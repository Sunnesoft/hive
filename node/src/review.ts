// A review: how an expert that declares `work: 'review'` goes through a customer's materials. An answer is one
// call with the six chunks of knowledge closest to the question: measured on audits, that uses a tenth of a
// checklist and finds no more than the model alone (eval/README.md). A review uses all of the knowledge:
//   reading  first the expert reads the materials with no checklist at all and writes down what it sees. A
//            checklist narrows a model to its items: on a contract where one call of a model found seven of an
//            audit's findings, passes that reported "only what this part leads to" raised none of the main ones
//   passes   one call per part of the knowledge (a file of it): what does this part find in the materials?
//            A pass is told what earlier passes raised and reports only what they missed: left alone, every
//            pass spends its reply on the flaws anyone sees first and never gets to what its own part is for
//   records  code reads the findings out of the replies. From here on no model rewrites the list as a whole:
//            a model that merges a long list drops its rare items, and the rare ones are the point
//   groups   records that say the same thing, by how close their embeddings are, and then by the model's answer
//            to one narrow question (see `same` below): one flaw in ten wordings is checked once
//   checks   do the materials do what it says? Every wording is checked, five at a time, with all of the
//            materials and the part of the knowledge it was raised from. The verdict is a form, not prose. A
//            finding that holds must quote the lines it rests on, and code looks those lines up in the
//            materials: no such line, not confirmed. What is true holds whatever it costs; the cost is its severity
//   leads    what a check did not confirm is not thrown away either: a model's "no" is a judgement like any
//            other, and the best model we tried refused a finding it had just made itself. A grave one is
//            given whole, with what the check said; a Medium one in a line
//   together the confirmed findings are looked at together: what do two of them allow that neither says alone?
//            (One gives a permission, another lets anyone use it.) What that raises is checked like any finding
//   same     the expert's model is asked one narrow question: which of these say the same thing in other words?
//            Before the checks its answer decides what is checked together. After them it only puts findings
//            side by side: each wording stays a finding of its own, marked as sorted with the one above it. Folded
//            into one, a true finding was once headed by a wrong neighbour's title, and doubted for it
//   proofs   code for the gravest confirmed findings, when the task asks for code
// Every call is the expert's own model under a public policy (policies/pass.md, check.md, proof.md), paid from the
// expert's hold. The worst case of the whole review must fit the hold before the first call is sent.
import type { Expert } from './admit.ts';
import { filesOf } from './audit.ts';
import { cfg } from './config.ts';
import { CHUNK, search, similarity, unit } from './library.ts';
import { lint } from './lint.ts';
import * as llm from './llm.ts';
import { log } from './log.ts';
import { alike, bySeverity, CHECK_AT_ONCE, CHECK_IN, clip, COMBINE_IN, findingsIn, groupsOf, grounded, KNOWN_IN, lineOf, MAX_CHECKS, MAX_COMBINED, middleOf, PASS_FINDINGS, READ_FINDINGS, MAX_LEADS, MAX_PASSES, MAX_PROOFS, PASS_CHARS, partition, partsOf, piecesOf, PROOF_IN, SAME, SAME_IN, SAME_WORDS, SEVERITIES, showFinding, usdc, type Finding } from './rules.ts';
import { read, type Page } from './web.ts';

/** `also`: other wordings of the same finding, which the model named the same and code joined to this one. They
 *  stay on the page: if the model was wrong to join them, the customer still reads what was raised. */
/** `checkSaid`: what its check answered, if it did not confirm it. `sortedWith`: the title of the finding above it
 *  that a model took it to be the same as; it is kept apart, in case it is not. */
export type Raised = Finding & { also?: string[]; checkSaid?: string; sortedWith?: string };
/** `second`: what the controller said of it, if it did not simply agree; `doubted`: it said the materials stop it. */
export type Checked = Raised & { proof?: string; second?: string; doubted?: boolean };
/** How a review went, in numbers: for the log and the owner's trial run, never the findings themselves. */
export type Counts = { own: number; passes: number; raised: number; groups: number; checked: number; combined: number; held: number; leads: number; proofs: number; cut: number; unpaid: number }; // unpaid: calls not made because the expert's hold was spent
/** `findings` held their check; `leads` were raised by a pass and not confirmed, as the pass worded them; `unsure`:
 *  every one not confirmed, Low ones too, and `open`: what a step could not take to its end. The last two are not
 *  given to the customer: they point the team at places to look closer (hotSpots). */
export type Review = { findings: Checked[]; leads: Raised[]; unsure: Raised[]; open: llm.Open[]; cost: bigint; counts: Counts; why?: llm.Why };

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

type Item = { f: Checked; held: boolean; id?: number };
/** What a group of items that say the same is known by: of its confirmed wordings, or of all of them if none is
 *  confirmed, the one in the middle by severity (rules.middleOf). */
const headOf = (g: Item[]) => middleOf((g.some((x) => x.held) ? g.filter((x) => x.held) : g).map((x) => x.f));
/** Groups that code could not join because they are worded differently, joined by a model's answer to one narrow
 *  question (policies/same.md): which of these say the same thing? The gravest are asked about first, as many as
 *  fit the question. Returns each joined group as the groups it was made of. */
async function sortedBy(model: string, groups: Item[][], cap?: bigint): Promise<{ groups: Item[][][]; cost: bigint }> {
  const byRank = [...groups].sort((a, b) => rank(headOf(a)) - rank(headOf(b)));
  const lines = byRank.map((g) => clip(lineOf(headOf(g)), 240));
  let room = SAME_IN;
  const asked = lines.filter((l) => (room -= Buffer.byteLength(l)) >= 0).length;
  const said = await llm.sameFindings(model, lines.slice(0, asked), cap);
  return { groups: [...partition(asked, said.groups).map((ids) => ids.map((i) => byRank[i]!)), ...byRank.slice(asked).map((g) => [g])], cost: said.cost };
}
/** A finding with the other wordings it was joined from, none of them twice and none its own. */
const withAlso = <T extends Raised>(f: T, wordings: string[]): T => {
  const seen = new Set([f.title.toLowerCase()]);
  const others = wordings.filter((t) => !seen.has(t.toLowerCase()) && !!seen.add(t.toLowerCase()));
  return { ...f, ...(others.length ? { also: others } : {}) };
};
/** What code took for one thing, as one finding: its middle wording, with what its members were joined from before. */
const oneOf = (g: Item[]): Checked => withAlso(headOf(g), g.flatMap((x) => x.f.also ?? []));
/** Groups a model named the same, laid out and not folded: each wording that code could tell from the others
 *  stays a finding of its own, the middle one by severity first, the rest after it and marked as sorted with it.
 *  The groups come gravest first. If the model was wrong to put two together, both are still there to read. */
