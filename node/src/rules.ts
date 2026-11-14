// Pure rules: money, budgets, who may work, where each statement came from. No I/O; see test/rules.test.ts.

export type Agent = {
  id: string; // `<sponsor>/<name>`
  sponsor: string; // the account whose balance pays its holds and receives its pay
  skills: string;
  rate: string;
  max_cost: string;
  materials_hash: string; // sha256 of its sealed materials
  size_mb: number;
  status: 'Pending' | 'Active' | 'Suspended';
  registration: number; // which registration this card is; a review names it
  balance: string;
};
export type Job = { at: number; finished: boolean; slots: { agent: string; hold: string; pay: string }[] }; // finished: the holds are settled, it waits to be paid for
export type Outcome = { cost: string; delivered: boolean; violation: boolean; weight?: number }; // weight: what its findings that held were worth (review.weightsOf)
export type Usage = { inputTokens?: number | undefined; outputTokens?: number | undefined; inputTokenDetails?: { cacheReadTokens?: number | undefined } };
export type Price = { in: number; out: number; cached?: number }; // USD per 1M tokens; `cached`: an input token NEAR AI has seen at the start of an earlier call

export const USDC = 1_000_000n; // base units in one USDC
export const COST_STEP = 10_000n; // 0.01 USDC, as the contract requires
export const MARKET_FEE_BPS = 500n; // Agent Market's platform fee
export const MAX_OUT = 4_000; // output tokens of one agent answer
// How long a reply of a review may be is what the money left in the expert's hold pays for (llm.limitFor), and no
// number of the protocol. Two bounds stay: REPLY_MOST, under what the models accept at all, and REPLY_LEAST, below
// which a call is not worth sending. What stops a reply is a loop (rules.repeats), a model that falls silent, or
// the money running out.
export const REPLY_MOST = 16_000;
export const REPLY_LEAST = 1_000;
export const LOOKUPS = 5; // things an agent may look up in its knowledge for one question with materials, besides the question
export const LOOKUP_OUT = 300; // output tokens of that look-up

// A review: an agent goes through the customer's materials with every part of its knowledge, one pass a piece,
// then each finding is checked against the materials on its own. These bound what one review can cost.
export const PASS_CHARS = 9_000; // of its knowledge one pass reads whole: a file of it, or a part of a longer file
export const MAX_PASSES = 24; // parts read in one review: up to 216,000 characters of knowledge
// The sizes of a full review as it usually goes, for the registration page's estimate of what one costs; no step is cut to them.
export const READ_OUT = 6_000; // output tokens of the expert's own reading, before any checklist
export const READ_FINDINGS = 30; // findings taken from it
export const KNOWN_IN = 3_000; // bytes of what earlier passes raised, a line each, that a later pass is told not to repeat
export const PASS_FINDINGS = 20; // findings taken from one pass, the first ones: a model that has run out of findings goes on with "no check for ..." until its limit
export const PASS_OUT = 4_000; // output tokens of one pass: at 1,800, more than half of the passes of two held-out runs were cut off mid-finding
export const MAX_CHECKS = 60; // checks in one review, the gravest first; the rest are given as not confirmed
export const MAX_LEADS = 20; // findings a check did not confirm that an answer still lists, apart and as unconfirmed
export const CHECK_IN = 6_000; // bytes of findings one check is given: one group, as the passes wrote it
export const CHECK_AT_ONCE = 5; // wordings one check is shown: a model that joined twenty findings into a group must not have them dismissed in one line
export const CHECK_OUT = 3_000; // a check answers on a form, a verdict for each of up to five claims; a form cut short is no form at all, and its group goes unchecked
export const COMBINE_IN = 6_000; // bytes of confirmed findings the step that looks at them together is given
export const COMBINE_OUT = 1_200;
export const MAX_COMBINED = 5; // findings that step may add: each is checked like any other
export const SUMMARY_OUT = 300; // output tokens of the paragraph that opens a review: room for 120 words, none for a report of its own
export const SAME_IN = 60_000; // bytes of findings, a line each, that one question "which of these are the same" is given: all of a team's, so that no two wordings of one flaw stay apart because one did not fit
export const SAME_OUT = 4_000;
export const MAX_PROOFS = 3; // proofs written in one review, for its gravest findings: of several experts' proofs of one finding the answer keeps one
export const PROOF_IN = 2_500; // bytes of the finding a proof is written for
export const PROOF_OUT = 2_500; // a test cut short is thrown away, paid for: two models of three ran past 1,500
export const SAME = 0.85; // findings whose words are this close (cosine of their embeddings) say the same thing

