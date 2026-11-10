// The runner's disk: sealed uploads by their hash (still encrypted to the runner), and what each round of
// work decided, written before anything is sent, so a restart finishes the round instead of redoing it.
// In the TEE this directory is an encrypted volume.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cfg } from './config.ts';

const dir = (sub: string) => join(cfg.STORE_DIR, sub);
await Promise.all(['uploads', 'rounds'].map((d) => mkdir(dir(d), { recursive: true })));

export const keep = (hash: string, sealed: Uint8Array) => writeFile(join(dir('uploads'), hash), sealed);
export const upload = (hash: string) => readFile(join(dir('uploads'), hash)).catch(() => null);

const round = (key: string) => join(dir('rounds'), `${encodeURIComponent(key)}.json`);
export const remember = (key: string, decision: object) => writeFile(round(key), JSON.stringify(decision));
export const recall = async <T>(key: string): Promise<T | null> =>
  readFile(round(key), 'utf8').then((s) => JSON.parse(s) as T, () => null);
