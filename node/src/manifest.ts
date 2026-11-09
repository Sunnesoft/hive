// An agent is data, not code: a manifest sealed to the runner and stored in the contract. Only this
// process opens it, and only in memory.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import * as chain from './chain.ts';
import { allowedModels } from './config.ts';
import { open } from './seal.ts';
import type { Agent } from './settle.ts';
import { tools } from './web.ts';

export const Manifest = z.strictObject({
  name: z.string().min(1).max(60),
  model: z.string().refine((m) => allowedModels.includes(m), 'model not allowed'),
  system: z.string().min(1).max(8_000),
  knowledge: z.string().max(16_000).default(''), // the contract caps the sealed file at 16 KiB anyway
  tools: z.array(z.enum(Object.keys(tools) as [keyof typeof tools])).max(4).default([]),
  maxSteps: z.number().int().min(1).max(8).default(4),
});
export type Manifest = z.infer<typeof Manifest>;

/** The sponsor's fault (deny the agent), as opposed to a network hiccup (try again later). */
export class InvalidManifest extends Error {}

/** Opens and checks a sealed manifest of `account`. */
export function parse(sealed: Uint8Array, secret: Uint8Array, account: string): Manifest {
  let json: unknown;
  try {
    json = JSON.parse(open(sealed, secret, account).toString('utf8'));
  } catch {
    throw new InvalidManifest('not sealed to this runner for this account, or not JSON');
  }
  const parsed = Manifest.safeParse(json);
  if (!parsed.success) throw new InvalidManifest(z.prettifyError(parsed.error));
  return parsed.data;
}

let secret: Uint8Array | undefined;
export const useSecret = (s: Uint8Array) => (secret = s);
const cache = new Map<string, Manifest>(); // by account and hash: a copied manifest must not hit the original's entry

export async function load(a: Pick<Agent, 'account' | 'hash'>): Promise<Manifest> {
  const key = `${a.account}/${a.hash}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const sealed = await chain.manifest(a.account);
  if (!sealed || createHash('sha256').update(sealed).digest('hex') !== a.hash) throw new Error(`${a.account} re-registered meanwhile`);
  const m = parse(sealed, secret!, a.account);
  cache.set(key, m);
  return m;
}
