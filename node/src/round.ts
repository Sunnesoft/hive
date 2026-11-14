// One round of work on a task: the first answer, or a rework the customer asked for. The task comes through
// a door: Agent Market (each round is the job `<assignment>#<round>` on chain) or an order placed in the
// contract (one round, the job has the order's id). Agents never see each other: each gets its own question,
// is checked alone and is owed its fixed rate or nothing. What a round decided is stored before it is sent.
import { expertOf, type Expert } from './admit.ts';
import * as chain from './chain.ts';
import { cfg } from './config.ts';
import { gate } from './filter.ts';
import { CHUNK, NEAREST, search, similarity, unit } from './library.ts';
import * as llm from './llm.ts';
import { inJob, log } from './log.ts';
import * as market from './market.ts';
import type { Door } from './market.ts';
import { controlled, digestOf, join, listOf, reportOf, review, tested, tried, weightsOf, type Review } from './review.ts';
import { budget, ceiling, coarse, fit, lineOf, provenance, quote, ready, rivals, sharesOf, usdc, usedOf, type Agent, type Outcome } from './rules.ts';
import * as store from './store.ts';
import { head, shelve, type Shelf } from './shelf.ts';
import { referred } from './deps.ts';
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
const PARALLEL = 4; // tasks in work at once: the most that can be running when the day's spending limit is reached

/** Agents that may work now: active, funded, admitted in this runner's memory, and whose cap covers a worst-case answer. */
function candidates(agents: Agent[]): Member[] {
  const seen = new Set<string>();
  return ready(agents).flatMap((agent) => {
    const expert = expertOf(agent);
    const price = expert && llm.priceOf(expert.m.model);
    if (!expert || !price || seen.has(expert.digest)) return [];
    const worst = Buffer.byteLength(llm.instructions(expert.m, [])) + NEAREST * CHUNK + WORST_PUBLIC; // typical text: a byte a character
    if (BigInt(agent.max_cost) < ceiling(worst, price) + llm.lookupCeiling(expert.m, WORST_PUBLIC, price)) return [];
    seen.add(expert.digest);
    return [{ agent, expert }];
  });
}

const skillVectors = new Map<string, Float32Array>();
/** The members whose public skills are closest to the task, by embeddings, when there are many. */
async function shortlist(task: string, pool: Member[]) {
  if (pool.length <= SHORTLIST) return pool;
  const missing = [...new Set(pool.map((c) => c.agent.skills))].filter((s) => !skillVectors.has(s));
  const { vectors } = await llm.embed('shortlist', [task.slice(0, 8_000), ...missing]);
  missing.forEach((s, i) => skillVectors.set(s, unit(vectors[i + 1]!)));
  const q = unit(vectors[0]!);
  const score = (c: Member) => similarity(skillVectors.get(c.agent.skills)!, q);
  return pool.map((c) => ({ c, s: score(c) })).sort((a, b) => b.s - a.s).slice(0, SHORTLIST).map((x) => x.c);
}

/** An expert's recent record for the router: "delivered/picked" over its last tasks, and how much of the answers it
 *  worked on came from it (`usedOf`); null for a new one. An expert that keeps failing, or whose parts are not
 *  used, gets fewer tasks, so its failures cost it, not the experts it works with. */
async function record(agent: string) {
  const picked = (await store.historyOf(agent, 200)).filter((r) => r.picked).slice(-50);
  return { record: picked.length ? `${picked.filter((r) => r.delivered).length}/${picked.length}` : null, used: usedOf(picked) };
}

/** What the earlier rounds of an assignment still owe: each delivered expert's rate and its overhead. All rounds
 *  of a task share its budget, because the customer pays once and every round's delivered experts are paid. */
