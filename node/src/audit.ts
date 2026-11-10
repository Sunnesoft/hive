// The audit of a sponsor's materials, as the runner does it at entry and as `scripts/try.ts --audit` shows it.
// Code checks every chunk for dangerous patterns, a cheap model scans every chunk, the protocol's model decides.
import { chunk } from './library.ts';
import { scan, verdictOnMaterials } from './llm.ts';
import type { Materials } from './materials.ts';
import { dangers } from './safety.ts';

/** The knowledge as the agent searches it: each file cut into chunks under its name. */
export const docsOf = (m: Materials) => m.knowledge.flatMap((k) => chunk(`${k.name}\n\n${k.text}`));

/** Addresses in the materials: they existed before any task, so they cannot carry one. Answers may link to them. */
export const linksOf = (m: Materials) =>
  new Set([m.expertise, m.method, ...m.knowledge.map((k) => k.text)].flatMap((t) => t.match(/https:\/\/[^\s)<>"'\]]+/g) ?? []).map((u) => u.replace(/[.,;:!?]+$/, '')).slice(0, 10_000));

export type Flag = { reason: string; excerpt: string };

export async function audit(m: Materials, skills: string, docs: string[]) {
  const all = [skills, ...m.examples, m.expertise, m.method, ...docs]; // the public profile goes into the router's prompt: scanned too
  const found = [...all.flatMap((text, id) => dangers(text).map((reason) => ({ id, reason }))), ...(await scan(all))];
  const flags: Flag[] = found.slice(0, 50).map((f) => ({ reason: f.reason, excerpt: all[f.id]?.slice(0, 600) ?? '' }));
  const verdict = await verdictOnMaterials({ name: m.name, skills, examples: m.examples, topics: m.topics, model: m.model, expertise: m.expertise, method: m.method, knowledge: m.knowledge.map((k) => k.name), flags });
  return { ...verdict, flags };
}
