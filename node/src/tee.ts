// The runner key is born inside the TEE on every boot and never leaves it. The quote binds the
// public key to this exact image, so the owner checks the code before giving the key any power.
import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { DstackClient } from '@phala/dstack-sdk';
import { KeyPair, type KeyPairString } from 'near-api-js';
import { hasKey } from './chain.ts';
import { cfg, log, policyHash } from './config.ts';

export async function bootKey(): Promise<KeyPair> {
  if (cfg.DEV_KEY) return KeyPair.fromString(cfg.DEV_KEY as KeyPairString);
  const key = KeyPair.fromRandom('ed25519');
  const publicKey = key.getPublicKey().toString();
  const reportData = createHash('sha256').update(publicKey).digest(); // first 32 bytes of report_data
  const { quote, event_log } = await new DstackClient().getQuote(reportData);
  log('attest', { publicKey, quote, event_log, policies: policyHash });
  while (!(await hasKey(publicKey))) await sleep(15_000); // powerless until the owner adds it to the runner account
  return key;
}
