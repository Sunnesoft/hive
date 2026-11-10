// One round of work on an assignment: the first answer, or a rework the customer asked for. Each round is
// its own job on chain, `<assignment>#<round>`. Agents never see each other: each gets its own question,
// is checked alone and is owed its fixed rate or nothing. What a round decided is stored before it is sent.
import { expertOf, type Expert } from './admit.ts';
import * as chain from './chain.ts';
import { cfg, log } from './config.ts';
import { gate } from './filter.ts';
import { CHUNK, NEAREST, search, similarity, unit } from './library.ts';
import * as llm from './llm.ts';
import * as market from './market.ts';
import { budget, ceiling, coarse, fit, provenance, quote, ready, usdc, type Agent, type Outcome } from './rules.ts';
import * as store from './store.ts';
import { gather, linksIn, PAGE_CHARS, PAGES, type Page } from './web.ts';

/** What a round decided: the chain's outcomes, if agents worked, and what the customer gets. */
type Decision = {
  outcomes?: Outcome[];
  submit?: string;
  decline?: { reason: 'rejected' | 'failed'; detail: string };
  provenance?: { answer: string; agents: string[] }; // the answer with [[id]] marks: who said what, for disputes
};

type Member = { agent: Agent; expert: Expert };
const SHORTLIST = 20; // agents the router sees at once
const WORST_PUBLIC = PAGES * (PAGE_CHARS + 100) + llm.MAX_QUESTION; // the most of a prompt that is not the agent's own

/** Agents that may work now: active, funded, admitted in this runner's memory, and whose cap covers a worst-case answer. */
function candidates(agents: Agent[]): Member[] {
  const seen = new Set<string>();
  return ready(agents).flatMap((agent) => {
    const expert = expertOf(agent);
    const price = expert && llm.priceOf(expert.m.model);
    if (!expert || !price || seen.has(expert.digest)) return [];
    const worst = llm.instructions(expert.m, []).length + NEAREST * CHUNK + WORST_PUBLIC;
    if (BigInt(agent.max_cost) < ceiling(worst, price)) return [];
    seen.add(expert.digest);
    return [{ agent, expert }];
  });
}

const skillVectors = new Map<string, Float32Array>();
/** The members whose public skills are closest to the task, by embeddings, when there are many. */
async function shortlist(task: string, pool: Member[]) {
  if (pool.length <= SHORTLIST) return pool;
  const missing = [...new Set(pool.map((c) => c.agent.skills))].filter((s) => !skillVectors.has(s));
  const { vectors } = await llm.embed([task.slice(0, 8_000), ...missing]);
  missing.forEach((s, i) => skillVectors.set(s, unit(vectors[i + 1]!)));
  const q = unit(vectors[0]!);
  const score = (c: Member) => similarity(skillVectors.get(c.agent.skills)!, q);
  return pool.map((c) => ({ c, s: score(c) })).sort((a, b) => b.s - a.s).slice(0, SHORTLIST).map((x) => x.c);
}

/** The team for a task within a budget: the router's picks, most important first, as many as the money covers. */
async function team(task: string, pool: Member[], net: bigint) {
  const list = await shortlist(task, pool);
  const units = (x: bigint) => Number(x) / 1e6;
  const plan = await llm.plan(task, units(net), list.map((c, id) => ({ id, skills: c.agent.skills, rate: units(BigInt(c.agent.rate)) })));
  const picks = plan.picks.map((p) => ({ ...list[p.id]!, question: p.question, rate: BigInt(list[p.id]!.agent.rate) }));
  return { picked: picks.length, members: fit(picks, net, usdc(cfg.OVERHEAD_PER_AGENT_USD)), search: plan.search };
}

const FAILED = { delivered: false, violation: false };

/** One agent's part: its knowledge searched for its question, one call, then a check of that answer alone. */
async function contribute(task: string, t: Member & { question: string }, pages: Page[]) {
  const hold = BigInt(t.agent.max_cost);
  const found = await search(t.expert.lib, t.question).catch(() => ({ chunks: [], cost: 0n }));
  const left = hold > found.cost ? hold - found.cost : 0n;
  const r = await llm.answer(t.expert.m, found.chunks, t.question, pages, left);
  const check = r.text.trim() ? await llm.evaluate(task, t.question, r.text).catch(() => FAILED) : FAILED;
  const outcome: Outcome = { cost: coarse(found.cost + r.cost, hold).toString(), delivered: check.delivered && !check.violation, violation: check.violation };
  return { text: r.text, outcome };
}

