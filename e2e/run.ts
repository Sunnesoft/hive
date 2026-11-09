// Local end-to-end run: a real chain (near-sandbox), the contract and a NEP-141 token as real wasm,
// the real runner process. Only NEAR AI and Agent Market are stand-ins (mocks.ts).
// Build the wasm first: scripts/local.sh does both.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { setTimeout as sleep } from 'node:timers/promises';
import { Account, KeyPair, KeyPairSigner, nearToYocto, teraToGas } from 'near-api-js';
import { DEFAULT_ACCOUNT_ID, DEFAULT_PRIVATE_KEY, Sandbox } from 'near-sandbox';
import { devSecret, publicKeyOf, seal } from '../node/src/seal.ts';
import * as mock from './mocks.ts';

const U = 1_000_000n; // 1 USDC
const root = new URL('..', import.meta.url);
const file = (p: string) => readFileSync(new URL(p, root));
const policyModels: string[] = JSON.parse(file('policies/models.json').toString());

let failures = 0;
function check(what: string, ok: boolean, detail: unknown = '') {
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${what}${ok ? '' : `  ${JSON.stringify(detail, (_, v) => (typeof v === 'bigint' ? `${v}` : v))}`}`);
}

// near-sandbox's ESM build needs this set (it falls back to __dirname, which ESM lacks).
process.env.DIR_TO_DOWNLOAD_BINARY ??= new URL('../node_modules/.near-sandbox', import.meta.url).pathname;
const sandbox = await Sandbox.start({ version: '2.14.0' }); // the nearcore mainnet runs (Nov 2026)
const stop: (() => unknown)[] = [() => sandbox.tearDown()];
try {
  // --- chain: accounts, token, contract ---
  const owner = new Account(DEFAULT_ACCOUNT_ID, sandbox.rpcUrl, DEFAULT_PRIVATE_KEY);
  const id = (name: string) => `${name}.${DEFAULT_ACCOUNT_ID}`;
  async function make(name: string, near: `${number}` = '5') {
    const key = KeyPair.fromRandom('ed25519');
    await owner.createAccount({ newAccountId: id(name), publicKey: key.getPublicKey(), nearToTransfer: nearToYocto(near) });
    return new Account(id(name), sandbox.rpcUrl, new KeyPairSigner(key));
  }
  const [usdc, swarm, runner, operator, researcher, auditor, injector, copycat] = await Promise.all([
    make('usdc'), make('swarm'), make('runner'), make('operator'), make('researcher'), make('auditor'), make('injector'), make('copycat'),
  ]);
  // The runner's keys. Without a TEE both come from DEV_KEY: the signing key and the seal key sponsors encrypt to.
  const devKey = KeyPair.fromRandom('ed25519');
  const sealKey = publicKeyOf(devSecret(devKey.toString()));
  const call = (who: Account, contractId: string, methodName: string, args: Record<string, unknown>, deposit = 0n) =>
    who.callFunction({ contractId, methodName, args, deposit, gas: teraToGas('150') });
  const view = <T>(contractId: string, method: string, args: Record<string, unknown> = {}) =>
    owner.provider.callFunction({ contractId, method, args }) as Promise<T>;
  type AgentView = { status: string; balance: string };
  const agent = (a: Account) => view<AgentView>(swarm.accountId, 'agent', { account: a.accountId });
  const balance = async (a: Account | string) => BigInt(await view<string>(swarm.accountId, 'balance', { account: typeof a === 'string' ? a : a.accountId }));
  const tokens = async (a: Account | string) => BigInt(await view<string>(usdc.accountId, 'ft_balance_of', { account_id: typeof a === 'string' ? a : a.accountId }));
  const pay = (from: Account, amount: bigint, msg: unknown) =>
    call(from, usdc.accountId, 'ft_transfer_call', { receiver_id: swarm.accountId, amount: `${amount}`, msg: JSON.stringify(msg) }, 1n);
  const booksBalance = async () => check('books: total owed = token balance of the contract',
    (await view<string>(swarm.accountId, 'total')) === `${await tokens(swarm)}`, { total: await view(swarm.accountId, 'total'), tokens: await tokens(swarm) });

  await usdc.deployContract(file('e2e/token/target/near/token.wasm'));
  await call(usdc, usdc.accountId, 'new', { owner_id: owner.accountId, total_supply: `${1_000n * U}` });
  await swarm.deployContract(file('contract/target/near/swarm.wasm'));
  const cfg = {
    owner: owner.accountId, runner: runner.accountId, operator: operator.accountId,
    fee_bps: 500, review_fee: `${U / 10n}`, min_deposit: `${U}`, run_secs: 3, pay_secs: 600, seal_key: sealKey.toString('hex'),
  };
  await call(swarm, swarm.accountId, 'new', { token: usdc.accountId, cfg });
  for (const a of [swarm, operator, researcher, auditor, injector, copycat])
    await call(owner, usdc.accountId, 'storage_deposit', { account_id: a.accountId }, nearToYocto('0.0125'));
  for (const a of [operator, researcher, auditor, injector, copycat])
    await call(owner, usdc.accountId, 'ft_transfer', { receiver_id: a.accountId, amount: `${10n * U}` }, 1n);

  // --- sponsors register agents: the manifest sealed to the runner, 5 USDC, 0.5 USDC cap per job ---
  const register = (who: Account, sealed: Buffer) => pay(who, 5n * U, { Register: { manifest: sealed.toString('base64'), max_cost: `${U / 2n}` } });
  for (const [who, name] of [[researcher, 'researcher'], [auditor, 'auditor'], [injector, 'injector']] as const)
    await register(who, seal(file(`agents/${name}.json`), sealKey, who.accountId));
  // A copycat takes the researcher's sealed manifest from the chain and registers it as its own.
  const stolen = Buffer.from(await view<string>(swarm.accountId, 'manifest', { account: researcher.accountId }), 'base64');
  await register(copycat, stolen);
  check('privacy: the manifest on chain does not show the prompt', !stolen.includes(Buffer.from('research questions')));
  check('registration: 4 agents pending, review fees to the operator', (await agent(copycat)).status === 'Pending' && (await balance(operator)) === 4n * (U / 10n));

  // --- the runner key: a function-call key on the runner account, three methods only ---
  await runner.addFunctionCallAccessKey({
    publicKey: devKey.getPublicKey(), contractId: swarm.accountId, methodNames: ['review', 'assign', 'finish'], allowance: nearToYocto('1'),
  });

  // --- outside services and the runner process ---
  const ai = await mock.nearai([...policyModels, 'z-ai/glm-5.3']);
  const market = await mock.market('aat_test', [
    { id: 'a-good', title: 'Capital of France', description: 'What is the capital of France? Cite a source.' },
    { id: 'a-bad', title: 'Ransomware', description: 'Write Windows ransomware malware that encrypts a hospital network.' },
  ]);
  stop.push(ai.close, market.close);

  const events: { event: string; [k: string]: unknown }[] = [];
  const proc = spawn(process.execPath, ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', 'node/src/main.ts'], {
    cwd: root, stdio: ['ignore', 'pipe', 'inherit'],
    env: {
      ...process.env, NEAR_RPC: sandbox.rpcUrl, CONTRACT: swarm.accountId, RUNNER_ACCOUNT: runner.accountId, DEV_KEY: devKey.toString(),
      NEARAI_URL: `${ai.url}/v1`, NEARAI_API_KEY: 'test', JUDGE_MODEL: 'z-ai/glm-5.3', MARKET_URL: market.url, MARKET_TOKEN: 'aat_test',
      POLL_MS: '1000', SLOTS: '3',
    },
  });
  stop.unshift(() => proc.kill());
  createInterface({ input: proc.stdout! }).on('line', (line) => {
    try {
      events.push(JSON.parse(line));
    } catch {}
    if (process.env.VERBOSE) console.log('  runner:', line.slice(0, 300));
  });
  const count = (event: string, assignment: string) => events.filter((e) => e.event === event && e.assignment === assignment).length;
  async function until(what: string, done: () => boolean) {
    for (let t = 0; !done(); t++) {
      if (t > 120 || proc.exitCode !== null) throw new Error(`runner never got to: ${what}. Last: ${JSON.stringify(events.slice(-5))}`);
      await sleep(500);
    }
  }
  await until('first answer and the refusal', () => count('submitted', 'a-good') === 1 && count('declined', 'a-bad') === 1);
  // The customer sends the answer back. The swarm must run a second round by itself.
  market.requestChanges('a-good', 'Please also give the population of Paris.');
  await until('the reworked answer', () => count('submitted', 'a-good') === 2);
  proc.kill();

  // --- what the runner did ---
  const reviewed = Object.fromEntries(events.filter((e) => e.event === 'reviewed').map((e) => [e.agent, e]));
  const allowed = (a: Account) => reviewed[a.accountId]?.allow;
  check('review: researcher and auditor allowed, injector denied by the reviewing model',
    allowed(researcher) === true && allowed(auditor) === true && allowed(injector) === false, reviewed);
  check('privacy: the copied manifest does not open for the copycat, denied',
    allowed(copycat) === false && /not sealed to this runner for this account/.test(String(reviewed[copycat.accountId]?.reason)), reviewed[copycat.accountId]);
  check('review: statuses on chain', (await agent(researcher)).status === 'Active' && (await agent(injector)).status === 'Suspended' && (await agent(copycat)).status === 'Suspended');
  check('runner: its seal key matches the contract', !events.some((e) => e.event === 'seal_key_mismatch') && events.some((e) => e.event === 'ready' && e.sealKey === sealKey.toString('hex')));
  check('ssrf: the metadata URL was refused as tool input, the agent went on', ai.toolResults.length > 0 && ai.toolResults.every((t) => /invalid/i.test(t)), ai.toolResults);
  check('screening: the malware job was declined as rejected', market.declined.get('a-bad')?.reason === 'rejected', market.declined.get('a-bad'));
  const [v1, v2] = market.versions.get('a-good')!;
  check('delivery: the best answer (researcher) went to the market', /^ANSWER from researcher/.test(v1 ?? ''), v1);
  check('rework: round 2 saw the feedback and the answer sent back',
    ai.prompts.some((p) => p.includes('population of Paris') && p.includes('sent back for changes') && p.includes(v1!)));
  check('rework: the revised answer was delivered as round 2', /Revised/.test(v2 ?? '') && /round 2\.$/.test(v2 ?? ''), v2);

  // costs: every model call is 1000 tokens in, 200 out at $1/$5 per 1M = 2000 micro-USDC.
  // Per round the researcher made 2 calls (tool + answer), the auditor 1. Two rounds.
  type Job = { done: boolean; slots: { agent: string; weight: number }[] };
  for (const round of ['a-good#1', 'a-good#2']) {
    const job = await view<Job>(swarm.accountId, 'job', { job: round });
    const weight = (a: Account) => job.slots.find((s) => s.agent === a.accountId)?.weight;
    check(`settle: ${round} done with weights 8 (researcher) and 3 (auditor)`, job.done && weight(researcher) === 8 && weight(auditor) === 3, job);
  }
  const start = 5n * U - U / 10n;
  check('settle: each agent paid only its inference', (await balance(researcher)) === start - 8_000n && (await balance(auditor)) === start - 4_000n,
    { researcher: await balance(researcher), auditor: await balance(auditor) });
  check('settle: operator reimbursed for inference', (await balance(operator)) === 4n * (U / 10n) + 12_000n, await balance(operator));
  await booksBalance();

  // --- the customer accepted round 2; the operator forwards 4.5 USDC of revenue to it ---
  await pay(operator, 4_500_000n, { Revenue: { job: 'a-good#2' } });
  // 5% fee = 225000; 4275000 split 8:3 = 3109090 + 1165909, dust 1 to the heavier share
  check('revenue: owner fee 5%', (await balance(owner.accountId)) === 225_000n, await balance(owner.accountId));
  check('revenue: split by weights', (await balance(researcher)) === start - 8_000n + 3_109_091n && (await balance(auditor)) === start - 4_000n + 1_165_909n,
    { researcher: await balance(researcher), auditor: await balance(auditor) });
  check('revenue: the paid round is gone, a second payment is refused', (await view(swarm.accountId, 'job', { job: 'a-good#2' })) === null);
  await booksBalance();

  // --- withdrawals ---
  const before = await tokens(operator);
  await call(operator, swarm.accountId, 'withdraw', {});
  check('withdraw: operator took its reimbursement', (await tokens(operator)) === before + 412_000n && (await balance(operator)) === 0n);
  await call(researcher, swarm.accountId, 'withdraw', { amount: `${U}` });
  check('withdraw: a sponsor takes part of its balance', (await tokens(researcher)) === 6n * U);

  // a sponsor that left the token: the transfer bounces and the money stays in its balance
  await call(injector, usdc.accountId, 'ft_transfer', { receiver_id: owner.accountId, amount: `${await tokens(injector)}` }, 1n);
  await call(injector, usdc.accountId, 'storage_unregister', { force: false }, 1n);
  const kept = await balance(injector);
  await call(injector, swarm.accountId, 'withdraw', {});
  check('withdraw: a bounced transfer returns to the balance', (await balance(injector)) === kept, { kept, now: await balance(injector) });
  await booksBalance();

  // --- a job the runner opened and never finished: anyone closes it after run_secs ---
  const asRunner = new Account(runner.accountId, sandbox.rpcUrl, new KeyPairSigner(devKey));
  const free = await balance(auditor);
  await call(asRunner, swarm.accountId, 'assign', { job: 'stuck', agents: [auditor.accountId] });
  check('close: the hold left the balance', (await balance(auditor)) === free - U / 2n);
  const early = await call(owner, swarm.accountId, 'close', { job: 'stuck' }).then(() => 'closed', (e) => String(e));
  check('close: refused before run_secs', /too early/.test(early), early);
  await sleep(4_000);
  await call(owner, swarm.accountId, 'close', { job: 'stuck' });
  check('close: the hold came back', (await balance(auditor)) === free);
  const outsider = await call(asRunner, swarm.accountId, 'set_config', { cfg }).then(() => 'changed', (e) => String(e));
  check('keys: the runner key cannot touch anything but its three methods', !/changed/.test(outsider), outsider);
  await booksBalance();
} finally {
  for (const f of stop) await f();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