function unfolded<T extends Raised>(groups: Item[][][], made: (g: Item[]) => T): { heads: T[]; all: T[] } {
  const laid = groups.map((joined) => {
    const each = joined.map(made);
    const head = middleOf(each);
    return { head, rest: bySeverity(each.filter((f) => f !== head)).map((f) => ({ ...f, sortedWith: head.title })) };
  }).sort((a, b) => rank(a.head) - rank(b.head));
  return { heads: laid.map((x) => x.head), all: laid.flatMap((x) => [x.head, ...x.rest]) };
}
const confirmedIn = (joined: Item[][]) => joined.some((g) => g.some((x) => x.held));
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
  const counts: Counts = { own: 0, passes: 0, raised: 0, groups: 0, checked: 0, combined: 0, held: 0, leads: 0, proofs: 0, cut: 0, unpaid: 0 }; // own: findings of the expert's own reading // cut: replies that ran into their limit, the sign that a limit is too low for this model
  const [price, reading] = [llm.priceOf(m.model), llm.priceOf(llm.modelOf('pass', m))]; // the passes may run on a cheaper model
  if (!price || !reading) return { findings: [], leads: [], unsure: [], open: [], cost: 0n, counts, why: 'model_unavailable' };
  const chosen = await parts(expert, question, pages, hold);
  let cost = chosen.cost;
  const stop = (why: llm.Why): Review => ({ findings: [], leads: [], unsure: [], open: [], cost, counts, why });
  const opens: llm.Open[] = []; // what the reading and the passes could not take to their end

  /** What is left of the expert's hold: every call is paid from it, and a reply may be as long as it pays for. A
   *  review spends what its expert allowed and no more; when it runs out, what was found so far is given. */
  const left = () => (hold > cost ? hold - cost : 0n);
  /** One step, tried again once if the model failed: a failed call costs the expert nothing. No step starts once
   *  the review has run its time: the task has a deadline on chain, and a late answer is no answer. */
  const deadline = Date.now() + cfg.REVIEW_TIMEOUT_MS;
  const paid = <R extends { cost: bigint; why?: llm.Why; cut?: boolean }>(r: R) => {
    cost += r.cost;
    if (r.cut) counts.cut++;
    if (r.why === 'too_expensive') counts.unpaid++;
    return r;
  };
  const found = async (kind: 'read' | 'pass' | 'combine', knowledge: string, about: string) => {
    if (Date.now() > deadline) return { findings: [] as Finding[], open: [] as llm.Open[], cost: 0n, why: 'model_failed' as const };
    const first = await llm.raise(kind, m, knowledge, question, pages, about, left());
    const r = paid(first.why === 'model_failed' && Date.now() < deadline ? await llm.raise(kind, m, knowledge, question, pages, about, left()) : first);
    opens.push(...r.open);
    return r;
  };

  // The expert's own reading comes first, and the passes are told what it found.
  const known = new Map<string, Finding>();
  const first = await found('read', '', '');
  if (first.why === 'too_expensive') return stop('too_expensive'); // the hold does not pay for even the first reading
  // What the expert's tools find with no model (lint.ts) stands beside its own reading, and is checked the same way.
  const own = [...first.findings, ...(m.tools?.includes('near-lint') ? lint(pages) : [])];
  for (const f of own) known.set(`${f.where} | ${f.title}`.toLowerCase(), f);
  counts.own = own.length;
  // Passes run a few at a time; each is told what was raised before it, a line a finding, the gravest first.
  const raisedSoFar = () => (known.size ? section('Already raised by earlier passes', bySeverity([...known.values()]).map((f) => `- ${lineOf(f)}`).join('\n'), KNOWN_IN) : '');
  // Each finding a pass raised keeps the part of the knowledge that raised it: its check is given that part.
  const partOf = new Map<Finding, string>();
  const passes = await each(chosen.pieces, async (piece) => {
    const r = await found('pass', piece, raisedSoFar());
    for (const f of r.findings) { known.set(`${f.where} | ${f.title}`.toLowerCase(), f); partOf.set(f, piece); }
    return r;
  });
  const read = passes.filter((r) => !r.why);
  if (!read.length && first.why) return stop(passes[0]?.why ?? first.why); // neither the reading nor any pass came back
  const raised = [...own, ...read.flatMap((r) => r.findings)];
  Object.assign(counts, { passes: read.length, raised: raised.length });

  // What the passes raised, in groups that say the same: by code's measure, then by the model's answer to the
  // narrow question, so that one flaw raised in ten wordings is checked once, not ten times. In a group the
  // different wordings come first: a check is shown as many of them as fit. The gravest groups are checked first,
  // and of equally grave ones those more passes arrived at.
  const alikeRaised = await sortedBy(m.model, await same(raised.map((f): Item => ({ f, held: false })), (x) => x.f), left());
  cost += alikeRaised.cost;
  // A check is shown every different wording of a group, CHECK_AT_ONCE at a time: one wording of ten may be the
  // one that says how it happens, and a check that is shown twenty claims dismisses them in one line.
  const groups = alikeRaised.groups
    .flatMap((joined) => {
      const seen = new Set<string>();
      const heads = bySeverity(joined.flat().map((x) => x.f)).filter((f) => !seen.has(f.title.toLowerCase()) && !!seen.add(f.title.toLowerCase())) as Finding[];
      return Array.from({ length: Math.ceil(heads.length / CHECK_AT_ONCE) }, (_, k) => heads.slice(k * CHECK_AT_ONCE, (k + 1) * CHECK_AT_ONCE)).map((all) => ({ all, wordings: all.map((f) => f.title), raised: joined.flat().length }));
    })
    .sort((a, b) => rank(gravest(a.all)) - rank(gravest(b.all)) || b.raised - a.raised);
  const material = pages.map((p) => p.text).join('\n');
  const toCheck = m.review?.checks ? groups.slice(0, m.review.checks) : groups; // all of them, the gravest first, unless the expert said how many it pays for
  /** The check of one group: what of it holds and quotes a line that is in the materials, and, if nothing does,
   *  what the check said instead. Tried again once if the model failed; not started once the review's time is up. */
  const judged = async (group: Finding[]): Promise<{ confirmed: Checked[]; said?: string; failed?: llm.Why }> => {
    if (Date.now() > deadline) return { confirmed: [], failed: 'model_failed' };
    // A check reads all of the materials, and the part of the knowledge its findings were raised from: the rule that
    // "assert_one_yocto without #[payable] can never succeed" stood in the knowledge, and the checks that judged
    // findings about that very function never saw it.
    const about = section('Findings to check', group.map((f, i) => showFinding(f, i + 1)).join('\n\n'), CHECK_IN);
    const knowledge = [...new Set(group.map((f) => partOf.get(f)).filter((k): k is string => !!k))].join('\n\n');
    const once = await llm.check(m, question, pages, about, left(), knowledge);
    const r = paid(once.why === 'model_failed' && Date.now() < deadline ? await llm.check(m, question, pages, about, left(), knowledge) : once);
    const severityOf = (s: string) => SEVERITIES.find((x) => x.toLowerCase() === s.trim().toLowerCase()) ?? gravest(group).severity;
    const lines = (quote: string) => quote.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3).map((l) => `\`${l.replace(/`/g, "'")}\``).join('\n').slice(0, 500);
    const confirmed = r.verdicts.filter((v) => v.holds && grounded(v.quote, material))
      .map((v): Checked => ({ severity: severityOf(v.severity), where: v.where.trim().slice(0, 120), title: v.title.trim().slice(0, 240), how: v.how.trim().slice(0, 900), evidence: lines(v.quote), fix: (v.fix ?? '').trim().slice(0, 500) }));
    const said = confirmed.length ? undefined : (r.verdicts.find((v) => !v.holds)?.how.trim().slice(0, 400) ?? (r.verdicts.length ? 'It held the finding true and quoted no line that stands in the materials.' : undefined));
    return { confirmed, ...(said ? { said } : {}), ...(r.why ? { failed: r.why } : {}) };
  };
  const checks = await each(toCheck, (group) => judged(group.all));
  if (toCheck.length && checks.every((r) => r.failed) && Date.now() < deadline) return stop(checks[0]!.failed!); // the model is not there; out of time, what was raised is still given
  // The wordings a group was joined from stay with what its check confirmed: under the first finding, none that is a finding itself.
  const held = checks.map((r, i): Checked[] => {
    const own = new Set(r.confirmed.map((f) => f.title.toLowerCase()));
    return r.confirmed.map((f, n) => (n ? f : withAlso(f, toCheck[i]!.wordings.filter((t) => !own.has(t.toLowerCase())))));
  });

  // What the confirmed findings allow together: raised by one call that sees them all, a line each, then checked
  // one by one like any finding. It can only add: what it raises and its check does not confirm is left out.
  const soFar = bySeverity(held.flat());
  const together = soFar.length > 1 ? await found('combine', '', section('Confirmed findings', soFar.map((f, i) => `${i + 1}. ${lineOf(f)}\n   ${f.how.slice(0, 200)}`).join('\n'), COMBINE_IN)) : { findings: [] as Finding[] };
  const combined: Checked[] = (await each(together.findings, (f) => judged([f]))).flatMap((r) => r.confirmed);
  counts.combined = combined.length;
  // A group of which nothing held, or that was never checked, stays as it was raised, with what its check said.
  const open = groups.flatMap((g, i): Raised[] => (held[i]?.length ? [] : [{ ...withAlso(gravest(g.all), g.wordings), ...(checks[i]?.said ? { checkSaid: checks[i]!.said } : {}) }]));
  // Two groups may have held the same thing, and a lead may say what a finding says. By code's measure such a lead
  // is the finding. The model's answer joins findings with findings and leads with leads, never a lead into a
  // finding: joined there once, a finding the check had wrongly refused became "another wording" of a different one.
  const items: Item[] = [...[...held.flat(), ...combined].map((f) => ({ f, held: true })), ...open.map((f) => ({ f, held: false }))];
  const byCode = await same(items, (x) => x.f);
  const [sure, unsure] = [await sortedBy(m.model, byCode.filter((g) => g.some((x) => x.held)), left()), await sortedBy(m.model, byCode.filter((g) => !g.some((x) => x.held)), left())];
  cost += sure.cost + unsure.cost;
  const [confirmed, open2] = [unfolded(sure.groups, oneOf), unfolded(unsure.groups, oneOf)];
  const findings: Checked[] = confirmed.all;
  const leads = open2.all.filter(worthALook).slice(0, MAX_LEADS);
  Object.assign(counts, { groups: groups.length, checked: checks.filter((r) => !r.failed).length, held: findings.length, leads: leads.length });

  const toProve = code ? confirmed.heads.filter(grave).slice(0, MAX_PROOFS) : []; // one proof for what was sorted as one finding
  const proofs = await each(toProve, async (f) => (Date.now() > deadline ? undefined : codeOf(paid(await llm.step('proof', m, '', question, pages, section('Finding to prove', showFinding(f), PROOF_IN), left())))));
  toProve.forEach((f, i) => proofs[i] && (f.proof = proofs[i]));
  counts.proofs = proofs.filter(Boolean).length;
  return { findings, leads, unsure: open2.all, open: opens, cost, counts };
}

