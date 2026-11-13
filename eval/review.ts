// Runs the reviews of eval/review-tasks.ts with the runner's own code, outside the chain: each expert of a task
// reviews the task's files (node/src/review.ts), the reviews are joined as a round joins them, and models are
// asked the task alone, at once, with the same files and no knowledge: what the reviews have to beat, one by one
// and put together. Costs are what NEAR AI charged. Results are kept in eval/out/reviews.json; what failed is
// not kept, so the next run asks again.
//   npm run eval:review -- <task id> [<task id> ...] [--alone]      (--alone: only the models alone)
// EVAL_TAG       a name for this version of the review, kept beside the earlier ones ("v2")
// EVAL_ALONE     more models to ask alone, besides the experts' own
// EVAL_LIMIT_USD (default 0.60) the run starts no new work once it has spent that much
// CONTROL_MODEL  also keeps the joined reviews with the controller's word beside each finding
// EVAL_PROOFS=0  the reviews write no proofs: a fifth of a review's cost, and the reading scores findings, not tests
// EVAL_REPEATS=5 also asks the first expert's model alone that many times and keeps the answers as one: what a
//                customer gets who spends on one model, asked again and again, what a swarm costs
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { docsOf, filesOf, linksOf } from '../node/src/audit.ts';
import { cfg } from '../node/src/config.ts';
import { index } from '../node/src/library.ts';
import * as llm from '../node/src/llm.ts';
import { Materials } from '../node/src/materials.ts';
import { controlled, join, listOf, reportOf, review, type Review } from '../node/src/review.ts';
import { MAX_PASSES, partsOf, READ_OUT, usdc } from '../node/src/rules.ts';
import { PUBLIC_CHARS } from '../node/src/web.ts';
import { readAgent } from '../scripts/agent-folder.ts';
import { REVIEWS, type ReviewTask } from './review-tasks.ts';

const OUT = 'eval/out/reviews.json';
const LIMIT = Number(process.env.EVAL_LIMIT_USD ?? '0.60');
const TAG = process.env.EVAL_TAG ? ` ${process.env.EVAL_TAG}` : '';
const ALONE_ROOM = 2 * READ_OUT; // output tokens of a model asked alone: nothing cuts it short, as nothing would cut a customer's own call
type Page = { url: string; text: string };
type Kept = { text: string; usd: number; seconds: number; model?: string; review?: Pick<Review, 'findings' | 'leads' | 'counts'> };
const kept: Record<string, Record<string, Kept>> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
let spent = 0;
const started = new Date().toISOString();
const say = (line: string) => console.error(line);
function keep(task: string, system: string, a: Kept & { why?: string }) {
  spent += a.usd;
  say(`${task} | ${system}: ${a.why ?? 'done'}, $${a.usd.toFixed(4)}, ${Math.round(a.seconds)} s${a.review ? `, ${JSON.stringify(a.review.counts)}` : ''}`);
  if (a.why) return; // what failed is asked again next time
  (kept[task] ??= {})[system] = a;
  mkdirSync('eval/out', { recursive: true });
  writeFileSync(OUT, JSON.stringify(kept, null, 1));
}
const folder = (name: string) => (existsSync(`eval/agents/${name}`) ? `eval/agents/${name}` : `agents/${name}`);
const usd = (micro: bigint) => Number(micro) / 1e6;
const cardOf = (name: string) => {
  const { card, materials } = readAgent(folder(name));
  return { card, m: Materials.parse(materials) };
};

const pagesOf = (t: ReviewTask) => Promise.all(t.files.map(async (url): Promise<Page> => {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return { url, text: await res.text() };
}));

