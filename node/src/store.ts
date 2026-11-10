// The runner's disk: sealed uploads by their hash (still encrypted to the runner), and what each round of
// work decided, written before anything is sent, so a restart finishes the round instead of redoing it.
// In the TEE this directory is an encrypted volume.
import { randomUUID } from 'node:crypto';
import { access, appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cfg } from './config.ts';

const dir = (sub: string) => join(cfg.STORE_DIR, sub);
await Promise.all(['uploads', 'rounds', 'agents'].map((d) => mkdir(dir(d), { recursive: true })));

/** An upload is written to a draft first and becomes `uploads/<hash>` only once its hash is checked. */
export const draft = () => join(dir('uploads'), `.part-${randomUUID()}`);
export const commit = (draft: string, hash: string) => rename(draft, join(dir('uploads'), hash));
export const discard = (draft: string) => rm(draft, { force: true });
export const upload = (hash: string) => readFile(join(dir('uploads'), hash)).catch(() => null);
export const has = (hash: string) => access(join(dir('uploads'), hash)).then(() => true, () => false);

/** What the sponsor's cabinet shows: the audit of each registration, and a line for each round the agent was considered for. */
const agentFile = (account: string, kind: string) => join(dir('agents'), `${encodeURIComponent(account)}.${kind}`);
export const keepAudit = (account: string, record: object) => writeFile(agentFile(account, 'audit.json'), JSON.stringify(record));
export const auditOf = (account: string) => readFile(agentFile(account, 'audit.json'), 'utf8').then((s) => JSON.parse(s), () => null);
export const note = (account: string, line: object) => appendFile(agentFile(account, 'rounds.jsonl'), `${JSON.stringify(line)}\n`);
export const historyOf = async (account: string, last = 200) => {
  const text = await readFile(agentFile(account, 'rounds.jsonl'), 'utf8').catch(() => '');
  return text.split('\n').filter(Boolean).slice(-last).map((l) => JSON.parse(l));
};

/** Demand by topic, over all tasks: public, so sponsors see what knowledge the swarm lacks. */
const demandFile = () => join(dir('agents'), 'demand.json');
let demand: Record<string, Record<string, number>> | undefined;
export async function count(topic: string, outcome: 'served' | 'no_expert' | 'over_budget' | 'refused') {
  demand ??= await readFile(demandFile(), 'utf8').then((s) => JSON.parse(s), () => ({}));
  const t = (demand![topic] ??= {});
  t[outcome] = (t[outcome] ?? 0) + 1;
  await writeFile(demandFile(), JSON.stringify(demand));
}
export const demandNow = async () => (demand ??= await readFile(demandFile(), 'utf8').then((s) => JSON.parse(s), () => ({})));

const round = (key: string) => join(dir('rounds'), `${encodeURIComponent(key)}.json`);
export const remember = (key: string, decision: object) => writeFile(round(key), JSON.stringify(decision));
export const recall = async <T>(key: string): Promise<T | null> =>
  readFile(round(key), 'utf8').then((s) => JSON.parse(s) as T, () => null);
