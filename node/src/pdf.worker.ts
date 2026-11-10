// The text of an untrusted PDF, in its own thread with its own memory and time limits (see web.ts).
// No code from the file ever runs: this pdf.js has no eval path for font programs at all, and nothing is rendered.
import { parentPort, workerData } from 'node:worker_threads';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const MAX_PAGES = 300;
const MAX_CHARS = 400_000;

const doc = await getDocument({ data: new Uint8Array(workerData as ArrayBuffer), disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
let text = '';
for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES) && text.length < MAX_CHARS; n++) {
  const page = await doc.getPage(n);
  const { items } = await page.getTextContent();
  for (const item of items) if ('str' in item) text += item.str + (item.hasEOL ? '\n' : ' ');
  text += '\n\n';
}
await doc.cleanup?.();
parentPort!.postMessage(text.slice(0, MAX_CHARS));
