// An agent is data, not code: a manifest the sponsor pins on IPFS. The contract stores its sha256;
// that digest is also its CID (v1, raw), so no gateway can swap the content.
import { createHash } from 'node:crypto';
import { CID } from 'multiformats/cid';
import * as raw from 'multiformats/codecs/raw';
import * as Digest from 'multiformats/hashes/digest';
import { sha256 } from 'multiformats/hashes/sha2';
import { z } from 'zod';
import { allowedModels, cfg } from './config.ts';
import { tools } from './web.ts';

export const Manifest = z.strictObject({
  name: z.string().min(1).max(60),
  model: z.string().refine((m) => allowedModels.includes(m), 'model not allowed'),
  system: z.string().min(1).max(8_000),
  knowledge: z.string().max(32_000).default(''),
  tools: z.array(z.enum(Object.keys(tools) as [keyof typeof tools])).max(4).default([]),
  maxSteps: z.number().int().min(1).max(8).default(4),
});
export type Manifest = z.infer<typeof Manifest>;

export const cidOf = (hex: string) => CID.createV1(raw.code, Digest.create(sha256.code, Buffer.from(hex, 'hex'))).toString();

/** The sponsor's fault (deny the agent), as opposed to a network hiccup (try again later). */
export class InvalidManifest extends Error {}

const MAX_BYTES = 256_000;
const cache = new Map<string, Manifest>();

export async function load(hex: string): Promise<Manifest> {
  const hit = cache.get(hex);
  if (hit) return hit;
  // The gateway comes from the attested config, not from a sponsor, so no SSRF filter here.
  const res = await fetch(`${cfg.IPFS_GATEWAY}/ipfs/${cidOf(hex)}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`gateway: ${res.status} for ${hex}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new InvalidManifest('larger than 256 kB');
  if (createHash('sha256').update(bytes).digest('hex') !== hex) throw new Error(`gateway: wrong bytes for ${hex}`);
  let json: unknown;
  try {
    json = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new InvalidManifest('not JSON');
  }
  const parsed = Manifest.safeParse(json);
  if (!parsed.success) throw new InvalidManifest(z.prettifyError(parsed.error));
  cache.set(hex, parsed.data);
  return parsed.data;
}
