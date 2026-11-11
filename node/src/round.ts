// One round of work on a task: the first answer, or a rework the customer asked for. The task comes through
// a door: Agent Market (each round is the job `<assignment>#<round>` on chain) or an order placed in the
// contract (one round, the job has the order's id). Agents never see each other: each gets its own question,
// is checked alone and is owed its fixed rate or nothing. What a round decided is stored before it is sent.
import { expertOf, type Expert } from './admit.ts';
import * as chain from './chain.ts';
import { cfg, log } from './config.ts';
import { gate } from './filter.ts';
import { CHUNK, NEAREST, search, similarity, unit } from './library.ts';
import * as llm from './llm.ts';
import * as market from './market.ts';
import type { Door } from './market.ts';
import { budget, ceiling, coarse, fit, provenance, quote, ready, usdc, type Agent, type Outcome } from './rules.ts';
import * as store from './store.ts';
import { shelve, type Shelf } from './shelf.ts';
import { gather, linksIn, MAX_SOURCES, PUBLIC_CHARS, textOf, type Page, type Unread } from './web.ts';

/** What a round decided: the chain's outcomes, if agents worked, and what the customer gets. */
type Decision = {
  outcomes?: Outcome[];
  submit?: string;
  decline?: { reason: 'rejected' | 'failed'; detail: string };
  provenance?: { answer: string; agents: string[] }; // the answer with [[id]] marks: who said what, for disputes
};

type Member = { agent: Agent; expert: Expert };
const SHORTLIST = 20; // agents the router sees at once
const MAX_TASK = 20_000; // characters of brief and messages the protocol reads
// The most of a prompt that is not the agent's own: its share of the customer's materials, their source tags, the question.
export const WORST_PUBLIC = PUBLIC_CHARS + (MAX_SOURCES + 5) * 300 + llm.MAX_QUESTION;
const TRIES = 5; // rounds that fail on our side, tried again after 1, 2, 4, 8 minutes, then given up

