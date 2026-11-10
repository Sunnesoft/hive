// The protocol's only way out to the web; agents have none. The SSRF filter checks every resolved address,
// redirects included, so private, loopback and metadata hosts are unreachable. Untrusted HTML is turned
// into text in its own thread with its own memory and time limits.
import { Worker } from 'node:worker_threads';
import axios from 'axios';
import { RequestFilteringHttpAgent, RequestFilteringHttpsAgent } from 'request-filtering-agent';
import { cfg } from './config.ts';

const allow = { allowIPAddressList: cfg.FETCH_ALLOW.split(',').filter(Boolean) };
const http = axios.create({
  httpAgent: new RequestFilteringHttpAgent(allow),
  httpsAgent: new RequestFilteringHttpsAgent(allow),
  timeout: 10_000,
  maxRedirects: 3,
  maxContentLength: 2_000_000,
  responseType: 'text',
  headers: { 'user-agent': 'swarm-for-hire' },
});

/** HTML to plain text in a separate thread: a page that breaks the parser kills only that thread. */
export const toText = (html: string) =>
  new Promise<string>((resolve, reject) => {
    const worker = new Worker(new URL('./html.worker.ts', import.meta.url), { workerData: html, resourceLimits: { maxOldGenerationSizeMb: 64 } });
    const timer = setTimeout(() => void worker.terminate().then(() => reject(new Error('page took too long to read'))), 5_000);
    worker.once('message', (text: string) => (clearTimeout(timer), resolve(text), void worker.terminate()));
    worker.once('error', (e) => (clearTimeout(timer), reject(e)));
  });

/** The text of an untrusted PDF, read in its own thread: nothing in the file runs, a hostile file kills only that thread. */
export const pdfText = (bytes: Uint8Array) =>
  new Promise<string>((resolve, reject) => {
    const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const worker = new Worker(new URL('./pdf.worker.ts', import.meta.url), { workerData: copy, resourceLimits: { maxOldGenerationSizeMb: 192 } });
    const timer = setTimeout(() => void worker.terminate().then(() => reject(new Error('the PDF took too long to read'))), 20_000);
    worker.once('message', (text: string) => (clearTimeout(timer), resolve(text), void worker.terminate()));
    worker.once('error', () => (clearTimeout(timer), reject(new Error('the PDF could not be read'))));
  });

/** The text of a file or a response by what it is: PDF, HTML, or plain text of any kind (Markdown, CSV, JSON, code). */
export async function textOf(bytes: Uint8Array, type: string, name = ''): Promise<string> {
  if (/pdf/i.test(type) || /\.pdf$/i.test(name) || Buffer.from(bytes.subarray(0, 5)).toString('latin1') === '%PDF-') return pdfText(bytes);
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  if (/html/i.test(type)) return toText(text);
  if (!type || /^text\/|json|xml|csv|markdown|yaml|javascript|typescript/i.test(type) || /\.(md|txt|csv|tsv|json|xml|ya?ml|sol|rs|ts|js|py|go|java|toml|ini|log)$/i.test(name)) return text;
  throw new Error(`cannot read ${type || 'this kind of file'}`);
}

/** Links people paste, as the address that serves their content: a GitHub file or repository (its README),
 *  a public Google Doc, Sheet or Slides. Anything else is fetched as it is. */
export function direct(url: string): string {
  const u = new URL(url);
  const parts = u.pathname.split('/').filter(Boolean);
  if (u.hostname === 'github.com' && parts.length >= 2) {
    const [owner, repo, kind, ...rest] = parts as [string, string, string?, ...string[]];
    if (kind === 'blob' && rest.length >= 2) return `https://raw.githubusercontent.com/${owner}/${repo}/${rest.join('/')}`;
    if (!kind) return `https://raw.githubusercontent.com/${owner}/${repo.replace(/\.git$/, '')}/HEAD/README.md`;
  }
  const doc = u.hostname === 'docs.google.com' && /^\/(document|spreadsheets|presentation)\/d\/([\w-]+)/.exec(u.pathname);
  if (doc) return `https://docs.google.com/${doc[1]}/d/${doc[2]}/export?format=${doc[1] === 'spreadsheets' ? 'csv' : 'txt'}`;
  return url;
}

/** One link's content as text, or why it could not be read. Only public content: no cookies, no sign-in. */
export async function read(url: string): Promise<string> {
  const res = await http.get<ArrayBuffer>(direct(url), { responseType: 'arraybuffer', maxContentLength: SOURCE_BYTES });
  const landed: string = res.request?.res?.responseUrl ?? '';
  if (/^https:\/\/(accounts\.google\.com|github\.com\/login|login\.)/.test(landed)) throw new Error('not public: it asks to sign in');
  return textOf(new Uint8Array(res.data), String(res.headers['content-type'] ?? ''), new URL(url).pathname);
}

/** https links the customer put in the brief or the messages: public material they want used. */
export const linksIn = (text: string, max = MAX_SOURCES) =>
  [...new Set((text.match(/https:\/\/[^\s)<>"'\]]+/g) ?? []).map((u) => u.replace(/[.,;:!?]+$/, '')))].slice(0, max);

async function searchWeb(query: string): Promise<string[]> {
  if (!cfg.BRAVE_API_KEY) return [];
  const url = `https://api.search.brave.com/res/v1/web/search?count=3&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { accept: 'application/json', 'x-subscription-token': cfg.BRAVE_API_KEY }, signal: AbortSignal.timeout(10_000) });
  const body = (await res.json()) as { web?: { results?: { url: string }[] } };
  return (body.web?.results ?? []).map((r) => r.url).filter((u) => u.startsWith('https://'));
}

export const MAX_SOURCES = 10; // links read per job, besides the customer's files
export const SOURCE_BYTES = 5_000_000; // the most downloaded for one link
export const SOURCE_CHARS = 400_000; // of one source's text
export const PUBLIC_CHARS = 48_000; // of the public material one expert gets with its question

export type Page = { url: string; text: string };
export type Unread = { url: string; why: string };

/** Public pages for a job: the brief's links and, with a search key, the results of the planned searches.
 *  What could not be read is reported, so the customer learns which of their links did not work. */
export async function gather(task: string, queries: string[]): Promise<{ pages: Page[]; unread: Unread[] }> {
  const found = await Promise.all(queries.map((q) => searchWeb(q).catch(() => [])));
  const urls = [...new Set([...linksIn(task), ...found.flat()])].slice(0, MAX_SOURCES + 3);
  const read_ = await Promise.all(urls.map((url) => read(url).then((text) => ({ url, text: text.trim().slice(0, SOURCE_CHARS) }), (e: Error) => ({ url, why: reason(e) }))));
  return {
    pages: read_.filter((p): p is Page => 'text' in p && p.text !== ''),
    unread: read_.filter((p): p is Unread => 'why' in p).filter((u) => linksIn(task).includes(u.url)), // the customer's own links
  };
}
const reason = (e: Error & { response?: { status?: number }; code?: string }) =>
  e.response?.status ? `the site answered ${e.response.status}` : e.code === 'ECONNABORTED' ? 'it took too long' : /maxContentLength/.test(e.message) ? 'it is over 5 MB' : e.message.slice(0, 80);