async function owedBefore(id: string, round: number, door: Door) {
  let owed = 0n;
  for (let k = 1; k < round; k++) {
    const j = await chain.job(door.key(id, k));
    for (const s of j?.finished ? j.slots : []) if (BigInt(s.pay) > 0n) owed += BigInt(s.pay) + door.perAgent;
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
  const plan = await llm.plan(task, units(net), list.map((c, id) => ({ id, skills: c.agent.skills, examples: c.expert.m.examples, rate: units(BigInt(c.agent.rate)), requested: asked.has(c.agent.id), record: records[id]!.record })));
  // The router picks by the words of the skills. Where the numbers put another agent clearly above its pick
  // (rules.rivals) and that agent could be asked the same question, the better one is asked instead. An expert the
  // customer named is never replaced, and nobody is asked twice.
  const taken = new Set(plan.picks.map((p) => p.id));
  const scored = (id: number) => ({ id, used: records[id]!.used, rate: BigInt(list[id]!.agent.rate) });
  const card = (id: number) => ({ id, skills: list[id]!.agent.skills, examples: list[id]!.expert.m.examples });
  const replaced: [from: string, to: string][] = [];
  const chosen: typeof plan.picks = [];
  for (const p of plan.picks) {
    const above = asked.has(list[p.id]!.agent.id) ? [] : rivals(scored(p.id), list.map((_, id) => id).filter((id) => !taken.has(id)).map(scored));
    const could = above.length ? await llm.standIns(p.question, card(p.id), above.map((a) => card(a.id))).catch(() => []) : [];
    const id = above.find((a) => could.includes(a.id))?.id ?? p.id;
    if (id !== p.id) (taken.delete(p.id), taken.add(id), replaced.push([list[p.id]!.agent.id, list[id]!.agent.id]));
    chosen.push({ ...p, id });
  }
  const picks = chosen.map((p) => ({ ...list[p.id]!, question: p.question, rate: BigInt(list[p.id]!.agent.rate) }));
  return { considered: list, picked: picks.length, members: fit(picks, net, perAgent), search: plan.search, replaced };
}

type Asked = Member & { question: string };
/** What an expert made of its question, before it is checked. `review`: its findings and leads, which reach the
 *  customer as code joins them; `sizes` go to the log, `seen` only to the trace. */
type Made = { text: string; cost: bigint; why?: llm.Why; cut?: boolean; review?: Pick<Review, 'findings' | 'leads' | 'unsure' | 'open'>; sizes: Record<string, number>; seen?: object };

/** An answer: the expert's knowledge searched for its question and, when the question came with materials, for
 *  what the expert chose to look up after reading them; then one call. */
async function answered(t: Asked, pages: Page[], hold: bigint): Promise<Made> {
  const looked = pages.length ? await llm.lookups(t.expert.m, t.question, pages, hold) : { queries: [], cost: 0n };
  const sought = await search(t.expert.lib, t.question, looked.queries).catch(() => ({ chunks: [], cost: 0n }));
  const spent = looked.cost + sought.cost;
  const r = await llm.answer(t.expert.m, sought.chunks, t.question, pages, hold > spent ? hold - spent : 0n);
  return { ...r, cost: spent + r.cost, sizes: { chunks: sought.chunks.length, lookups: looked.queries.length }, seen: { lookups: looked.queries } };
}

/** A review of the customer's own materials with all of the expert's knowledge (review.ts). */
async function reviewed(t: Asked, pages: Page[], hold: bigint, code: boolean): Promise<Made> {
  const r = await review(t.expert, t.question, pages, hold, code);
  return { text: r.why ? '' : reportOf(r), cost: r.cost, sizes: r.counts, ...(r.why ? { why: r.why } : { review: { findings: r.findings, leads: r.leads, unsure: r.unsure, open: r.open } }) };
}

/** One agent's part, and a check of that part alone. An expert that reviews does so when the customer gave
 *  materials of their own to review; asked a question without them, it answers like any other.
 *  `given`: which pages are the customer's own; `code`: the task asks for code. */
async function contribute(task: string, t: Asked, shelf: Shelf, brief: { given: Set<string>; code: boolean }) {
  const hold = BigInt(t.agent.max_cost);
  const pages = await shelf.for(t.question); // the parts of the customer's materials closest to this question
  const own = pages.filter((p) => brief.given.has(p.url));
  const reviews = t.expert.m.work === 'review' && own.length > 0 && t.expert.lib.chunks.length > 0;
  const r = reviews ? await reviewed(t, own, hold, brief.code) : await answered(t, pages, hold);
  const failed = { delivered: false, violation: false, why: (r.why ?? (r.text.trim() ? 'not_checked' : 'empty')) as llm.Why };
  const check = r.text.trim() ? await llm.evaluate(task, t.question, r.text).catch(() => failed) : failed;
  const outcome: Outcome = { cost: coarse(r.cost, hold).toString(), delivered: check.delivered && !check.violation, violation: check.violation };
  // The checker calls an answer that stopped mid-way empty or off topic. Its owner is told what really happened.
  const why: llm.Why = r.cut && !check.delivered && !check.violation ? 'cut_off' : check.why;
  log('contribution', { agent: t.agent.id, ...outcome, why, work: reviews ? 'review' : 'answer', pages: pages.length, ...r.sizes }, { question: t.question, ...r.seen, answer: r.text, check });
  return { text: r.text, review: r.review, outcome, why, spent: r.cost };
}

/** A line in each considered agent's cabinet: when, which round, picked or not, how it went, and how much of the
 *  composed answer (`marked`) its part carried. Never the question. */
function noteRound(key: string, topic: string, considered: Member[], members: Member[], parts: { outcome: Outcome; why: llm.Why }[], marked: string) {
  const at = new Date().toISOString();
  const shares = sharesOf(marked); // empty if the answer carries no marks: then nobody's share is known
  const composed = parts.filter((p) => p.outcome.delivered).length; // the parts the answer was composed from
  return Promise.all(considered.map((c) => {
    const i = members.findIndex((m) => m.agent.id === c.agent.id);
    const part = parts[i];
    const share = part?.outcome.delivered && shares.size ? { share: shares.get(i) ?? 0, parts: composed } : {};
    const line = part ? { at, job: key, topic, picked: true, ...part.outcome, why: part.why, pay: part.outcome.delivered ? c.agent.rate : '0', ...share } : { at, job: key, topic, picked: false };
    return store.note(c.agent.id, line);
  })).catch((e) => log('note_failed', { job: key, error: String(e) }));
}

/** The customer sent a round's answer back for changes: the owner of each expert whose part was in it is told. */
async function noteRework(key: string) {
  const delivered = ((await chain.job(key))?.slots ?? []).filter((s) => BigInt(s.pay) > 0n);
  await Promise.all(delivered.map((s) => store.note(s.agent, { job: key, reworked: true }))).catch((e) => log('note_failed', { job: key, error: String(e) }));
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

  log('task', { round, escrow: a.escrowAmount, chars: task.length, attachments: job.attachments.length, messages: thread.length }, { task });
  if (giveUp) return refuse('failed', 'The swarm kept failing on our side.');
  if (round > cfg.MAX_REWORKS + 1 && !redo) return stand(`the ${cfg.MAX_REWORKS} reworks included in the price are used up. Please post further changes as a new job.`);
  // Before any paid call: is there anyone to work at all? (After a restart agents are still loading.)
  const pool = candidates(await chain.agents()); // fresh: other rounds may have just taken holds
  if (pool.length === 0) return null;
  if (round > 1 && !redo) {
    const scope = await llm.inScope(brief, fresh.map((n) => n.body).join('\n\n') || '(no message)');
    if (!scope.in_scope) return stand(`this change is new work beyond the original task (${scope.reason}) Please post it as a new job.`);
  }
  if (round > 1) await noteRework(door.key(id, round - 1));
  const screened = await llm.screen({ title: job.title, description: task });
  log('screened', { allow: screened.allow, topic: screened.topic, code: screened.code }, { reason: screened.reason });
  if (!screened.allow) return (void store.count(screened.topic, 'refused'), refuse('rejected', screened.reason));

  const net = budget(usdc(a.escrowAmount), feeBps, door.overhead, door.fee) - (await owedBefore(id, round, door));
  if (round > 1 && net <= 0n) return stand('the budget of this task went to the experts of its earlier rounds. Please post further changes as a new job.');
  const { considered, picked, members: planned, search: queries, replaced } = await team(task, pool, net, door.perAgent);
  const ids = (list: Member[]) => list.map((c) => c.agent.id);
  log('team', { net: net.toString(), considered: ids(considered), picked, members: ids(planned), replaced }, { questions: planned.map((t) => t.question), search: queries });
  if (picked === 0) return (void store.count(screened.topic, 'no_expert'), refuse('rejected', 'No expert in the swarm knows enough for this task.'));
  if (planned.length === 0) return (void store.count(screened.topic, 'over_budget'), refuse('rejected', 'The budget does not cover the experts this task needs.'));
  // The customer's materials: attached files, the links in the brief and messages, and search results if a key is set.
  // Each expert later gets the parts closest to its own question; what could not be read is told to the customer.
  const files = await Promise.all(job.attachments.slice(0, 5).map((f) => door.attachment(f).then(
    (bytes) => textOf(bytes, f.contentType, f.filename).then((text) => ({ url: `attachment: ${f.filename}`, text: text.trim() })),
  ).catch((e: Error): Unread => ({ url: `attachment: ${f.filename}`, why: e.message.slice(0, 80) }))));
  const found = await gather(task, queries);
  const pages = [...files.filter((f): f is Page => 'text' in f && f.text !== ''), ...found.pages];
  // What those files refer to and do not hold, from the same repository: the crate's other modules, its libraries.
  const referredTo = await referred(pages).catch(() => [] as Page[]);
  pages.push(...referredTo);
  const unread = [...files.filter((f): f is Unread => 'why' in f), ...found.unread];
  log('materials', { pages: pages.length, unread: unread.length }, { sources: pages.map((p) => ({ url: p.url, chars: p.text.length })), failed: unread });
  const shelf = await shelve(pages);
  const sources = [...new Set([...linksIn(task), ...pages.map((p) => p.url).filter((u) => u.startsWith('https://'))])];
  // The customer's own: the files they attached and the links they gave. What a search found is not theirs to have reviewed.
  const given = new Set([...pages.map((p) => p.url).filter((u) => u.startsWith('attachment: ') || linksIn(task).includes(u)), ...referredTo.map((p) => p.url)]);

  // Committed: the customer can no longer cancel for free, and each agent's hold is taken.
  if (!a.startedAt) await door.start(id);
  const key = door.key(id, round);
  const members = await commit(key, planned);
  if (members.length === 0) return null; // the team fell apart between planning and holding: plan again
  const parts = await Promise.all(members.map((t) => contribute(task, t, shelf, { given, code: screened.code })));
  const outcomes = parts.map((p) => p.outcome);
  const agents = members.map((t) => t.agent.id);
  void store.count(screened.topic, 'served');

  // Only delivered parts reach the composer; only the composer, the protocol's model, sees more than one.
  // Of a review it sees the titles alone: the findings go to the customer as code joined them, after what it wrote.
  const good = parts.flatMap((p, i) => (p.outcome.delivered ? [{ id: i, question: members[i]!.question, text: p.review ? digestOf(p.review) : p.text, review: p.review }] : []));
  const reviews = good.flatMap((g) => (g.review ? [{ id: g.id, ...g.review }] : []));
  const all = await join(reviews);
  const theirs = head(pages.filter((p) => given.has(p.url)));
  // The swarm tries what it found (review.tried): each finding's finder proves it, the others test the proofs, and
  // what a test refuted goes on the finder's appeal to the arbiter, the protocol's model. Each expert pays for its
  // part from what is left of its hold.
  const extra = new Map<number, bigint>();
  const triers = reviews.map((r) => ({ id: r.id, m: members[r.id]!.expert.m, money: BigInt(members[r.id]!.agent.max_cost) - parts[r.id]!.spent }));
  const judge = { ...members[reviews[0]?.id ?? 0]!.expert.m, name: 'arbiter', expertise: 'The arbiter of a swarm of reviewers: it owes neither side.', method: '', knowledge: [], model: cfg.PROTOCOL_MODEL };
  const trial = await tried(all.findings, triers, task, theirs, judge);
  trial.cost.forEach((c, id) => extra.set(id, c));
  // What stood and is grave gets a test, written by its finder along the path the trial upheld.
  const tests = await tested(trial.findings, triers.map((t) => ({ ...t, money: t.money - (extra.get(t.id) ?? 0n) })), task, theirs);
  tests.cost.forEach((c, id) => extra.set(id, (extra.get(id) ?? 0n) + c));
  trial.findings = tests.findings;
  for (const [id, more] of extra) outcomes[id] = { ...outcomes[id]!, cost: coarse(parts[id]!.spent + more, BigInt(members[id]!.agent.max_cost)).toString() };
  // Each reviewer is paid for what its part was worth: the findings the swarm stood behind, weighed by severity.
  if (trial.findings.some((f) => f.trial)) {
    const worth = weightsOf(trial.findings);
    for (const r of reviews) if (outcomes[r.id]) outcomes[r.id] = { ...outcomes[r.id]!, weight: worth.get(r.id) ?? 0 };
  }
  const joined = { ...all, findings: await controlled(trial.findings, theirs) }; // the controller, if one is set, says its word beside each finding
  const list = joined.findings.length || joined.leads.length ? listOf(joined, reviews.length) : '';
  // An answer made of reviews only opens with one paragraph about them; anything else is composed, the reviews as their titles.
  const onlyReviews = good.length > 0 && reviews.length === good.length;
  const written = !good.length ? ''
    : onlyReviews ? await llm.summarize(task, reviews.map((r) => ({ id: r.id, findings: r.findings.map(lineOf), unconfirmed: r.leads.length })), joined.findings.filter((f) => f.doubted).length).catch(() => '')
    : (await llm.compose(task, previous, good.map(({ id, question, text }) => ({ id, question, text })), sources).catch(() => '')).trim();
  const marked = [written || (list && '> The summary of this answer could not be written. The checked findings follow.'), list].filter(Boolean).join('\n\n');
  await noteRound(key, screened.topic, considered, members, parts, marked);
  if (!marked.trim()) return { outcomes, ...refuse('failed', 'The swarm could not compose an answer to this task.') };
  // Links that existed before this task cannot carry it: the brief's, the pages read and the links in them, the experts' materials.
  const known = new Set([...sources, ...pages.flatMap((p) => linksIn(p.text, 1_000)), ...members.flatMap((t) => [...t.expert.links])]);
  const answer = await gate(provenance(marked).text, known);
  log('composed', { from: good.length, findings: joined.findings.length, leads: joined.leads.length, second: joined.findings.filter((f) => f.second).length, chars: answer.length }, { marked, answer });
  const experts = good.map((g) => members[g.id]!.agent.id).join(', '); // public ids, as in the catalog: the customer may name them next time
  const footer = `---\n*Composed by Swarm-for-Hire from ${good.length} independent expert${good.length > 1 ? 's' : ''} (${experts}), round ${round}.*`;
  const label = (url: string) => url.replace(/^attachment: /, '');
  const read = [...given].map(label);
  const materials = read.length || unread.length
    ? `\n\n*Your materials: ${read.length ? `read ${read.join(', ')}` : 'none could be read'}${unread.length ? `; could not read ${unread.map((u) => `${label(u.url)} (${u.why})`).join(', ')}` : ''}.*`
    : '';
  return { outcomes, submit: `${answer}${materials}\n\n${footer}`.slice(0, 250_000), provenance: { answer: marked, agents } };
}

/** Puts a decision into effect. Every step is safe to repeat: a restart simply calls this again. */
async function settle(id: string, key: string, d: Decision, door: Door) {
  const open = d.outcomes && (await chain.job(key));
  if (open && !open.finished) await chain.finish(key, d.outcomes!);
  if (d.submit) await door.submit(id, d.submit);
  else if (d.decline) await door.decline(id, d.decline.reason, d.decline.detail);
  log(d.submit ? 'submitted' : 'declined', { assignment: id, job: key, outcomes: d.outcomes, reason: d.decline?.reason }, { detail: d.decline?.detail, answer: d.submit });
}

const busy = new Set<string>();
const failed = new Map<string, { n: number; next: number }>(); // per assignment: failures of the current round

/** Serves a task that is waiting for us. Rounds of different tasks run side by side. */
export function serve(row: market.Row, feeBps: number, door: Door = market.door) {
  const id = row.assignment.assignmentId;
  if (row.assignment.status !== 'in_progress' || row.job.jobKind === 'competition' || busy.has(id) || busy.size >= PARALLEL) return;
  const f = failed.get(id);
  if (f && Date.now() < f.next) return;
  busy.add(id);
  let key = '';
  void inJob(id, async () => {
    const round = (await door.versions(id)).length + 1;
    key = door.key(id, round);
    const known = await store.recall<Decision>(key);
    if (known) return settle(id, key, known, door);
    const open = await chain.job(key);
    if (open?.finished) return door.decline(id, 'failed', 'The answer was lost in a runner restart.'); // only if the store was lost
    if (open) await chain.finish(key, open.slots.map(() => ({ cost: '0', delivered: false, violation: false }))); // cut by a restart: holds back, run again
    const d = await work(row, round, feeBps, (failed.get(id)?.n ?? 0) >= TRIES, door);
    if (!d) return log('no_agents', { assignment: id });
    await store.remember(key, d);
    await settle(id, key, d, door);
    failed.delete(id);
  })
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