/** Agents that may work now: active, funded, admitted in this runner's memory, and whose cap covers a worst-case answer. */
function candidates(agents: Agent[]): Member[] {
  const seen = new Set<string>();
  return ready(agents).flatMap((agent) => {
    const expert = expertOf(agent);
    const price = expert && llm.priceOf(expert.m.model);
    if (!expert || !price || seen.has(expert.digest)) return [];
    const worst = Buffer.byteLength(llm.instructions(expert.m, [])) + NEAREST * CHUNK + WORST_PUBLIC; // typical text: a byte a character
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

/** An expert's recent record for the router: "delivered/picked" over its last tasks, or null for a new one.
 *  An expert that keeps failing gets fewer tasks, so its failures cost it, not the experts it works with. */
async function record(agent: string) {
  const picked = (await store.historyOf(agent, 200)).filter((r) => r.picked).slice(-50);
  return picked.length ? `${picked.filter((r) => r.delivered).length}/${picked.length}` : null;
}

/** What the earlier rounds of an assignment still owe: each delivered expert's rate and its overhead. All rounds
 *  of a task share its budget, because the customer pays once and every round's delivered experts are paid. */
async function owedBefore(id: string, round: number, door: Door) {
  let owed = 0n;
  for (let k = 1; k < round; k++) {
    const j = await chain.job(door.key(id, k));
    for (const s of j?.done ? j.slots : []) if (BigInt(s.pay) > 0n) owed += BigInt(s.pay) + door.perAgent;
  }
  return owed;
}

/** Did the customer name this expert in the brief, by its id from the public catalog (`alice.near/auditor`)? */
const names = (task: string, id: string) => new RegExp(`(^|[^\\w.-])${id.replace(/[.]/g, '\\.')}(?![\\w-])`).test(task);

/** The team for a task within a budget: the router's picks, most important first, as many as the money covers.
 *  Experts the customer asked for come first and are marked: the router takes them unless they cannot help. */
async function team(task: string, pool: Member[], net: bigint, perAgent: bigint) {
  const asked = new Set(pool.filter((c) => names(task, c.agent.id)).map((c) => c.agent.id));
  const list = [...pool.filter((c) => asked.has(c.agent.id)), ...(await shortlist(task, pool.filter((c) => !asked.has(c.agent.id))))];
  const units = (x: bigint) => Number(x) / 1e6;
  const records = await Promise.all(list.map((c) => record(c.agent.id)));
  const plan = await llm.plan(task, units(net), list.map((c, id) => ({ id, skills: c.agent.skills, examples: c.expert.m.examples, rate: units(BigInt(c.agent.rate)), requested: asked.has(c.agent.id), record: records[id]! })));
  const picks = plan.picks.map((p) => ({ ...list[p.id]!, question: p.question, rate: BigInt(list[p.id]!.agent.rate) }));
  return { considered: list, picked: picks.length, members: fit(picks, net, perAgent), search: plan.search };
}

/** One agent's part: its knowledge searched for its question, one call, then a check of that answer alone. */
async function contribute(task: string, t: Member & { question: string }, shelf: Shelf) {
  const hold = BigInt(t.agent.max_cost);
  const pages = await shelf.for(t.question); // the parts of the customer's materials closest to this question
  const found = await search(t.expert.lib, t.question).catch(() => ({ chunks: [], cost: 0n }));
  const left = hold > found.cost ? hold - found.cost : 0n;
  const r = await llm.answer(t.expert.m, found.chunks, t.question, pages, left);
  const failed = { delivered: false, violation: false, why: (r.why ?? (r.text.trim() ? 'not_checked' : 'empty')) as llm.Why };
  const check = r.text.trim() ? await llm.evaluate(task, t.question, r.text).catch(() => failed) : failed;
  const outcome: Outcome = { cost: coarse(found.cost + r.cost, hold).toString(), delivered: check.delivered && !check.violation, violation: check.violation };
  return { text: r.text, outcome, why: check.why };
}

/** A line in each considered agent's cabinet: when, which round, picked or not, and how it went. Never the question. */
function noteRound(key: string, topic: string, considered: Member[], members: Member[], parts: { outcome: Outcome; why: llm.Why }[]) {
  const at = new Date().toISOString();
  return Promise.all(considered.map((c) => {
    const i = members.findIndex((m) => m.agent.id === c.agent.id);
    const part = parts[i];
    const line = part ? { at, job: key, topic, picked: true, ...part.outcome, why: part.why, pay: part.outcome.delivered ? c.agent.rate : '0' } : { at, job: key, topic, picked: false };
    return store.note(c.agent.id, line);
  })).catch((e) => log('note_failed', { job: key, error: String(e) }));
}

/** Takes the holds. An agent that stopped being ready since it was picked (withdrew, registered again) is left out. */
async function commit(key: string, members: (Member & { question: string })[]) {
  for (let i = 0; i < 3 && members.length; i++) {
    const now = await Promise.all(members.map((t) => chain.agent(t.agent.id)));
    members = members.filter((t, j) => now[j]?.registration === t.agent.registration && ready([now[j]!]).length === 1);
    if (!members.length) break;
    const ok = await chain.assign(key, members.map((t) => t.agent.id)).then(() => true, (e) => (/agent not ready/.test(String(e)) ? false : Promise.reject(e)));
    if (ok) return members;
  }
  return [];
}

async function work(row: market.Row, round: number, feeBps: number, giveUp: boolean, door: Door): Promise<Decision | null> {
  const { assignment: a, job } = row;
  const id = a.assignmentId;
  const [thread, sent] = await Promise.all([door.thread(id), door.versions(id)]);
  const brief = job.title ? `# ${job.title}\n\n${job.description}` : job.description;
  const said = (n: (typeof thread)[number]) => (n.origin === 'platform' ? `Marketplace: ${n.body}` : n.body);
  const task = (thread.length ? `${brief}\n\n## Messages\n\n${thread.map(said).join('\n\n')}` : brief).slice(0, MAX_TASK);
  const since = round > 1 ? Date.parse(sent.at(-1)!.submittedAt) : 0;
  const fresh = thread.filter((n) => Date.parse(n.createdAt) > since);
  const redo = fresh.some((n) => n.origin === 'platform'); // a dispute ruled `redo`: always done, never refused
  const previous = round > 1 ? await door.delivered(id) : '';
  // After a delivery a refusal would refund the customer in full: the last answer stands instead, with a note.
  const stand = (why: string): Decision => ({ submit: `${previous}\n\n> Round ${round}: ${why}` });
  const refuse = (reason: 'rejected' | 'failed', detail: string): Decision => (round > 1 ? stand(detail) : { decline: { reason, detail } });

  if (giveUp) return refuse('failed', 'The swarm kept failing on our side.');
  if (round > cfg.MAX_REWORKS + 1 && !redo) return stand(`the ${cfg.MAX_REWORKS} reworks included in the price are used up. Please post further changes as a new job.`);
  // Before any paid call: is there anyone to work at all? (After a restart agents are still loading.)
  const pool = candidates(await chain.agents()); // fresh: other rounds may have just taken holds
  if (pool.length === 0) return null;
  if (round > 1 && !redo) {
    const scope = await llm.inScope(brief, fresh.map((n) => n.body).join('\n\n') || '(no message)');
    if (!scope.in_scope) return stand(`this change is new work beyond the original task (${scope.reason}) Please post it as a new job.`);
  }
  const screened = await llm.screen({ title: job.title, description: task });
  if (!screened.allow) return (void store.count(screened.topic, 'refused'), refuse('rejected', screened.reason));

  const net = budget(usdc(a.escrowAmount), feeBps, door.overhead, door.fee) - (await owedBefore(id, round, door));
  if (round > 1 && net <= 0n) return stand('the budget of this task went to the experts of its earlier rounds. Please post further changes as a new job.');
  const { considered, picked, members: planned, search: queries } = await team(task, pool, net, door.perAgent);
  if (picked === 0) return (void store.count(screened.topic, 'no_expert'), refuse('rejected', 'No expert in the swarm knows enough for this task.'));
  if (planned.length === 0) return (void store.count(screened.topic, 'over_budget'), refuse('rejected', 'The budget does not cover the experts this task needs.'));
  // The customer's materials: attached files, the links in the brief and messages, and search results if a key is set.
  // Each expert later gets the parts closest to its own question; what could not be read is told to the customer.
  const files = await Promise.all(job.attachments.slice(0, 5).map((f) => door.attachment(f).then(
    (bytes) => textOf(bytes, f.contentType, f.filename).then((text) => ({ url: `attachment: ${f.filename}`, text: text.trim() })),
  ).catch((e: Error): Unread => ({ url: `attachment: ${f.filename}`, why: e.message.slice(0, 80) }))));
  const found = await gather(task, queries);
  const pages = [...files.filter((f): f is Page => 'text' in f && f.text !== ''), ...found.pages];
  const unread = [...files.filter((f): f is Unread => 'why' in f), ...found.unread];
  const shelf = await shelve(pages);
  const sources = [...new Set([...linksIn(task), ...pages.map((p) => p.url).filter((u) => u.startsWith('https://'))])];

  // Committed: the customer can no longer cancel for free, and each agent's hold is taken.
  if (!a.startedAt) await door.start(id);
  const key = door.key(id, round);
  const members = await commit(key, planned);
  if (members.length === 0) return null; // the team fell apart between planning and holding: plan again
  const parts = await Promise.all(members.map((t) => contribute(task, t, shelf)));
  const outcomes = parts.map((p) => p.outcome);
  const agents = members.map((t) => t.agent.id);
  await noteRound(key, screened.topic, considered, members, parts);
  void store.count(screened.topic, 'served');

  // Only delivered parts reach the composer; only the composer, the protocol's model, sees more than one.
  const good = parts.flatMap((p, i) => (p.outcome.delivered ? [{ id: i, question: members[i]!.question, text: p.text }] : []));
  const marked = good.length ? await llm.compose(task, previous, good, sources).catch(() => '') : '';
  if (!marked.trim()) return { outcomes, ...refuse('failed', 'The swarm could not compose an answer to this task.') };
  // Links that existed before this task cannot carry it: the brief's, the pages read and the links in them, the experts' materials.
  const known = new Set([...sources, ...pages.flatMap((p) => linksIn(p.text, 1_000)), ...members.flatMap((t) => [...t.expert.links])]);
  const answer = await gate(provenance(marked).text, known);
  const experts = good.map((g) => members[g.id]!.agent.id).join(', '); // public ids, as in the catalog: the customer may name them next time
  const footer = `---\n*Composed by Swarm-for-Hire from ${good.length} independent expert${good.length > 1 ? 's' : ''} (${experts}), round ${round}.*`;
  const label = (url: string) => url.replace(/^attachment: /, '');
  const read = pages.filter((p) => p.url.startsWith('attachment: ') || linksIn(task).includes(p.url)).map((p) => label(p.url));
  const materials = read.length || unread.length
    ? `\n\n*Your materials: ${read.length ? `read ${read.join(', ')}` : 'none could be read'}${unread.length ? `; could not read ${unread.map((u) => `${label(u.url)} (${u.why})`).join(', ')}` : ''}.*`
    : '';
  return { outcomes, submit: `${answer}${materials}\n\n${footer}`.slice(0, 250_000), provenance: { answer: marked, agents } };
}

/** Puts a decision into effect. Every step is safe to repeat: a restart simply calls this again. */
async function settle(id: string, key: string, d: Decision, door: Door) {
  const open = d.outcomes && (await chain.job(key));
  if (open && !open.done) await chain.finish(key, d.outcomes!);
  if (d.submit) await door.submit(id, d.submit);
  else if (d.decline) await door.decline(id, d.decline.reason, d.decline.detail);
  log(d.submit ? 'submitted' : 'declined', { assignment: id, job: key, outcomes: d.outcomes, ...d.decline });
}

const busy = new Set<string>();
const failed = new Map<string, { n: number; next: number }>(); // per assignment: failures of the current round

/** Serves a task that is waiting for us. Rounds of different tasks run side by side. */
export function serve(row: market.Row, feeBps: number, door: Door = market.door) {
  const id = row.assignment.assignmentId;
  if (row.assignment.status !== 'in_progress' || row.job.jobKind === 'competition' || busy.has(id)) return;
  const f = failed.get(id);
  if (f && Date.now() < f.next) return;
  busy.add(id);
  let key = '';
  void (async () => {
    const round = (await door.versions(id)).length + 1;
    key = door.key(id, round);
    const known = await store.recall<Decision>(key);
    if (known) return settle(id, key, known, door);
    const open = await chain.job(key);
    if (open?.done) return door.decline(id, 'failed', 'The answer was lost in a runner restart.'); // only if the store was lost
    if (open) await chain.finish(key, open.slots.map(() => ({ cost: '0', delivered: false, violation: false }))); // cut by a restart: holds back, run again
    const d = await work(row, round, feeBps, (failed.get(id)?.n ?? 0) >= TRIES, door);
    if (!d) return log('no_agents', { assignment: id });
    await store.remember(key, d);
    await settle(id, key, d, door);
    failed.delete(id);
  })()
    .catch((e) => {
      const n = (failed.get(id)?.n ?? 0) + 1;
      failed.set(id, { n, next: Date.now() + 60_000 * 2 ** (n - 1) });
      log('error', { assignment: id, job: key, tries: n, error: String(e) });
    })
    .finally(() => busy.delete(id));
}

// ---- bids, when BIDS=on ----

const seen = new Set<string>();

/** Bids on a board job the swarm can do: the price covers the planned team's rates, both fees and the overhead. */
export async function bid(job: market.BoardJob, agents: Agent[], feeBps: number) {
  if (seen.has(job.jobId) || job.budgetToken !== 'USDC') return; // revenue is forwarded in USDC
  seen.add(job.jobId);
  const task = `# ${job.title}\n\n${job.description}`.slice(0, MAX_TASK);
  const pool = candidates(agents);
  if (pool.length === 0) return;
  const screened = await llm.screen({ title: job.title, description: task });
  if (!screened.allow) return;
  const ceilingBudget = job.budgetAmount ? budget(usdc(job.budgetAmount), feeBps, usdc(cfg.OVERHEAD_USD)) : 1_000n * 1_000_000n;
  const { members } = await team(task, pool, ceilingBudget, usdc(cfg.OVERHEAD_PER_AGENT_USD));
  if (members.length === 0) return;
  const price = quote(members.map((t) => t.rate), feeBps, usdc(cfg.OVERHEAD_USD), usdc(cfg.OVERHEAD_PER_AGENT_USD));
  const amount = (Number(price) / 1e6).toFixed(2);
  await market.bid(job.jobId, amount, `A swarm of ${members.length} independent experts with private knowledge; one composed, sourced answer. Includes ${cfg.MAX_REWORKS} reworks.`);
  log('bid', { job: job.jobId, amount });
}
