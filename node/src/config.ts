// Everything the runner may know, validated once at start. The rules it applies are in policies.ts.
import { z } from 'zod';

const USD = /^\d+(\.\d{1,6})?$/;

const Env = z.object({
  NEAR_RPC: z.url(),
  CONTRACT: z.string(), // swarm.<root>
  RUNNER_ACCOUNT: z.string(), // runner.<root>: its function-call key is born in the TEE
  DEV_KEY: z.string().startsWith('ed25519:').optional(), // local chain or testnet without a TEE only
  NEARAI_URL: z.url().default('https://cloud-api.near.ai/v1'),
  NEARAI_API_KEY: z.string().min(1),
  PROTOCOL_MODEL: z.string().min(1), // screens tasks, picks teams, evaluates, composes, reviews agents
  AUDIT_MODEL: z.string().default('z-ai/glm-5.3-flash'), // reads every chunk of uploaded materials
  EMBED_MODEL: z.string().default('Qwen/Qwen3-Embedding-0.6B'), // indexes knowledge, matches skills
  MARKET_URL: z.url().default('https://market.near.ai'),
  MARKET_TOKEN: z.string().startsWith('aat_'),
  BRAVE_API_KEY: z.string().optional(), // lets the protocol search the web for public materials
  OVERHEAD_USD: z.string().regex(USD).default('0.50'), // the protocol's own cost per job
  OVERHEAD_PER_AGENT_USD: z.string().regex(USD).default('0.10'),
  MAX_REWORKS: z.coerce.number().int().min(0).default(2), // included in the price; written in our listing
  BIDS: z.enum(['on', 'off']).default('off'), // bid on board jobs, or take direct hires only
  AGENT_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  POLL_MS: z.coerce.number().int().min(1_000).default(30_000),
  PORT: z.coerce.number().int().min(0).default(8080), // GET /attestation, POST /upload, GET / (the sealing page)
  STORE_DIR: z.string().default('./store'), // sealed uploads; an encrypted volume in the TEE
  FETCH_ALLOW: z.string().default(''), // IPs reachable despite the SSRF filter, comma separated: local tests only
});

export const cfg = Env.parse(process.env);

export { allowedModels, policy, policyHash } from './policies.ts';

export const log = (event: string, data: object = {}) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), event, ...data }));
