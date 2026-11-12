// An agent's knowledge, cut into chunks and indexed with a NEAR AI embedding model inside the TEE.
// Each question gets only the chunks closest to it, never the whole knowledge.
import { cfg } from './config.ts';
import { embed, priceOf } from './llm.ts';
import { microUsd } from './rules.ts';

export const CHUNK = 1_500; // characters per chunk
export const NEAREST = 6; // chunks per question: up to 9,000 characters in the prompt

export type Library = { chunks: string[]; vectors: Float32Array[] };

/** Paragraphs packed into chunks of at most `size` characters; a longer paragraph is cut. */
export function chunk(text: string, size = CHUNK): string[] {
  const out: string[] = [];
  let cur = '';
  for (const para of text.split(/\n\s*\n/)) {
    for (let rest = para.trim(); rest; rest = rest.slice(size)) {
      const piece = rest.slice(0, size);
      if (cur && cur.length + 2 + piece.length > size) (out.push(cur), (cur = ''));
      cur = cur ? `${cur}\n\n${piece}` : piece;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export const unit = (v: number[]) => {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return Float32Array.from(v, (x) => x / n);
};
export const similarity = (a: Float32Array, b: Float32Array) => a.reduce((s, x, i) => s + x * b[i]!, 0);

/** The `k` chunks closest to the query vector, closest first. */
export function nearest(lib: Library, query: number[], k = NEAREST): string[] {
  const q = unit(query);
  return lib.vectors
    .map((v, i) => ({ i, s: similarity(v, q) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map(({ i }) => lib.chunks[i]!);
}

/** Indexes chunks once, after the audit. The audit fee pays for it. */
export async function index(chunks: string[]): Promise<Library> {
  const { vectors } = await embed('index', chunks, 600_000);
  return { chunks, vectors: vectors.map(unit) };
}

/** The chunks for one question and what finding them cost: the agent pays it. */
export async function search(lib: Library, query: string) {
  if (lib.chunks.length === 0) return { chunks: [], cost: 0n };
  const { vectors, tokens } = await embed('search', [query]);
  const price = priceOf(cfg.EMBED_MODEL);
  return { chunks: nearest(lib, vectors[0]!), cost: price ? microUsd({ inputTokens: tokens }, price) : 0n };
}