/** Before any money is spent: does every model the run needs answer, and do the files fit what an expert is given? */
async function ready(t: ReviewTask, pages: Page[], models: string[]) {
  const size = pages.reduce((n, p) => n + p.text.length, 0);
  const problems = size > PUBLIC_CHARS ? [`the files are ${size} characters: an expert is given ${PUBLIC_CHARS}, the rest would be cut`] : [];
  const headers = { authorization: `Bearer ${cfg.NEARAI_API_KEY}`, 'content-type': 'application/json' };
  const asked = async (what: string, path: string, body: object) => {
    const at = Date.now();
    const ok = await fetch(`${cfg.NEARAI_URL}${path}`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(45_000) }).then((r) => r.ok, () => false);
    say(`  ${ok ? 'answers' : 'DOES NOT ANSWER'}: ${what} (${Date.now() - at} ms)`);
    if (!ok) problems.push(`${what} does not answer`);
  };
  await Promise.all([
    asked(`embeddings ${cfg.EMBED_MODEL}`, '/embeddings', { model: cfg.EMBED_MODEL, input: ['probe'] }),
    ...models.map((model) => asked(model, '/chat/completions', { model, messages: [{ role: 'user', content: 'Reply with the word: ok' }], max_tokens: 4, chat_template_kwargs: { enable_thinking: false, thinking: false } })),
  ]);
  say(`${t.id}: ${pages.length} files, ${size} characters; ${problems.length ? `NOT READY: ${problems.join('; ')}` : 'ready'}`);
  return problems.length === 0;
}

/** One expert's review of the task's files, as it would run in a round. */
async function reviewed(t: ReviewTask, name: string, pages: Page[]) {
  if (kept[t.id]?.[`review${TAG}: ${name}`]) return;
  const { card, m } = cardOf(name);
  // A review that reads all of the knowledge needs no index of it.
  const lib = partsOf(filesOf(m)).length <= MAX_PASSES ? { chunks: docsOf(m), vectors: [] } : await index(docsOf(m));
  const at = Date.now();
  const r = await review({ m, lib, digest: '', links: linksOf(m) }, t.task, pages, usdc(card.max_cost), process.env.EVAL_PROOFS !== '0');
  keep(t.id, `review${TAG}: ${name}`, { text: r.why ? '' : reportOf(r), usd: usd(r.cost), seconds: (Date.now() - at) / 1000, model: m.pass_model ? `${m.model}, passes on ${m.pass_model}` : m.model, review: { findings: r.findings, leads: r.leads, counts: r.counts }, ...(r.why ? { why: r.why } : {}) });
}

/** The experts' reviews as one answer: what the customer gets below the opening paragraph. With CONTROL_MODEL
 *  set, also the same list with the controller's word beside each finding. */
async function joined(t: ReviewTask, pages: Page[]) {
  const parts = t.experts.map((name, id) => ({ id, r: kept[t.id]?.[`review${TAG}: ${name}`] })).filter((p) => p.r?.review);
  // EVAL_REJOIN names a new joining of reviews already kept: the experts are not asked again, only joined by the code as it is now.
  const again = process.env.EVAL_REJOIN ? `, joined again (${process.env.EVAL_REJOIN})` : '';
  const [plain, second] = [`review${TAG}: the swarm${again}`, `review${TAG}: the swarm${again}, with the controller ${(process.env.CONTROL_MODEL ?? '').split('/').at(-1)}`];
  const wanted = [...(kept[t.id]?.[plain] ? [] : [plain]), ...(process.env.CONTROL_MODEL && !kept[t.id]?.[second] ? [second] : [])];
  if (parts.length < t.experts.length || !wanted.length) return;
  const all = await join(parts.map((p) => ({ id: p.id, findings: p.r!.review!.findings, leads: p.r!.review!.leads })));
  if (wanted.includes(plain)) keep(t.id, plain, { text: listOf(all, parts.length), usd: 0, seconds: Math.max(...parts.map((p) => p.r!.seconds)) });
  if (wanted.includes(second)) keep(t.id, second, { text: listOf({ ...all, findings: await controlled(all.findings, pages) }, parts.length), usd: 0, seconds: 0 });
}

/** A model asked the task alone and at once: the call of an expert's answer, with the files, none of a sponsor's
 *  materials, and room to write as much as it has to say. */
async function alone(t: ReviewTask, model: string, pages: Page[]) {
  const system = `alone, with room: ${model.split('/')[1]}`;
  if (kept[t.id]?.[system]) return;
  const m = Materials.parse({ name: 'nobody', model, expertise: 'A careful reviewer of smart contracts.', method: '', knowledge: [] });
  const at = Date.now();
  const r = await llm.answer(m, [], t.task, pages, usdc('2'), ALONE_ROOM);
  keep(t.id, system, { text: r.text, usd: usd(r.cost), seconds: (Date.now() - at) / 1000, model, ...(r.why ? { why: r.why } : {}) });
}

