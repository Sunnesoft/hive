// The contract as the runner sees it: views plus the three runner methods.
import { Account, JsonRpcProvider, KeyPairSigner, teraToGas, type KeyPair } from 'near-api-js';
import { cfg } from './config.ts';
import type { Agent, Job, Outcome } from './rules.ts';

export type Config = { fee_bps: number; audit_base: string; audit_per_mb: string; min_deposit: string };

export const provider = new JsonRpcProvider({ url: cfg.NEAR_RPC });

const view = <T>(method: string, args: Record<string, unknown> = {}) =>
  provider.callFunction({ contractId: cfg.CONTRACT, method, args }) as Promise<T>;

let runner: Account | undefined;
export const useKey = (key: KeyPair) => (runner = new Account(cfg.RUNNER_ACCOUNT, provider, new KeyPairSigner(key)));

// One transaction at a time: they share one access key, and so one nonce.
let lane: Promise<unknown> = Promise.resolve();
const call = (methodName: string, args: Record<string, unknown>) => {
  const next = lane.then(() => runner!.callFunction({ contractId: cfg.CONTRACT, methodName, args, gas: teraToGas('100') }));
  lane = next.catch(() => {});
  return next;
};

export async function agents(): Promise<Agent[]> {
  const all: Agent[] = [];
  for (;;) {
    const page = await view<Agent[]>('agents', { from: all.length, limit: 100 });
    all.push(...page);
    if (page.length < 100) return all;
  }
}

export const agent = (account: string) => view<Agent | null>('agent', { account });
export const job = (job: string) => view<Job | null>('job', { job });
export const config = () => view<Config>('config');
export const token = () => view<string>('token');
export const hasKey = (publicKey: string) =>
  provider.viewAccessKey({ accountId: cfg.RUNNER_ACCOUNT, publicKey }).then(() => true, () => false);

export const review = (agent: string, hash: string, allow: boolean) => call('review', { agent, hash, allow });
export const assign = (job: string, agents: string[]) => call('assign', { job, agents });
export const finish = (job: string, outcomes: Outcome[]) => call('finish', { job, outcomes });
