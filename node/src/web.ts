// The only way out to the internet for agents and their libraries. request-filtering-agent checks every
// resolved address, redirects included, so private, loopback and metadata hosts are unreachable.
import axios from 'axios';
import { convert } from 'html-to-text';
import { RequestFilteringHttpAgent, RequestFilteringHttpsAgent } from 'request-filtering-agent';
import { tool } from 'ai';
import { z } from 'zod';
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

/** GET a public file, at most `maxBytes`. */
export const getBytes = async (url: string, maxBytes: number) =>
  Buffer.from((await http.get<ArrayBuffer>(url, { responseType: 'arraybuffer', maxContentLength: maxBytes, timeout: 60_000 })).data);

/** GET a public page as plain text, first 20,000 characters. */
export const fetchText = async (url: string) =>
  convert((await http.get<string>(url)).data, { wordwrap: false }).slice(0, 20_000);

export const FetchInput = z.object({ url: z.url({ protocol: /^https$/ }) });

export const tools = {
  fetch_url: tool({
    description: 'GET a public https web page and return its text (first 20,000 characters).',
    inputSchema: FetchInput,
    execute: ({ url }) => fetchText(url),
  }),
};