/** One model asked the task alone several times, the answers one after another: the opponent at a swarm's budget. */
async function repeated(t: ReviewTask, model: string, times: number, pages: Page[]) {
  const system = `alone, ${times} times: ${model.split('/')[1]}`;
  if (kept[t.id]?.[system]) return;
  const m = Materials.parse({ name: 'nobody', model, expertise: 'A careful reviewer of smart contracts.', method: '', knowledge: [] });
  const at = Date.now();
  const runs = [];
  for (let i = 0; i < times; i++) runs.push(await llm.answer(m, [], t.task, pages, usdc('2'), ALONE_ROOM)); // one after another: a model's queue is short
  const failed = runs.find((r) => r.why);
  keep(t.id, system, { text: runs.map((r, i) => `# Answer ${i + 1} of ${times}\n\n${r.text}`).join('\n\n'), usd: runs.reduce((sum, r) => sum + usd(r.cost), 0), seconds: (Date.now() - at) / 1000, model, ...(failed ? { why: failed.why } : {}) });
}

/** What NEAR AI billed for the calls of this run, beside our own count of them. */
async function billed() {
  const dir = process.env.TRACE_DIR;
  if (!dir) return;
  const calls = readdirSync(dir).flatMap((f) => readFileSync(`${dir}/${f}`, 'utf8').split('\n').filter((l) => l.includes('"event":"llm"')).map((l) => JSON.parse(l))).filter((l) => l.t >= started);
  const numbered = calls.filter((l) => l.id).map((l) => l.id as string);
  const metered = calls.reduce((s, l) => s + (l.micro_usd ?? 0) / 1e6, 0);
  const headers = { authorization: `Bearer ${cfg.NEARAI_API_KEY}`, 'content-type': 'application/json' };
  const bill = !numbered.length ? 0 : await fetch(`${cfg.NEARAI_URL}/billing/costs`, { method: 'POST', headers, body: JSON.stringify({ requestIds: numbered.slice(0, 1_000) }), signal: AbortSignal.timeout(60_000) })
    .then((r) => r.json()).then((b: { requests: { costNanoUsd: number }[] }) => b.requests.reduce((s, r) => s + r.costNanoUsd / 1e9, 0), () => null);
  say(`this run: ${calls.length} calls, our meter $${metered.toFixed(4)}; NEAR AI's bill for the ${numbered.length} it numbered: ${bill === null ? 'not answered' : `$${bill.toFixed(4)}`}; ${calls.filter((l) => l.error).length} failed, counted at their worst`);
}

const args = process.argv.slice(2);
const ids = args.filter((a) => !a.startsWith('--'));
const tasks = REVIEWS.filter((t) => ids.includes(t.id));
if (!tasks.length) throw new Error(`name a task: ${REVIEWS.map((t) => `"${t.id}"`).join(', ')}`);
await llm.refreshPrices();
for (const t of tasks) {
  const pages = await pagesOf(t);
  const experts = args.includes('--alone') ? [] : t.experts.map(cardOf);
  // Each expert's model is asked alone, and those EVAL_ALONE names: a stronger one, to see what one call of it finds.
  const asked = [...new Set([...t.experts.map((name) => cardOf(name).m.model), ...(process.env.EVAL_ALONE ?? '').split(',').filter(Boolean)])];
  const needed = [...new Set([...asked, ...experts.flatMap(({ m }) => [m.model, ...(m.pass_model ? [m.pass_model] : [])]), ...(experts.length ? [cfg.COMPOSE_MODEL ?? cfg.PROTOCOL_MODEL, ...(process.env.CONTROL_MODEL ? [process.env.CONTROL_MODEL] : [])] : [])])];
  if (!(await ready(t, pages, needed))) continue;
  if (spent < LIMIT) await Promise.all(asked.map((model) => alone(t, model, pages)));
  const repeats = Number(process.env.EVAL_REPEATS ?? '0');
  if (repeats > 1 && spent < LIMIT) await repeated(t, cardOf(t.experts[0]!).m.model, repeats, pages);
  for (const name of experts.length ? t.experts : []) if (spent < LIMIT) await reviewed(t, name, pages); // one after another: a model's queue is short
  if (experts.length) await joined(t, pages);
  if (spent >= LIMIT) say(`stopped: $${spent.toFixed(3)} spent, the limit is $${LIMIT}`);
}
await billed();
say(`spent in this run by our meter: $${spent.toFixed(4)}`);
