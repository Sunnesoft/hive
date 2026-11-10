// The operator's one command: for every assignment the customer accepted on Agent Market, forward its payout to
// the round that composed the accepted answer (its footer says "round N"), so exactly those experts are paid.
// Safe to run again or from cron: a paid round is gone from the contract, so it is skipped.
//   node --experimental-strip-types --env-file=.env.testnet scripts/payouts.ts <operator account> [--dry]
// Needs NEAR_RPC, CONTRACT, MARKET_URL, MARKET_TOKEN; the operator's key in OPERATOR_KEY or in ~/.near-credentials.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, teraToGas, type KeyPairString } from 'near-api-js';
import { MARKET_FEE_BPS, show, usdc } from '../node/src/rules.ts';

const [operator, dry] = [process.argv[2], process.argv.includes('--dry')];
const { NEAR_RPC, CONTRACT, MARKET_URL = 'https://market.near.ai', MARKET_TOKEN } = process.env;
if (!operator || !NEAR_RPC || !CONTRACT || !MARKET_TOKEN) throw new Error('usage: payouts.ts <operator account> [--dry], with NEAR_RPC, CONTRACT, MARKET_TOKEN set');

const provider = new JsonRpcProvider({ url: NEAR_RPC });
const view = <T>(method: string, args: Record<string, unknown> = {}) => provider.callFunction({ contractId: CONTRACT, method, args }) as Promise<T>;
const network = operator.endsWith('.near') ? 'mainnet' : 'testnet';
const private_key = process.env.OPERATOR_KEY ?? JSON.parse(readFileSync(join(homedir(), '.near-credentials', network, `${operator}.json`), 'utf8')).private_key;
const account = new Account(operator, provider, new KeyPairSigner(KeyPair.fromString(private_key as KeyPairString)));
const token = await view<string>('token');

type Row = { assignment: { assignmentId: string; status: string; escrowAmount: string } };
async function accepted(): Promise<Row[]> {
  const all: Row[] = [];
  for (let offset = 0; ; offset += 100) {
    const res = await fetch(`${MARKET_URL}/v1/agents/me/assignments?status=accepted&limit=100&offset=${offset}`, { headers: { authorization: `Bearer ${MARKET_TOKEN}` } });
    const page: Row[] = (await res.json()).assignments ?? [];
    all.push(...page);
    if (page.length < 100) return all;
  }
}

/** The round whose experts composed the accepted answer, if it still waits for its revenue. A note added later
 *  ("Round 4: ...") keeps the answer of an earlier round, so the last "Composed ... round N" is the one. */
async function owedRound(id: string) {
  const res = await fetch(`${MARKET_URL}/v1/assignments/${encodeURIComponent(id)}/deliverable/raw`, { headers: { authorization: `Bearer ${MARKET_TOKEN}` } });
  const round = [...(await res.text()).matchAll(/Composed by Swarm-for-Hire[^\n]*round (\d+)/g)].at(-1)?.[1];
  const job = round ? await view<{ done: boolean } | null>('job', { job: `${id}#${round}` }) : null;
  return job?.done ? `${id}#${round}` : null;
}

let [sent, total] = [0, 0n];
for (const { assignment: a } of await accepted()) {
  const round = await owedRound(a.assignmentId);
  if (!round) continue; // paid already, or nobody was owed anything
  const amount = (usdc(a.escrowAmount) * (10_000n - MARKET_FEE_BPS)) / 10_000n; // what Agent Market pays us for it
  console.log(`${dry ? 'would pay' : 'paying'} ${show(amount)} USDC to ${round}`);
  if (!dry) {
    await account.callFunction({
      contractId: token, methodName: 'ft_transfer_call', deposit: 1n, gas: teraToGas('100'),
      args: { receiver_id: CONTRACT, amount: `${amount}`, msg: JSON.stringify({ Revenue: { job: round } }) },
    });
  }
  sent++;
  total += amount;
}
console.log(`${sent} round${sent === 1 ? '' : 's'}, ${show(total)} USDC${dry ? ' (dry run)' : ''}`);
