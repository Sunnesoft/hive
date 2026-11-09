// Two keys are born inside the TEE. The signing key is new on every boot and becomes the runner's
// function-call key only after the owner checks the quote. The seal key opens sponsors' manifests; dstack
// derives it from the app's identity, so it survives restarts and sealed manifests stay readable.
// The attestation is served at GET /attestation, so anyone can check it (scripts/verify.ts).
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { DstackClient } from '@phala/dstack-sdk';
import { KeyPair, type KeyPairString } from 'near-api-js';
import { reportDataOf } from './attest.ts';
import { hasKey } from './chain.ts';
import { cfg, log, policyHash } from './config.ts';
import { devSecret, publicKeyOf } from './seal.ts';

/** Serves what this runner is. The content proves itself (Intel's signature), so plain HTTP is fine. */
const publish = (attestation: object) =>
  createServer((req, res) => {
    const ok = req.method === 'GET' && req.url === '/attestation';
    res.writeHead(ok ? 200 : 404, { 'content-type': 'application/json' }).end(ok ? JSON.stringify(attestation) : '{}');
  }).listen(cfg.PORT);

export async function bootKeys(): Promise<{ key: KeyPair; seal: Uint8Array }> {
  if (cfg.DEV_KEY) {
    const [key, seal] = [KeyPair.fromString(cfg.DEV_KEY as KeyPairString), devSecret(cfg.DEV_KEY)];
    publish({ dev: true, publicKey: key.getPublicKey().toString(), sealKey: publicKeyOf(seal).toString('hex'), policies: policyHash });
    return { key, seal };
  }
  const dstack = new DstackClient();
  const seal = createHash('sha256').update((await dstack.getKey('swarm/manifest-seal')).key).digest();
  const key = KeyPair.fromRandom('ed25519');
  const [publicKey, sealKey] = [key.getPublicKey().toString(), publicKeyOf(seal).toString('hex')];
  const { quote, event_log } = await dstack.getQuote(Buffer.from(reportDataOf(publicKey, sealKey), 'hex'));
  const attestation = { publicKey, sealKey, quote, event_log, policies: policyHash };
  publish(attestation);
  log('attest', attestation);
  while (!(await hasKey(publicKey))) await sleep(15_000); // powerless until the owner adds it to the runner account
  return { key, seal };
}
