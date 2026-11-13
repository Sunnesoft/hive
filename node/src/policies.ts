// What the protocol's models obey at each step, the agents' template and the models agents may use.
// Public: in the repository and in the image, so the TEE quote covers them together with the code.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const text = (f: string) => readFileSync(new URL(`../../policies/${f}`, import.meta.url), 'utf8');
const names = ['scan', 'audit', 'job', 'route', 'stand-in', 'agent', 'lookup', 'frame', 'read', 'pass', 'check', 'combine', 'hotspot', 'refute', 'same', 'proof', 'evaluate', 'control', 'summary', 'compose', 'code', 'scope'] as const;

export const policy = Object.fromEntries(names.map((n) => [n, text(`${n}.md`)])) as Record<(typeof names)[number], string>;

/** Models agents may use. Prices come live from NEAR AI, never from a sponsor. */
export const allowedModels: string[] = JSON.parse(text('models.json'));

/** One hash over all of it, published in the attestation, so anyone can check which rules a runner applies. */
export const policyHash = createHash('sha256').update(JSON.stringify([policy, allowedModels])).digest('hex');
