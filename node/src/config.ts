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
  AUDIT_MODEL: z.string().default('Qwen/Qwen3.8-27B'), // reads every chunk of uploaded materials
  COMPOSE_MODEL: z.string().min(1).optional(), // writes the customer's answer from the experts' parts; the protocol model if not set
  // A second pair of eyes on the joined findings of a review (policies/control.md). It can doubt a finding or rate
  // it otherwise, beside the finding; it cannot remove one. Not set: no controller. Set it to a strong model, and not
  // the one the experts judge with: a weak controller doubts true findings.
  CONTROL_MODEL: z.string().min(1).optional(),
  EMBED_MODEL: z.string().default('Qwen/Qwen3-Embedding-0.6B'), // indexes knowledge, matches skills
  MARKET_URL: z.url().default('https://market.near.ai'),
  MARKET_TOKEN: z.preprocess((v) => (v === '' ? undefined : v), z.string().startsWith('aat_').optional()), // without it the swarm serves only orders placed in the contract; an empty one, as a compose passes it, is none
  BRAVE_API_KEY: z.string().optional(), // lets the protocol search the web for public materials
  OVERHEAD_USD: z.string().regex(USD).default('0.50'), // the protocol's own cost per Agent Market job; orders use the contract's
  OVERHEAD_PER_AGENT_USD: z.string().regex(USD).default('0.10'),
  DAILY_BUDGET_USD: z.string().regex(USD).default('2.00'), // the most the runner spends at NEAR AI in a UTC day; then it starts no new work
  MAX_REWORKS: z.coerce.number().int().min(0).default(2), // included in the price; written in our listing
  BIDS: z.enum(['on', 'off']).default('on'), // bid on board jobs at the price of the team each task needs
  MARKET_LISTING_URL: z.url().optional(), // the swarm's page on Agent Market, for the site's "Hire" buttons
  // How long a model is given to start writing (and a call that is not read as a stream, to answer). A reply that
  // is read as it is written goes on for as long as the model keeps writing: see MODEL_SILENCE_MS and llm.written.
  AGENT_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  MODEL_SILENCE_MS: z.coerce.number().int().positive().default(60_000), // a model that has started and then writes nothing for this long is given up on
  // A review starts no new call after this long: what is not checked by then is given as not confirmed. Keep it well
  // under the contract's run_secs, after which an order can be sent back unanswered.
  REVIEW_TIMEOUT_MS: z.coerce.number().int().positive().default(900_000), // one expert's review: half of the task's 30 minutes
  // The whole round, the trial and the tests with it: under the contract's run_secs (1,800 s), so the answer is in
  // before anyone may close the job, and the work done is paid.
  ROUND_MS: z.coerce.number().int().positive().default(1_500_000),
  SPARE_MODEL: z.string().default('Qwen/Qwen3.6-35B-A3B-FP8'), // a step whose model failed is tried once more on this one
  POLL_MS: z.coerce.number().int().min(1_000).default(30_000),
  PORT: z.coerce.number().int().min(0).default(8080), // GET /attestation, POST /upload, GET / (the sealing page)
  STORE_DIR: z.string().default('./store'), // sealed uploads; an encrypted volume in the TEE
  FETCH_ALLOW: z.string().default(''), // IPs reachable despite the SSRF filter, comma separated: local tests only
  TRACE_DIR: z.string().min(1).optional(), // tests only: the log with every prompt and answer in the clear (log.ts)
}).refine((e) => !e.TRACE_DIR || e.DEV_KEY, 'TRACE_DIR needs DEV_KEY: a trace holds what the TEE hides, so a runner in a TEE never writes one');

export const cfg = Env.parse(process.env);

export { allowedModels, policy, policyHash } from './policies.ts';
