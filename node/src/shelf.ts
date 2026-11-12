// The customer's materials for one task, as a library: each expert gets the parts closest to its own question,
// never all of it. Small materials go to every expert whole. The protocol pays for this indexing (its overhead).
import { CHUNK, chunk, index, unit, similarity } from './library.ts';
import { embed } from './llm.ts';
import { PUBLIC_CHARS, type Page } from './web.ts';

export type Shelf = { for: (question: string) => Promise<Page[]> };

const MAX_CHARS = 1_000_000; // of all of a task's materials that are indexed
const PICK = Math.floor(PUBLIC_CHARS / CHUNK); // chunks one expert gets

/** The first `PUBLIC_CHARS` of the materials, source by source: what an expert gets if indexing is not possible,
 *  and what the controller of a review reads. */
export const head = (pages: Page[]) => {
  let left = PUBLIC_CHARS;
  return pages.flatMap((p) => {
    const text = p.text.slice(0, Math.max(0, left));
    left -= text.length;
    return text ? [{ url: p.url, text }] : [];
  });
};

export async function shelve(pages: Page[]): Promise<Shelf> {
  if (pages.reduce((s, p) => s + p.text.length, 0) <= PUBLIC_CHARS) return { for: async () => pages };
  let room = MAX_CHARS;
  const parts = pages.flatMap((p, source) => chunk(p.text).map((text, at) => ({ source, at, text }))).filter((x) => (room -= x.text.length) >= 0);
  const lib = await index(parts.map((x) => x.text)).catch(() => null);
  if (!lib) return { for: async () => head(pages) }; // NEAR AI is down: the beginning of each source, as before
  return {
    async for(question) {
      const query = await embed('shelf', [question]).then((r) => unit(r.vectors[0]!), () => null);
      if (!query) return head(pages);
      const best = lib.vectors.map((v, i) => ({ i, s: similarity(v, query) })).sort((a, b) => b.s - a.s).slice(0, PICK).map(({ i }) => parts[i]!);
      // Back in each source's order, one page per source: the expert reads the parts as they stand in the document.
      return pages.flatMap((p, source) => {
        const mine = best.filter((x) => x.source === source).sort((a, b) => a.at - b.at);
        return mine.length ? [{ url: p.url, text: mine.map((x) => x.text).join('\n\n[…]\n\n') }] : [];
      });
    },
  };
}