export const SAME_WORDS = 0.6; // the same by the words they share: the measure when the embeddings cannot be had
/** How close two short texts are by their words alone: the part of their words (three letters and longer, without
 *  a plural's s, cut to six) that they share, as a cosine. Cruder than embeddings: it joins only what is worded alike. */
export function alike(a: string, b: string) {
  const words = (s: string) => new Set((s.toLowerCase().match(/[\p{L}\p{N}_]{3,}/gu) ?? []).map((w) => (w.length > 3 ? w.replace(/s$/, '') : w).slice(0, 6)));
  const [x, y] = [words(a), words(b)];
  return x.size && y.size ? [...x].filter((w) => y.has(w)).length / Math.sqrt(x.size * y.size) : 0;
}

/** Chunks of knowledge packed into the parts a review reads, at most `size` characters of knowledge each, in
 *  their own order: what stands together in the owner's files is read together. */
export function piecesOf(chunks: string[], size = PASS_CHARS): string[] {
  const parts: string[][] = [];
  let room = 0;
  for (const c of chunks) {
    if (!parts.length || c.length > room) (parts.push([]), (room = size));
    parts.at(-1)!.push(c);
    room -= c.length;
  }
  return parts.map((p) => p.join('\n---\n'));
}

/** The parts of the knowledge a review reads, a pass each. A file is a part, a long file several: its owner put
 *  into one file what belongs together, and a pass that holds one subject against the materials finds more than a
 *  pass that holds two. If that makes more than `most` parts, the files are packed together in their order. */
export function partsOf(files: string[][], size = PASS_CHARS, most = MAX_PASSES): string[] {
  const perFile = files.flatMap((chunks) => piecesOf(chunks, size));
  return perFile.length <= most ? perFile : piecesOf(files.flat(), size);
}

/** A text cut to at most `bytes` bytes: what a step is given is bounded in the unit its worst cost is counted in. */
export const clip = (text: string, bytes: number) =>
  Buffer.byteLength(text) <= bytes ? text : Buffer.from(text).subarray(0, bytes).toString().replace(/\uFFFD+$/, '');

/** "12.5" -> 12500000. Exact: no floating point. Extra decimals are cut. */
export const usdc = (s: string) => {
  const [whole = '0', frac = ''] = s.trim().split('.');
  return BigInt(whole) * USDC + BigInt((frac + '000000').slice(0, 6));
};
/** Agent Market's categories: a task's topic, and the topics an expert lists on its public profile. */
export const TOPICS = ['automation', 'creative', 'customer_support', 'data', 'dev_tools', 'events', 'finance', 'legal_compliance', 'marketing', 'operations', 'research', 'sales', 'travel', 'other'] as const;

export const show = (units: bigint) => (Number(units) / 1e6).toFixed(2);

/** USD per 1M tokens times tokens is micro-USD, i.e. USDC base units; rounded up. */
export const microUsd = (u: Usage, p: Price) => {
  const cached = Math.min(u.inputTokenDetails?.cacheReadTokens ?? 0, u.inputTokens ?? 0);
  return BigInt(Math.ceil(((u.inputTokens ?? 0) - cached) * p.in + cached * (p.cached ?? p.in) + (u.outputTokens ?? 0) * p.out));
};

