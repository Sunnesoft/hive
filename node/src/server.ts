// The runner's public face. GET /attestation: what anyone checks before trusting it (scripts/verify.ts).
// GET /info: what the sealing page needs. POST /upload/<account>: sealed materials of a registered agent.
// GET /: the sealing page (node/ui); materials are sealed in the browser and leave it encrypted to this TEE.
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage } from 'node:http';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as chain from './chain.ts';
import { allowedModels, cfg, log } from './config.ts';
import * as store from './store.ts';

const MB = 1024 * 1024;
const UPLOADS = 8; // at a time, one per account: each is streamed to disk, so memory stays flat
const ACCOUNT = /^(?=.{2,64}$)([a-z\d]+[-_])*[a-z\d]+(\.([a-z\d]+[-_])*[a-z\d]+)*$/;
const ui = (file: string) => readFile(new URL(`../ui/${file}`, import.meta.url));

type Reply = [status: number, body: unknown, type?: string];

const uploading = new Set<string>();

/** Takes the upload only for an agent that registered (and paid) with exactly these bytes, and still waits for review. */
async function upload(account: string, req: IncomingMessage): Promise<Reply> {
  const agent = ACCOUNT.test(account) ? await chain.recent(account) : null;
  if (agent?.status !== 'Pending') return [409, { error: 'no agent of this account waits for its materials: register first, or retry in a minute' }];
  if (await store.has(agent.hash)) return [200, { ok: true, hash: agent.hash }]; // these bytes are here already
  const limit = agent.size_mb * MB;
  const tooBig: Reply = [413, { error: `larger than the registered ${agent.size_mb} MB` }];
  if (Number(req.headers['content-length'] ?? 0) > limit) return tooBig;
  if (uploading.size >= UPLOADS || uploading.has(account)) return [429, { error: 'busy: try again in a minute' }];
  uploading.add(account);
  const draft = store.draft();
  try {
    const digest = createHash('sha256');
    let size = 0;
    const meter = new Transform({
      transform(part: Buffer, _, next) {
        size += part.length;
        if (size > limit) return next(new Error('too big'));
        digest.update(part);
        next(null, part);
      },
    });
    const done = await pipeline(req, meter, createWriteStream(draft)).then(() => true, () => false);
    if (size > limit) return tooBig;
    if (!done) return [400, { error: 'the upload broke off' }];
    if (digest.digest('hex') !== agent.hash) return [409, { error: 'these bytes are not the registered hash' }];
    await store.commit(draft, agent.hash);
    log('uploaded', { agent: account, bytes: size });
    return [200, { ok: true, hash: agent.hash }];
  } finally {
    uploading.delete(account);
    await store.discard(draft);
  }
}

let cached: { at: number; reply: Promise<Reply> } | undefined;
/** Contract, token, models and fees. Cached for a minute: a busy page must not become load on the RPC. */
function info(sealKey: string): Promise<Reply> {
  if (cached && Date.now() - cached.at < 60_000) return cached.reply;
  const network = cfg.CONTRACT.endsWith('.near') ? 'mainnet' : cfg.CONTRACT.endsWith('.testnet') ? 'testnet' : 'local';
  const reply = Promise.all([chain.token(), chain.config()]).then(([token, c]): Reply => {
    const fees = { audit_base: c.audit_base, audit_per_mb: c.audit_per_mb, min_deposit: c.min_deposit };
    return [200, { contract: cfg.CONTRACT, token, network, sealKey, models: allowedModels, fees }];
  });
  cached = { at: Date.now(), reply };
  reply.catch(() => (cached = undefined));
  return reply;
}

async function route(req: IncomingMessage, attestation: { sealKey: string }): Promise<Reply> {
  const path = (req.url ?? '').split('?')[0]!;
  if (!path.startsWith('/') || path.startsWith('//')) return [400, { error: 'bad path' }];
  const up = /^\/upload\/([^/]+)$/.exec(path); // an account needs no escaping: anything escaped is refused
  if (req.method === 'POST' && up) return upload(up[1]!, req);
  if (req.method !== 'GET') return [405, { error: 'method not allowed' }];
  if (path === '/attestation') return [200, attestation];
  if (path === '/info') return info(attestation.sealKey);
  if (path === '/') return [200, await ui('index.html'), 'text/html; charset=utf-8'];
  if (path === '/app.js' || path === '/seal.js') return [200, await ui(path.slice(1)), 'text/javascript; charset=utf-8'];
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
  server.requestTimeout = 300_000; // a 10 MB upload on a slow line
  return new Promise<typeof server>((ok) => server.listen(cfg.PORT, () => ok(server)));
}