// ---- a review as text ----

const tally = (findings: Finding[]) => SEVERITIES.flatMap((s) => { const n = findings.filter((f) => f.severity === s).length; return n ? [`${n} ${s}`] : []; }).join(', ');
const some = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One finding as the customer reads it. `marks`: the [[id]] of the experts it came from; `note`: who found it.
 *  A finding that stands beside another as the same is given briefly: what it says, how, and the lines it rests on.
 *  The fix and the proof are with the finding it stands beside; if it is not the same after all, it is all there
 *  to be read. */
const entry = (f: Checked, n: number, marks = '', note = '') =>
  [
    `### ${n}. ${f.severity}: ${f.title}${marks}`,
    [f.where && `*Where:* ${f.where}.`, note].filter(Boolean).join(' '),
    f.sortedWith && `*Sorted with "${f.sortedWith}" above as the same finding; kept apart in case it is not.*`,
    f.how,
    !f.sortedWith && f.also?.length && `*The same was raised as:* ${f.also.slice(0, 4).join('; ')}${f.also.length > 4 ? `; and ${f.also.length - 4} more` : ''}`,
    f.second && `*Second opinion, from the controller:* ${f.second}`,
    f.evidence && `**Evidence:** ${f.evidence}`,
    !f.sortedWith && f.fix && `**Fix:** ${f.fix}`,
    !f.sortedWith && f.proof && `**Proof** (written, not run):\n\n${f.proof}`,
  ].filter(Boolean).join('\n\n');
/** A minor finding in brief: what is wrong, where, how in a sentence or two, and the line it rests on. */
const briefly = (f: Checked, n: number, marks = '', note = '') =>
  [
    `### ${n}. ${f.severity}: ${f.title}${marks}`,
    [f.where && `*Where:* ${f.where}.`, note].filter(Boolean).join(' '),
    clip(f.how, 300),
    f.second && `*Second opinion, from the controller:* ${f.second}`,
    f.evidence && `**Evidence:** ${f.evidence.split('\n')[0]}`,
  ].filter(Boolean).join('\n\n');
