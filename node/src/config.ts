// Everything the runner may know, validated once at start. Policies ship inside the image,
// so the TEE quote covers them together with the code.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { z } from 'zod';

const Env = z.object({
  NEAR_RPC: z.url(),
  CONTRACT: z.string(), // swarm.<root>
  RUNNER_ACCOUNT: z.string(), // runner.<root>: its function-call key is born in the TEE
  DEV_KEY: z.string().startsWith('ed25519:').optional(), // local chain or testnet without a TEE only
  NEARAI_URL: z.url().default('https://cloud-api.near.ai/v1'),
  NEARAI_API_KEY: z.string().min(1),
  PROTOCOL_MODEL: z.string().min(1), // reviews agents, screens tasks, routes questions, composes the answer
  MARKET_URL: z.url().default('https://market.near.ai'),
  MARKET_TOKEN: z.string().startsWith('aat_'),
  BID_USD: z.string().regex(/^\d+\.\d{2}$/).optional(), // set it to bid on board jobs; unset: direct hires only
  SLOTS: z.coerce.number().int().min(1).max(8).default(3),
  AGENT_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  POLL_MS: z.coerce.number().int().min(1_000).default(30_000),
});

export const cfg = Env.parse(process.env);

const text = (f: string) => readFileSync(new URL(`../../policies/${f}`, import.meta.url), 'utf8');

/** What the protocol's model obeys at each step. */
export const policy = { manifest: text('manifest.md'), job: text('job.md'), route: text('route.md'), compose: text('compose.md') };

/** Models agents may use. Prices come live from NEAR AI, never from a sponsor. */
export const allowedModels: string[] = JSON.parse(text('models.json'));

/** One hash over all policies, logged at start, so anyone can check which rules this runner applies. */
export const policyHash = createHash('sha256').update(JSON.stringify([policy, allowedModels])).digest('hex');

export const log = (event: string, data: object = {}) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), event, ...data }));
