// Every model call goes to NEAR AI Cloud. The protocol's model does the protocol's steps, each under its
// public policy, always with the input as JSON data. An agent is one call with our template, its own
// materials and its own question: no tools, no network, no other agents, no memory between jobs.
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { embedMany, generateText, Output } from 'ai';
import { z } from 'zod';
import { cfg, policy } from './config.ts';
import { log } from './log.ts';
import type { Materials } from './materials.ts';
import { ceiling, CHECK_OUT, COMBINE_OUT, LOOKUP_OUT, LOOKUPS, MAX_OUT, microUsd, PASS_OUT, PROOF_OUT, SAME_OUT, TOPICS, usdc, type Price, type Usage } from './rules.ts';
import * as store from './store.ts';
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

// ---- the operator's own money: every call is priced, counted by UTC day and logged ----

const today = () => new Date().toISOString().slice(0, 10);
/** Has the runner spent its daily limit at NEAR AI? Then it starts no new work until the next UTC day. */
export const overBudget = async () => BigInt(Math.ceil((await store.spendNow())[today()] ?? 0)) >= usdc(cfg.DAILY_BUDGET_USD);

type Used = Usage & { outputTokenDetails?: { reasoningTokens?: number | undefined } };

/** One call to NEAR AI, under the name of its step. Its price is counted against the day's limit, a call that
 *  answered badly included: NEAR AI bills it too. Its size and time go to the log; what was sent and what came
 *  back go only to the trace. */
async function metered<R>(step: string, model: string, sent: object, limit: number, call: () => Promise<R>, read: (r: R) => { usage: Used; got: unknown; finish?: string; id?: string | undefined }): Promise<R> {
  const at = Date.now();
  const line = (usage: Used | undefined, more: object, got: unknown) => {
    const price = priceOf(model);
    const cost = usage && price ? microUsd(usage, price) : 0n;
    if (cost) void store.spent(today(), cost).catch(() => {});
    const size = { in: usage?.inputTokens, out: usage?.outputTokens, reasoning: usage?.outputTokenDetails?.reasoningTokens };
    log('llm', { step, model, ...size, micro_usd: Number(cost), ms: Date.now() - at, ...more }, { sent, got });
  };
  try {
    const r = await call();
    const { usage, got, finish, id } = read(r);
    line(usage, { finish, id }, got); // `id` is what NEAR AI bills the call under: POST /v1/billing/costs tells its real cost
    return r;
  } catch (e) {
    const failed = e as { name?: string; usage?: Used; text?: string; finishReason?: string };
    // A call we stopped waiting for went on at NEAR AI, and what it used is unknown: it is counted at its worst.
    const worst = failed.name === 'TimeoutError' ? { inputTokens: Buffer.byteLength(JSON.stringify(sent)), outputTokens: limit } : undefined;
    line(failed.usage ?? worst, { finish: failed.finishReason, error: String(e).slice(0, 300) }, failed.text);
    throw e;
  }
}

// ---- building blocks ----

/** `step` says what the vectors are for: `index` a library, `search` it, `shortlist` experts, `shelf` a customer's materials. */
export async function embed(step: string, values: string[], timeoutMs = cfg.AGENT_TIMEOUT_MS) {
  const call = () => embedMany({ model: nearai.embeddingModel(cfg.EMBED_MODEL), values, maxParallelCalls: 4, abortSignal: AbortSignal.timeout(timeoutMs) });
  const { embeddings, usage } = await metered(step, cfg.EMBED_MODEL, { values }, 0, call, (r) => ({ usage: { inputTokens: r.usage.tokens }, got: `${r.embeddings.length} vectors` }));
  return { vectors: embeddings, tokens: usage.tokens };
}