/** A grave finding that was not confirmed, whole: what was raised, in its own words, and what its check said. */
const unconfirmed = (f: Raised, n: number, note = '') =>
  [
    `### ${n}. ${f.severity}, not confirmed: ${f.title}`,
    [f.where && `*Where:* ${f.where}.`, note].filter(Boolean).join(' '),
    f.sortedWith && `*Sorted with "${f.sortedWith}" above as the same; kept apart in case it is not.*`,
    f.how,
    f.also?.length && `*The same was raised as:* ${f.also.slice(0, 4).join('; ')}${f.also.length > 4 ? `; and ${f.also.length - 4} more` : ''}`,
    f.checkSaid && `*Its check said:* ${f.checkSaid}`,
  ].filter(Boolean).join('\n\n');
/** The findings that were not confirmed: the grave ones whole, numbered on from `from`, then the others a line each. */
const notConfirmed = (leads: Raised[], from: number, noteOf: (f: Raised, whole: boolean) => string) => {
  const [whole, brief] = [leads.filter(grave), leads.filter((f) => !grave(f))];
  return [...whole.map((f, i) => unconfirmed(f, from + i + 1, noteOf(f, true))), ...(brief.length ? [brief.map((f) => line(f, noteOf(f, false))).join('\n')] : [])];
};
/** One lead, in a line: what it would be and where, as the pass worded it, and the other wordings joined to it. */
const line = (f: Raised, note = '') =>
  `- **${f.severity}**${f.where ? `, ${f.where}` : ''}: ${f.title}${note}${f.also?.length ? ` *(also raised as: ${f.also.slice(0, 2).join('; ')}${f.also.length > 2 ? `; and ${f.also.length - 2} more` : ''})*` : ''}`;

/** A review as one expert's contribution: what the checker of contributions reads and an owner's trial run shows. */
export const reportOf = (r: Pick<Review, 'findings' | 'leads' | 'counts'>) =>
  [
    r.findings.length
      ? `Checked findings: ${r.findings.length} (${tally(r.findings)}).`
      : `Checked findings: none. The review read the materials with ${some(r.counts.passes, 'part')} of its checklist and raised ${some(r.counts.raised, 'candidate')}; none was confirmed against the materials.`,
    ...r.findings.map((f, i) => entry(f, i + 1)),
    ...(r.leads.length ? [`Not confirmed: ${r.leads.length}. A reading or a pass of the checklist raised them and their check did not confirm them.`, ...notConfirmed(r.leads, r.findings.length, () => '')] : []),
  ].join('\n\n');

/** The same contribution as the composer gets it: the titles only. The findings reach the customer as code joined
 *  them (`listOf`), so the composer has nothing to drop or to reword. */
export const digestOf = (r: Pick<Review, 'findings' | 'leads'>) =>
  [
    r.findings.length ? `Checked findings (given to the customer in full after your answer):\n${r.findings.map((f, i) => `${i + 1}. ${f.severity} | ${f.where || '—'} | ${f.title}`).join('\n')}` : 'Checked findings: none was confirmed against the materials.',
    ...(r.leads.length ? [`Raised and not confirmed, listed for the customer apart as unverified: ${r.leads.length}.`] : []),
  ].join('\n');

/** `by`: the experts that confirmed it, and whose it is; `seen`: every expert that raised it, confirmed or not;
 *  `crossed`: what another expert of the team said when it checked a grave finding only one expert had confirmed. */
/** How the swarm tried a finding: whether its proof stands (most of its lines in the materials, no step through
 *  code not shown), how many other experts confirmed or refuted it with a line code found, and, if it was
 *  refuted, whether the arbiter upheld the finder's appeal. */
export type Trial = { proved: boolean; confirm: number; note: number; refute: number; confirmedBy: number[]; upheld?: boolean };
export type Joined = Checked & { by: number[]; seen: number[]; crossed?: { by: number; holds: boolean; said: string }; hotspot?: boolean; trial?: Trial };
export type Lead = Raised & { seen: number[] };
/** The reviews of several experts as one list. Which findings are one is the protocol's model's answer to one
 *  narrow question (policies/same.md): the same flaw, the same cause in the same place, so that one fix closes
 *  both, whatever words each expert used. It sees every wording, a line each, and what it names the same is one
 *  finding: in the middle of its confirmed wordings, the others listed under it, counted for every expert that
 *  confirmed any of them. That rule is not one of text: what one fix closes is the same flaw in a video or a plan
 *  too. What no expert confirmed stays a lead. The experts never saw each other's findings. The gravest first. */
export async function join(reviews: { id: number; findings: Checked[]; leads: Raised[] }[]): Promise<{ findings: Joined[]; leads: Lead[] }> {
  const all: Item[] = reviews.flatMap((r) => [...r.findings.map((f) => ({ f, id: r.id, held: true })), ...r.leads.map((f) => ({ f, id: r.id, held: false }))]);
  const model = cfg.COMPOSE_MODEL ?? cfg.PROTOCOL_MODEL;
  // Wordings that are word for word the same, in the same place, need no model to be one.
  const verbatim = (items: Item[]) => {
    const by = new Map<string, Item[]>();
    for (const x of items) {
      const key = `${x.f.where} | ${x.f.title}`.toLowerCase().replace(/\s+/g, ' ').trim();
      by.set(key, [...(by.get(key) ?? []), x]);
    }
    return [...by.values()];
  };
  const [held, unheld] = [verbatim(all.filter((x) => x.held)), verbatim(all.filter((x) => !x.held))];
  const sorted = (reviews.length < 2 ? [...held, ...unheld].map((g) => [g]) : [...(await sortedBy(model, held)).groups, ...(await sortedBy(model, unheld)).groups])
    .map((joined) => [joined.flat()]);
  const ids = (g: Item[]) => [...new Set(g.map((x) => x.id!))].sort((a, b) => a - b);
  const wordings = (g: Item[]) => withAlso(headOf(g), g.flatMap((x) => [x.f.title, ...(x.f.also ?? [])]));
  const found = (g: Item[]): Joined => {
    const [confirmed, first] = [g.filter((x) => x.held), wordings(g)];
    const proof = first.proof ?? confirmed.find((x) => x.f.proof)?.f.proof;
    return { ...first, ...(proof ? { proof } : {}), by: ids(confirmed), seen: ids(g) };
  };
  const findings = unfolded(sorted.filter(confirmedIn), found).all;
  const leads = unfolded(sorted.filter((j) => !confirmedIn(j)), (g): Lead => ({ ...wordings(g), seen: ids(g) })).all;
  return { findings, leads: leads.slice(0, MAX_LEADS) };
}

