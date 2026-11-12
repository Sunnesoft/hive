// Entry. A sponsor registers on chain, paying the audit fee, then uploads its sealed materials. Inside the
// TEE the runner opens them, audits them (audit.ts) and indexes the knowledge. Nobody, the operator included,
// sees the materials in the clear; the audit's findings go only to the sponsor's cabinet, never to the logs.
import { createHash } from 'node:crypto';
import { docsOf, linksOf, audit, type Flag } from './audit.ts';
import * as chain from './chain.ts';
import { log } from './log.ts';
import { index, type Library } from './library.ts';
import { Refused, unseal, type Materials } from './materials.ts';
import type { Agent } from './rules.ts';
import * as store from './store.ts';

/** An admitted agent as the runner holds it, in memory only: its materials, their index and the links in them. */
export type Expert = { m: Materials; lib: Library; digest: string; links: Set<string> };
/** What the sponsor's cabinet shows about one registration, its name and model included (the sponsor's own data). */
export type AuditRecord = { registration: number; allow: boolean; category: string; reason: string; flags: Flag[]; name?: string; model?: string; pass_model?: string; work?: Materials['work']; examples?: string[]; topics?: string[] };

const MB = 1024 * 1024;
const TRIES = 3; // audits that fail on our side before the agent is denied, so that it cannot cost us forever

let secret: Uint8Array;
export const useSeal = (s: Uint8Array) => (secret = s);

/** One registration of one sponsor: a new registration, even with the same materials, is audited anew. */
const cardOf = (a: Agent) => `${a.id}#${a.registration}`;
const experts = new Map<string, Expert>();
export const expertOf = (a: Agent) => experts.get(cardOf(a));

async function open(a: Agent) {
  const sealed = await store.upload(a.materials_hash);
  if (!sealed) return null; // not uploaded yet
  if (sealed.length > a.size_mb * MB) throw new Refused(`larger than the registered ${a.size_mb} MB`);
  const m = unseal(sealed, secret, a.id); // sealed for this very agent: a copy registered as any other does not open
  // Two accounts with the same materials are one expert: they never work on the same job.
  const digest = createHash('sha256').update(JSON.stringify(m)).digest('hex');
  return { m, docs: docsOf(m), digest };
}

const expert = async (o: NonNullable<Awaited<ReturnType<typeof open>>>): Promise<Expert> =>
  ({ m: o.m, digest: o.digest, links: linksOf(o.m), lib: await index(o.docs) });

const failures = new Map<string, number>();
const decided = new Map<string, AuditRecord>(); // decided, maybe not yet on chain

/** Decides a Pending agent once its upload is here. */
export async function admit(a: Agent) {
  const card = cardOf(a);
  const record: AuditRecord | null =
    decided.get(card) ??
    (await (async () => {
      const opened = await open(a);
      if (!opened) return null;
      const v = await audit(opened.m, a.skills, opened.docs);
      if (v.allow) experts.set(card, await expert(opened));
      return { registration: a.registration, allow: v.allow, category: v.category, reason: v.reason, flags: v.flags, name: opened.m.name, model: opened.m.model, ...(opened.m.pass_model ? { pass_model: opened.m.pass_model } : {}), work: opened.m.work, examples: opened.m.examples, topics: opened.m.topics };
    })().catch((e) => {
      if (e instanceof Refused) return { registration: a.registration, allow: false, category: 'refused', reason: e.message, flags: [] };
      const n = (failures.get(card) ?? 0) + 1;
      failures.set(card, n);
      if (n < TRIES) throw e; // NEAR AI trouble: try again next tick
      return { registration: a.registration, allow: false, category: 'not_audited', reason: 'the audit kept failing on our side; register again later', flags: [] };
    }));
  if (!record) return;
  decided.set(card, record); // if the chain refuses now, only the review is retried, never the paid audit
  await store.keepAudit(a.id, record);
  await chain.review(a.id, a.registration, record.allow);
  decided.delete(card);
  log('reviewed', { agent: a.id, allow: record.allow, category: record.category });
}

/** After a restart: opens and indexes Active agents again, one at a time, in the background. */
let queue: Promise<unknown> = Promise.resolve();
const loading = new Set<string>();
export function warm(a: Agent) {
  const key = cardOf(a);
  if (a.status !== 'Active' || experts.has(key) || loading.has(key)) return;
  loading.add(key);
  queue = queue
    .then(async () => {
      const opened = await open(a);
      if (!opened) return log('upload_missing', { agent: a.id });
      experts.set(key, await expert(opened));
    })
    .catch((e) => log('load_failed', { agent: a.id, error: String(e) }))
    .finally(() => loading.delete(key));
}