const PROTOCOL_OUT = 8_000; // output tokens of one protocol step: room for a composed answer, a ceiling for a runaway one
// A model answers at once, without a reasoning pass. Reasoning counts against the same output limit, so a hard
// question could spend the whole limit thinking and return nothing; without it a call's time and cost are bounded.
// Qwen and DeepSeek read `enable_thinking`, Kimi reads `thinking`; a model ignores the name it does not know.
const DIRECT = { nearai: { chat_template_kwargs: { enable_thinking: false, thinking: false } } };
const billedAs = (r: { response: { headers?: Record<string, string> | undefined } }) => r.response.headers?.['inference-id'];
type Step = Exclude<keyof typeof policy, 'agent' | 'lookup' | 'pass' | 'check' | 'combine' | 'same' | 'proof'>; // a protocol step is named after the public policy it applies

/** One structured call: the step's policy as instructions, the input only as JSON data. */
async function ask<T>(model: string, step: Step, data: unknown, schema: z.ZodType<T>): Promise<T> {
  const prompt = JSON.stringify(data);
  const call = () => generateText({
    model: nearai(model),
    instructions: policy[step],
    prompt,
    output: Output.object({ schema }),
    temperature: 0,
    maxOutputTokens: PROTOCOL_OUT,
    providerOptions: DIRECT,
    abortSignal: AbortSignal.timeout(cfg.AGENT_TIMEOUT_MS),
  });
  return (await metered(step, model, { prompt }, PROTOCOL_OUT, call, (r) => ({ usage: r.usage, got: r.output, finish: r.finishReason, id: billedAs(r) }))).output;
}
const protocol = <T>(step: Step, data: unknown, schema: z.ZodType<T>) => ask(cfg.PROTOCOL_MODEL, step, data, schema);

const Verdict = z.object({ allow: z.boolean(), reason: z.string() });
export type Verdict = z.infer<typeof Verdict>;

/** Topics of tasks: Agent Market's own categories. Coarse on purpose: they tell sponsors where demand is, not what was asked. */
export { TOPICS };
export type Topic = (typeof TOPICS)[number];

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
    const found = await Promise.all(batches.slice(i, i + 4).map((b) => ask(cfg.AUDIT_MODEL, 'scan', { chunks: b }, Flags)));
    flags.push(...found.flatMap((f) => f.flags));
  }
  return flags;
}

/** Why an agent was denied, in words that name a rule, never the material. */
export const DENIALS = ['instructions_to_ai', 'hidden_content', 'malware', 'personal_data', 'deception_or_copyright', 'skills_unsupported'] as const;
const Audit = z.object({ allow: z.boolean(), category: z.enum(['ok', ...DENIALS]), reason: z.string() });
export const verdictOnMaterials = (summary: object) => protocol('audit', summary, Audit);

// ---- a job ----

const Screened = Verdict.extend({ topic: z.enum(TOPICS), code: z.boolean().default(false) }); // code: the task asks for code in the answer
export const screen = (job: { title: string; description: string }) => protocol('job', job, Screened);

export const MAX_QUESTION = 4_000; // characters of one agent's question

const Plan = z.object({
  picks: z.array(z.object({ id: z.number(), question: z.string() })),
  search: z.array(z.string()).default([]),
});
/** Which agents the task needs, most important first, each with its own question; and web searches, if any. */
export async function plan(task: string, budget: number, agents: { id: number; skills: string; examples?: string[]; rate: number; requested?: boolean; record?: string | null }[]) {
  const { picks, search } = await protocol('route', { task, budget, agents }, Plan);
  const seen = new Set<number>();
  const valid = picks.filter((p) => agents.some((a) => a.id === p.id) && p.question.trim() && !seen.has(p.id) && !!seen.add(p.id));
  return { picks: valid.map((p) => ({ id: p.id, question: p.question.slice(0, MAX_QUESTION) })), search: search.slice(0, 3) };
}

type Card = { skills: string; examples?: string[] };
/** Which of the candidates could be asked this question instead of the picked agent: those whose own skills cover it. */
export const standIns = (question: string, picked: Card, candidates: (Card & { id: number })[]) =>
  protocol('stand-in', { question, picked, candidates }, z.object({ ids: z.array(z.number()) })).then((r) => r.ids.filter((id) => candidates.some((c) => c.id === id)));

