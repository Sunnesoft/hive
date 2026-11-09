// Checks a runner before anyone trusts it with a manifest or a key. Usage:
//   node --experimental-strip-types scripts/verify.ts <https://…/attestation | attestation.json> [app-compose.json]
// With RPC and CONTRACT in the environment (scripts/swarm.sh sets them) it also compares the seal key
// with the one in the contract. Exits 1 if any check fails.
import { readFileSync } from 'node:fs';
import { getCollateralAndVerify } from '@phala/dcap-qvl';
import { getComposeHash } from '@phala/dstack-sdk';
import { inspect, type Attestation, type Check } from '../node/src/attest.ts';

const [source, composeFile] = process.argv.slice(2);
if (!source) throw new Error('usage: verify.ts <url|file> [app-compose.json]');
const a: Attestation & { dev?: boolean } = source.startsWith('http')
  ? await (await fetch(source, { signal: AbortSignal.timeout(20_000) })).json()
  : JSON.parse(readFileSync(source, 'utf8'));
if (a.dev) {
  console.log('✗ this runner has no TEE (dev mode): its keys come from DEV_KEY and prove nothing');
  process.exit(1);
}

const verified = await getCollateralAndVerify(Buffer.from(a.quote.replace(/^0x/, ''), 'hex'));
const td = verified.report.asTd10() ?? verified.report.asTd15()?.base;
if (!td) throw new Error(`not a TDX quote: ${verified.report.type}`);
const { checks, appId, composeHash } = inspect(a, td);
const all: Check[] = [
  { what: `the quote is genuine Intel TDX (TCB ${verified.status})`, ok: ['UpToDate', 'SWHardeningNeeded'].includes(verified.status), detail: verified.advisory_ids.join(' ') },
  ...checks,
];
if (composeFile) {
  const expected = getComposeHash(JSON.parse(readFileSync(composeFile, 'utf8')));
  all.push({ what: 'it runs our compose (image digest, env, policies)', ok: expected === composeHash, detail: `expected ${expected}` });
}
if (process.env.RPC && process.env.CONTRACT) {
  const args = Buffer.from('{}').toString('base64');
  const body = { jsonrpc: '2.0', id: 1, method: 'query', params: { request_type: 'call_function', finality: 'final', account_id: process.env.CONTRACT, method_name: 'config', args_base64: args } };
  const res = await (await fetch(process.env.RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
  const cfg = JSON.parse(Buffer.from(res.result.result).toString());
  all.push({ what: 'sponsors seal to this key: it is the contract\'s seal_key', ok: cfg.seal_key === a.sealKey, detail: `contract has ${cfg.seal_key || 'none'}` });
}

for (const c of all) console.log(`${c.ok ? '✓' : '✗'} ${c.what}${!c.ok && c.detail ? `  (${c.detail})` : ''}`);
console.log(`  app id ${appId}\n  compose hash ${composeHash}\n  signing key ${a.publicKey}\n  seal key ${a.sealKey}\n  policies ${a.policies}`);
process.exit(all.every((c) => c.ok) ? 0 : 1);
