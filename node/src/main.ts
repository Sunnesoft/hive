// The runner loop: review new agents, optionally bid on board jobs, run every hire through the swarm.
// The swarm adds up private knowledge of owners who do not trust each other. Agents never see each
// other: the protocol's model asks each one a question, then composes the answer from the replies.
// Every round of work on an assignment (the first answer, each rework, each dispute redo) is its own
// job on chain: `<assignment>#<round>`. State lives on chain and on the market, so a restart is safe.
import { setTimeout as sleep } from 'node:timers/promises';
import * as chain from './chain.ts';
import { cfg, log, policyHash } from './config.ts';
import { CHUNK, NEAREST, search } from './library.ts';
import { compose, instructions, priceOf, prompt, refreshPrices, reviewManifest, route, runAgent, screenJob, type Verdict } from './llm.ts';
import { InvalidManifest, load, useSecret, type Loaded } from './manifest.ts';
import * as market from './market.ts';
import { candidates, NOTHING, outcomes, stepCeiling, type Agent } from './settle.ts';
import { publicKeyOf } from './seal.ts';
import { bootKeys } from './tee.ts';

/** Code checks first (seal, schema, allowlists); only a manifest that passes them reaches the reviewing model. */
async function review(a: Agent) {
  if (a.status !== 'Pending') return;
  const v = await load(a).then(
    async ({ m }) => ({ allow: (await reviewManifest(m)).allow }), // the model's reason may quote the private manifest: not logged
    (e) => {
      if (e instanceof InvalidManifest) return { allow: false, reason: `invalid manifest: ${e.message}` }; // written by our code
      throw e; // chain trouble: stays Pending, retried next tick
    },
  );
  await chain.review(a.account, a.hash, v.allow);
  log('reviewed', { agent: a.account, ...v });
}

const verdicts = new Map<string, Promise<Verdict>>();
/** One screening per task, so a retry or a restart of the loop does not pay for it again. */
function screen(key: string, title: string, description: string) {
  let v = verdicts.get(key);
  if (!v) {
    v = screenJob({ title, description });
    v.catch(() => verdicts.delete(key)); // a failed screening is retried, not remembered
    verdicts.set(key, v);
  }
  return v;
}

const bidOn = new Set<string>();
async function bid(job: market.BoardJob) {
  if (bidOn.has(job.jobId) || job.budgetToken !== 'USDC') return; // revenue is forwarded in USDC
  bidOn.add(job.jobId);
  const v = await screen(job.jobId, job.title, job.description);
  if (v.allow) await market.bid(job.jobId, cfg.BID_USD!, 'A reviewed swarm of independent agents; the judged best answer is delivered.');
  log('screened', { job: job.jobId, ...v });
}

/** The task: the brief and everything the customer wrote (clarifications, rework feedback). */
async function brief(id: string, job: market.Row['job']) {
  const notes = await market.notes(id);
  return [`# ${job.title}`, job.description, ...(notes.length ? ['## Customer messages', ...notes] : [])].join('\n\n');
}

const POOL = 30; // how many candidates the router sees at once

/** Candidates the router may pick from: one per distinct manifest (clones never share a job), each with
 *  a cap that covers a worst-case first step. */
async function pool(agents: Agent[], task: string) {
  const crew: (Loaded & { id: string; cap: bigint })[] = [];
  const seen = new Set<string>();
  for (const a of candidates(agents)) {
    if (crew.length === POOL) break;
    const x = await load(a).catch(() => undefined);
    const price = x && priceOf(x.m.model);
    const cap = BigInt(a.max_cost);
    const chars = x && instructions(x.m).length + task.length + 2_000 + (x.lib ? NEAREST * CHUNK : 0);
    if (!x || !price || cap < stepCeiling(chars!, price) || seen.has(JSON.stringify(x.m))) continue;
    seen.add(JSON.stringify(x.m));
    crew.push({ ...x, id: a.account, cap });
  }
  return crew;
}

/** One agent's part: search its library for the question, then run it. Both are paid from its cap. */
async function contribute(t: Loaded & { cap: bigint }, task: string, question: string) {
  const found = t.lib ? await search(t.lib, question).catch(() => ({ chunks: [], cost: 0n })) : { chunks: [], cost: 0n };
  const run = await runAgent(t.m, prompt(task, question), t.cap - found.cost, found.chunks);
  const cost = run.cost + found.cost;
  return { ...run, cost: cost < t.cap ? cost : t.cap };
}