/** What an agent is told: our template, its expertise and method, the chunks of its knowledge found for the question.
 *  Replaced by functions, so `$&` or `$'` in a sponsor's text stays text. */
export const instructions = (m: Materials, found: string[]) =>
  policy.agent
    .replace('{{expertise}}', () => m.expertise)
    .replace('{{method}}', () => m.method)
    .replace('{{knowledge}}', () => found.join('\n---\n'));

/** A question as an agent gets it: with the parts of the customer's materials that are its to read. */
const asked = (question: string, pages: Page[]) => {
  const materials = pages.map((p) => `<material url="${p.url}">\n${p.text}\n</material>`).join('\n');
  return materials ? `# Question\n\n${question}\n\n# Public materials\n\n${materials}` : `# Question\n\n${question}`;
};

const lookupInstructions = (m: Materials) => policy.lookup.replace('{{expertise}}', () => m.expertise).replace('{{method}}', () => m.method);
/** The most the look-up step can cost an agent whose share of the public materials is `publicBytes`. */
export const lookupCeiling = (m: Materials, publicBytes: number, price: Price) =>
  microUsd({ inputTokens: Buffer.byteLength(lookupInstructions(m)) + publicBytes, outputTokens: LOOKUP_OUT }, price);

const Lookups = z.object({ queries: z.array(z.string()) });
/** Before it answers a question that came with materials, an expert reads them and names what to look up in its
 *  own knowledge. The knowledge is searched by meaning, and "audit this contract" is close to nothing in it: what
 *  to look for is in the contract. The queries only choose which of the expert's own chunks it gets; nobody sees
 *  them. If the step fails or does not fit `cap`, the expert goes on with what its question alone finds. */
export async function lookups(m: Materials, question: string, pages: Page[], cap: bigint): Promise<{ queries: string[]; cost: bigint }> {
  const price = priceOf(m.model);
  const [system, prompt] = [lookupInstructions(m), asked(question, pages)];
  if (!price || microUsd({ inputTokens: Buffer.byteLength(system + prompt), outputTokens: LOOKUP_OUT }, price) > cap) return { queries: [], cost: 0n };
  const call = () => generateText({ model: nearai(m.model), instructions: system, prompt, output: Output.object({ schema: Lookups }), temperature: 0, maxOutputTokens: LOOKUP_OUT, providerOptions: DIRECT, abortSignal: AbortSignal.timeout(cfg.AGENT_TIMEOUT_MS) });
  try {
    const r = await metered('lookup', m.model, { agent: m.name, system, prompt }, LOOKUP_OUT, call, (r) => ({ usage: r.usage, got: r.output, finish: r.finishReason, id: billedAs(r) }));
    return { queries: r.output.queries.map((q) => q.trim().slice(0, 300)).filter(Boolean).slice(0, LOOKUPS), cost: microUsd(r.usage, price) };
  } catch {
    return { queries: [], cost: 0n };
  }
}

/** The steps of a review (review.ts), each a call of the agent's own model under a public policy. */
const STEP_OUT = { pass: PASS_OUT, check: CHECK_OUT, combine: COMBINE_OUT, proof: PROOF_OUT };
export type ReviewStep = keyof typeof STEP_OUT;
/** The model a step of a review runs on: the passes on the agent's reading model, if it named one. */
export const modelOf = (kind: ReviewStep, m: Materials) => (kind === 'pass' ? (m.pass_model ?? m.model) : m.model);
const stepInstructions = (kind: ReviewStep, m: Materials, knowledge: string) =>
  policy[kind].replace('{{expertise}}', () => m.expertise).replace('{{method}}', () => m.method).replace('{{knowledge}}', () => knowledge);