/** What the privileged roles of the code can do (policies/powers.md), set down by one expert of the team after the
 *  reviews: each power a finding of its own, tried by the swarm as any finding is. Audits list them every time; a
 *  review that judges each power alone leaves them out, as intended. */
export async function powersOf<T extends Joined>(expert: { id: number; m: Expert['m']; money: bigint }, question: string, pages: Page[]): Promise<{ findings: T[]; cost: bigint }> {
  const r = await llm.raise('powers', expert.m, '', question, pages, '', expert.money);
  const material = pages.map((p) => p.text).join('\n');
  const findings = r.findings.filter((f) => grounded(f.evidence, material)).map((f) => ({ ...f, by: [expert.id], seen: [expert.id] }) as unknown as T);
  return { findings, cost: r.cost };
}

/** A finding the testers took for true and harmless more often than for a loss is a note, apart from the findings. */
const harmless = (f: Joined) => !!f.trial && f.trial.note > f.trial.confirm;
/** What the swarm stands behind: proved, not a note, and backed by two (its finders and the testers who confirmed
 *  it) with no refutation, or upheld by the arbiter on appeal. */
export const standsTried = (f: Joined) => !!f.trial?.proved && !harmless(f) && ((f.by.length + f.trial.confirm >= 2 && f.trial.refute === 0) || f.trial.upheld === true);
export const isNoteTried = (f: Joined) => !!f.trial?.proved && harmless(f) && f.trial.refute === 0;
const WORTH: Record<Finding['severity'], number> = { Critical: 27, High: 9, Medium: 3, Low: 1, Info: 0 };
/** What each expert's part of a round was worth, by the findings the swarm stood behind, weighed by severity: of
 *  each, seven tenths to the experts who found it and three to those who tested and confirmed it (all of it to the
 *  finders if none did). A note, or a finding that did not hold, is worth nothing: noise costs its expert what it
 *  spent and earns it nothing. In tenths, for the contract. */
export function weightsOf(findings: Joined[]): Map<number, number> {
  const w = new Map<number, number>();
  const give = (ids: number[], v: number) => ids.forEach((id) => w.set(id, (w.get(id) ?? 0) + v / ids.length));
  for (const f of findings.filter(standsTried)) {
    const [finders, testers, worth] = [f.by.length ? f.by : f.seen, f.trial!.confirmedBy, WORTH[f.severity] * 10];
    if (testers.length) { give(finders, worth * 0.7); give(testers, worth * 0.3); } else give(finders, worth);
  }
  return new Map([...w].map(([id, v]) => [id, Math.round(v)]));
}

/** A proof goes to the testers if it was not withdrawn and code finds at least one of its lines (in the materials,
 *  or in the public file of a library a step names: `sources`). A step whose line code does not find is not
 *  thrown out by code: it is shown to the testers marked as such, and they settle it. */
const foundIn = (s: llm.Proof['steps'][number], material: string, sources: Map<string, string>) => grounded(s.line, s.source ? (sources.get(s.source) ?? '') : material);
export const provedIn = (p: llm.Proof | undefined, material: string, sources: Map<string, string> = new Map()) =>
  !!p && !p.withdrawn && p.steps.some((s) => foundIn(s, material, sources));
/** The libraries' files a proof may stand on: public source code, at a fixed address, nothing else. */
const LIBRARY_HOSTS = /^https:\/\/(raw\.githubusercontent\.com|github\.com|docs\.rs)\//;
const MAX_LIBRARY_FILES = 12; // library files fetched for one trial
/** A few lines of a library's file around the line a step stands on: what a tester or the arbiter reads to check it. */
const around = (text: string, line: string) => {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => l.replace(/\s+/g, '').includes(line.trim().split('\n')[0]!.replace(/\s+/g, '').slice(0, 60)));
  return at < 0 ? '' : lines.slice(Math.max(0, at - 4), at + 5).join('\n');
};
const PROVE_AT_ONCE = 15; // findings one expert proves in one call
const TEST_AT_ONCE = 20; // proofs one expert tests in one call

/** The swarm tries its findings, with no judge but on appeal. Each finding's first finder gives its proof, step by
 *  step on lines of the materials (policies/prove.md); every other expert tests the proofs it did not write and
 *  looks for the step that breaks (policies/mark.md); a finding a test refuted with a line code finds goes, with its
 *  finder's one appeal and one rule of the finder's knowledge, to the arbiter (policies/appeal.md, arbiter.md). The
 *  other experts never see an appeal or the rule in it. On eight held-out NEAR contracts, read blind: of the team's
 *  487 items 18 were wrong; of those proved and tested by two, 9; the arbiter agreed with the readers on 13 appeals
 *  of 16. Each expert pays for its proofs, tests and appeals from what is left of its hold; the arbiter is the
 *  protocol's. */
