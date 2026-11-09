// The runner loop: review new agents, optionally bid on board jobs, run every hire through the swarm.
// Every round of work on an assignment (the first answer, each rework, each dispute redo) is its own
// job on chain: `<assignment>#<round>`. State lives on chain and on the market, so a restart is safe.
import { setTimeout as sleep } from 'node:timers/promises';
import * as chain from './chain.ts';
import { cfg, log, policyHash } from './config.ts';
import { instructions, judge, priceOf, refreshPrices, reviewManifest, runAgent, screenJob, type Verdict } from './llm.ts';
import { InvalidManifest, load, type Manifest } from './manifest.ts';
import * as market from './market.ts';
import { best, candidates, NOTHING, outcomes, stepCeiling, type Agent } from './settle.ts';
import { bootKey } from './tee.ts';

/** Code checks first (hash, schema, allowlists); only a manifest that passes them reaches the reviewing model. */
async function review(a: Agent) {
  if (a.status !== 'Pending') return;
  const v = await load(a.manifest).then(reviewManifest, (e) => {
    if (e instanceof InvalidManifest) return { allow: false, reason: `invalid manifest: ${e.message}` };
    throw e; // gateway trouble: stays Pending, retried next tick
  });
  await chain.review(a.account, a.manifest, v.allow);
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

/** The task as the agents see it: the brief, everything the customer wrote, and on a rework the answer sent back. */
async function brief(id: string, job: market.Row['job'], round: number) {
  const parts = [`# ${job.title}`, job.description];
  const notes = await market.notes(id);
  if (notes.length) parts.push('## Customer messages', ...notes);
  if (round > 1) parts.push('## Previous answer, sent back for changes', (await market.delivered(id)).slice(0, 20_000));
  return parts.join('\n\n');
}

/** Up to SLOTS candidates whose manifest loads and whose cap covers a worst-case first step. */
async function team(agents: Agent[], task: string) {
  const crew: { id: string; m: Manifest; cap: bigint }[] = [];
  for (const a of candidates(agents)) {
    if (crew.length === cfg.SLOTS) break;
    const m = await load(a.manifest).catch(() => undefined);
    const price = m && priceOf(m.model);
    const cap = BigInt(a.max_cost);
    if (m && price && cap >= stepCeiling(instructions(m).length + task.length, price)) crew.push({ id: a.account, m, cap });
  }
  return crew;
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

  const task = await brief(id, job, round);
  const verdict = await screen(key, job.title, task);
  if (!verdict.allow) return decline(id, giveUp, verdict.reason);
  const crew = await team(agents, task);
  if (crew.length === 0) return log('no_agents', { assignment: id, round }); // retried next tick

  if (!a.startedAt) await market.start(id); // the customer can no longer cancel, so a cut round is always resumed here
  await chain.assign(key, crew.map((t) => t.id));
  const runs = await Promise.all(crew.map((t) => runAgent(t.m, task, t.cap)));
  const scores = await judge(task, runs).catch((e) => void log('judge_failed', { job: key, error: String(e) }));
  const outs = scores ? outcomes(runs, scores) : runs.map(() => NOTHING); // a judge failure is ours: nobody pays, nobody earns
  await chain.finish(key, outs);
  log('finished', { job: key, agents: crew.map((t) => t.id), outcomes: outs });

  const i = best(outs);
  if (i < 0) return decline(id, 'failed', 'No answer passed the judge.');
  outbox.set(id, `${runs[i]!.text}\n\n---\nDelivered by swarm agent ${crew[i]!.id}, round ${round}.`);
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

chain.useKey(await bootKey());
log('ready', { runner: cfg.RUNNER_ACCOUNT, contract: cfg.CONTRACT, policies: policyHash });
for (;;) {
  await tick().catch((e) => log('error', { error: String(e) }));
  await sleep(cfg.POLL_MS);
}