/** A cost as the contract takes it: up to the next 0.01 USDC, never above the hold. Coarse costs leak almost no bits. */
export const coarse = (cost: bigint, hold: bigint) => {
  const up = ((cost + COST_STEP - 1n) / COST_STEP) * COST_STEP;
  return up < hold ? up : hold;
};

/** The worst cost of one answer: a token never covers less than one UTF-8 byte, and the output stops at MAX_OUT. */
export const ceiling = (promptBytes: number, p: Price) => microUsd({ inputTokens: promptBytes, outputTokens: MAX_OUT }, p);

/** Active agents with money for one more job. */
export const ready = (agents: Agent[]) =>
  agents.filter((a) => a.status === 'Active' && BigInt(a.balance) >= BigInt(a.max_cost));

const bps = (amount: bigint, b: bigint) => (amount * (10_000n - b)) / 10_000n;

/** What the agents of a job may cost together, out of what the customer pays: less the door's own fee
 *  (Agent Market's; an order in the contract has none), the owner's fee and the protocol's overhead. */
export const budget = (price: bigint, feeBps: number, overhead: bigint, doorBps = MARKET_FEE_BPS) => bps(bps(price, doorBps), BigInt(feeBps)) - overhead;

/** The revenue a round needs to pay what it owes its delivered experts after the owner's fee: rounded up. */
export const share = (due: bigint, feeBps: number) => {
  const keep = BigInt(10_000 - feeBps);
  return (due * 10_000n + keep - 1n) / keep;
};

/** The longest prefix of picks (most important first) whose rates and per-agent overhead fit the budget. */
export function fit<T extends { rate: bigint }>(picks: T[], net: bigint, perAgent: bigint): T[] {
  const team: T[] = [];
  let spent = 0n;
  for (const p of picks) {
    if (spent + p.rate + perAgent > net) break;
    spent += p.rate + perAgent;
    team.push(p);
  }
  return team;
}

/** The price to ask on Agent Market for a team, so that after both fees it covers the rates and the overhead. */
export function quote(rates: bigint[], feeBps: number, overhead: bigint, perAgent: bigint) {
  const net = rates.reduce((s, r) => s + r + perAgent, overhead);
  const gross = (net * 10_000n * 10_000n) / ((10_000n - MARKET_FEE_BPS) * (10_000n - BigInt(feeBps)));
  return ((gross + COST_STEP - 1n) / COST_STEP) * COST_STEP;
}

/** How much of an answer each contribution carried: its part of the answer's source marks, in percent to the
 *  nearest ten. Coarse like the costs: a sponsor learns how much of its expert's part was used, not what was said. */
export function sharesOf(answer: string) {
  const marks = [...answer.matchAll(/\[\[(\d+)\]\]/g)].map((m) => Number(m[1]));
  const count = new Map<number, number>();
  for (const id of marks) count.set(id, (count.get(id) ?? 0) + 1);
  return new Map([...count].map(([id, n]) => [id, Math.round((10 * n) / marks.length) * 10]));
}

/** How much of the answers an expert worked on came from it, against an equal split with the experts it worked
 *  with: 1 is an equal part, 0.5 half of one. From its rounds with a known share in a team of two or more; alone, a
 *  share says nothing. Null if there is no such round. The router reads it: nothing else it sees says how good an
 *  expert is. */
export function usedOf(rounds: { share?: number; parts?: number }[]) {
  const known = rounds.filter((r): r is { share: number; parts: number } => typeof r.share === 'number' && typeof r.parts === 'number' && r.parts >= 2);
  if (!known.length) return null;
  return Math.round((10 * known.reduce((s, r) => s + (r.share * r.parts) / 100, 0)) / known.length) / 10;
}

