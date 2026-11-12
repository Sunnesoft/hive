// A review: how an expert that declares `work: 'review'` goes through a customer's materials. An answer is one
// call with the six chunks of knowledge closest to the question: measured on audits, that uses a tenth of a
// checklist and finds no more than the model alone (eval/README.md). A review uses all of the knowledge:
//   passes   one call per part of the knowledge: what does this part find in the materials?
//   records  code reads the findings out of the replies. From here on no model rewrites the list as a whole:
//            a model that merges a long list drops its rare items, and the rare ones are the point
//   groups   records that say the same thing, by how close their embeddings are
//   checks   one call per group: does it hold in the materials? A finding that holds must quote the lines it
//            rests on, and code looks those lines up in the materials: no such line, no finding
//   proofs   code for the gravest findings, when the task asks for code
// Every call is the expert's own model under a public policy (policies/pass.md, check.md, proof.md), paid from the
// expert's hold. The worst case of the whole review must fit the hold before the first call is sent.
import type { Expert } from './admit.ts';
import { CHUNK, search, similarity, unit } from './library.ts';
import * as llm from './llm.ts';
import { bySeverity, CHECK_IN, clip, findingsIn, groupsOf, grounded, MAX_CHECKS, MAX_PASSES, MAX_PROOFS, PASS_CHARS, piecesOf, PROOF_IN, SAME, SEVERITIES, showFinding, type Finding } from './rules.ts';
import type { Page } from './web.ts';

export type Checked = Finding & { proof?: string };
/** How a review went, in numbers: for the log and the owner's trial run, never the findings themselves. */
export type Counts = { passes: number; raised: number; groups: number; checked: number; held: number; proofs: number };
export type Review = { findings: Checked[]; cost: bigint; counts: Counts; why?: llm.Why };

const AT_ONCE = 3; // calls of one review in flight at once: more, and a model's queue answers with timeouts
// Chunks of a larger knowledge that always fit MAX_PASSES parts: a part is closed only when the next chunk does
// not fit, so with one chunk less than fills it every closed part is still more than that full.
const FITS = MAX_PASSES * (Math.floor(PASS_CHARS / CHUNK) - 1);

/** `work` over the items, at most AT_ONCE at a time, results in the items' order. */
async function each<T, R>(items: T[], work: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < items.length; i = next++) out[i] = await work(items[i]!);
  };
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, items.length) }, worker));
  return out;
}

/** The parts of the knowledge a review reads: all of it, if it fits MAX_PASSES parts. Of a larger one, the chunks
 *  closest to the question and to what the expert chose to look up after reading the materials, in their own order. */
async function parts(expert: Expert, question: string, pages: Page[], hold: bigint) {
  const all = piecesOf(expert.lib.chunks);
  if (all.length <= MAX_PASSES) return { pieces: all, cost: 0n };
  const looked = await llm.lookups(expert.m, question, pages, hold);
  const sought = await search(expert.lib, question, looked.queries, FITS).catch(() => null);
  const close = new Set(sought?.chunks);
  const pieces = sought ? piecesOf(expert.lib.chunks.filter((c) => close.has(c))) : all.slice(0, MAX_PASSES);
  return { pieces, cost: looked.cost + (sought?.cost ?? 0n) };
}

/** What two findings are compared by: the place, the claim and how it happens, as the model worded them. */
const wordsOf = (f: Finding) => `${f.where} | ${f.title}\n${f.how}`.slice(0, 500);

/** The items in groups that say the same thing (rules.groupsOf over their embeddings). The protocol pays for the
 *  embeddings. If they cannot be had, every item stands alone: nothing is joined that may be different. */