async function work(row: market.Row, round: number, feeBps: number): Promise<Decision | null> {
  const { assignment: a, job } = row;
  const id = a.assignmentId;
  const [thread, sent] = await Promise.all([market.thread(id), market.versions(id)]);
  const brief = `# ${job.title}\n\n${job.description}`;
  const task = thread.length ? `${brief}\n\n## Customer messages\n\n${thread.map((n) => n.body).join('\n\n')}` : brief;
  const previous = round > 1 ? await market.delivered(id) : '';
  // After a delivery a refusal would refund the customer in full: the last answer stands instead, with a note.
  const stand = (why: string): Decision => ({ submit: `${previous}\n\n> Round ${round}: ${why}` });
  const refuse = (reason: 'rejected' | 'failed', detail: string): Decision => (round > 1 ? stand(detail) : { decline: { reason, detail } });

  if (round > cfg.MAX_REWORKS + 1) return stand(`the ${cfg.MAX_REWORKS} reworks included in the price are used up. Please post further changes as a new job.`);
  if (round > 1) {
    const since = Date.parse(sent.at(-1)!.submittedAt);
    const feedback = thread.filter((n) => Date.parse(n.createdAt) > since).map((n) => n.body).join('\n\n');
    const scope = await llm.inScope(brief, feedback || '(no message)');
    if (!scope.in_scope) return stand(`this change is new work beyond the original task (${scope.reason}) Please post it as a new job.`);
  }
  const screened = await llm.screen({ title: job.title, description: task });
  if (!screened.allow) return refuse('rejected', screened.reason);

  const pool = candidates(await chain.agents()); // fresh: other rounds may have just taken holds
  if (pool.length === 0) return null; // nobody can work yet (agents still loading): try again next tick
  const net = budget(usdc(a.escrowAmount), feeBps, usdc(cfg.OVERHEAD_USD));
  const { picked, members, search: queries } = await team(task, pool, net);
  if (picked === 0) return refuse('rejected', 'No expert in the swarm knows enough for this task.');
  if (members.length === 0) return refuse('rejected', 'The budget does not cover the experts this task needs.');
  const pages = await gather(task, queries);
  const sources = [...new Set([...linksIn(task), ...pages.map((p) => p.url)])];

  // Committed: the customer can no longer cancel for free, and each agent's hold is taken.
  if (!a.startedAt) await market.start(id);
  await chain.assign(`${id}#${round}`, members.map((t) => t.agent.account));
  const parts = await Promise.all(members.map((t) => contribute(task, t, pages)));
  const outcomes = parts.map((p) => p.outcome);
  const agents = members.map((t) => t.agent.account);

  // Only delivered parts reach the composer; only the composer, the protocol's model, sees more than one.
  const good = parts.flatMap((p, i) => (p.outcome.delivered ? [{ id: i, question: members[i]!.question, text: p.text }] : []));
  const marked = good.length ? await llm.compose(task, previous, good, sources).catch(() => '') : '';
  if (!marked.trim()) return { outcomes, ...refuse('failed', 'The swarm could not compose an answer to this task.') };
  const answer = await gate(provenance(marked).text, new Set(sources));
  const footer = `---\n*Composed by Swarm-for-Hire from ${good.length} independent expert${good.length > 1 ? 's' : ''}, round ${round}.*`;
  return { outcomes, submit: `${answer}\n\n${footer}`.slice(0, 250_000), provenance: { answer: marked, agents } };
}

/** Puts a decision into effect. Every step is safe to repeat: a restart simply calls this again. */
async function settle(id: string, key: string, d: Decision) {
  const open = d.outcomes && (await chain.job(key));
  if (open && !open.done) await chain.finish(key, d.outcomes!);
  if (d.submit) await market.submit(id, d.submit);
  else if (d.decline) await market.decline(id, d.decline.reason, d.decline.detail);
  log(d.submit ? 'submitted' : 'declined', { assignment: id, job: key, outcomes: d.outcomes, ...d.decline });
}

const busy = new Set<string>();

/** Serves an assignment that is waiting for us. Rounds of different assignments run side by side. */
export function serve(row: market.Row, feeBps: number) {
  const id = row.assignment.assignmentId;
  if (row.assignment.status !== 'in_progress' || row.job.jobKind === 'competition' || busy.has(id)) return;
  busy.add(id);
  void (async () => {
    const round = (await market.versions(id)).length + 1;
    const key = `${id}#${round}`;
    const known = await store.recall<Decision>(key);
    if (known) return settle(id, key, known);
    const open = await chain.job(key);
    if (open?.done) return market.decline(id, 'failed', 'The answer was lost in a runner restart.'); // only if the store was lost
    if (open) await chain.finish(key, open.slots.map(() => ({ cost: '0', delivered: false, violation: false }))); // cut by a restart: holds back, run again
    const d = await work(row, round, feeBps);
    if (!d) return log('no_agents', { assignment: id });
    await store.remember(key, d);
    await settle(id, key, d);
  })()
    .catch((e) => log('error', { assignment: id, error: String(e) }))
    .finally(() => busy.delete(id));
}

// ---- bids, when BIDS=on ----

const seen = new Set<string>();

/** Bids on a board job the swarm can do: the price covers the planned team's rates, both fees and the overhead. */
export async function bid(job: market.BoardJob, agents: Agent[], feeBps: number) {
  if (seen.has(job.jobId) || job.budgetToken !== 'USDC') return; // revenue is forwarded in USDC
  seen.add(job.jobId);
  const task = `# ${job.title}\n\n${job.description}`;
  const screened = await llm.screen(job);
  const pool = candidates(agents);
  if (!screened.allow || pool.length === 0) return;
  const ceilingBudget = job.budgetAmount ? budget(usdc(job.budgetAmount), feeBps, usdc(cfg.OVERHEAD_USD)) : 1_000n * 1_000_000n;
  const { members } = await team(task, pool, ceilingBudget);
  if (members.length === 0) return;
  const price = quote(members.map((t) => t.rate), feeBps, usdc(cfg.OVERHEAD_USD), usdc(cfg.OVERHEAD_PER_AGENT_USD));
  const amount = (Number(price) / 1e6).toFixed(2);
  await market.bid(job.jobId, amount, `A swarm of ${members.length} independent experts with private knowledge; one composed, sourced answer. Includes ${cfg.MAX_REWORKS} reworks.`);
  log('bid', { job: job.jobId, amount });
}