/** The agents that the numbers put clearly above the router's pick, best first: their parts are used more by
 *  `MARGIN` of an equal part or over, and they cost the customer no more. The router chooses by how well the words
 *  of an agent's skills match the task, which says little about how good the agent is. Whether one of these could
 *  be asked the same question is then a separate, narrow question (policies/stand-in.md). An agent with no history
 *  is neither a rival nor replaced. */
export const MARGIN = 0.2;
export function rivals<T extends { used: number | null; rate: bigint }>(pick: T, others: T[]): T[] {
  if (pick.used === null) return [];
  const clearlyMore = (a: T): a is T & { used: number } => a.used !== null && Math.round((a.used - pick.used!) * 10) >= MARGIN * 10;
  return others.filter(clearlyMore).filter((a) => a.rate <= pick.rate).sort((x, y) => y.used - x.used);
}

// ---- findings: what a review is made of ----

export const SEVERITIES = ['Critical', 'High', 'Medium', 'Low', 'Info'] as const;
/** One finding of a review. In text it is a heading `### <severity> | <where> | <title>`, the lines that say how it
 *  happens, and, once checked, `Evidence:` (the lines of the material it rests on) and `Fix:`. */
export type Finding = { severity: (typeof SEVERITIES)[number]; where: string; title: string; how: string; evidence: string; fix: string };
/** A finding in one line, as the question "which of these are the same" gets it. */
export const lineOf = (f: Finding) => `${f.severity} | ${f.where || '—'} | ${f.title}`;

