// Entry. A sponsor registers on chain, paying the audit fee, then uploads its sealed materials. Inside the
// TEE the runner opens them, scans every chunk, lets the protocol's model decide, and indexes the knowledge.
// Nobody, the operator included, sees the materials in the clear; after entry they are only ever read here.
import { createHash } from 'node:crypto';
import * as chain from './chain.ts';
import { log } from './config.ts';
import { chunk, index, type Library } from './library.ts';
import { scan, verdictOnMaterials } from './llm.ts';
import { Refused, unseal, type Materials } from './materials.ts';
import type { Agent } from './rules.ts';
import { dangers } from './safety.ts';
import * as store from './store.ts';

/** An admitted agent as the runner holds it: its materials and their index, in memory only. */
export type Expert = { m: Materials; lib: Library; digest: string };

const MB = 1024 * 1024;
const TRIES = 3; // audits that fail on our side before the agent is denied, so that it cannot cost us forever

let secret: Uint8Array;
export const useSeal = (s: Uint8Array) => (secret = s);

/** One registration of one sponsor: a new registration, even with the same materials, is audited anew. */
const cardOf = (a: Agent) => `${a.account}#${a.registration}`;
const experts = new Map<string, Expert>();
export const expertOf = (a: Agent) => experts.get(cardOf(a));

async function open(a: Agent) {
  const sealed = await store.upload(a.hash);
  if (!sealed) return null; // not uploaded yet
  if (sealed.length > a.size_mb * MB) throw new Refused(`larger than the registered ${a.size_mb} MB`);
  const m = unseal(sealed, secret, a.account);
  const docs = m.knowledge.flatMap((k) => chunk(`${k.name}\n\n${k.text}`));
  // Two accounts with the same materials are one expert: they never work on the same job.
  const digest = createHash('sha256').update(JSON.stringify(m)).digest('hex');
  return { m, docs, digest };
}

async function audit(m: Materials, skills: string, docs: string[]) {
  const all = [skills, m.expertise, m.method, ...docs]; // the public skills go into the router's prompt: scanned too
  const flags = [...all.flatMap((text, id) => dangers(text).map((reason) => ({ id, reason }))), ...(await scan(all))];
  return verdictOnMaterials({
    name: m.name,
    skills,
    model: m.model,
    expertise: m.expertise,
    method: m.method,
    knowledge: m.knowledge.map((k) => k.name),
    flags: flags.slice(0, 50).map((f) => ({ reason: f.reason, excerpt: all[f.id]?.slice(0, 600) ?? '' })),
  });
}

const failures = new Map<string, number>();
const verdicts = new Map<string, { allow: boolean; reason?: string }>(); // decided, maybe not yet on chain

/** Decides a Pending agent once its upload is here. The model's reason may quote the materials: never logged. */
export async function admit(a: Agent) {
  const card = cardOf(a);
  const v =
    verdicts.get(card) ??
    (await (async () => {
      const opened = await open(a);
      if (!opened) return null;
      const { allow } = await audit(opened.m, a.skills, opened.docs);
      if (allow) experts.set(card, { m: opened.m, digest: opened.digest, lib: await index(opened.docs) });
      return { allow };
    })().catch((e) => {
      if (e instanceof Refused) return { allow: false, reason: e.message }; // our own code's words
      const n = (failures.get(card) ?? 0) + 1;
      failures.set(card, n);
      if (n < TRIES) throw e; // NEAR AI trouble: try again next tick
      return { allow: false, reason: 'could not be audited' };
    }));
  if (!v) return;
  verdicts.set(card, v); // if the chain refuses now, only the review is retried, never the paid audit
  await chain.review(a.account, a.registration, v.allow);
  verdicts.delete(card);
  log('reviewed', { agent: a.account, ...v });
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
      if (!opened) return log('upload_missing', { agent: a.account });
      experts.set(key, { m: opened.m, digest: opened.digest, lib: await index(opened.docs) });
    })
    .catch((e) => log('load_failed', { agent: a.account, error: String(e) }))
    .finally(() => loading.delete(key));
}
