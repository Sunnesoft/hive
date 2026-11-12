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

/** An answer with [[n]] source marks -> the text without them, and which contributions it used. */
export function provenance(answer: string) {
  const used = new Set([...answer.matchAll(/\[\[(\d+)\]\]/g)].map((m) => Number(m[1])));
  return { text: answer.replace(/\s*\[\[\d+\]\]/g, ''), used };
}