export async function tried<T extends Joined>(findings: T[], team: { id: number; m: Expert['m']; money: bigint }[], question: string, pages: Page[], judge: Expert['m']): Promise<{ findings: T[]; cost: Map<number, bigint> }> {
  const cost = new Map<number, bigint>();
  if (team.length < 2 || !findings.length) return { findings, cost };
  const material = pages.map((p) => p.text).join('\n');
  const spend = (id: number, c: bigint) => cost.set(id, (cost.get(id) ?? 0n) + c);
  const left = (t: { id: number; money: bigint }) => t.money - (cost.get(t.id) ?? 0n);
  const finder = (f: T) => team.find((t) => t.id === Math.min(...(f.by.length ? f.by : f.seen)))!;
  const shown = (f: T, k: number) => `### ${k}. ${f.severity}: ${f.title}\n\n${[f.where && `Where: ${f.where}.`, f.how, f.evidence && `Evidence: ${f.evidence}`].filter(Boolean).join('\n\n')}`;
  const chunks = <X>(xs: X[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, (i + 1) * n));
  // The proofs, each expert of its own findings.
  const proofs = new Map<number, llm.Proof>();
  await each(team.flatMap((t) => chunks(findings.map((f, k) => ({ f, k })).filter(({ f }) => finder(f)?.id === t.id), PROVE_AT_ONCE).map((part) => ({ t, part }))), async ({ t, part }) => {
    const r = await llm.prove(t.m, question, pages, `# Your findings\n\n${part.map(({ f, k }) => shown(f, k)).join('\n\n')}`, left(t));
    spend(t.id, r.cost);
    for (const p of r.proofs) if (part.some(({ k }) => k === p.id)) proofs.set(p.id, p);
  });
  // The library files the proofs stand on, fetched by code from their public addresses.
  const sources = new Map<string, string>();
  const wanted = [...new Set([...proofs.values()].flatMap((p) => p.steps.map((s) => s.source?.trim() ?? '')).filter((u) => LIBRARY_HOSTS.test(u)))].slice(0, MAX_LIBRARY_FILES);
  await Promise.all(wanted.map(async (url) => { const text = await read(url).catch(() => ''); if (text) sources.set(url, text); }));
  const proved = new Set(findings.map((_, k) => k).filter((k) => provedIn(proofs.get(k), material, sources)));
  const showStep = (s: llm.Proof['steps'][number], i: number) => `${i + 1}. ${s.does}\n   \`${s.line}\`${foundIn(s, material, sources) ? '' : '\n   (code did not find this line in the materials or in the library named: check it)'}${s.source ? `\n   in ${s.source}:\n\`\`\`\n${around(sources.get(s.source) ?? '', s.line)}\n\`\`\`` : ''}`;
  const showProof = (k: number) => { const p = proofs.get(k)!; return `### ${k}. ${findings[k]!.severity}: ${findings[k]!.title}\n\n${p.steps.map(showStep).join('\n')}\n\nEnd: ${p.end}`; };
  // The tests, each expert of the proofs it did not write.
  const marks: { k: number; by: number; mark: llm.Mark }[] = [];
  await each(team.flatMap((t) => chunks([...proved].filter((k) => !findings[k]!.by.includes(t.id) && finder(findings[k]!)?.id !== t.id), TEST_AT_ONCE).map((part) => ({ t, part }))), async ({ t, part }) => {
    const r = await llm.mark(t.m, question, pages, `# Findings and their proofs\n\n${part.map(showProof).join('\n\n')}`, left(t));
    spend(t.id, r.cost);
    for (const m of r.marks) if (part.includes(m.id) && m.mark !== 'pass' && grounded(m.quote ?? '', material)) marks.push({ k: m.id, by: t.id, mark: m });
  });
  // The appeals of what a test refuted, each to the arbiter alone.
  const upheld = new Map<number, boolean>();
  await each([...proved].filter((k) => marks.some((x) => x.k === k && x.mark.mark === 'refute')), async (k) => {
    const f = findings[k]!, t = finder(f), said = `${f.where} ${f.title} ${f.how}`;
    const knowledge = partsOf(filesOf(t.m)).map((part) => ({ part, near: alike(part, said) })).sort((a, b) => b.near - a.near).slice(0, 2).map((x) => x.part).join('\n\n');
    const against = marks.filter((x) => x.k === k && x.mark.mark === 'refute').map((x) => `- step ${x.mark.step ?? 0}: ${x.mark.why ?? ''} The line: \`${x.mark.quote}\``).join('\n');
    const a = await llm.appeal(t.m, knowledge, question, pages, `# Your finding and its proof\n\n${showProof(k)}\n\n# The refutation\n\n${against}`, left(t));
    spend(t.id, a.cost);
    if (!a.appeal || a.appeal.withdrawn) return upheld.set(k, false);
    const rule = a.appeal.rule.trim() && knowledge.replace(/\s+/g, ' ').includes(a.appeal.rule.trim().replace(/\s+/g, ' ')) ? a.appeal.rule.trim() : ''; // a rule counts only if it is in the finder's knowledge
    const v = await llm.check(judge, question, pages, `# The finding and its proof\n\n${showProof(k)}\n\n# The refutations\n\n${against}\n\n# The finder's appeal\n\n${rule ? `The rule of its knowledge it rests on: "${rule}"\n\n` : ''}${a.appeal.answer}`, usdc('1'), '', 'arbiter');
    upheld.set(k, v.verdicts[0]?.holds ?? false);
  });
  const out = findings.map((f, k) => {
    const on = marks.filter((x) => x.k === k).map((x) => x.mark.mark);
    const trial: Trial = { proved: proved.has(k), confirm: on.filter((m) => m === 'confirm').length, note: on.filter((m) => m === 'note').length, refute: on.filter((m) => m === 'refute').length, confirmedBy: marks.filter((x) => x.k === k && x.mark.mark === 'confirm').map((x) => x.by), ...(upheld.has(k) ? { upheld: upheld.get(k)! } : {}) };
    return { ...f, trial };
  });
  return { findings: out, cost };
}

/** A grave finding only one expert confirmed, given to another expert of the team to refute (policies/refute.md):
 *  with that expert's own model, method and the parts of its knowledge closest to the finding, and all of the
 *  files. Only its doubt is given, with the line that stops the finding (code finds that line in the files, or the
 *  doubt is not given); nothing is removed. That it holds is not given until it is measured: asked only whether a
 *  finding held, a second expert on the same model agreed with five false grave findings of nine, and both of its
 *  doubts were right. The checker pays for its check from its hold. */
export async function crossChecked<T extends Joined>(findings: T[], team: { id: number; m: Expert['m']; money: bigint }[], question: string, pages: Page[]): Promise<{ findings: T[]; cost: Map<number, bigint> }> {
  const cost = new Map<number, bigint>();
  if (team.length < 2) return { findings, cost };
  const material = pages.map((p) => p.text).join('\n');
  const out = await each(findings, async (f): Promise<T> => {
    if (f.by.length !== 1 || !grave(f)) return f;
    const checker = team[(team.findIndex((t) => t.id === f.by[0]) + 1) % team.length]!; // the next expert of the team
    const said = `${f.where} ${f.title} ${f.how}`;
    const knowledge = partsOf(filesOf(checker.m)).map((part) => ({ part, near: alike(part, said) })).sort((a, b) => b.near - a.near).slice(0, 2).map((x) => x.part).join('\n\n');
    const r = await llm.check(checker.m, question, pages, section('Finding to refute', showFinding(f, 1), CHECK_IN), checker.money - (cost.get(checker.id) ?? 0n), knowledge, 'refute');
    cost.set(checker.id, (cost.get(checker.id) ?? 0n) + r.cost);
    const v = r.verdicts[0];
    const why = (v?.how ?? '').trim().replace(/\s+/g, ' ').slice(0, 400);
    if (v?.holds && grounded(v.quote, material)) return { ...f, crossed: { by: checker.id, holds: true, said: why } };
    if (v && !v.holds && v.quote && grounded(`\`${v.quote}\``, material)) return { ...f, crossed: { by: checker.id, holds: false, said: `${why} The line it points at: \`${v.quote.trim().split('\n')[0]!.slice(0, 200)}\`` } };
    return f;
  });
  return { findings: out, cost };
}

