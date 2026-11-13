// The numbers of a review, from what blind readers wrote about each answer (eval/out/readings/<task>.<reader>.txt
// and the names' key beside them). The measures are the ones used for systems of this kind (eval/README.md, "How a
// review is measured"): recall against a published audit, as EVMbench's detect mode has it; precision over every
// finding an answer makes, as ScaBench has it; false alarms, as CTFBench's overreporting; and what a real finding costs.
//   node --experimental-strip-types eval/score.ts [<task id> ...]      (all tasks that have readings, if none is named)
//
// A reader writes, for each answer under its random name:
//   ## KT
//   verdicts: SSPAL...           one letter for each reference finding: Stated, only as not confirmed (L), in Passing, Absent
//   items: 1:H:M2 2:C:W 3:M:R 4:L:D2 5:L:N
//                                each finding of the main list: its number, the severity the answer gives it
//                                (C, H, M, L, I) and what it is: M<n> states reference finding n; R a real flaw the
//                                audit does not list; N true and harmless (by design, a note); W wrong, the code
//                                refutes it; D<k> the same claim as item k of this answer
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { REVIEWS } from './review-tasks.ts';

const DIR = 'eval/out/readings';
type Item = { n: number; severity: string; kind: 'M' | 'R' | 'N' | 'W' | 'D'; ref?: number };
type Reading = { verdicts: string; items: Item[] };
type Kept = Record<string, Record<string, { usd: number; text: string }>>;
const kept: Kept = existsSync('eval/out/reviews.json') ? JSON.parse(readFileSync('eval/out/reviews.json', 'utf8')) : {};

/** One reader's report: answer name -> what it says of that answer. */
function parse(text: string): Record<string, Reading> {
  const out: Record<string, Reading> = {};
  for (const block of text.split(/^## +/m).slice(1)) {
    const name = block.split('\n')[0]!.trim();
    const verdicts = (/^\s*verdicts:\s*([SLPAD ]+)/m.exec(block)?.[1] ?? '').replace(/\s/g, '');
    const items = [...(/^\s*items:\s*(.*)$/m.exec(block)?.[1] ?? '').matchAll(/(\d+):([CHMLI]):([MRNWD])(\d*)/g)]
      .map((m): Item => ({ n: Number(m[1]), severity: m[2]!, kind: m[3] as Item['kind'], ...(m[4] ? { ref: Number(m[4]) } : {}) }));
    if (name && verdicts) out[name] = { verdicts, items };
  }
  return out;
}

type Row = { system: string; refs: number; stated: number; claims: number; matched: number; real: number; harmless: number; wrong: number; falseGrave: number; usd: number };
/** What an answer cost: its own call, or for the joined reviews the reviews of the task's experts under the same tag. */
function costOf(task: { id: string; experts: string[] }, system: string) {
  const tag = /^review (\S+): the swarm/.exec(system)?.[1];
  if (!tag) return kept[task.id]?.[system]?.usd ?? 0;
  return task.experts.reduce((sum, name) => sum + (kept[task.id]?.[`review ${tag}: ${name}`]?.usd ?? 0), 0);
}
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '—');
const f1 = (p: number, r: number) => (p + r ? (2 * p * r) / (p + r) : 0);

