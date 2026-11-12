// The contract as the runner sees it: views plus the runner's methods.
import { Account, JsonRpcProvider, KeyPairSigner, teraToGas, type KeyPair } from 'near-api-js';
import { cfg } from './config.ts';
import type { Agent, Job, Outcome } from './rules.ts';

export type Config = { runner: string; fee_bps: number; audit_base: string; audit_per_mb: string; min_deposit: string; overhead: string; overhead_per_agent: string; run_secs: number };
export type Order = { id: string; customer: string; amount: string; hash: string; at: number }; // an open order; `hash` names its description
export type Event = { event: string; data: Record<string, any> }; // what the contract logged

export const provider = new JsonRpcProvider({ url: cfg.NEAR_RPC });

const view = <T>(method: string, args: Record<string, unknown> = {}) =>
  provider.callFunction({ contractId: cfg.CONTRACT, method, args }) as Promise<T>;

let runner: Account | undefined;
export const useKey = (key: KeyPair) => (runner = new Account(cfg.RUNNER_ACCOUNT, provider, new KeyPairSigner(key)));

// One transaction at a time: they share one access key, and so one nonce.
let lane: Promise<unknown> = Promise.resolve();
const call = (methodName: string, args: Record<string, unknown>) => {
  const next = lane.then(() => runner!.callFunctionRaw({ contractId: cfg.CONTRACT, methodName, args, gas: teraToGas('100') }));
  lane = next.catch(() => {});
  return next;
};
/** The events of a call: they say what the contract did with the money. */
const events = (r: Awaited<ReturnType<typeof call>>): Event[] =>
  r.receipts_outcome.flatMap((o) => o.outcome.logs).filter((l) => l.startsWith('EVENT_JSON:')).map((l) => JSON.parse(l.slice(11)));

export async function agents(): Promise<Agent[]> {
  const all: Agent[] = [];
  for (;;) {
    const page = await view<Agent[]>('agents', { from: all.length, limit: 100 });
    all.push(...page);
    if (page.length < 100) return (known = { at: Date.now(), agents: all }).agents;
  }
}

let known = { at: 0, agents: [] as Agent[] };
/** The agents as of the last listing (every tick): for counts on the pages, never for decisions. */
export const listed = () => known.agents;
/** An agent as of the last listing, listed again at most every 3 s: a request from outside costs us no more than that. */
export async function recent(id: string) {
  if (Date.now() - known.at > 3_000 && !known.agents.some((a) => a.id === id && a.status === 'Pending')) await agents();
  return known.agents.find((a) => a.id === id) ?? null;
}
/** A sponsor's agents, as of a listing at most 5 s old. */
export async function ownedBy(owner: string) {
  if (Date.now() - known.at > 5_000) await agents();
  return known.agents.filter((a) => a.owner === owner);
}

export const agent = (id: string) => view<Agent | null>('agent', { id });
export const balance = (account: string) => view<string>('balance', { account });
export const job = (job: string) => view<Job | null>('job', { job });
export const config = () => view<Config>('config');
export const token = () => view<string>('token');
export const hasKey = (publicKey: string) =>
  provider.viewAccessKey({ accountId: cfg.RUNNER_ACCOUNT, publicKey }).then(() => true, () => false);

export const review = (agent: string, registration: number, allow: boolean) => call('review', { agent, registration, allow });
export const assign = (job: string, agents: string[]) => call('assign', { job, agents });
export const finish = (job: string, outcomes: Outcome[]) => call('finish', { job, outcomes });

// ---- orders placed in the contract ----

let open = { at: 0, orders: [] as Order[] };
export async function orders(): Promise<Order[]> {
  const all: Order[] = [];
  for (;;) {
    const page = await view<Order[]>('orders', { from: all.length, limit: 100 });
    all.push(...page);
    if (page.length < 100) return (open = { at: Date.now(), orders: all }).orders;
  }
}
/** Open orders as of a listing at most 3 s old: for requests from outside. */
export const recentOrders = async () => (Date.now() - open.at > 3_000 ? orders() : open.orders);
export const order = (id: string) => view<Omit<Order, 'id'> | null>('order', { id });
export const deliver = (order: string, answer: string) => call('deliver', { order, answer }).then(events);
export const refuse = (order: string, reason: string) => call('refuse', { order, reason });