const stepPrompt = (question: string, pages: Page[], about: string) => (about ? `${asked(question, pages)}\n\n${about}` : asked(question, pages));
/** The most one step can cost: every byte of its prompt as a token, and its whole output limit. */
export const stepCeiling = (kind: ReviewStep, m: Materials, knowledge: string, question: string, pages: Page[], about: string, price: Price) =>
  microUsd({ inputTokens: Buffer.byteLength(stepInstructions(kind, m, knowledge) + stepPrompt(question, pages, about)), outputTokens: STEP_OUT[kind] }, price);

/** One step of a review: a pass with one part of the agent's knowledge, the check of a group of findings, a look at
 *  the confirmed findings together, or the proof of one. `about` is the section the step is given after the question and the materials: the findings to
 *  check, the finding to prove. Sent only if its worst case fits `cap`; a step that fails costs the agent nothing
 *  and returns nothing. `cut`: the reply ran into the step's output limit. */
export async function step(kind: ReviewStep, m: Materials, knowledge: string, question: string, pages: Page[], about: string, cap: bigint): Promise<{ text: string; cost: bigint; why?: Why; cut?: boolean }> {
  const model = modelOf(kind, m);
  const price = priceOf(model);
  if (!price) return { text: '', cost: 0n, why: 'model_unavailable' };
  if (stepCeiling(kind, m, knowledge, question, pages, about, price) > cap) return { text: '', cost: 0n, why: 'too_expensive' };
  const [system, prompt] = [stepInstructions(kind, m, knowledge), stepPrompt(question, pages, about)];
  const call = () => generateText({ model: nearai(model), instructions: system, prompt, temperature: 0, maxOutputTokens: STEP_OUT[kind], providerOptions: DIRECT, abortSignal: AbortSignal.timeout(cfg.AGENT_TIMEOUT_MS) });
  try {
    const r = await metered(kind, model, { agent: m.name, system, prompt }, STEP_OUT[kind], call, (r) => ({ usage: r.usage, got: r.text, finish: r.finishReason, id: billedAs(r) }));
    return { text: r.text, cost: microUsd(r.usage, price), cut: r.finishReason === 'length' };
  } catch {
    return { text: '', cost: 0n, why: 'model_failed' };
  }
}

const Same = z.object({ groups: z.array(z.array(z.number())) });
/** The most the question "which of these are the same" can cost on `bytes` of findings. */
export const sameCeiling = (bytes: number, price: Price) => microUsd({ inputTokens: Buffer.byteLength(policy.same) + bytes, outputTokens: SAME_OUT }, price);
/** Which of the findings, a line each, say the same thing (policies/same.md): a narrow question whose answer only
 *  sorts, and code does the joining (rules.partition). Asked of an expert's own model inside its review (`cap`:
 *  what its hold covers) and of the protocol's model when the reviews of several experts are joined. No answer, or
 *  one that does not fit `cap`: nothing is joined. */
export async function sameFindings(model: string, lines: string[], cap?: bigint): Promise<{ groups: number[][]; cost: bigint }> {
  const price = priceOf(model);
  const prompt = JSON.stringify({ findings: lines.map((text, id) => ({ id, text })) });
  if (!price || lines.length < 2 || (cap !== undefined && sameCeiling(Buffer.byteLength(prompt), price) > cap)) return { groups: [], cost: 0n };
  const call = () => generateText({ model: nearai(model), instructions: policy.same, prompt, output: Output.object({ schema: Same }), temperature: 0, maxOutputTokens: SAME_OUT, providerOptions: DIRECT, abortSignal: AbortSignal.timeout(cfg.AGENT_TIMEOUT_MS) });
  try {
    const r = await metered('same', model, { prompt }, SAME_OUT, call, (r) => ({ usage: r.usage, got: r.output, finish: r.finishReason, id: billedAs(r) }));
    return { groups: r.output.groups, cost: microUsd(r.usage, price) };
  } catch {
    return { groups: [], cost: 0n };
  }
}

