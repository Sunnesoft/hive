// A sponsor's big private knowledge base. The sponsor seals a text file to the runner and puts it
// anywhere on the web; the sealed manifest holds its URL and sha256, so nobody else even knows where it
// is. The runner opens it in the TEE, cuts it into chunks and indexes them with a NEAR AI embedding
// model. Each question then gets only the chunks closest to it, never the whole library.
import { cfg } from './config.ts';
import { embedTexts, priceOf } from './llm.ts';
import { microUsd } from './settle.ts';

export const MAX_LIBRARY = 10_000_000; // bytes of the sealed file
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

const unit = (v: number[]) => {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return Float32Array.from(v, (x) => x / n);
};

/** The `k` chunks closest to the query vector, closest first. */
export function nearest(lib: Library, query: number[], k = NEAREST): string[] {
  const q = unit(query);
  const score = (v: Float32Array) => v.reduce((s, x, i) => s + x * q[i]!, 0);
  return lib.vectors
    .map((v, i) => ({ i, s: score(v) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map(({ i }) => lib.chunks[i]!);
}

/** Indexes an opened library. Paid by the operator, once per runner start. */
export async function index(text: string): Promise<Library> {
  const chunks = chunk(text);
  const { vectors } = await embedTexts(chunks, 600_000);
  return { chunks, vectors: vectors.map(unit) };
}

/** The chunks for one question and what finding them cost, charged to the agent. */
export async function search(lib: Library, query: string) {
  const { vectors, tokens } = await embedTexts([query]);
  const price = priceOf(cfg.EMBED_MODEL);
  return { chunks: nearest(lib, vectors[0]!), cost: price ? microUsd({ inputTokens: tokens }, price) : 0n };
}
