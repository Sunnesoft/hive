// The operator's one command: for every assignment the customer accepted on Agent Market, forward its payout to
// the rounds of that task, so every expert whose part passed its check, in any round, is paid its rate. A round
// improves the answer of the round before, so an earlier round's work is part of the accepted answer too.
// Earlier rounds get exactly what they owe their experts (plus the owner's fee on it); the round that composed the
// accepted answer gets the rest. That round is paid first: if a run stops halfway, the next run pays the earlier
// rounds their exact shares. A paid round is gone from the contract, so nothing is paid twice. Safe from cron.
//   node --experimental-strip-types --env-file=.env.testnet scripts/payouts.ts <operator account> [--dry]
// Needs NEAR_RPC, CONTRACT, MARKET_URL, MARKET_TOKEN; the operator's key in OPERATOR_KEY or in ~/.near-credentials.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, teraToGas, type KeyPairString } from 'near-api-js';
import { MARKET_FEE_BPS, share, show, usdc, type Job } from '../node/src/rules.ts';

const [operator, dry] = [process.argv[2], process.argv.includes('--dry')];
const { NEAR_RPC, CONTRACT, MARKET_URL = 'https://market.near.ai', MARKET_TOKEN } = process.env;
if (!operator || !NEAR_RPC || !CONTRACT || !MARKET_TOKEN) throw new Error('usage: payouts.ts <operator account> [--dry], with NEAR_RPC, CONTRACT, MARKET_TOKEN set');

const provider = new JsonRpcProvider({ url: NEAR_RPC });
const view = <T>(method: string, args: Record<string, unknown> = {}) => provider.callFunction({ contractId: CONTRACT, method, args }) as Promise<T>;
const network = operator.endsWith('.near') ? 'mainnet' : 'testnet';
const private_key = process.env.OPERATOR_KEY ?? JSON.parse(readFileSync(join(homedir(), '.near-credentials', network, `${operator}.json`), 'utf8')).private_key;
const account = new Account(operator, provider, new KeyPairSigner(KeyPair.fromString(private_key as KeyPairString)));
const [token, { fee_bps }] = await Promise.all([view<string>('token'), view<{ fee_bps: number }>('config')]);
const market = (path: string) => fetch(`${MARKET_URL}${path}`, { headers: { authorization: `Bearer ${MARKET_TOKEN}` } });

type Row = { assignment: { assignmentId: string; status: string; escrowAmount: string } };
async function accepted(): Promise<Row[]> {
  const all: Row[] = [];
  for (let offset = 0; ; offset += 100) {
    const page: Row[] = (await (await market(`/v1/agents/me/assignments?status=accepted&limit=100&offset=${offset}`)).json()).assignments ?? [];
    all.push(...page);
    if (page.length < 100) return all;
  }
}

/** The rounds of an assignment that still wait for their revenue, up to the one that composed the accepted answer.
 *  A note added later ("Round 4: ...") keeps an earlier round's answer, so the last "Composed ... round N" is it. */
async function owedRounds(id: string) {
  const text = await (await market(`/v1/assignments/${encodeURIComponent(id)}/deliverable/raw`)).text();
  const last = Number([...text.matchAll(/Composed by Swarm-for-Hire[^\n]*round (\d+)/g)].at(-1)?.[1] ?? 0);
  const rounds: { job: string; due: bigint; last: boolean }[] = [];
  for (let k = 1; k <= last; k++) {
    const j = await view<Job | null>('job', { job: `${id}#${k}` });
    if (j?.done) rounds.push({ job: `${id}#${k}`, due: j.slots.reduce((s, x) => s + BigInt(x.pay), 0n), last: k === last });
  }
  return rounds;
}

/** What to send to each round: earlier rounds their exact share, the accepted round the rest, sent first. */
function split(revenue: bigint, rounds: { job: string; due: bigint; last: boolean }[]) {
  const earlier = rounds.filter((r) => !r.last).map((r) => ({ job: r.job, amount: share(r.due, fee_bps) }));
  const final = rounds.find((r) => r.last);
  if (!final) return earlier; // paid before a run stopped: only the earlier rounds are left
  const rest = revenue - earlier.reduce((s, r) => s + r.amount, 0n);
  return [{ job: final.job, amount: rest }, ...earlier].filter((r) => r.amount > 0n);
}

let [sent, total] = [0, 0n];
for (const { assignment: a } of await accepted()) {
  const rounds = await owedRounds(a.assignmentId);
  if (!rounds.length) continue; // paid already, or nobody was owed anything
  const revenue = (usdc(a.escrowAmount) * (10_000n - MARKET_FEE_BPS)) / 10_000n; // what Agent Market pays us for it
  for (const { job, amount } of split(revenue, rounds)) {
    console.log(`${dry ? 'would pay' : 'paying'} ${show(amount)} USDC to ${job}`);
    if (!dry) {
      await account.callFunction({
        contractId: token, methodName: 'ft_transfer_call', deposit: 1n, gas: teraToGas('100'),
        args: { receiver_id: CONTRACT, amount: `${amount}`, msg: JSON.stringify({ Revenue: { job } }) },
      });
    }
    sent++;
    total += amount;
  }
}
console.log(`${sent} round${sent === 1 ? '' : 's'}, ${show(total)} USDC${dry ? ' (dry run)' : ''}`);