async function same<T>(items: T[], findingOf: (item: T) => Finding): Promise<T[][]> {
  if (items.length < 2) return items.map((x) => [x]);
  const vectors = await llm.embed('findings', items.map((x) => wordsOf(findingOf(x)))).then((r) => r.vectors.map(unit), () => null);
  if (!vectors) return items.map((x) => [x]);
  return groupsOf(items.length, (i, j) => similarity(vectors[i]!, vectors[j]!) >= SAME).map((g) => g.map((i) => items[i]!));
}

const gravest = (group: Finding[]) => bySeverity(group)[0]!;
const rank = (f: Finding) => SEVERITIES.indexOf(f.severity);
const section = (title: string, body: string, bytes: number) => clip(`# ${title}\n\n${body}`, bytes);
/** The code of a proof: the reply's code block, or the whole reply if the model drew no fence. A reply that ran
 *  into its limit is half a test: no proof. */
const codeOf = (r: { text: string; cut?: boolean }) =>
  r.cut || !r.text.trim() ? undefined : (/```[^\n]*\n[\s\S]*?\n```/.exec(r.text)?.[0] ?? `\`\`\`\n${r.text.trim()}\n\`\`\``);

/** One expert's review of the materials it was given. `code`: the task asks for code, so the gravest findings get proofs. */
export async function review(expert: Expert, question: string, pages: Page[], hold: bigint, code: boolean): Promise<Review> {
  const { m } = expert;
  const counts: Counts = { passes: 0, raised: 0, groups: 0, checked: 0, held: 0, proofs: 0 };
  const price = llm.priceOf(m.model);
  if (!price) return { findings: [], cost: 0n, counts, why: 'model_unavailable' };
  const chosen = await parts(expert, question, pages, hold);
  let cost = chosen.cost;
  const stop = (why: llm.Why): Review => ({ findings: [], cost, counts, why });

  const worst =
    chosen.pieces.reduce((sum, piece) => sum + llm.stepCeiling('pass', m, piece, question, pages, '', price), 0n) +
    BigInt(MAX_CHECKS) * llm.stepCeiling('check', m, '', question, pages, 'x'.repeat(CHECK_IN), price) +
    (code ? BigInt(MAX_PROOFS) * llm.stepCeiling('proof', m, '', question, pages, 'x'.repeat(PROOF_IN), price) : 0n);
  if (cost + worst > hold) return stop('too_expensive');

  /** One step, tried again once if the model failed: a failed call costs the expert nothing. */
  const step = async (kind: llm.ReviewStep, knowledge: string, about: string) => {
    const first = await llm.step(kind, m, knowledge, question, pages, about, hold);
    const r = first.why === 'model_failed' ? await llm.step(kind, m, knowledge, question, pages, about, hold) : first;
    cost += r.cost;
    return r;
  };

  const passes = await each(chosen.pieces, (piece) => step('pass', piece, ''));
  const read = passes.filter((r) => !r.why);
  if (!read.length) return stop(passes[0]?.why ?? 'empty'); // no part of the knowledge could be held against the materials
  const raised = read.flatMap((r) => findingsIn(r.text));
  Object.assign(counts, { passes: read.length, raised: raised.length });

  // The gravest groups are checked first, and of equally grave ones those more passes arrived at.
  const groups = (await same(raised, (f) => f)).sort((a, b) => rank(gravest(a)) - rank(gravest(b)) || b.length - a.length);
  const material = pages.map((p) => p.text).join('\n');
  const checks = await each(groups.slice(0, MAX_CHECKS), (group) => step('check', '', section('Findings to check', group.map((f, i) => showFinding(f, i + 1)).join('\n\n'), CHECK_IN)));
  const checked = checks.filter((r) => !r.why);
  if (groups.length && !checked.length) return stop(checks[0]?.why ?? 'model_failed');
  const held = checked.flatMap((r) => findingsIn(r.text)).filter((f) => grounded(f.evidence, material));
  // Two groups may have held the same thing: of findings that say the same, the gravest wording stays.
  const findings: Checked[] = bySeverity((await same(held, (f) => f)).map(gravest));
  Object.assign(counts, { groups: groups.length, checked: checked.length, held: findings.length });

  const grave = code ? findings.filter((f) => f.severity === 'Critical' || f.severity === 'High').slice(0, MAX_PROOFS) : [];
  const proofs = await each(grave, (f) => step('proof', '', section('Finding to prove', showFinding(f), PROOF_IN)).then(codeOf));
  grave.forEach((f, i) => proofs[i] && (f.proof = proofs[i]));
  counts.proofs = proofs.filter(Boolean).length;
  return { findings, cost, counts };
}

