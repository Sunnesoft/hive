// Two keys are born inside the TEE. The signing key is new on every boot and becomes the runner's
// function-call key only after the owner checks the quote. The seal key opens what sponsors upload; dstack
// derives it from the app's identity, so it survives restarts. Without a TEE both come from DEV_KEY.
import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { DstackClient } from '@phala/dstack-sdk';
import { KeyPair, type KeyPairString } from 'near-api-js';
import { reportDataOf, type Attestation } from './attest.ts';
import { hasKey } from './chain.ts';
import { cfg, log, policyHash } from './config.ts';
import { devSecret, publicKeyOf } from './seal.ts';

export type Keys = { key: KeyPair; seal: Uint8Array; attestation: Attestation | { dev: true; publicKey: string; sealKey: string; policies: string } };

export async function bootKeys(): Promise<Keys> {
  if (cfg.DEV_KEY) {
    const [key, seal] = [KeyPair.fromString(cfg.DEV_KEY as KeyPairString), devSecret(cfg.DEV_KEY)];
    const attestation = { dev: true as const, publicKey: key.getPublicKey().toString(), sealKey: publicKeyOf(seal).toString('hex'), policies: policyHash };
    return { key, seal, attestation };
  }
  const dstack = new DstackClient();
  const seal = createHash('sha256').update((await dstack.getKey('swarm/manifest-seal')).key).digest();
  const key = KeyPair.fromRandom('ed25519');
  const [publicKey, sealKey] = [key.getPublicKey().toString(), publicKeyOf(seal).toString('hex')];
  const { quote, event_log } = await dstack.getQuote(Buffer.from(reportDataOf(publicKey, sealKey), 'hex'));
  return { key, seal, attestation: { publicKey, sealKey, quote, event_log, policies: policyHash } };
}

/** Powerless until the owner checks the quote and adds the signing key to the runner account. */
export async function waitForKey(publicKey: string) {
  while (!(await hasKey(publicKey))) {
    log('waiting_for_key', { publicKey });
    await sleep(Math.min(cfg.POLL_MS, 15_000));
  }
}
