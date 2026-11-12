// Runs the reviews of eval/review-tasks.ts with the runner's own code, outside the chain: each expert of a task
// reviews the task's files (node/src/review.ts), the reviews are joined as a round joins them, and each expert's
// model is also asked the task alone, at once, with the same files and no knowledge: what the review has to beat.
// Costs are what NEAR AI charged. Results are kept in eval/out/reviews.json and nothing is run twice.
//   npm run eval:review -- <task id> [<task id> ...] [--alone]      (--alone: only the models alone)
// EVAL_LIMIT_USD (default 0.50): the run stops starting work once it has spent that much.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { docsOf, filesOf, linksOf } from '../node/src/audit.ts';
import { index } from '../node/src/library.ts';
import * as llm from '../node/src/llm.ts';
import { Materials } from '../node/src/materials.ts';
import { controlled, join, listOf, reportOf, review, type Review } from '../node/src/review.ts';
import { MAX_PASSES, partsOf, usdc } from '../node/src/rules.ts';
import { readAgent } from '../scripts/agent-folder.ts';
import { REVIEWS, type ReviewTask } from './review-tasks.ts';

const OUT = 'eval/out/reviews.json';
const LIMIT = Number(process.env.EVAL_LIMIT_USD ?? '0.50');
type Kept = { text: string; usd: number; seconds: number; model?: string; review?: Pick<Review, 'findings' | 'leads' | 'counts'>; why?: string };
const kept: Record<string, Record<string, Kept>> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
let spent = 0;
const keep = (task: string, system: string, a: Kept) => {
  (kept[task] ??= {})[system] = a;
  spent += a.usd;
  mkdirSync('eval/out', { recursive: true });
  writeFileSync(OUT, JSON.stringify(kept, null, 1));
  console.error(`${task} | ${system}: ${a.why ?? 'done'}, $${a.usd.toFixed(4)}, ${Math.round(a.seconds)} s${a.review ? `, ${JSON.stringify(a.review.counts)}` : ''}`);
};
const folder = (name: string) => (existsSync(`eval/agents/${name}`) ? `eval/agents/${name}` : `agents/${name}`);
const usd = (micro: bigint) => Number(micro) / 1e6;

const pagesOf = (t: ReviewTask) => Promise.all(t.files.map(async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return { url, text: await res.text() };
}));

/** One expert's review of the task's files, as it would run in a round. */
async function reviewed(t: ReviewTask, name: string, pages: { url: string; text: string }[]) {
  if (kept[t.id]?.[`review: ${name}`]) return;
  const { card, materials } = readAgent(folder(name));
  const m = Materials.parse(materials);
  // A review that reads all of the knowledge needs no index of it.
  const lib = partsOf(filesOf(m)).length <= MAX_PASSES ? { chunks: docsOf(m), vectors: [] } : await index(docsOf(m));
  const at = Date.now();
  const r = await review({ m, lib, digest: '', links: linksOf(m) }, t.task, pages, usdc(card.max_cost), true);
  keep(t.id, `review: ${name}`, { text: r.why ? '' : reportOf(r), usd: usd(r.cost), seconds: (Date.now() - at) / 1000, model: m.model, review: { findings: r.findings, leads: r.leads, counts: r.counts }, ...(r.why ? { why: r.why } : {}) });
}

/** The experts' reviews as one answer: what the customer gets below the composer's summary. With CONTROL_MODEL
 *  set, also the same list with the controller's word beside each finding. */
async function joined(t: ReviewTask, pages: { url: string; text: string }[]) {
  const parts = t.experts.map((name, id) => ({ id, r: kept[t.id]?.[`review: ${name}`] })).filter((p) => p.r?.review && !p.r.why);
  const second = `review: the swarm, with the controller ${(process.env.CONTROL_MODEL ?? '').split('/').at(-1)}`;
  const wanted = [...(kept[t.id]?.['review: the swarm'] ? [] : ['review: the swarm']), ...(process.env.CONTROL_MODEL && !kept[t.id]?.[second] ? [second] : [])];
  if (parts.length < t.experts.length || !wanted.length) return;
  const all = await join(parts.map((p) => ({ id: p.id, findings: p.r!.review!.findings, leads: p.r!.review!.leads })));
  if (wanted.includes('review: the swarm')) keep(t.id, 'review: the swarm', { text: listOf(all, parts.length), usd: 0, seconds: Math.max(...parts.map((p) => p.r!.seconds)) });
  if (wanted.includes(second)) keep(t.id, second, { text: listOf({ ...all, findings: await controlled(all.findings, pages) }, parts.length), usd: 0, seconds: 0 });
}

/** The model of an expert, asked the task alone and at once: the same call as an expert's answer, with the files
 *  and none of a sponsor's materials. */
async function alone(t: ReviewTask, model: string, pages: { url: string; text: string }[]) {
  const system = `alone, at once: ${model.split('/')[1]}`;
  if (kept[t.id]?.[system]) return;
  const m = Materials.parse({ name: 'nobody', model, expertise: 'A careful reviewer of smart contracts.', method: '', knowledge: [] });
  const at = Date.now();
  const r = await llm.answer(m, [], t.task, pages, usdc('2'));
  keep(t.id, system, { text: r.text, usd: usd(r.cost), seconds: (Date.now() - at) / 1000, model, ...(r.why ? { why: r.why } : {}) });
}

const args = process.argv.slice(2);
const ids = args.filter((a) => !a.startsWith('--'));
const tasks = REVIEWS.filter((t) => ids.includes(t.id));
if (!tasks.length) throw new Error(`name a task: ${REVIEWS.map((t) => `"${t.id}"`).join(', ')}`);
await llm.refreshPrices();
for (const t of tasks) {
  const pages = await pagesOf(t);
  console.error(`${t.id}: ${pages.length} files, ${pages.reduce((n, p) => n + p.text.length, 0)} characters`);
  const models = [...new Set(t.experts.map((name) => Materials.parse(readAgent(folder(name)).materials).model))];
  if (spent < LIMIT) await Promise.all(models.map((model) => alone(t, model, pages)));
  if (!args.includes('--alone')) {
    for (const name of t.experts) if (spent < LIMIT) await reviewed(t, name, pages); // one after another: a model's queue is short
    await joined(t, pages);
  }
  if (spent >= LIMIT) console.error(`stopped: $${spent.toFixed(3)} spent, the limit is $${LIMIT}`);
}
console.error(`spent in this run: $${spent.toFixed(4)}`);
