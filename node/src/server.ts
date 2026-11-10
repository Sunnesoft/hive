// The runner's public face. GET /attestation: what anyone checks before trusting it (scripts/verify.ts).
// GET /info: what the pages need. POST /upload/<owner>/<name>: sealed materials of a registered agent.
// POST /cabinet: a sponsor's own agents, after signing in with a wallet. GET /demand: tasks by topic.
// GET /agents: the public catalog, active experts with their record.
// Pages (node/ui): / for everyone, /experts for customers, /app for sponsors (wallet, sealing, dashboard).
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage } from 'node:http';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as chain from './chain.ts';
import { allowedModels, cfg, log } from './config.ts';
import { CHUNK, NEAREST } from './library.ts';
import { priceOf } from './llm.ts';
import { policy } from './policies.ts';
import { PLANS } from './plans.ts';
import { MAX_OUT } from './rules.ts';
import { WORST_PUBLIC } from './round.ts';
import * as store from './store.ts';
import { SignedIn, signer } from './wallet.ts';

const MB = 1024 * 1024;
const UPLOADS = 8; // at a time, one per agent: each is streamed to disk, so memory stays flat
const ACCOUNT = /^(?=.{2,64}$)([a-z\d]+[-_])*[a-z\d]+(\.([a-z\d]+[-_])*[a-z\d]+)*$/;
const NAME = /^[a-z0-9-]{1,32}$/;
const ui = (file: string) => readFile(new URL(`../ui/${file}`, import.meta.url));

type Reply = [status: number, body: unknown, type?: string, csp?: string, cache?: boolean, headers?: Record<string, string>];

const uploading = new Set<string>();

/** Takes the upload only for an agent that registered (and paid) with exactly these bytes, and still waits for review. */
async function upload(owner: string, name: string, req: IncomingMessage): Promise<Reply> {
  const id = `${owner}/${name}`;
  const agent = ACCOUNT.test(owner) && NAME.test(name) ? await chain.recent(id) : null;
  if (agent?.status !== 'Pending') return [409, { error: 'this agent does not wait for its materials: register it first, or retry in a minute' }];
  if (await store.has(agent.hash)) return [200, { ok: true, hash: agent.hash }]; // these bytes are here already
  const limit = agent.size_mb * MB;
  const tooBig: Reply = [413, { error: `larger than the registered ${agent.size_mb} MB` }];
  if (Number(req.headers['content-length'] ?? 0) > limit) return tooBig;
  if (uploading.size >= UPLOADS || uploading.has(id)) return [429, { error: 'busy: try again in a minute' }];
  uploading.add(id);
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
    log('uploaded', { agent: id, bytes: size });
    return [200, { ok: true, hash: agent.hash }];
  } finally {
    uploading.delete(id);
    await store.discard(draft);
  }
}

let catalog: { at: number; reply: Promise<Reply> } | undefined;
/** Active experts as customers see them: the public card and the record, never a task. Cached for a minute. */
function agents(): Promise<Reply> {
  if (catalog && Date.now() - catalog.at < 60_000) return catalog.reply;
  const reply = Promise.all(chain.listed().filter((a) => a.status === 'Active').map(async (a) => {
    const picked = (await store.historyOf(a.id)).filter((r) => r.picked);
    const delivered = picked.filter((r) => r.delivered);
    const earned = delivered.reduce((s, r) => s + BigInt(r.pay), 0n);
    return { id: a.id, owner: a.owner, skills: a.skills, rate: a.rate, picked: picked.length, delivered: delivered.length, earned: `${earned}`, last: picked.at(-1)?.at ?? null };
  })).then((list): Reply => [200, list.sort((x, y) => y.delivered - x.delivered)]);
  catalog = { at: Date.now(), reply };
  return reply;
}

let cached: { at: number; reply: Promise<Reply> } | undefined;
/** Contract, token, models and fees. Cached for a minute: a busy page must not become load on the RPC. */
function info(sealKey: string): Promise<Reply> {
  if (cached && Date.now() - cached.at < 60_000) return cached.reply;
  const network = cfg.CONTRACT.endsWith('.near') ? 'mainnet' : cfg.CONTRACT.endsWith('.testnet') ? 'testnet' : 'local';
  const reply = Promise.all([chain.token(), chain.config()]).then(([token, c]): Reply => {
    const fees = { audit_base: c.audit_base, audit_per_mb: c.audit_per_mb, min_deposit: c.min_deposit, fee_bps: c.fee_bps };
    const models = allowedModels.map((id) => ({ id, ...priceOf(id) })); // USD per 1M tokens, live from NEAR AI
    // What the runner adds around an expert's own text, for the page to show the worst cost of one call.
    const limits = { template_bytes: Buffer.byteLength(policy.agent), knowledge_bytes: NEAREST * CHUNK, public_bytes: WORST_PUBLIC, max_out: MAX_OUT };
    const agents = chain.listed();
    const stats = { active: agents.filter((a) => a.status === 'Active').length, pending: agents.filter((a) => a.status === 'Pending').length };
    // How a price is made, so the site can quote a team the way the runner bids: rates + overhead, then both fees.
    const pricing = { market_fee_bps: 500, overhead: cfg.OVERHEAD_USD, per_agent: cfg.OVERHEAD_PER_AGENT_USD, reworks: cfg.MAX_REWORKS, listing: cfg.MARKET_LISTING_URL ?? null, plans: PLANS };
    return [200, { contract: cfg.CONTRACT, token, network, sealKey, models, fees, limits, stats, pricing }];
  });
  cached = { at: Date.now(), reply };
  reply.catch(() => (cached = undefined));
  return reply;
}

