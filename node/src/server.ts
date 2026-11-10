// The runner's public face. GET /attestation: what anyone checks before trusting it (scripts/verify.ts).
// GET /info: what the sealing page needs. POST /upload/<account>: sealed materials of a registered agent.
// GET /: the sealing page (node/ui); materials are sealed in the browser and leave it encrypted to this TEE.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage } from 'node:http';
import * as chain from './chain.ts';
import { allowedModels, cfg, log } from './config.ts';
import * as store from './store.ts';

const MB = 1024 * 1024;
const ACCOUNT = /^(?=.{2,64}$)([a-z\d]+[-_])*[a-z\d]+(\.([a-z\d]+[-_])*[a-z\d]+)*$/;
const ui = (file: string) => readFile(new URL(`../ui/${file}`, import.meta.url));

type Reply = [status: number, body: unknown, type?: string];

/** Takes the upload only for an agent that registered (and paid) with exactly these bytes, and still waits for review. */
async function upload(account: string, req: IncomingMessage): Promise<Reply> {
  const agent = ACCOUNT.test(account) ? await chain.agent(account) : null;
  if (agent?.status !== 'Pending') return [409, { error: 'no agent of this account waits for its materials: register first' }];
  const limit = agent.size_mb * MB;
  if (Number(req.headers['content-length'] ?? 0) > limit) return [413, { error: `larger than the registered ${agent.size_mb} MB` }];
  const parts: Buffer[] = [];
  let size = 0;
  for await (const part of req as AsyncIterable<Buffer>) {
    size += part.length;
    if (size > limit) return [413, { error: `larger than the registered ${agent.size_mb} MB` }];
    parts.push(part);
  }
  const sealed = Buffer.concat(parts);
  if (createHash('sha256').update(sealed).digest('hex') !== agent.hash) return [409, { error: 'these bytes are not the registered hash' }];
  await store.keep(agent.hash, sealed);
  log('uploaded', { agent: account, bytes: size });
  return [200, { ok: true, hash: agent.hash }];
}

async function info(sealKey: string): Promise<Reply> {
  const [token, c] = await Promise.all([chain.token(), chain.config()]);
  const fees = { audit_base: c.audit_base, audit_per_mb: c.audit_per_mb, min_deposit: c.min_deposit };
  return [200, { contract: cfg.CONTRACT, token, network: cfg.CONTRACT.endsWith('.testnet') ? 'testnet' : 'mainnet', sealKey, models: allowedModels, fees }];
}

async function route(req: IncomingMessage, attestation: { sealKey: string }): Promise<Reply> {
  const { pathname } = new URL(req.url ?? '/', 'http://runner');
  const up = /^\/upload\/([^/]+)$/.exec(pathname);
  if (req.method === 'POST' && up) return upload(decodeURIComponent(up[1]!), req);
  if (req.method !== 'GET') return [405, { error: 'method not allowed' }];
  if (pathname === '/attestation') return [200, attestation];
  if (pathname === '/info') return info(attestation.sealKey);
  if (pathname === '/') return [200, await ui('index.html'), 'text/html; charset=utf-8'];
  if (pathname === '/app.js' || pathname === '/seal.js') return [200, await ui(pathname.slice(1)), 'text/javascript; charset=utf-8'];
  return [404, { error: 'not found' }];
}

const HEADERS = {
  'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

export function listen(attestation: { sealKey: string }) {
  const server = createServer((req, res) => {
    route(req, attestation)
      .catch((e): Reply => (log('http_error', { path: req.url, error: String(e) }), [500, { error: 'internal error' }]))
      .then(([status, body, type = 'application/json']) => {
        res.writeHead(status, { ...HEADERS, 'content-type': type, ...(status >= 400 ? { connection: 'close' } : {}) });
        res.end(Buffer.isBuffer(body) ? body : JSON.stringify(body));
      });
  });
  server.requestTimeout = 120_000;
  return new Promise<typeof server>((ok) => server.listen(cfg.PORT, () => ok(server)));
}