/** One agent answers its question. Its cost is what NEAR AI charges for this call. The call is sent only if
 *  its worst case fits `cap`, so the cost can never pass the agent's hold. */
export async function answer(m: Materials, found: string[], question: string, pages: Page[], cap: bigint): Promise<{ text: string; cost: bigint; why?: Why; cut?: boolean }> {
  const price = priceOf(m.model);
  const [system, prompt] = [instructions(m, found), asked(question, pages)];
  if (!price) return { text: '', cost: 0n, why: 'model_unavailable' }; // the model left the catalog: no work, no charge
  if (ceiling(Buffer.byteLength(system + prompt), price) > cap) return { text: '', cost: 0n, why: 'too_expensive' }; // max_cost too low for this prompt
  const call = () => generateText({ model: nearai(m.model), instructions: system, prompt, maxOutputTokens: MAX_OUT, providerOptions: DIRECT, abortSignal: AbortSignal.timeout(cfg.AGENT_TIMEOUT_MS) });
  try {
    const r = await metered('agent', m.model, { agent: m.name, system, prompt }, MAX_OUT, call, (r) => ({ usage: r.usage, got: r.text, finish: r.finishReason, id: billedAs(r) }));
    const cost = microUsd(r.usage, price);
    return { text: r.text.slice(0, 20_000), cost: cost < cap ? cost : cap, cut: r.finishReason === 'length' }; // cut: it ran into MAX_OUT before it was whole
  } catch {
    return { text: '', cost: 0n, why: 'model_failed' }; // a failed call costs the agent nothing: what NEAR AI billed for it is ours
  }
}

/** Why a contribution counted or not, as its sponsor may see it: a rule, never the question. */
export const WHYS = ['answered', 'empty', 'off_topic', 'refused', 'repeated_question', 'addressed_others', 'asked_for_score', 'changed_rules', 'hidden_content', 'attack'] as const;
export type Why = (typeof WHYS)[number] | 'cut_off' | 'too_expensive' | 'model_unavailable' | 'model_failed' | 'not_checked';
const Check = z.object({ delivered: z.boolean(), violation: z.boolean(), why: z.enum(WHYS), reason: z.string() });
/** Did this agent do its part? Sees only its question and answer, so no agent can sway another's verdict. */
export const evaluate = (task: string, question: string, text: string) => protocol('evaluate', { task, question, answer: text }, Check);

/** Joins the contributions into the customer's answer; every statement carries [[id]] of its source. The answer
 *  is the model's text as it is, not a field of a JSON object: inside a JSON string every quotation mark and line
 *  break of a long Markdown answer has to be escaped, and one that is not ends the answer there. */
export async function compose(task: string, previous: string, contributions: { id: number; question: string; text: string }[], sources: string[]) {
  const prompt = JSON.stringify({ task, previous, contributions, sources: sources.map((url) => ({ url })) });
  const model = cfg.COMPOSE_MODEL ?? cfg.PROTOCOL_MODEL;
  const call = () => generateText({ model: nearai(model), instructions: policy.compose, prompt, temperature: 0, maxOutputTokens: PROTOCOL_OUT, providerOptions: DIRECT, abortSignal: AbortSignal.timeout(cfg.AGENT_TIMEOUT_MS) });
  const r = await metered('compose', model, { prompt }, PROTOCOL_OUT, call, (r) => ({ usage: r.usage, got: r.text, finish: r.finishReason, id: billedAs(r) }));
  return r.finishReason === 'length' ? `${r.text}\n\n> The answer reached its length limit and stops here.` : r.text;
}

const Dangerous = z.object({ dangerous: z.array(z.object({ id: z.number(), reason: z.string() })) });
export const reviewCode = (blocks: { id: number; code: string }[]) => protocol('code', { blocks }, Dangerous).then((d) => d.dangerous);

const Scope = z.object({ in_scope: z.boolean(), reason: z.string() });
export const inScope = (task: string, feedback: string) => protocol('scope', { task, feedback }, Scope);
