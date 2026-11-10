// Checks a runner before anyone trusts it: before a sponsor seals materials to it, before the owner gives
// it a key. Usage: verify.ts <runner url | attestation.json> [app-compose.json]
// With RPC and RUNNER in the environment (scripts/swarm.sh sets them) it also says whether the signing key
// already acts for the runner account. Exits 1 if a check fails.
import { readFileSync } from 'node:fs';
import { getCollateralAndVerify } from '@phala/dcap-qvl';
import { getComposeHash } from '@phala/dstack-sdk';
import { inspect, type Attestation, type Check } from '../node/src/attest.ts';
import { policyHash } from '../node/src/policies.ts';

const [source, composeFile] = process.argv.slice(2);
if (!source) throw new Error('usage: verify.ts <runner url | attestation.json> [app-compose.json]');
const a: Attestation & { dev?: boolean } = source.startsWith('http')
  ? await (await fetch(`${source.replace(/\/(attestation)?$/, '')}/attestation`, { signal: AbortSignal.timeout(20_000) })).json()
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
  { what: 'it applies the policies of this repository', ok: a.policies === policyHash, detail: `this repository has ${policyHash}` },
];
if (composeFile) {
  const expected = getComposeHash(JSON.parse(readFileSync(composeFile, 'utf8')));
  all.push({ what: 'it runs our compose (image digest, env, policies)', ok: expected === composeHash, detail: `expected ${expected}` });
}

for (const c of all) console.log(`${c.ok ? '✓' : '✗'} ${c.what}${!c.ok && c.detail ? `  (${c.detail})` : ''}`);
console.log(`  app id ${appId}\n  compose hash ${composeHash}\n  signing key ${a.publicKey}\n  seal key ${a.sealKey}`);
if (process.env.RPC && process.env.RUNNER) {
  const body = { jsonrpc: '2.0', id: 1, method: 'query', params: { request_type: 'view_access_key', finality: 'final', account_id: process.env.RUNNER, public_key: a.publicKey } };
  const res = await (await fetch(process.env.RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
  console.log(res.result?.permission ? `  the signing key acts for ${process.env.RUNNER}` : `  the signing key is not (yet) a key of ${process.env.RUNNER}`);
}
process.exit(all.every((c) => c.ok) ? 0 : 1);