// ---- a review as text ----

const tally = (findings: Finding[]) => SEVERITIES.flatMap((s) => { const n = findings.filter((f) => f.severity === s).length; return n ? [`${n} ${s}`] : []; }).join(', ');

/** One finding as the customer reads it. `marks`: the [[id]] of the experts it came from; `note`: who found it. */
const entry = (f: Checked, n: number, marks = '', note = '') =>
  [
    `### ${n}. ${f.severity}: ${f.title}${marks}`,
    [f.where && `*Where:* ${f.where}.`, note].filter(Boolean).join(' '),
    f.how,
    f.evidence && `**Evidence:** ${f.evidence}`,
    f.fix && `**Fix:** ${f.fix}`,
    f.proof && `**Proof** (written, not run):\n\n${f.proof}`,
  ].filter(Boolean).join('\n\n');

/** A review as one expert's contribution: what the checker of contributions reads and an owner's trial run shows. */
export const reportOf = (r: Pick<Review, 'findings' | 'counts'>) =>
  r.findings.length
    ? [`Checked findings: ${r.findings.length} (${tally(r.findings)}).`, ...r.findings.map((f, i) => entry(f, i + 1))].join('\n\n')
    : `Checked findings: none. The review read the materials with ${r.counts.passes} part${r.counts.passes === 1 ? '' : 's'} of its checklist and raised ${r.counts.raised} candidate${r.counts.raised === 1 ? '' : 's'}; none held against the materials.`;

/** The same contribution as the composer gets it: the titles only. The findings reach the customer as code joined
 *  them (`listOf`), so the composer has nothing to drop or to reword. */
export const digestOf = (findings: Finding[]) =>
  findings.length ? `Checked findings (given to the customer in full after your answer):\n${findings.map((f, i) => `${i + 1}. ${f.severity} | ${f.where || '—'} | ${f.title}`).join('\n')}` : 'Checked findings: none held against the materials.';

export type Joined = Checked & { by: number[] };
/** The findings of several experts as one list, the gravest first: those that say the same thing become one, in
 *  its gravest wording, with everyone who found it. The experts never saw each other's findings. */
export async function join(reviews: { id: number; findings: Checked[] }[]): Promise<Joined[]> {
  const all = reviews.flatMap((r) => r.findings.map((f) => ({ f, id: r.id })));
  const groups = await same(all, (x) => x.f);
  return bySeverity(groups.map((g) => {
    const first = bySeverity(g.map((x) => x.f))[0]!;
    const proof = first.proof ?? g.find((x) => x.f.proof)?.f.proof;
    return { ...first, ...(proof ? { proof } : {}), by: [...new Set(g.map((x) => x.id))].sort((a, b) => a - b) };
  }));
}

/** The joined findings as the last part of the customer's answer, each with the [[id]] marks of its experts.
 *  `experts`: how many reviewed, so that "found by 2 of 3" says how sure a finding is. */
export const listOf = (findings: Joined[], experts: number) =>
  [
    `## Findings\n\n${findings.length} (${tally(findings)}). Each was checked on its own against your materials and quotes the lines it rests on.`,
    ...findings.map((f, i) => entry(f, i + 1, f.by.map((id) => ` [[${id}]]`).join(''), experts > 1 ? `*Found by ${f.by.length} of ${experts} experts.*` : '')),
  ].join('\n\n');
