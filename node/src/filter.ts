// The only way from the swarm to the customer. The answer is parsed as Markdown (GFM) and rebuilt from its
// tree, so every link, image, piece of HTML and code is seen whatever syntax a model used for it.
// Links: only an address that existed before the task stays clickable, because only such an address cannot
// carry the task to someone (OpenAI checks links against a public web index for the same reason). Others
// are shown as text, marked unverified. Code: code checks what it can; a model reviews the rest; whatever
// cannot be checked is removed.
import type { Code, Nodes, Root, RootContent } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown, gfmToMarkdown } from 'mdast-util-gfm';
import { toMarkdown } from 'mdast-util-to-markdown';
import { toString } from 'mdast-util-to-string';
import { gfm } from 'micromark-extension-gfm';
import { reviewCode } from './llm.ts';
import { clean, dangers, defang } from './safety.ts';

type Node = RootContent;
const text = (value: string): Node => ({ type: 'text', value });
const note = (value: string): Node => ({ type: 'blockquote', children: [{ type: 'paragraph', children: [{ type: 'text', value }] }] });

/** Text that looks like an address, in any letter case: a scheme, `//host` or `www.`. Shown, never linked. */
const URLISH = /\b[a-z][a-z\d+.-]*:\/\/[^\s<>()]+|(?<![\w/:])\/\/[^\s<>()]+|\bwww\.[^\s<>()]+/gi;
const plain = (s: string) => s.replace(URLISH, defang);

/** The tree again, with only what may reach a customer. `removed`: code blocks to replace, with the reason.
 *  Inside a known link (`linked`) the label is left as written: the address it shows is the one it opens. */
function rebuild(nodes: Node[], allowed: Set<string>, removed: Map<Code, string>, linked = false): Node[] {
  const again = (n: Nodes, inLink = linked) => ('children' in n ? rebuild(n.children as Node[], allowed, removed, inLink) : []);
  return nodes.flatMap((n): Node[] => {
    switch (n.type) {
      case 'html': // raw HTML, scripts, iframes, comments
      case 'imageReference':
      case 'definition': // targets of reference links, which become text below
        return [];
      case 'image': // never loaded by itself: a remote image tells its server who opened the answer
        return allowed.has(n.url) ? [{ type: 'link', url: n.url, children: [{ type: 'text', value: `image: ${plain(n.alt || n.url)}` }] }] : [];
      case 'link': {
        if (allowed.has(n.url)) return [{ ...n, children: again(n, true) as typeof n.children }];
        const [label, shown] = [toString(n), defang(n.url)];
        return [text(defang(label) === shown ? `${shown} (unverified link)` : `${plain(label)} (unverified link: ${shown})`)];
      }
      case 'linkReference':
        return [text(plain(toString(n)))];
      case 'text':
        return [text(dangers(n.value).length ? '[removed]' : linked ? n.value : plain(n.value))];
      case 'inlineCode':
        return [dangers(n.value).length ? text('[code removed]') : n];
      case 'code':
        return [removed.has(n) ? note(`Code removed: ${removed.get(n)}.`) : n];
      case 'paragraph': {
        const [danger] = dangers(toString(n)); // an instruction split over several pieces of text
        return [danger ? note(`Removed: ${danger}.`) : { ...n, children: again(n) as typeof n.children }];
      }
      default:
        return ['children' in n ? ({ ...n, children: again(n) } as Node) : n];
    }
  });
}

function codeIn(n: Nodes): Code[] {
  if (n.type === 'code') return [n];
  return 'children' in n ? (n.children as Nodes[]).flatMap(codeIn) : [];
}

/** The answer as the customer may receive it. `allowed`: addresses known before the task (see round.ts). */
export async function gate(answer: string, allowed: Set<string>): Promise<string> {
  const tree: Root = fromMarkdown(clean(answer), { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
  const blocks = codeIn(tree);
  const removed = new Map<Code, string>();
  for (const b of blocks) {
    const [danger] = dangers(b.value);
    if (danger) removed.set(b, danger);
  }
  const unsure = blocks.filter((b) => !removed.has(b));
  const review = unsure.map((b, id) => ({ id, code: b.value }));
  const flagged = unsure.length ? await reviewCode(review).catch(() => review.map(({ id }) => ({ id, reason: 'it could not be checked' }))) : [];
  for (const f of flagged) if (unsure[f.id]) removed.set(unsure[f.id]!, f.reason);

  const out = toMarkdown({ type: 'root', children: rebuild(tree.children, allowed, removed) }, { extensions: [gfmToMarkdown()], fences: true, bullet: '-' });
  return blocks.length > removed.size ? `${out}\n> The code in this answer was not run. Read it before you run it.\n` : out;
}
