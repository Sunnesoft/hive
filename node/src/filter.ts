// The only way from the swarm to the customer. Code does what code can; a model reviews the code that is
// left; whatever cannot be checked is removed.
import { reviewCode } from './llm.ts';
import { clean, dangers, defang } from './safety.ts';

const FENCE = /```[^\n]*\n[\s\S]*?```/g;

/** Markdown without HTML, without images and with links only to places the job itself named. */
export const prose = (md: string, allowed: Set<string>) =>
  md
    .replace(/<\/?[a-z][^>]*>/gi, '') // raw HTML, scripts, iframes
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images: a remote image tells its server who opened the answer
    .replace(/\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (_, text: string, url: string) => (allowed.has(url) ? `[${text}](${url})` : `${text} (${defang(url)})`))
    .replace(/(?<![(`])\bhttps?:\/\/[^\s)<>"'\]]+/g, (url) => (allowed.has(url) ? url : defang(url)));

/** The answer as the customer may receive it. `allowed`: the brief's links and the pages the protocol fetched. */
export async function gate(answer: string, allowed: Set<string>): Promise<string> {
  const text = clean(answer);
  const blocks = [...text.matchAll(FENCE)].map((m, id) => ({ id, code: m[0] }));
  const removed = new Map<number, string>();
  for (const b of blocks) {
    const [danger] = dangers(b.code);
    if (danger) removed.set(b.id, danger);
  }
  const unsure = blocks.filter((b) => !removed.has(b.id));
  const flagged = unsure.length ? await reviewCode(unsure).catch(() => unsure.map((b) => ({ id: b.id, reason: 'could not be checked' }))) : [];
  for (const f of flagged) removed.set(f.id, f.reason);

  const out = text
    .split(FENCE)
    .map((piece, i) => prose(piece, allowed) + (blocks[i] ? (removed.has(i) ? `> Code removed: ${removed.get(i)}.` : blocks[i].code) : ''))
    .join('');
  return blocks.length > removed.size ? `${out}\n\n> The code in this answer was not run. Read it before you run it.` : out;
}
