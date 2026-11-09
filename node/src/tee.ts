// Two keys are born inside the TEE. The signing key is new on every boot and becomes the runner's
// function-call key only after the owner checks the quote. The seal key opens sponsors' manifests; dstack
// derives it from the app's identity, so it survives restarts and sealed manifests stay readable.
import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { DstackClient } from '@phala/dstack-sdk';
import { KeyPair, type KeyPairString } from 'near-api-js';
import { hasKey } from './chain.ts';
import { cfg, log, policyHash } from './config.ts';
import { devSecret, publicKeyOf } from './seal.ts';

export async function bootKeys(): Promise<{ key: KeyPair; seal: Uint8Array }> {
  if (cfg.DEV_KEY) return { key: KeyPair.fromString(cfg.DEV_KEY as KeyPairString), seal: devSecret(cfg.DEV_KEY) };
  const dstack = new DstackClient();
  const seal = createHash('sha256').update((await dstack.getKey('swarm/manifest-seal')).key).digest();
  const key = KeyPair.fromRandom('ed25519');
  const publicKey = key.getPublicKey().toString();
  // report_data = sha256(signing public key) | seal public key: the quote vouches for both.
  const reportData = Buffer.concat([createHash('sha256').update(publicKey).digest(), publicKeyOf(seal)]);
  const { quote, event_log } = await dstack.getQuote(reportData);
  log('attest', { publicKey, sealKey: publicKeyOf(seal).toString('hex'), quote, event_log, policies: policyHash });
  while (!(await hasKey(publicKey))) await sleep(15_000); // powerless until the owner adds it to the runner account
  return { key, seal };
}
