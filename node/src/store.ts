// The runner's disk: sealed uploads by their hash (still encrypted to the runner), and what each round of
// work decided, written before anything is sent, so a restart finishes the round instead of redoing it.
// In the TEE this directory is an encrypted volume.
import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cfg } from './config.ts';

const dir = (sub: string) => join(cfg.STORE_DIR, sub);
await Promise.all(['uploads', 'rounds'].map((d) => mkdir(dir(d), { recursive: true })));

/** An upload is written to a draft first and becomes `uploads/<hash>` only once its hash is checked. */
export const draft = () => join(dir('uploads'), `.part-${randomUUID()}`);
export const commit = (draft: string, hash: string) => rename(draft, join(dir('uploads'), hash));
export const discard = (draft: string) => rm(draft, { force: true });
export const upload = (hash: string) => readFile(join(dir('uploads'), hash)).catch(() => null);
export const has = (hash: string) => access(join(dir('uploads'), hash)).then(() => true, () => false);

const round = (key: string) => join(dir('rounds'), `${encodeURIComponent(key)}.json`);
export const remember = (key: string, decision: object) => writeFile(round(key), JSON.stringify(decision));
export const recall = async <T>(key: string): Promise<T | null> =>
  readFile(round(key), 'utf8').then((s) => JSON.parse(s) as T, () => null);