/** The function or place a finding or a note is about, as code can tell it: the longest name in its "where". */
const placeOf = (where: string) => ((where.match(/[A-Za-z_][A-Za-z0-9_]{3,}/g) ?? []).filter((n) => !/^(src|lib|contracts?|rs|sol|impl|line|lines|and|the)$/i.test(n)).sort((a, b) => b.length - a.length)[0] ?? '').toLowerCase();
/** Places of the materials where experts saw something and none of them settled it: where two or more experts left
 *  a finding only one confirmed, one not confirmed, or a suspicion they could not take to its end, or where one
 *  expert said it could not; and no finding two experts confirmed stands there already. The places most experts
 *  left notes at come first. */
export function hotSpots(reviews: { id: number; findings: Checked[]; unsure?: Raised[]; open?: llm.Open[] }[], settled: Joined[]) {
  const done = new Set(settled.filter((f) => f.by.length > 1).map((f) => placeOf(f.where)));
  const spots = new Map<string, { place: string; notes: { id: number; text: string }[]; experts: Set<number>; opens: number }>();
  const note = (id: number, where: string, text: string, open = false) => {
    const place = placeOf(where);
    if (!place || done.has(place)) return;
    const spot = spots.get(place) ?? { place, notes: [], experts: new Set<number>(), opens: 0 };
    spot.notes.push({ id, text });
    spot.experts.add(id);
    if (open) spot.opens++;
    spots.set(place, spot);
  };
  for (const r of reviews) {
    for (const f of r.findings) note(r.id, f.where, `confirmed by this expert alone: ${lineOf(f)}. ${f.how}`);
    for (const f of r.unsure ?? []) note(r.id, f.where, `raised and not confirmed: ${lineOf(f)}. ${f.how}${f.checkSaid ? ` Its check said: ${f.checkSaid}` : ''}`);
    for (const o of r.open ?? []) note(r.id, o.where, `could not take it to the end: ${o.suspicion}${o.to_check ? ` To settle it: ${o.to_check}` : ''}`, true);
  }
  return [...spots.values()].filter((s) => s.experts.size > 1 || s.opens > 0).sort((a, b) => b.experts.size - a.experts.size || b.opens - a.opens || b.notes.length - a.notes.length);
}

/** A closer look at each hot spot (policies/hotspot.md): one expert of the team, the one that left most notes there,
 *  is given all of the team's notes about the place and the part of each expert's knowledge nearest to them, and
 *  settles what is wrong there. What it finds is checked like any finding, by the same expert with the same
 *  knowledge; what holds is given as found at a hot spot. It pays from what is left of its hold; the places most
 *  experts left notes at are looked at first, while the money lasts. */
export async function closerLook(spots: ReturnType<typeof hotSpots>, team: { id: number; m: Expert['m']; money: bigint }[], question: string, pages: Page[]): Promise<{ findings: Joined[]; cost: Map<number, bigint> }> {
  const cost = new Map<number, bigint>();
  const material = pages.map((p) => p.text).join('\n');
  const left = (id: number) => (team.find((t) => t.id === id)?.money ?? 0n) - (cost.get(id) ?? 0n);
  const spend = (id: number, c: bigint) => cost.set(id, (cost.get(id) ?? 0n) + c);
  const found = await each(spots, async (spot): Promise<Joined[]> => {
    const counts = new Map<number, number>();
    for (const n of spot.notes) counts.set(n.id, (counts.get(n.id) ?? 0) + 1);
    const who = team.filter((t) => counts.has(t.id)).sort((a, b) => (counts.get(b.id)! - counts.get(a.id)!) || Number(left(b.id) - left(a.id)))[0];
    if (!who) return [];
    const said = spot.notes.map((n) => n.text).join('\n');
    const knowledge = team.map((t) => partsOf(filesOf(t.m)).map((part) => ({ part, near: alike(part, said) })).sort((a, b) => b.near - a.near)[0]?.part ?? '').filter(Boolean).join('\n\n');
    const notes = section(`Notes of the team about ${spot.place}`, spot.notes.map((n) => `- expert ${n.id + 1}: ${n.text}`).join('\n'), CHECK_IN);
    const r = await llm.raise('hotspot', who.m, knowledge, question, pages, notes, left(who.id));
    spend(who.id, r.cost);
    const held: Joined[] = [];
    for (const f of r.findings) {
      const c = await llm.check(who.m, question, pages, section('Findings to check', showFinding(f, 1), CHECK_IN), left(who.id), knowledge);
      spend(who.id, c.cost);
      const v = c.verdicts.find((x) => x.holds && grounded(x.quote, material));
      if (v) held.push({ severity: SEVERITIES.find((x) => x.toLowerCase() === v.severity.trim().toLowerCase()) ?? f.severity, where: v.where.trim() || f.where, title: v.title.trim() || f.title, how: v.how.trim(), evidence: v.quote.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3).map((l) => `\`${l.replace(/`/g, "'")}\``).join('\n'), fix: (v.fix ?? '').trim(), by: [who.id], seen: [...spot.experts].sort((a, b) => a - b), hotspot: true });
    }
    return held;
  });
  return { findings: found.flat(), cost };
}

/** A second pair of eyes on the joined findings: the controller's model (policies/control.md) reads them all with
 *  the customer's materials. It may doubt a finding, if it names a line of the materials that stops it and code
 *  finds that line there, or rate it otherwise. Its word is put beside the finding; the finding stays as its
 *  expert wrote it, where it was. A model's "no" removes nothing here either. */
export async function controlled<T extends Checked>(findings: T[], pages: Page[]): Promise<T[]> {
  const verdicts = await llm.control(pages, findings.map((f, id) => ({ id, severity: f.severity, where: f.where, claim: f.title, how: f.how, evidence: f.evidence })));
  const material = pages.map((p) => p.text).join('\n');
  const said = new Map<number, { second: string; doubted?: boolean }>();
  for (const v of verdicts) {
    const reason = (v.reason ?? '').trim().replace(/\s+/g, ' ').slice(0, 400);
    if (!findings[v.id] || said.has(v.id) || !reason) continue;
    if (v.verdict === 'doubt' && v.stops && grounded(`\`${v.stops}\``, material)) said.set(v.id, { doubted: true, second: `it doubts this. ${reason} The line it points at: \`${v.stops.trim().replace(/\s+/g, ' ').slice(0, 200)}\`` });
    const rated = SEVERITIES.find((s) => s.toLowerCase() === (v.severity ?? '').toLowerCase());
    if (v.verdict === 'severity' && rated && rated !== findings[v.id]!.severity) said.set(v.id, { second: `it would rate this ${rated}. ${reason}` });
  }
  return findings.map((f, id) => (said.has(id) ? { ...f, ...said.get(id)! } : f));
}

