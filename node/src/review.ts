// A review: how an expert that declares `work: 'review'` goes through a customer's materials. An answer is one
// call with the six chunks of knowledge closest to the question: measured on audits, that uses a tenth of a
// checklist and finds no more than the model alone (eval/README.md). A review uses all of the knowledge:
//   passes   one call per part of the knowledge (a file of it): what does this part find in the materials?
//   records  code reads the findings out of the replies. From here on no model rewrites the list as a whole:
//            a model that merges a long list drops its rare items, and the rare ones are the point
//   groups   records that say the same thing, by how close their embeddings are
//   checks   one call per group: does it hold in the materials? A finding that holds must quote the lines it
//            rests on, and code looks those lines up in the materials: no such line, not confirmed
//   leads    what a check did not confirm is not thrown away either: a model's "no" is a judgement like any
//            other. If it would be grave, it is listed apart, as unconfirmed
//   proofs   code for the gravest confirmed findings, when the task asks for code
// Every call is the expert's own model under a public policy (policies/pass.md, check.md, proof.md), paid from the
// expert's hold. The worst case of the whole review must fit the hold before the first call is sent.
import type { Expert } from './admit.ts';
import { filesOf } from './audit.ts';
import { cfg } from './config.ts';
import { CHUNK, search, similarity, unit } from './library.ts';
import * as llm from './llm.ts';
import { log } from './log.ts';
import { alike, bySeverity, CHECK_IN, clip, findingsIn, groupsOf, grounded, MAX_CHECKS, MAX_LEADS, MAX_PASSES, MAX_PROOFS, PASS_CHARS, partsOf, piecesOf, PROOF_IN, SAME, SAME_WORDS, SEVERITIES, showFinding, type Finding } from './rules.ts';
import type { Page } from './web.ts';

export type Checked = Finding & { proof?: string };
/** How a review went, in numbers: for the log and the owner's trial run, never the findings themselves. */
export type Counts = { passes: number; raised: number; groups: number; checked: number; held: number; leads: number; proofs: number };
/** `findings` held their check; `leads` were raised by a pass and not confirmed, as the pass worded them. */
export type Review = { findings: Checked[]; leads: Finding[]; cost: bigint; counts: Counts; why?: llm.Why };

const AT_ONCE = 3; // calls of one review in flight at once: more, and a model's queue answers with timeouts
const EMBED_WAIT = 30_000; // ms a review waits for the embeddings of its findings before it compares them by words
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

/** The parts of the knowledge a review reads (rules.partsOf): all of it, if it fits MAX_PASSES parts. Of a larger
 *  one, the chunks closest to the question and to what the expert chose to look up after reading the materials. */
async function parts(expert: Expert, question: string, pages: Page[], hold: bigint) {
  const all = partsOf(filesOf(expert.m));
  if (all.length <= MAX_PASSES) return { pieces: all, cost: 0n };
  const looked = await llm.lookups(expert.m, question, pages, hold);
  const sought = await search(expert.lib, question, looked.queries, FITS).catch(() => null);
  const close = new Set(sought?.chunks);
  const pieces = sought ? piecesOf(expert.lib.chunks.filter((c) => close.has(c))) : all.slice(0, MAX_PASSES);
  return { pieces, cost: looked.cost + (sought?.cost ?? 0n) };
}

/** What two findings are compared by: the place, the claim and how it happens, as the model worded them. */
const wordsOf = (f: Finding) => `${f.where} | ${f.title}\n${f.how}`.slice(0, 500);
const claimOf = (f: Finding) => `${f.where} | ${f.title}`;

/** The items in groups that say the same thing (rules.groupsOf): by their embeddings, which the protocol pays for.
 *  If the embedding service does not answer, by the words they share, in the claim or in the whole of it: fewer
 *  are joined, so more are checked, and the review still ends. */
export async function same<T>(items: T[], findingOf: (item: T) => Finding): Promise<T[][]> {
  if (items.length < 2) return items.map((x) => [x]);
  const [words, claims] = [items.map((x) => wordsOf(findingOf(x))), items.map((x) => claimOf(findingOf(x)))];
  const vectors = await llm.embed('findings', words, EMBED_WAIT).then((r) => r.vectors.map(unit), () => null);
  if (!vectors) log('degraded', { step: 'findings', by: 'words' });
  const close = vectors
    ? (i: number, j: number) => similarity(vectors[i]!, vectors[j]!) >= SAME
    : (i: number, j: number) => alike(claims[i]!, claims[j]!) >= SAME_WORDS || alike(words[i]!, words[j]!) >= SAME_WORDS;
  return groupsOf(items.length, close).map((g) => g.map((i) => items[i]!));
}