/** What one reader's reading says of one answer, in counts. Claims are the items less those that repeat another. */
function rowOf(system: string, r: Reading, refs: number, usd: number): Row {
  const claims = r.items.filter((i) => i.kind !== 'D');
  const matched = new Set(claims.filter((i) => i.kind === 'M').map((i) => i.ref)).size;
  const count = (k: Item['kind']) => claims.filter((i) => i.kind === k).length;
  return {
    system, refs, usd,
    stated: [...r.verdicts].filter((c) => c === 'S' || c === 'D').length, // D: stated in the main list under a controller's doubt
    claims: claims.length, matched, real: matched + count('R'), harmless: count('N'), wrong: count('W'),
    falseGrave: claims.filter((i) => (i.kind === 'W' || i.kind === 'N') && (i.severity === 'C' || i.severity === 'H')).length,
  };
}
const add = (a: Row, b: Row): Row => ({ ...a, refs: a.refs + b.refs, stated: a.stated + b.stated, claims: a.claims + b.claims, matched: a.matched + b.matched, real: a.real + b.real, harmless: a.harmless + b.harmless, wrong: a.wrong + b.wrong, falseGrave: a.falseGrave + b.falseGrave, usd: a.usd + b.usd });
const mean = (rows: Row[]): Row => { const s = rows.reduce(add); const n = rows.length; return { ...s, refs: s.refs / n, stated: s.stated / n, claims: s.claims / n, matched: s.matched / n, real: s.real / n, harmless: s.harmless / n, wrong: s.wrong / n, falseGrave: s.falseGrave / n, usd: s.usd / n }; };
const num = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
const line = (r: Row, contracts = 1) => {
  const [recall, precision, strict] = [r.refs ? r.stated / r.refs : 0, r.claims ? r.real / r.claims : 0, r.claims ? r.matched / r.claims : 0];
  return `| ${r.system} | ${num(r.stated)} of ${num(r.refs)} (${pct(r.stated, r.refs)}) | ${num(r.real)} of ${num(r.claims)} (${pct(r.real, r.claims)}) | ${pct(r.matched, r.claims)} | ${f1(precision, recall).toFixed(2)} | ${num(r.wrong)} | ${num(r.falseGrave / contracts)} | ${r.usd.toFixed(3)} | ${r.real ? (r.usd / r.real).toFixed(3) : '—'} |`;
};
const HEAD = '| answer | recall: findings of the audit stated | precision: real findings of all it claims | strict precision (only the audit\'s count) | F1 | wrong | false Critical or High, per contract | cost, USD | USD per real finding |\n|---|---|---|---|---|---|---|---|---|';

const wanted = process.argv.slice(2);
const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.txt')) : [];
const totals = new Map<string, Row[]>();
for (const t of REVIEWS) {
  const mine = files.filter((f) => f.startsWith(`${t.id}.`));
  if (!mine.length || (wanted.length && !wanted.includes(t.id))) continue;
  const names: Record<string, string> = JSON.parse(readFileSync(`${DIR}/${t.id}.map.json`, 'utf8'));
  const readings = mine.map((f) => parse(readFileSync(`${DIR}/${f}`, 'utf8')));
  const agree = Object.keys(names).every((n) => new Set(readings.map((r) => r[n]?.verdicts)).size === 1);
  console.log(`\n### ${t.id} (${t.findings.length} findings of the audit; ${readings.length} reader${readings.length > 1 ? `s, ${agree ? 'who agree on every letter' : 'who differ on some letters: the counts are their mean'}` : ''})\n\n${HEAD}`);
  const rows = Object.entries(names).map(([name, system]) => mean(readings.filter((r) => r[name]).map((r) => rowOf(system, r[name]!, t.findings.length, costOf(t, system)))));
  // The models asked alone, put together: a finding of the audit counts once whoever states it; claims are pooled.
  const alone = Object.entries(names).filter(([, s]) => s.startsWith('alone'));
  const together = readings.map((r) => {
    const parts = alone.filter(([n]) => r[n]).map(([n, s]) => rowOf(s, r[n]!, t.findings.length, costOf(t, s)));
    const stated = t.findings.filter((_, i) => alone.some(([n]) => 'SD'.includes(r[n]?.verdicts[i] ?? 'A'))).length;
    return { ...parts.reduce(add), system: 'the models alone, their answers together', refs: t.findings.length, stated };
  });
  const all = [...rows, ...(alone.length > 1 ? [mean(together)] : [])].sort((a, b) => a.system.localeCompare(b.system));
  for (const r of all) {
    console.log(line(r));
    const key = r.system.replace(/^review \S+: /, 'the reviews: ');
    totals.set(key, [...(totals.get(key) ?? []), r]);
  }
}
if (totals.size && [...totals.values()].some((v) => v.length > 1)) {
  console.log(`\n### All contracts read\n\n${HEAD}`);
  for (const [system, rows] of [...totals].sort()) console.log(line({ ...rows.reduce(add), system: `${system} (${rows.length} contracts)` }, rows.length));
}