/** Everything the runner knows about the signed-in sponsor's agents. Never a question, a task or an answer. */
async function cabinet(req: IncomingMessage): Promise<Reply> {
  let body = '';
  for await (const part of req as AsyncIterable<Buffer>) if ((body += part).length > 4_000) return [413, { error: 'too long' }];
  const signed = SignedIn.safeParse((() => { try { return JSON.parse(body); } catch { return null; } })());
  const account = signed.success ? await signer(signed.data) : null;
  if (!account) return [401, { error: 'sign in with your wallet again' }];
  const [owned, balance] = await Promise.all([chain.ownedBy(account), chain.balance(account)]);
  const agents = await Promise.all(owned.map(async (a) => {
    const [audit, rounds] = await Promise.all([store.auditOf(a.id), store.historyOf(a.id)]);
    return { ...a, audit: audit?.registration === a.registration ? audit : null, rounds };
  }));
  return [200, { account, balance, agents }];
}

async function route(req: IncomingMessage, attestation: { sealKey: string }): Promise<Reply> {
  const path = (req.url ?? '').split('?')[0]!;
  if (!path.startsWith('/') || path.startsWith('//')) return [400, { error: 'bad path' }];
  const up = /^\/upload\/([^/]+)\/([^/]+)$/.exec(path); // an account and a name need no escaping: anything escaped is refused
  if (req.method === 'POST' && up) return upload(up[1]!, up[2]!, req);
  if (req.method === 'POST' && path === '/cabinet') return cabinet(req);
  if (req.method !== 'GET') return [405, { error: 'method not allowed' }];
  if (path === '/health') return [200, { ok: true, state }];
  if (path === '/attestation') return [200, attestation];
  if (path === '/info') return info(attestation.sealKey);
  if (path === '/demand') return [200, await store.demandNow()];
  if (path === '/agents') return agents();
  if (['/join', '/cabinet', '/cabinet.html'].includes(path)) return [302, '', 'text/plain', STRICT_CSP, false, { location: '/app' }]; // the old pages
  const page = PAGES[path];
  if (page) return [200, await ui(page.file), 'text/html; charset=utf-8', page.csp];
  if (ASSETS[path]) return [200, await ui(path.slice(1)), ASSETS[path], STRICT_CSP, true];
  const font = /^\/fonts\/(ibm-plex-(sans|mono)-(latin|cyrillic)-[456]00-normal\.woff2)$/.exec(path);
  if (font) return [200, await readFile(new URL(`../../node_modules/@fontsource/ibm-plex-${font[2]}/files/${font[1]}`, import.meta.url)), 'font/woff2', STRICT_CSP, true];
  return [404, { error: 'not found' }];
}

// The overview and the join page run nothing but our files and talk to nothing but the runner: the join page sees materials.
const STRICT_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'";
// The cabinet never sees materials. Wallets run there in sandboxed iframes, their code fetched from their own hosts.
const WALLET_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' https:; connect-src 'self' https: wss:; frame-src 'self' https:; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'";
const PAGES: Record<string, { file: string; csp: string }> = {
  '/': { file: 'index.html', csp: STRICT_CSP },
  '/experts': { file: 'experts.html', csp: STRICT_CSP },
  '/app': { file: 'app.html', csp: WALLET_CSP }, // seals in the browser too: wallets run in sandboxes with no access to the page
};
const JS = 'text/javascript; charset=utf-8';
const ASSETS: Record<string, string> = {
  '/ui.css': 'text/css; charset=utf-8', '/favicon.svg': 'image/svg+xml', '/ui.js': JS, '/home.js': JS, '/experts.js': JS, '/app.js': JS, '/seal.js': JS,
  '/vendor/near-connect.js': JS, // npm run ui
};
const HEADERS = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()' };

/** What the runner is doing, for GET /health and the container's health check. */
let state: 'starting' | 'waiting_for_key' | 'ready' | 'paused' = 'starting';
export const setState = (s: typeof state) => (state = s);

export function listen(attestation: { sealKey: string }) {
  const server = createServer((req, res) => {
    route(req, attestation)
      .catch((e): Reply => (log('http_error', { path: req.url, error: String(e) }), [500, { error: 'internal error' }]))
      .then(([status, body, type = 'application/json', csp = STRICT_CSP, cache = false, extra = {}]) => {
        const caching = { 'cache-control': cache ? 'public, max-age=300' : 'no-store' };
        res.writeHead(status, { ...HEADERS, ...caching, ...extra, 'content-security-policy': csp, 'content-type': type, ...(status >= 400 ? { connection: 'close' } : {}) });
        res.end(Buffer.isBuffer(body) ? body : JSON.stringify(body));
      });
  });
  server.requestTimeout = 300_000; // a 10 MB upload on a slow line
  return new Promise<typeof server>((ok) => server.listen(cfg.PORT, () => ok(server)));
}
