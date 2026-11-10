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

export const fetchPage = async (url: string) => toText((await http.get<string>(url)).data);

/** https links the customer put in the brief: public material they want used. */
export const linksIn = (text: string) =>
  [...new Set((text.match(/https:\/\/[^\s)<>"'\]]+/g) ?? []).map((u) => u.replace(/[.,;:!?]+$/, '')))].slice(0, 5);

async function searchWeb(query: string): Promise<string[]> {
  if (!cfg.BRAVE_API_KEY) return [];
  const url = `https://api.search.brave.com/res/v1/web/search?count=3&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { accept: 'application/json', 'x-subscription-token': cfg.BRAVE_API_KEY }, signal: AbortSignal.timeout(10_000) });
  const body = (await res.json()) as { web?: { results?: { url: string }[] } };
  return (body.web?.results ?? []).map((r) => r.url).filter((u) => u.startsWith('https://'));
}

export const PAGES = 6; // public pages per job
export const PAGE_CHARS = 8_000; // of each page's text

export type Page = { url: string; text: string };

/** Public pages for a job: the brief's links and, with a search key, the results of the planned searches. */
export async function gather(task: string, queries: string[]): Promise<Page[]> {
  const found = await Promise.all(queries.map((q) => searchWeb(q).catch(() => [])));
  const urls = [...new Set([...linksIn(task), ...found.flat()])].slice(0, PAGES);
  const pages = await Promise.all(urls.map((url) => fetchPage(url).then((text) => ({ url, text: text.trim().slice(0, PAGE_CHARS) }), () => null)));
  return pages.filter((p): p is Page => p !== null && p.text !== '');
}
