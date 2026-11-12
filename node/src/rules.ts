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
export type Outcome = { cost: string; delivered: boolean; violation: boolean };
export type Usage = { inputTokens?: number | undefined; outputTokens?: number | undefined };
export type Price = { in: number; out: number }; // USD per 1M tokens

export const USDC = 1_000_000n; // base units in one USDC
export const COST_STEP = 10_000n; // 0.01 USDC, as the contract requires
export const MARKET_FEE_BPS = 500n; // Agent Market's platform fee
export const MAX_OUT = 4_000; // output tokens of one agent answer
export const LOOKUPS = 5; // things an agent may look up in its knowledge for one question with materials, besides the question
export const LOOKUP_OUT = 300; // output tokens of that look-up

// A review: an agent goes through the customer's materials with every part of its knowledge, one pass a piece,
// then each finding is checked against the materials on its own. These bound what one review can cost.
export const PASS_CHARS = 9_000; // of its knowledge one pass reads whole
export const MAX_PASSES = 16; // pieces read in one review: 144,000 characters of knowledge
export const PASS_OUT = 1_500; // output tokens of one pass
export const MAX_CHECKS = 40; // groups of findings checked in one review, the gravest first; the rest are not reported
export const CHECK_IN = 6_000; // bytes of findings one check is given: one group, as the passes wrote it
export const CHECK_OUT = 600;
export const MAX_PROOFS = 5; // proofs written in one review, for the gravest findings
export const PROOF_IN = 2_500; // bytes of the finding a proof is written for
export const PROOF_OUT = 1_500;
export const SAME = 0.85; // findings whose words are this close (cosine of their embeddings) say the same thing

export const SAME_WORDS = 0.6; // the same by the words they share: the measure when the embeddings cannot be had
/** How close two short texts are by their words alone: the part of their words (three letters and longer, cut to
 *  six) that they share, as a cosine. Cruder than embeddings: it joins only what is worded alike. */
export function alike(a: string, b: string) {
  const words = (s: string) => new Set((s.toLowerCase().match(/[\p{L}\p{N}_]{3,}/gu) ?? []).map((w) => w.slice(0, 6)));
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
export const microUsd = (u: Usage, p: Price) =>
  BigInt(Math.ceil((u.inputTokens ?? 0) * p.in + (u.outputTokens ?? 0) * p.out));

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

const HEADING = /^\s*(?:[-*]\s+)?(?:#{1,4}\s*)?\**\s*(?:\d+[.)]\s*)?\**\s*(Critical|High|Medium|Low|Info)[a-z]*\**(?:\s*[|:]\s*|\s+[—–-]\s+)(.+)$/i;
const LABEL = /^\**\s*(Evidence|Fix)\s*:?\**\s*:?\s*(.*)$/i;
const plain = (s: string) => s.replace(/^[\s*`|—–:-]+|[\s*`|—–:-]+$/g, '');

/** The findings in a model's text. Tolerant of how a model draws the heading; what is not under a heading is dropped. */
export function findingsIn(text: string): Finding[] {
  const out: Finding[] = [];
  let last: 'how' | 'evidence' | 'fix' = 'how';
  for (const line of text.split('\n')) {
    const h = HEADING.exec(line);
    if (h) {
      const [where = '', ...rest] = h[2]!.split(/\s*\|\s*|\s+[—–]\s+/);
      const severity = SEVERITIES.find((s) => s.toLowerCase() === h[1]!.toLowerCase())!;
      out.push({ severity, where: plain(rest.length ? where : '').slice(0, 120), title: plain(rest.length ? rest.join(' — ') : where).slice(0, 240), how: '', evidence: '', fix: '' });
      last = 'how';
      continue;
    }
    const f = out.at(-1);
    if (!f || !line.trim()) continue;
    const l = LABEL.exec(line.trim());
    if (l) last = l[1]!.toLowerCase() as 'evidence' | 'fix';
    f[last] = `${f[last]}${f[last] ? '\n' : ''}${(l ? l[2]! : line).trim()}`.slice(0, last === 'how' ? 900 : 500);
  }
  return out.filter((f) => f.title);
}

/** A finding as text, in the form `findingsIn` reads. */
export const showFinding = (f: Finding, n?: number) =>
  [`### ${n ? `${n}. ` : ''}${f.severity} | ${f.where || '—'} | ${f.title}`, f.how, f.evidence && `Evidence: ${f.evidence}`, f.fix && `Fix: ${f.fix}`].filter(Boolean).join('\n');

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

/** Does the evidence of a finding point at the material? True if a stretch of it stands in the material word for
 *  word: what a model quotes from memory instead of from the page does not. */
export function grounded(evidence: string, material: string) {
  const flat = (s: string) => s.replace(/\s+/g, ' ').trim();
  const page = flat(material);
  const quoted = [...evidence.matchAll(/`([^`]{8,})`/g)].map((m) => m[1]!);
  return [...quoted, ...evidence.split('\n')].map(flat).some((q) => q.length >= 12 && page.includes(q));
}

/** An answer with [[n]] source marks -> the text without them, and which contributions it used. */
export function provenance(answer: string) {
  const used = new Set([...answer.matchAll(/\[\[(\d+)\]\]/g)].map((m) => Number(m[1])));
  return { text: answer.replace(/\s*\[\[\d+\]\]/g, ''), used };
}
