// The runner's disk: sealed uploads by their hash (still encrypted to the runner), and what each round of
// work decided, written before anything is sent, so a restart finishes the round instead of redoing it.
// In the TEE this directory is an encrypted volume.
import { randomUUID } from 'node:crypto';
import { access, appendFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cfg } from './config.ts';

const dir = (sub: string) => join(cfg.STORE_DIR, sub);
await Promise.all(['uploads', 'rounds', 'agents', 'orders'].map((d) => mkdir(dir(d), { recursive: true })));

/** An upload is written to a draft first and becomes `uploads/<hash>` only once its hash is checked. */
export const draft = () => join(dir('uploads'), `.part-${randomUUID()}`);
export const commit = (draft: string, hash: string) => rename(draft, join(dir('uploads'), hash));
export const discard = (draft: string) => rm(draft, { force: true });
export const upload = (hash: string) => readFile(join(dir('uploads'), hash)).catch(() => null);
export const has = (hash: string) => access(join(dir('uploads'), hash)).then(() => true, () => false);

/** What the sponsor's cabinet shows: the audit of each registration, and a line for each round the agent was considered for. */
const agentFile = (agent: string, kind: string) => join(dir('agents'), `${encodeURIComponent(agent)}.${kind}`);
export const keepAudit = (agent: string, record: object) => writeFile(agentFile(agent, 'audit.json'), JSON.stringify(record));
export const auditOf = (agent: string) => readFile(agentFile(agent, 'audit.json'), 'utf8').then((s) => JSON.parse(s), () => null);
export const note = (agent: string, line: object) => appendFile(agentFile(agent, 'rounds.jsonl'), `${JSON.stringify(line)}\n`);
export const historyOf = async (agent: string, last = 500) => {
  const text = await readFile(agentFile(agent, 'rounds.jsonl'), 'utf8').catch(() => '');
  const rounds = new Map<string, Record<string, any>>(); // a later line about the same round adds to it: a rework asked for after it
  for (const l of text.split('\n').filter(Boolean)) {
    const line = JSON.parse(l);
    rounds.set(line.job, { ...rounds.get(line.job), ...line });
  }
  return [...rounds.values()].slice(-last);
};

/** Demand by topic, over all tasks: public, so sponsors see what knowledge the swarm lacks. */
const demandFile = () => join(dir('agents'), 'demand.json');
// Loaded once, as a promise, so tasks that count at the same moment share one object; writes go one after another.
let demand: Promise<Record<string, Record<string, number>>> | undefined;
let saved = Promise.resolve();
export const demandNow = () => (demand ??= readFile(demandFile(), 'utf8').then((s) => JSON.parse(s), () => ({})));
export async function count(topic: string, outcome: 'served' | 'no_expert' | 'over_budget' | 'refused') {
  const d = await demandNow();
  const t = (d[topic] ??= {});
  t[outcome] = (t[outcome] ?? 0) + 1;
  await (saved = saved.catch(() => {}).then(() => writeFile(demandFile(), JSON.stringify(d))));
}

const round = (key: string) => join(dir('rounds'), `${encodeURIComponent(key)}.json`);
export const remember = (key: string, decision: object) => writeFile(round(key), JSON.stringify(decision));
export const recall = async <T>(key: string): Promise<T | null> =>
  readFile(round(key), 'utf8').then((s) => JSON.parse(s) as T, () => null);

/** Orders placed in the contract, once the swarm answered or declined: what the customer reads. Listed by customer. */
const orderFile = (id: string) => join(dir('orders'), `${encodeURIComponent(id)}.json`);
const ordersBy = (customer: string) => join(dir('orders'), `by-${encodeURIComponent(customer)}.jsonl`);
export const orderOf = <T>(id: string) => readFile(orderFile(id), 'utf8').then((s) => JSON.parse(s) as T, () => null);
export async function keepOrder<T extends { id: string; customer: string }>(record: T) {
  const isNew = !(await orderOf(record.id));
  await writeFile(orderFile(record.id), JSON.stringify(record));
  if (isNew) await appendFile(ordersBy(record.customer), `${record.id}\n`);
}
export const ordersOf = async (customer: string, last = 50) =>
  (await readFile(ordersBy(customer), 'utf8').catch(() => '')).split('\n').filter(Boolean).slice(-last);

/** Descriptions of orders, by the hash the order names them with, from the moment the customer hands one over
 *  until its order is settled. The contract holds only the hash. */
const briefFile = (hash: string) => join(dir('orders'), `brief-${hash}.json`);
export const keepBrief = (hash: string, brief: object) => writeFile(briefFile(hash), JSON.stringify(brief));
export const briefOf = <T>(hash: string) => readFile(briefFile(hash), 'utf8').then((s) => JSON.parse(s) as T, () => null);
export const dropBrief = (hash: string) => rm(briefFile(hash), { force: true });
export async function sweepBriefs(keep: Set<string>, olderMs: number) {
  for (const name of await readdir(dir('orders'))) {
    const hash = /^brief-([0-9a-f]{64})\.json$/.exec(name)?.[1];
    if (!hash || keep.has(hash)) continue;
    const file = join(dir('orders'), name);
    if (Date.now() - (await stat(file)).mtimeMs > olderMs) await rm(file, { force: true });
  }
}

/** What the runner itself spent at NEAR AI, by UTC day, in millionths of a dollar: the daily limit is checked against it. */
const spendFile = () => join(cfg.STORE_DIR, 'spend.json');
let spend: Promise<Record<string, number>> | undefined;
let spendSaved = Promise.resolve();
export const spendNow = () => (spend ??= readFile(spendFile(), 'utf8').then((s) => JSON.parse(s), () => ({})));
export async function spent(day: string, units: bigint) {
  const s = await spendNow();
  s[day] = (s[day] ?? 0) + Number(units);
  await (spendSaved = spendSaved.catch(() => {}).then(() => writeFile(spendFile(), JSON.stringify(s))));
}