const HEADING = /^\s*(?:[-*]\s+)?(?:#{1,4}\s*)?\**\s*(?:\d+[.)]\s*)?\**\s*(Critical|High|Medium|Low|Info)[a-z]*\**(?:\s*[|:]\s*|\s+[—–-]\s+)(.+)$/i;
const LABEL = /^\**\s*(Evidence|Fix)\s*:?\**\s*:?\s*(.*)$/i;
const plain = (s: string) => s.replace(/^[\s*`|—–:-]+|[\s*`|—–:-]+$/g, '');

/** The findings in a model's text. Tolerant of how a model draws the heading; what is not under a heading is dropped.
 *  Code in a fence is read only as evidence (a model may quote the lines that way); any other fenced code, and
 *  whatever follows a line that starts a proof, is not part of the finding: a proof has its own step. */
export function findingsIn(text: string): Finding[] {
  const out: Finding[] = [];
  let last: 'how' | 'evidence' | 'fix' | 'rest' = 'how';
  let fenced = false;
  for (const line of text.split('\n')) {
    if (/^\s*```/.test(line)) { fenced = !fenced; continue; }
    const h = fenced ? null : HEADING.exec(line);
    if (h) {
      const [where = '', ...rest] = h[2]!.split(/\s*\|\s*|\s+[—–]\s+/);
      const severity = SEVERITIES.find((s) => s.toLowerCase() === h[1]!.toLowerCase())!;
      out.push({ severity, where: plain(rest.length ? where : '').slice(0, 120), title: plain(rest.length ? rest.join(' — ') : where).slice(0, 240), how: '', evidence: '', fix: '' });
      last = 'how';
      continue;
    }
    const f = out.at(-1);
    if (!f || !line.trim()) continue;
    if (fenced && last !== 'evidence') continue;
    const l = fenced ? null : LABEL.exec(line.trim());
    if (l) last = l[1]!.toLowerCase() as 'evidence' | 'fix';
    else if (!fenced && /^[\s*_#]*proof\b/i.test(line)) last = 'rest';
    if (last === 'rest') continue;
    f[last] = `${f[last]}${f[last] ? '\n' : ''}${(l ? l[2]! : line).trim()}`.slice(0, last === 'how' ? 900 : 500);
  }
  return out.filter((f) => f.title);
}

/** A finding as text, in the form `findingsIn` reads. */
export const showFinding = (f: Finding, n?: number) =>
  [`### ${n ? `${n}. ` : ''}${f.severity} | ${f.where || '—'} | ${f.title}`, f.how, f.evidence && `Evidence: ${f.evidence}`, f.fix && `Fix: ${f.fix}`].filter(Boolean).join('\n');

/** Of findings that say the same thing, the one in the middle by severity (of two in the middle, the graver).
 *  The gravest wording used to stand for them all, which let one exaggerated wording become the headline of a
 *  finding that four others had put lower: a Critical that was wrong, over a Medium that was right. */
export const middleOf = <T extends { severity: Finding['severity'] }>(items: T[]) => bySeverity(items)[Math.floor((items.length - 1) / 2)]!;

/** The gravest first; among equals, the order they came in. */
export const bySeverity = <T extends { severity: Finding['severity'] }>(items: T[]) =>
  items.map((x, i) => ({ x, i })).sort((a, b) => SEVERITIES.indexOf(a.x.severity) - SEVERITIES.indexOf(b.x.severity) || a.i - b.i).map(({ x }) => x);

/** Groups of things that say the same: each joins the first group all of whose members it is close to. Every member
 *  of a group is close to every other, so a chain of near neighbours cannot pull two different findings together,
 *  which is how a rare finding gets lost. `close(i, j)`: are items i and j the same thing? */
export function groupsOf(count: number, close: (i: number, j: number) => boolean): number[][] {
  const groups: number[][] = [];
  for (let i = 0; i < count; i++) (groups.find((g) => g.every((j) => close(i, j))) ?? groups[groups.push([]) - 1]!).push(i);
  return groups;
}

/** A model's answer to "which of these are the same" made safe to act on: only numbers of the list, each in one
 *  group at most, groups of two and more; every item it did not join stands alone. The model can join findings, it
 *  cannot drop one. */
export function partition(count: number, groups: number[][]): number[][] {
  const taken = new Set<number>();
  const out: number[][] = [];
  for (const g of groups) {
    const ids = [...new Set(g)].filter((i) => Number.isInteger(i) && i >= 0 && i < count && !taken.has(i));
    if (ids.length < 2) continue;
    for (const i of ids) taken.add(i);
    out.push(ids);
  }
  for (let i = 0; i < count; i++) if (!taken.has(i)) out.push([i]);
  return out;
}

/** Does the evidence of a finding point at the material? True if a stretch of it stands in the material: twelve
 *  characters and more, compared without spaces and line breaks (a model lays a signature out in one line that the
 *  file has in four), and a quote with "..." in it counts by its pieces. What a model quotes from memory instead of
 *  from the page does not stand there. */
export function grounded(evidence: string, material: string) {
  const bare = (s: string) => s.replace(/\s+/g, '');
  const page = bare(material);
  const quoted = [...evidence.matchAll(/`([^`]{8,})`/g)].map((m) => m[1]!);
  return [...quoted, ...evidence.split('\n')].flatMap((q) => q.split(/\.{3,}|…/)).map(bare).some((q) => q.length >= 12 && page.includes(q));
}

/** An answer with [[n]] source marks -> the text without them, and which contributions it used. */
export function provenance(answer: string) {
  const used = new Set([...answer.matchAll(/\[\[(\d+)\]\]/g)].map((m) => Number(m[1])));
  return { text: answer.replace(/\s*\[\[\d+\]\]/g, ''), used };
}

/** A reply that has started going round: its last 200 characters stand three times more in the 6,000 before them.
 *  That is how a model in a loop writes (one finding said nine times over); a long reply of different findings
 *  does not. */
export function repeats(text: string) {
  const tail = text.slice(-200);
  if (tail.length < 200 || new Set(tail).size < 12) return false; // spaces, dashes or one sign over and over is layout, not a loop
  const before = text.slice(-6_200, -200);
  let n = 0;
  for (let i = before.indexOf(tail); i >= 0; i = before.indexOf(tail, i + 1)) if (++n >= 3) return true;
  return false;
}
