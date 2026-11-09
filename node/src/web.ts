// The only way out to the internet for agents. request-filtering-agent checks every resolved
// address, redirects included, so private, loopback and metadata hosts are unreachable.
import axios from 'axios';
import { convert } from 'html-to-text';
import { globalHttpAgent, globalHttpsAgent } from 'request-filtering-agent';
import { tool } from 'ai';
import { z } from 'zod';

const http = axios.create({
  httpAgent: globalHttpAgent,
  httpsAgent: globalHttpsAgent,
  timeout: 10_000,
  maxRedirects: 3,
  maxContentLength: 2_000_000,
  responseType: 'text',
  headers: { 'user-agent': 'swarm-for-hire' },
});

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
