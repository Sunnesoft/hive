// A local swarm to click around in: a chain, the contract, a funded sponsor and the runner with its sealing page,
// with NEAR AI and Agent Market as the stand-ins from mocks.ts. Ctrl+C stops everything.
//   npm run playground   then open http://127.0.0.1:18080, and type a task here to hire the swarm.
// The stand-in models answer by fixed rules (see mocks.ts): an expert is picked when the task names the topic
// before the colon in its skills, and it answers with the lines of its knowledge that mention "Project Alpha".
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { Account, KeyPair, KeyPairSigner, nearToYocto, teraToGas } from 'near-api-js';
import { DEFAULT_ACCOUNT_ID, DEFAULT_PRIVATE_KEY, Sandbox } from 'near-sandbox';
import * as mock from './mocks.ts';

const U = 1_000_000n;
const PORT = process.env.PORT ?? '18080';
const root = new URL('..', import.meta.url).pathname;
const file = (p: string) => readFileSync(join(root, p));
process.env.DIR_TO_DOWNLOAD_BINARY ??= join(root, 'node_modules/.near-sandbox');

const sandbox = await Sandbox.start({ version: '2.14.0' });
const owner = new Account(DEFAULT_ACCOUNT_ID, sandbox.rpcUrl, DEFAULT_PRIVATE_KEY);
const keys = new Map<string, KeyPair>();
async function make(name: string) {
  const key = KeyPair.fromRandom('ed25519');
  keys.set(name, key);
  await owner.createAccount({ newAccountId: `${name}.${DEFAULT_ACCOUNT_ID}`, publicKey: key.getPublicKey(), nearToTransfer: nearToYocto('5') });
  return new Account(`${name}.${DEFAULT_ACCOUNT_ID}`, sandbox.rpcUrl, new KeyPairSigner(key));
}
const [usdc, swarm, runner, operator, sponsor] = await Promise.all([make('usdc'), make('swarm'), make('runner'), make('operator'), make('alice')]);
const call = (who: Account, contractId: string, methodName: string, args: object, deposit = 0n) =>
  who.callFunction({ contractId, methodName, args, deposit, gas: teraToGas('150') });

await usdc.deployContract(file('e2e/token/target/near/token.wasm'));
await call(usdc, usdc.accountId, 'new', { owner_id: owner.accountId, total_supply: `${1_000n * U}` });
await swarm.deployContract(file('contract/target/near/swarm.wasm'));
const cfg = { owner: owner.accountId, runner: runner.accountId, operator: operator.accountId, fee_bps: 500,
  audit_base: `${U / 10n}`, audit_per_mb: `${U / 10n}`, min_deposit: `${U}`, run_secs: 60, pay_secs: 3_600 };
await call(swarm, swarm.accountId, 'new', { token: usdc.accountId, cfg });
for (const a of [swarm, operator, sponsor]) await call(owner, usdc.accountId, 'storage_deposit', { account_id: a.accountId }, nearToYocto('0.0125'));
await call(owner, usdc.accountId, 'ft_transfer', { receiver_id: sponsor.accountId, amount: `${100n * U}` }, 1n);
const devKey = KeyPair.fromRandom('ed25519');
await runner.addFunctionCallAccessKey({ publicKey: devKey.getPublicKey(), contractId: swarm.accountId, methodNames: ['review', 'assign', 'finish'], allowance: nearToYocto('1') });

const ai = await mock.nearai([...JSON.parse(file('policies/models.json').toString()), 'z-ai/glm-5.3', 'Qwen/Qwen3-Embedding-0.6B']);
const market = await mock.market('aat_test');
const proc = spawn(process.execPath, ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', 'node/src/main.ts'], {
  cwd: root, stdio: ['ignore', 'inherit', 'inherit'],
  env: { ...process.env, NEAR_RPC: sandbox.rpcUrl, CONTRACT: swarm.accountId, RUNNER_ACCOUNT: runner.accountId, DEV_KEY: devKey.toString(),
    NEARAI_URL: `${ai.url}/v1`, NEARAI_API_KEY: 'test', PROTOCOL_MODEL: 'z-ai/glm-5.3', MARKET_URL: market.url, MARKET_TOKEN: 'aat_test',
    POLL_MS: '2000', PORT, STORE_DIR: mkdtempSync(join(tmpdir(), 'swarm-playground-')) },
});
console.log(`
  sealing page   http://127.0.0.1:${PORT}
  chain RPC      ${sandbox.rpcUrl}
  contract       ${swarm.accountId}, token ${usdc.accountId}
  sponsor        ${sponsor.accountId} with 100 USDC, key ${keys.get('alice')}
  type a task and press Enter to hire the swarm for 10 USDC
`);
let n = 0;
createInterface({ input: process.stdin }).on('line', (task) => {
  if (!task.trim()) return;
  const id = `task-${++n}`;
  market.hire({ id, title: task.slice(0, 60), description: task, escrow: '10.0' });
  const wait = setInterval(() => {
    const [answer] = market.delivered(id);
    const declined = market.declined.get(id);
    if (answer || declined) clearInterval(wait);
    if (answer) console.log(`\n--- answer to ${id}\n${answer}\n`);
    if (declined) console.log(`\n--- ${id} declined: ${declined.detail}\n`);
  }, 1_000);
});
const stop = async () => (proc.kill(), ai.close(), market.close(), await sandbox.tearDown(), process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
