// An agent is data, not code: a manifest sealed to the runner and stored in the contract, plus an optional
// sealed library anywhere on the web. Only this process opens them, and only in memory.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import * as chain from './chain.ts';
import { allowedModels } from './config.ts';
import { index, MAX_LIBRARY, type Library } from './library.ts';
import { libraryAad, open } from './seal.ts';
import type { Agent } from './settle.ts';
import { getBytes, tools } from './web.ts';

export const Manifest = z.strictObject({
  name: z.string().min(1).max(60),
  model: z.string().refine((m) => allowedModels.includes(m), 'model not allowed'),
  skills: z.string().min(1).max(500), // what it knows and does well: the router reads only this
  system: z.string().min(1).max(8_000),
  knowledge: z.string().max(16_000).default(''), // the contract caps the sealed file at 16 KiB anyway
  tools: z.array(z.enum(Object.keys(tools) as [keyof typeof tools])).max(4).default([]),
  maxSteps: z.number().int().min(1).max(8).default(4),
  // A big knowledge base: a text file sealed with `libraryAad`, at any URL. The hash pins its content.
  library: z.strictObject({ url: z.url({ protocol: /^https?$/ }), hash: z.string().regex(/^[0-9a-f]{64}$/) }).optional(),
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

const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

/** Fetches, checks, opens and indexes a sponsor's library. */
async function library(ref: { url: string; hash: string }, secret: Uint8Array, account: string): Promise<Library> {
  const sealed = await getBytes(ref.url, MAX_LIBRARY); // a network failure is retried, not held against the sponsor
  if (sha256(sealed) !== ref.hash) throw new InvalidManifest('library: other bytes at its URL than its hash');
  let text: string;
  try {
    text = open(sealed, secret, libraryAad(account)).toString('utf8');
  } catch {
    throw new InvalidManifest('library: not sealed to this runner for this account');
  }
  return index(text);
}

export type Loaded = { m: Manifest; lib?: Library | undefined };

let secret: Uint8Array | undefined;
export const useSecret = (s: Uint8Array) => (secret = s);
const cache = new Map<string, Loaded>(); // by account and hash: a copied manifest must not hit the original's entry

export async function load(a: Pick<Agent, 'account' | 'hash'>): Promise<Loaded> {
  const key = `${a.account}/${a.hash}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const sealed = await chain.manifest(a.account);
  if (!sealed || sha256(sealed) !== a.hash) throw new Error(`${a.account} re-registered meanwhile`);
  const m = parse(sealed, secret!, a.account);
  const loaded = { m, lib: m.library && (await library(m.library, secret!, a.account)) };
  cache.set(key, loaded);
  return loaded;
}
