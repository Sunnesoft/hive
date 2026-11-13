// Where each finding of the audit that a swarm stated came from: an expert's own reading, with no knowledge read,
// or a pass over one file of its knowledge. Read from the journal of calls: the item a reader matched to a reference
// finding -> the check that confirmed it -> the wordings that check was given -> the reading or pass that wrote them.
// This is how "do the skills add anything" is answered, skill by skill.
//   TRACE_DIR=eval/out/trace node --experimental-strip-types eval/origin.ts <task id> <tag> [<since, ISO time>] [<team, commas>]
import { readdirSync, readFileSync } from 'node:fs';
import { alike, findingsIn } from '../node/src/rules.ts';
import { REVIEWS } from './review-tasks.ts';

const [id, tag, since = '', teamArg] = process.argv.slice(2) as [string, string, string?, string?];
const t = REVIEWS.find((x) => x.id === id)!;
const team = teamArg ? teamArg.split(',') : t.experts;
const DIR = process.env.TRACE_DIR ?? 'eval/out/trace';
type Call = { t: string; step: string; got: unknown; sent: { agent?: string; system?: string; prompt?: string } };
const calls: Call[] = readdirSync(DIR).sort().flatMap((f) => readFileSync(`${DIR}/${f}`, 'utf8').split('\n'))
  .filter((l) => l.includes('"event":"llm"') && l.includes(t.files[0]!)).map((l) => JSON.parse(l)).filter((c) => c.t >= since && c.got);
const text = (c: Call) => (typeof c.got === 'string' ? c.got : JSON.stringify(c.got));
const fileOf = (c: Call) => /<knowledge>\s*\n?(\S+)/.exec(c.sent.system ?? '')?.[1] ?? 'knowledge';

// The swarm's answer as it was kept, with the marks of who confirmed each item; and what the readers matched.
const swarm = `review ${tag}: the swarm`;
const kept: Record<string, { text: string }> = JSON.parse(readFileSync('eval/out/reviews.json', 'utf8'))[id];
const entries = new Map([...kept[swarm]!.text.matchAll(/^### (\d+)\. \w+: (.*?)((?: \[\[\d+\]\])*)$/gm)].map((m) => [Number(m[1]), { title: m[2]!, by: [...m[3]!.matchAll(/\[\[(\d+)\]\]/g)].map((x) => Number(x[1])) }]));
const names: Record<string, string> = JSON.parse(readFileSync(`eval/out/readings/${id}.map.json`, 'utf8'));
const name = Object.entries(names).find(([, s]) => s === swarm)![0];
const matched = new Map<number, Set<number>>(); // reference finding -> the items that state it
for (const f of readdirSync('eval/out/readings').filter((x) => x.startsWith(`${id}.`) && x.endsWith('.txt'))) {
  const block = readFileSync(`eval/out/readings/${f}`, 'utf8').split(/^## +/m).find((b) => b.startsWith(name)) ?? '';
  for (const m of (/^\s*items:\s*(.*)$/m.exec(block)?.[1] ?? '').matchAll(/(\d+):[CHMLI]:M(\d+)/g)) matched.set(Number(m[2]), (matched.get(Number(m[2])) ?? new Set()).add(Number(m[1])));
}

/** Everything an expert's reading, its passes and its look at the findings together wrote down, with where from. */
const raisedBy = new Map(team.map((expert) => [expert, calls.filter((c) => c.sent.agent === expert && ['read', 'pass', 'combine'].includes(c.step))
  .flatMap((c) => findingsIn(text(c)).map((f) => ({ f, from: c.step === 'read' ? 'own reading' : c.step === 'combine' ? 'findings looked at together' : `pass: ${fileOf(c)}` })))] as const));
const bodies = new Map(kept[swarm]!.text.split(/\n(?=### \d+\. )/).map((b) => [Number(/^### (\d+)\. /.exec(b)?.[1] ?? -1), b.replace(/\*\*Proof\*\*[\s\S]*/, '').slice(0, 900)] as const));

/** Where what an item says was first written by one expert: the records of that expert that say the same, by the
 *  words they share with the item's title or with its text. */
function originsOf(expert: string, n: number, title: string): string[] {
  const body = bodies.get(n) ?? title;
  const close = (raisedBy.get(expert) ?? []).map((r) => ({ ...r, score: Math.max(alike(r.f.title, title), alike(`${r.f.where} ${r.f.title} ${r.f.how}`, body)) })).filter((r) => r.score >= 0.45);
  return [...new Set(close.map((r) => r.from))];
}

console.log(`${id}, ${swarm}: ${calls.length} calls in the journal; the readers matched ${matched.size} of ${t.findings.length} reference findings\n`);
const tally = new Map<string, { any: number; only: number }>();
let [byReading, onlyByKnowledge, untraced] = [0, 0, 0];
for (const [ref, items] of [...matched].sort((a, b) => a[0] - b[0])) {
  const origins = new Map<string, Set<string>>(); // origin -> experts
  for (const n of items) {
    const e = entries.get(n);
    if (!e) continue;
    for (const i of e.by.length ? e.by : team.map((_, k) => k)) for (const o of originsOf(team[i]!, n, e.title)) origins.set(o, (origins.get(o) ?? new Set()).add(team[i]!));
  }
  const kinds = [...origins.keys()];
  const own = kinds.includes('own reading');
  if (!kinds.length) untraced++; else if (own) byReading++; else onlyByKnowledge++;
  for (const k of kinds.filter((x) => x.startsWith('pass: '))) { const s = tally.get(k) ?? { any: 0, only: 0 }; s.any++; if (!own) s.only++; tally.set(k, s); }
  console.log(`finding ${ref} (items ${[...items].join(', ')}): ${kinds.length ? [...origins].map(([o, who]) => `${o} [${[...who].join(', ')}]`).join('; ') : 'not traced'}`);
}
console.log(`\nraised by an own reading: ${byReading}; raised only by passes over knowledge: ${onlyByKnowledge}; not traced: ${untraced}`);
for (const [k, s] of [...tally].sort((a, b) => b[1].only - a[1].only || b[1].any - a[1].any)) console.log(`  ${k}: raised ${s.any} of the stated findings, ${s.only} of them that no own reading raised`);