/** The joined review as the last part of the customer's answer. Each finding carries the [[id]] marks of the
 *  experts that confirmed it; a lead carries none: it is nobody's finding yet. `experts`: how many reviewed, so
 *  that "found by 2 of 3" says how sure a finding is. */
export const listOf = (r: { findings: Joined[]; leads: Lead[] }, experts: number) => {
  // A finding the controller doubts stays where it is, whole, with the doubt under it: the controller is a model
  // too, and on one answer it doubted two findings an audit had made.
  const doubted = r.findings.filter((f) => f.doubted).length;
  const tried = (f: Joined) => (!f.trial ? '' : !f.trial.proved ? '*Its proof did not stand.*'
    : f.trial.upheld !== undefined ? `*Refuted by ${f.trial.refute} other expert${f.trial.refute > 1 ? 's' : ''}; the arbiter ${f.trial.upheld ? 'upheld the appeal of the expert who found it' : 'rejected the appeal'}.*`
    : `*Proved${f.trial.confirm ? `, and confirmed by ${f.trial.confirm} other expert${f.trial.confirm > 1 ? 's' : ''} who tested the proof` : ''}.*`);
  const noteOf = (f: Joined) => [experts > 1 ? `*Found by ${f.seen.length} of ${experts} experts.*` : '', tried(f), f.crossed && !f.crossed.holds ? `*Another expert of the team checked it and doubts it:* ${f.crossed.said}` : ''].filter(Boolean).join(' ');
  const marksOf = (f: Joined) => f.by.map((id) => ` [[${id}]]`).join('');
  const shown = (f: Joined, n: number, brief = false) => (brief ? briefly : entry)(f, n, marksOf(f), noteOf(f));
  // What experts who did not see each other's work both confirmed comes first: on a held-out contract every false
  // grave finding of a team was one that a single expert confirmed, and the exploit the team found stood among
  // those two had confirmed. What one expert confirmed follows, said as that.
  const agreed = r.findings.filter((f) => f.by.length > 1).sort((a, b) => b.by.length - a.by.length); // the more experts found it on their own, the higher
  const [spot, alone] = [r.findings.filter((f) => f.by.length < 2 && f.hotspot), r.findings.filter((f) => f.by.length < 2 && !f.hotspot)];
  // What one expert confirmed as Low is most of a team's answer and the least of it: by blind readers, of 97 such
  // items on three contracts 78 were true and harmless, and 6 were findings of the audit. They stay, each in brief,
  // last: left out, they took three of the team's seventeen findings of the audit with them.
  const [weighty, minor] = [alone.filter((f) => f.severity !== 'Low'), alone.filter((f) => f.severity === 'Low')];
  // Tried by the swarm (`tried`): what was proved and backed by two experts, or upheld on appeal, stands first; what
  // was proved and nobody refuted follows; what was not proved, or was refuted and lost its appeal, last, in brief.
  const [stands, isNote] = [standsTried, isNoteTried];
  const open = (f: Joined) => !!f.trial?.proved && !stands(f) && !isNote(f) && f.trial.refute === 0;
  const trialTiers: [Joined[], string, boolean?][] = [
    [r.findings.filter(stands).sort((a, b) => b.by.length - a.by.length), `**Proved and tested by the team**: ${some(r.findings.filter(stands).length, 'finding')}. Each came with a proof on lines of your files, and another expert tested it and could not break it, or the arbiter upheld it.`],
    [r.findings.filter((f) => open(f) && f.severity !== 'Low'), `**Proved, not yet tested by a second expert**: ${some(r.findings.filter((f) => open(f) && f.severity !== 'Low').length, 'finding')}.`],
    [r.findings.filter((f) => open(f) && f.severity === 'Low'), `**Low, proved, not yet tested**: ${some(r.findings.filter((f) => open(f) && f.severity === 'Low').length, 'finding')}, each in brief.`, true],
    [r.findings.filter(isNote), `**True, and harmless: notes**: ${some(r.findings.filter(isNote).length, 'point')}, each in brief. The experts who tested them found the code as said, and nobody who gains or loses by it.`, true],
    [r.findings.filter((f) => !stands(f) && !open(f) && !isNote(f)), `**Not proved, or refuted**: ${some(r.findings.filter((f) => !stands(f) && !open(f) && !isNote(f)).length, 'point')}, each in brief: its proof did not stand, or another expert broke it and the arbiter agreed. Read them as leads.`, true],
  ];
  const tiers: [Joined[], string, boolean?][] = r.findings.some((f) => f.trial) && experts > 1 ? trialTiers : experts > 1 ? [
    [agreed, `**Confirmed by two or more experts**, each on its own and without seeing the others' work: ${some(agreed.length, 'finding')}.`],
    [spot, `**Found on a closer look at a place several experts had notes about**: ${some(spot.length, 'finding')}. One expert took all of the team's notes about the place and settled them; its check confirmed these.`],
    [weighty, `**Confirmed by one expert**: ${some(weighty.length, 'finding')}. Each is that expert's word, checked against your files by its own model; read it as one opinion.`],
    [minor, `**Low, confirmed by one expert**: ${some(minor.length, 'finding')}, each in brief. Little or nothing is lost by any of them; some are worth a line in a fix, most are notes.`, true],
  ] : [[[...spot, ...alone], '']];
  return [
    r.findings.length
      ? `## Findings\n\n${r.findings.length} (${tally(r.findings)}). Each was checked on its own against your materials and quotes the lines it rests on. Findings that may be one and the same stand together, each in its own words.${doubted ? ` The controller, a second model that read them all, doubts ${doubted} of them: its word stands under each. Both are models: read the finding and the doubt.` : ''}`
      : '## Findings\n\nNo finding was confirmed against your materials.',
    ...tiers.flatMap(([list, head, brief], k) => {
      const before = tiers.slice(0, k).reduce((n, [l]) => n + l.length, 0);
      return list.length ? [...(head ? [head] : []), ...list.map((f, i) => shown(f, before + i + 1, brief))] : [];
    }),
    ...(r.leads.length
      ? [`## Not confirmed\n\n${some(r.leads.length, 'more point was', 'more points were')} raised by an expert's checklist and not confirmed when checked. They are unverified: read them as leads, not as findings.${r.leads.some(grave) ? ' The grave ones are given whole, with what their check said: a check is a model too, and can be wrong.' : ''}`,
        ...notConfirmed(r.leads, r.findings.length, (f, whole) => { const seen = (f as Lead).seen.length; return experts > 1 && (whole || seen > 1) ? (whole ? `*Raised by ${seen} of ${experts} experts.*` : ` *(raised by ${seen} of ${experts} experts)*`) : ''; })]
      : []),
  ].join('\n\n');
};