const gravest = <T extends Finding>(group: T[]) => bySeverity(group)[0]!;
const rank = (f: Finding) => SEVERITIES.indexOf(f.severity);
const grave = (f: Finding) => f.severity === 'Critical' || f.severity === 'High';
/** Worth a reader's time unconfirmed: what would matter if it were true. An unconfirmed Low is noise. */
const worthALook = (f: Finding) => rank(f) <= SEVERITIES.indexOf('Medium');
const section = (title: string, body: string, bytes: number) => clip(`# ${title}\n\n${body}`, bytes);
/** The code of a proof: the reply's code block, or the whole reply if the model drew no fence. A reply that ran
 *  into its limit is half a test: no proof. */
const codeOf = (r: { text: string; cut?: boolean }) =>
  r.cut || !r.text.trim() ? undefined : (/```[^\n]*\n[\s\S]*?\n```/.exec(r.text)?.[0] ?? `\`\`\`\n${r.text.trim()}\n\`\`\``);

/** One expert's review of the materials it was given. `code`: the task asks for code, so the gravest findings get proofs. */
export async function review(expert: Expert, question: string, pages: Page[], hold: bigint, code: boolean): Promise<Review> {
  const { m } = expert;
  const counts: Counts = { passes: 0, raised: 0, groups: 0, checked: 0, held: 0, leads: 0, proofs: 0 };
  const price = llm.priceOf(m.model);
  if (!price) return { findings: [], leads: [], cost: 0n, counts, why: 'model_unavailable' };
  const chosen = await parts(expert, question, pages, hold);
  let cost = chosen.cost;
  const stop = (why: llm.Why): Review => ({ findings: [], leads: [], cost, counts, why });

  const worst =
    chosen.pieces.reduce((sum, piece) => sum + llm.stepCeiling('pass', m, piece, question, pages, '', price), 0n) +
    BigInt(MAX_CHECKS) * llm.stepCeiling('check', m, '', question, pages, 'x'.repeat(CHECK_IN), price) +
    (code ? BigInt(MAX_PROOFS) * llm.stepCeiling('proof', m, '', question, pages, 'x'.repeat(PROOF_IN), price) : 0n);
  if (cost + worst > hold) return stop('too_expensive');

  /** One step, tried again once if the model failed: a failed call costs the expert nothing. No step starts once
   *  the review has run its time: the task has a deadline on chain, and a late answer is no answer. */
  const deadline = Date.now() + cfg.REVIEW_TIMEOUT_MS;
  const late = { text: '', cost: 0n, why: 'model_failed' as const };
  const step = async (kind: llm.ReviewStep, knowledge: string, about: string): ReturnType<typeof llm.step> => {
    if (Date.now() > deadline) return late;
    const first = await llm.step(kind, m, knowledge, question, pages, about, hold);
    const r = first.why === 'model_failed' && Date.now() < deadline ? await llm.step(kind, m, knowledge, question, pages, about, hold) : first;
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
  const toCheck = groups.slice(0, MAX_CHECKS);
  const checks = await each(toCheck, (group) => step('check', '', section('Findings to check', group.map((f, i) => showFinding(f, i + 1)).join('\n\n'), CHECK_IN)));
  if (toCheck.length && checks.every((r) => r.why) && Date.now() < deadline) return stop(checks[0]!.why!); // the model is not there; out of time, what was raised is still given
  const held = checks.map((r) => (r.why ? [] : findingsIn(r.text).filter((f) => grounded(f.evidence, material))));
  // A group of which nothing held, or that was never checked, stays as the pass raised it: not confirmed.
  const open = groups.filter((_, i) => !held[i]?.length).map(gravest);
  // Two groups may have held the same thing, and a lead may say what a finding says: of those that say the same,
  // the confirmed one stays, in its gravest wording.
  const sorted = await same([...held.flat().map((f) => ({ f, held: true })), ...open.map((f) => ({ f, held: false }))], (x) => x.f);
  const confirmed = (g: typeof sorted[number]) => g.filter((x) => x.held).map((x) => x.f);
  const findings: Checked[] = bySeverity(sorted.filter((g) => confirmed(g).length).map((g) => gravest(confirmed(g))));
  const leads = bySeverity(sorted.filter((g) => !confirmed(g).length).map((g) => gravest(g.map((x) => x.f)))).filter(worthALook).slice(0, MAX_LEADS);
  Object.assign(counts, { groups: groups.length, checked: checks.filter((r) => !r.why).length, held: findings.length, leads: leads.length });

  const toProve = code ? findings.filter(grave).slice(0, MAX_PROOFS) : [];
  const proofs = await each(toProve, (f) => step('proof', '', section('Finding to prove', showFinding(f), PROOF_IN)).then(codeOf));
  toProve.forEach((f, i) => proofs[i] && (f.proof = proofs[i]));
  counts.proofs = proofs.filter(Boolean).length;
  return { findings, leads, cost, counts };
}

// ---- a review as text ----

const tally = (findings: Finding[]) => SEVERITIES.flatMap((s) => { const n = findings.filter((f) => f.severity === s).length; return n ? [`${n} ${s}`] : []; }).join(', ');
const some = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

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
/** One lead, in a line: what it would be and where, as the pass worded it. */
const line = (f: Finding, note = '') => `- **${f.severity}**${f.where ? `, ${f.where}` : ''}: ${f.title}${note}`;

/** A review as one expert's contribution: what the checker of contributions reads and an owner's trial run shows. */
export const reportOf = (r: Pick<Review, 'findings' | 'leads' | 'counts'>) =>
  [
    r.findings.length
      ? `Checked findings: ${r.findings.length} (${tally(r.findings)}).`
      : `Checked findings: none. The review read the materials with ${some(r.counts.passes, 'part')} of its checklist and raised ${some(r.counts.raised, 'candidate')}; none was confirmed against the materials.`,
    ...r.findings.map((f, i) => entry(f, i + 1)),
    ...(r.leads.length ? [`Not confirmed: ${r.leads.length}. A pass of the checklist raised them and their check did not confirm them.`, r.leads.map((f) => line(f)).join('\n')] : []),
  ].join('\n\n');

/** The same contribution as the composer gets it: the titles only. The findings reach the customer as code joined
 *  them (`listOf`), so the composer has nothing to drop or to reword. */
export const digestOf = (r: Pick<Review, 'findings' | 'leads'>) =>
  [
    r.findings.length ? `Checked findings (given to the customer in full after your answer):\n${r.findings.map((f, i) => `${i + 1}. ${f.severity} | ${f.where || '—'} | ${f.title}`).join('\n')}` : 'Checked findings: none was confirmed against the materials.',
    ...(r.leads.length ? [`Raised and not confirmed, listed for the customer apart as unverified: ${r.leads.length}.`] : []),
  ].join('\n');

/** `by`: the experts that confirmed it, and whose it is; `seen`: every expert that raised it, confirmed or not. */
export type Joined = Checked & { by: number[]; seen: number[] };
export type Lead = Finding & { seen: number[] };
/** The reviews of several experts as one: findings that say the same thing become one, in its gravest confirmed
 *  wording, with everyone who found it; what no expert confirmed stays a lead. The experts never saw each other's
 *  findings. The gravest first; of leads, then those more experts raised. */
export async function join(reviews: { id: number; findings: Checked[]; leads: Finding[] }[]): Promise<{ findings: Joined[]; leads: Lead[] }> {
  const all = reviews.flatMap((r) => [...r.findings.map((f) => ({ f: f as Checked, id: r.id, held: true })), ...r.leads.map((f) => ({ f: f as Checked, id: r.id, held: false }))]);
  const groups = await same(all, (x) => x.f);
  const ids = (g: typeof all) => [...new Set(g.map((x) => x.id))].sort((a, b) => a - b);
  const findings = groups.flatMap((g): Joined[] => {
    const held = g.filter((x) => x.held);
    if (!held.length) return [];
    const first = gravest(held.map((x) => x.f));
    const proof = first.proof ?? held.find((x) => x.f.proof)?.f.proof;
    return [{ ...first, ...(proof ? { proof } : {}), by: ids(held), seen: ids(g) }];
  });
  const leads = groups.filter((g) => !g.some((x) => x.held)).map((g): Lead => ({ ...gravest(g.map((x) => x.f)), seen: ids(g) }));
  return { findings: bySeverity(findings), leads: bySeverity(leads.sort((a, b) => b.seen.length - a.seen.length)).slice(0, MAX_LEADS) };
}

/** The joined review as the last part of the customer's answer. Each finding carries the [[id]] marks of the
 *  experts that confirmed it; a lead carries none: it is nobody's finding yet. `experts`: how many reviewed, so
 *  that "found by 2 of 3" says how sure a finding is. */
export const listOf = (r: { findings: Joined[]; leads: Lead[] }, experts: number) =>
  [
    r.findings.length
      ? `## Findings\n\n${r.findings.length} (${tally(r.findings)}). Each was checked on its own against your materials and quotes the lines it rests on.`
      : '## Findings\n\nNo finding was confirmed against your materials.',
    ...r.findings.map((f, i) => entry(f, i + 1, f.by.map((id) => ` [[${id}]]`).join(''), experts > 1 ? `*Found by ${f.seen.length} of ${experts} experts.*` : '')),
    ...(r.leads.length
      ? [`## Not confirmed\n\n${some(r.leads.length, 'more point was', 'more points were')} raised by an expert's checklist and not confirmed when checked. They are unverified: read them as leads, not as findings.`,
        r.leads.map((f) => line(f, experts > 1 && f.seen.length > 1 ? ` *(raised by ${f.seen.length} of ${experts} experts)*` : '')).join('\n')]
      : []),
  ].join('\n\n');
