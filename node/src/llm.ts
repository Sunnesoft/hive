// Every model call goes to NEAR AI Cloud. The protocol's model does the protocol's steps, each under its
// public policy, always with the input as JSON data. An agent is one call with our template, its own
// materials and its own question: no tools, no network, no other agents, no memory between jobs.
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { embedMany, generateText, Output } from 'ai';
import { z } from 'zod';
import { cfg, policy } from './config.ts';
import type { Materials } from './materials.ts';
import { MAX_OUT, microUsd, type Price } from './rules.ts';
import type { Page } from './web.ts';

const nearai = createOpenAICompatible({ name: 'nearai', baseURL: cfg.NEARAI_URL, apiKey: cfg.NEARAI_API_KEY, supportsStructuredOutputs: true });

// ---- prices ----

const Cost = z.object({ amount: z.number(), scale: z.number() }); // amount * 10^-scale USD per token
const Catalog = z.object({ models: z.array(z.object({ modelId: z.string(), inputCostPerToken: Cost, outputCostPerToken: Cost })) });
const perMillion = (c: z.infer<typeof Cost>) => c.amount * 10 ** (6 - c.scale);

let prices: Record<string, Price> = {};
export const priceOf = (model: string) => prices[model];

/** Live NEAR AI prices, USD per 1M tokens. Costs reported on chain are computed from these. */
export async function refreshPrices() {
  const res = await fetch(`${cfg.NEARAI_URL}/model/list?limit=500`, { signal: AbortSignal.timeout(20_000) });
  const { models } = Catalog.parse(await res.json());
  prices = Object.fromEntries(models.map((m) => [m.modelId, { in: perMillion(m.inputCostPerToken), out: perMillion(m.outputCostPerToken) }]));
}

// ---- building blocks ----

export async function embed(values: string[], timeoutMs = cfg.AGENT_TIMEOUT_MS) {
  const model = nearai.embeddingModel(cfg.EMBED_MODEL);
  const { embeddings, usage } = await embedMany({ model, values, maxParallelCalls: 4, abortSignal: AbortSignal.timeout(timeoutMs) });
  return { vectors: embeddings, tokens: usage.tokens };
}

/** One structured call: rules as instructions, the input only as JSON data. */
async function ask<T>(model: string, instructions: string, data: unknown, schema: z.ZodType<T>): Promise<T> {
  const { output } = await generateText({
    model: nearai(model),
    instructions,
    prompt: JSON.stringify(data),
    output: Output.object({ schema }),
    temperature: 0,
    abortSignal: AbortSignal.timeout(cfg.AGENT_TIMEOUT_MS),
  });
  return output;
}
const protocol = <T>(rules: string, data: unknown, schema: z.ZodType<T>) => ask(cfg.PROTOCOL_MODEL, rules, data, schema);

const Verdict = z.object({ allow: z.boolean(), reason: z.string() });
export type Verdict = z.infer<typeof Verdict>;

// ---- entry: audit of a sponsor's materials ----

const Flags = z.object({ flags: z.array(z.object({ id: z.number(), reason: z.string() })) });
export type Flag = { id: number; reason: string };

/** A cheap model reads every chunk, a batch per call, a few calls at once. */
export async function scan(chunks: string[]): Promise<Flag[]> {
  const batches: { id: number; text: string }[][] = [[]];
  chunks.forEach((text, id) => {
    const last = batches.at(-1)!;
    if (last.reduce((n, c) => n + c.text.length, 0) + text.length > 16_000 && last.length) batches.push([]);
    batches.at(-1)!.push({ id, text });
  });
  const flags: Flag[] = [];
  for (let i = 0; i < batches.length; i += 4) {
    const found = await Promise.all(batches.slice(i, i + 4).map((b) => ask(cfg.AUDIT_MODEL, policy.scan, { chunks: b }, Flags)));
    flags.push(...found.flatMap((f) => f.flags));
  }
  return flags;
}

export const verdictOnMaterials = (summary: object) => protocol(policy.audit, summary, Verdict);

// ---- a job ----

export const screen = (job: { title: string; description: string }) => protocol(policy.job, job, Verdict);

export const MAX_QUESTION = 4_000; // characters of one agent's question

const Plan = z.object({
  picks: z.array(z.object({ id: z.number(), question: z.string() })),
  search: z.array(z.string()).default([]),
});
/** Which agents the task needs, most important first, each with its own question; and web searches, if any. */
export async function plan(task: string, budget: number, agents: { id: number; skills: string; rate: number }[]) {
  const { picks, search } = await protocol(policy.route, { task, budget, agents }, Plan);
  const seen = new Set<number>();
  const valid = picks.filter((p) => agents.some((a) => a.id === p.id) && p.question.trim() && !seen.has(p.id) && !!seen.add(p.id));
  return { picks: valid.map((p) => ({ id: p.id, question: p.question.slice(0, MAX_QUESTION) })), search: search.slice(0, 3) };
}

/** What an agent is told: our template, its expertise and method, the chunks of its knowledge found for the question. */
export const instructions = (m: Materials, found: string[]) =>
  policy.agent.replace('{{expertise}}', m.expertise).replace('{{method}}', m.method).replace('{{knowledge}}', found.join('\n---\n'));

/** One agent answers its question. Its cost is what NEAR AI charges for this call, capped. */
export async function answer(m: Materials, found: string[], question: string, pages: Page[], cap: bigint) {
  const price = priceOf(m.model);
  if (!price) return { text: '', cost: 0n }; // the model left the catalog: no work, no charge
  const materials = pages.map((p) => `<material url="${p.url}">\n${p.text}\n</material>`).join('\n');
  try {
    const r = await generateText({
      model: nearai(m.model),
      instructions: instructions(m, found),
      prompt: materials ? `# Question\n\n${question}\n\n# Public materials\n\n${materials}` : `# Question\n\n${question}`,
      maxOutputTokens: MAX_OUT,
      abortSignal: AbortSignal.timeout(cfg.AGENT_TIMEOUT_MS),
    });
    const cost = microUsd(r.usage, price);
    return { text: r.text.slice(0, 20_000), cost: cost < cap ? cost : cap };
  } catch {
    return { text: '', cost: 0n }; // a failed call: NEAR AI does not bill it
  }
}

const Check = z.object({ delivered: z.boolean(), violation: z.boolean(), reason: z.string() });
/** Did this agent do its part? Sees only its question and answer, so no agent can sway another's verdict. */
export const evaluate = (task: string, question: string, text: string) => protocol(policy.evaluate, { task, question, answer: text }, Check);

const Composed = z.object({ answer: z.string() });
/** Joins the contributions into the customer's answer; every statement carries [[id]] of its source. */
export const compose = (task: string, previous: string, contributions: { id: number; question: string; text: string }[], sources: string[]) =>
  protocol(policy.compose, { task, previous, contributions, sources: sources.map((url) => ({ url })) }, Composed).then((c) => c.answer);

const Dangerous = z.object({ dangerous: z.array(z.object({ id: z.number(), reason: z.string() })) });
export const reviewCode = (blocks: { id: number; code: string }[]) => protocol(policy.code, { blocks }, Dangerous).then((d) => d.dangerous);

const Scope = z.object({ in_scope: z.boolean(), reason: z.string() });
export const inScope = (task: string, feedback: string) => protocol(policy.scope, { task, feedback }, Scope);
