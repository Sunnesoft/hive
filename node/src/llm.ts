// All inference goes to NEAR AI Cloud. Agents get only their own manifest and the task: no keys,
// no other agents, no memory between jobs. Their output is data for the judge, never instructions.
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, isStepCount, Output } from 'ai';
import { z } from 'zod';
import { cfg, log, policy } from './config.ts';
import type { Manifest } from './manifest.ts';
import { MAX_OUT, microUsd, type Price, type Run, type Score } from './settle.ts';
import { tools } from './web.ts';

const nearai = createOpenAICompatible({
  name: 'nearai',
  baseURL: cfg.NEARAI_URL,
  apiKey: cfg.NEARAI_API_KEY,
  supportsStructuredOutputs: true,
});

const Cost = z.object({ amount: z.number(), scale: z.number() }); // amount * 10^-scale USD per token
const Catalog = z.object({
  models: z.array(z.object({ modelId: z.string(), inputCostPerToken: Cost, outputCostPerToken: Cost })),
});
const perMillion = (c: z.infer<typeof Cost>) => c.amount * 10 ** (6 - c.scale);

let prices: Record<string, Price> = {};
export const priceOf = (model: string) => prices[model];

/** Live NEAR AI prices, USD per 1M tokens. Costs reported on-chain are computed from these. */
export async function refreshPrices() {
  const res = await fetch(`${cfg.NEARAI_URL}/model/list?limit=500`, { signal: AbortSignal.timeout(20_000) });
  const { models } = Catalog.parse(await res.json());
  prices = Object.fromEntries(models.map((m) => [m.modelId, { in: perMillion(m.inputCostPerToken), out: perMillion(m.outputCostPerToken) }]));
}

export const instructions = (m: Manifest) =>
  m.knowledge ? `${m.system}\n\n<knowledge>\n${m.knowledge}\n</knowledge>` : m.system;

/** Runs one agent. Spend is counted per step and the run stops at the cap; a failed run keeps what it spent. */
export async function runAgent(m: Manifest, task: string, cap: bigint): Promise<Run> {
  const price = prices[m.model];
  if (!price) return { text: '', cost: 0n }; // the model left the catalog: no work, no charge
  let cost = 0n;
  let text = '';
  try {
    const r = await generateText({
      model: nearai(m.model),
      instructions: instructions(m),
      prompt: task,
      tools: Object.fromEntries(m.tools.map((t) => [t, tools[t]])),
      stopWhen: [isStepCount(m.maxSteps), () => cost >= cap],
      maxOutputTokens: MAX_OUT,
      abortSignal: AbortSignal.timeout(cfg.AGENT_TIMEOUT_MS),
      onStepEnd: (step) => void (cost += microUsd(step.usage, price)),
    });
    text = r.text.slice(0, 20_000);
  } catch (e) {
    log('agent_failed', { agent: m.name, error: String(e) });
  }
  return { text, cost: cost < cap ? cost : cap };
}

export type Verdict = { allow: boolean; reason: string };
const VerdictSchema = z.object({ allow: z.boolean(), reason: z.string() });

async function ask<T>(instructions: string, data: unknown, schema: z.ZodType<T>): Promise<T> {
  const { output } = await generateText({
    model: nearai(cfg.JUDGE_MODEL),
    instructions,
    prompt: JSON.stringify(data), // data only: the policies tell the model never to obey it
    output: Output.object({ schema }),
    temperature: 0,
    abortSignal: AbortSignal.timeout(cfg.AGENT_TIMEOUT_MS),
  });
  return output;
}

export const reviewManifest = (m: Manifest): Promise<Verdict> => ask(policy.manifest, m, VerdictSchema);
export const screenJob = (job: { title: string; description: string }): Promise<Verdict> => ask(policy.job, job, VerdictSchema);

// Lenient on purpose: an out-of-range score is clamped by `outcomes`, not a reason to fail the whole job.
const Scores = z.object({ scores: z.array(z.object({ id: z.number(), score: z.number(), violation: z.boolean() })) });

/** One call sees all answers, labelled only by index: the judge never learns who wrote what. */
export async function judge(task: string, runs: Run[]): Promise<Score[]> {
  const { scores } = await ask(policy.result, { task, answers: runs.map((r, id) => ({ id, text: r.text })) }, Scores);
  return runs.map((_, i) => scores.find((s) => s.id === i) ?? { score: 0, violation: false });
}