const outbox = new Map<string, string>(); // settled answers the market has not taken yet

async function serve({ assignment: a, job }: market.Row, agents: Agent[]) {
  const id = a.assignmentId;
  if (a.status !== 'in_progress' || job.jobKind === 'competition') return;
  if (outbox.has(id)) return deliver(id);

  // In progress after a delivery means request-changes or a dispute redo: the next round.
  const round = a.deliverableUrl ? (await market.versions(id)) + 1 : 1;
  const key = `${id}#${round}`;
  const giveUp = round === 1 ? 'rejected' : 'failed'; // the market's reasons before and after a delivery
  const open = await chain.job(key);
  if (open?.done) return decline(id, 'failed', 'The answer was lost in a runner restart.');
  if (open) await chain.finish(key, open.slots.map(() => NOTHING)); // a round cut by a restart: holds go back, run again

  const task = await brief(id, job);
  const verdict = await screen(key, job.title, task);
  if (!verdict.allow) return decline(id, giveUp, verdict.reason);
  const ready = await pool(agents, task);
  if (ready.length === 0) return log('no_agents', { assignment: id, round }); // retried next tick
  const crew = (await route(task, ready.map((t) => t.m.skills), cfg.SLOTS)).map((q) => ({ ...ready[q.id]!, question: q.question }));
  if (crew.length === 0) return decline(id, giveUp, 'No agent in the swarm knows enough for this task.');

  if (!a.startedAt) await market.start(id); // the customer can no longer cancel, so a cut round is always resumed here
  await chain.assign(key, crew.map((t) => t.id));
  // Each agent sees the task and its own question, never another agent's answer: its knowledge stays with it.
  const runs = await Promise.all(crew.map((t) => contribute(t, task, t.question)));
  // Only the protocol's model sees the answer that was sent back: it holds every agent's knowledge.
  const previous = round > 1 ? (await market.delivered(id)).slice(0, 20_000) : '';
  const done = await compose(task, previous, crew.map((t, i) => ({ question: t.question, text: runs[i]!.text }))).catch(
    (e) => void log('compose_failed', { job: key, error: String(e) }),
  );
  const outs = done ? outcomes(runs, done.scores) : runs.map(() => NOTHING); // a failure of ours: nobody pays, nobody earns
  await chain.finish(key, outs);
  log('finished', { job: key, agents: crew.map((t) => t.id), outcomes: outs });

  if (!done?.answer.trim() || outs.every((o) => o.weight === 0)) return decline(id, 'failed', 'The swarm could not compose an answer.');
  outbox.set(id, `${done.answer}\n\n---\nComposed by Swarm-for-Hire from ${crew.length} agents, round ${round}.`);
  await deliver(id);
}

async function deliver(id: string) {
  await market.submit(id, outbox.get(id)!);
  outbox.delete(id);
  log('submitted', { assignment: id });
}

async function decline(id: string, reason: 'rejected' | 'failed', detail: string) {
  await market.decline(id, reason, detail);
  log('declined', { assignment: id, reason, detail });
}

/** Runs `f` on every item; one item's failure is logged and does not stop the others. */
async function each<T>(items: T[], f: (x: T) => Promise<unknown>) {
  for (const x of items) await f(x).catch((e) => log('error', { error: String(e) }));
}

async function tick() {
  await refreshPrices();
  const agents = await chain.agents();
  await each(agents, review);
  if (cfg.BID_USD) await each(await market.board(), bid);
  await each(await market.assignments(), (row) => serve(row, agents));
}

const keys = await bootKeys();
chain.useKey(keys.key);
useSecret(keys.seal);
const sealKey = publicKeyOf(keys.seal).toString('hex');
if ((await chain.sealKey()) !== sealKey) log('seal_key_mismatch', { runner: sealKey, hint: 'sponsors seal to the key in the contract config' });
log('ready', { runner: cfg.RUNNER_ACCOUNT, contract: cfg.CONTRACT, sealKey, policies: policyHash });
for (;;) {
  await tick().catch((e) => log('error', { error: String(e) }));
  await sleep(cfg.POLL_MS);
}
