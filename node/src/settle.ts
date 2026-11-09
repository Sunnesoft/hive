// Pure rules: costs, weights, who works, what gets delivered. No I/O; see test/settle.test.ts.

export type Agent = { account: string; hash: string; max_cost: string; balance: string; status: 'Pending' | 'Active' | 'Suspended' };
export type Job = { at: number; done: boolean; slots: { agent: string; hold: string; weight: number }[] };
export type Usage = { inputTokens?: number | undefined; outputTokens?: number | undefined };
export type Price = { in: number; out: number }; // USD per 1M tokens
export type Run = { text: string; cost: bigint }; // cost in USDC base units (1e-6)
export type Score = { score: number; violation: boolean };
export type Outcome = { cost: string; weight: number; violation: boolean };

export const MAX_OUT = 4_000; // output tokens per step
export const NOTHING: Outcome = { cost: '0', weight: 0, violation: false }; // hold back in full, no share

/** USD per 1M tokens times tokens is exactly micro-USD, i.e. USDC base units; rounded up. */
export const microUsd = (u: Usage, p: Price) =>
  BigInt(Math.ceil((u.inputTokens ?? 0) * p.in + (u.outputTokens ?? 0) * p.out));

/** Worst cost of a first step: the whole prompt in at a pessimistic 2 chars per token, the token limit out.
 *  An agent whose cap is below it would make the operator pay for its overrun. */
export const stepCeiling = (promptChars: number, p: Price) =>
  microUsd({ inputTokens: Math.ceil(promptChars / 2), outputTokens: MAX_OUT }, p);

/** Active agents funded for one job, in random order. */
export const candidates = (agents: Agent[], rnd = Math.random): Agent[] =>
  agents
    .filter((a) => a.status === 'Active' && BigInt(a.balance) >= BigInt(a.max_cost))
    .map((a) => ({ a, r: rnd() }))
    .sort((p, q) => p.r - q.r)
    .map(({ a }) => a);

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Weight is the judge's score, 0..10. Empty answers, copies of an earlier answer and violations earn nothing. */
export function outcomes(runs: Run[], scores: Score[]): Outcome[] {
  const seen = new Set<string>();
  return runs.map((run, i) => {
    const key = norm(run.text);
    const fresh = key !== '' && !seen.has(key);
    seen.add(key);
    const { score, violation } = scores[i] ?? { score: 0, violation: false };
    const weight = fresh && !violation ? Math.max(0, Math.min(10, Math.trunc(score))) : 0;
    return { cost: run.cost.toString(), weight, violation };
  });
}

/** Index of the answer to deliver, or -1 if nobody earned anything. */
export const best = (outs: Outcome[]) =>
  outs.reduce((top, o, i) => (o.weight > (outs[top]?.weight ?? 0) ? i : top), -1);
