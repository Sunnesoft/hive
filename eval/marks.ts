// The swarm's own step, measured on answers already read: each expert of a team marks the findings the others
// posted (policies/mark.md), and a finding stands if enough experts back it, by finding it or by a grounded mark.
// No judge, and no new reader: blind readers already said of every item whether it is a finding of the audit, real,
// harmless or wrong, so what a rule keeps is scored at once.
//   EVAL_DIR=eval/out/claude node ... eval/marks.ts ask   <tag>=<expert,expert,...> ...   (asks the marks)
//   EVAL_DIR=eval/out/claude node ... eval/marks.ts score <tag> ...                        (scores the rules)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import * as llm from '../node/src/llm.ts';
import { allowedModels } from '../node/src/config.ts';
import { Materials } from '../node/src/materials.ts';
import { grounded, usdc } from '../node/src/rules.ts';
import { readAgent } from '../scripts/agent-folder.ts';
import { OUT_DIR, REVIEWS } from './review-tasks.ts';

const TASKS = ['nearx audit', 'mintbase store audit', 'cnear audit', 'staking farm audit', 'registry audit', 'vote escrow audit', 'sweat token audit', 'pot audit'];
const MARKS = `${OUT_DIR}/marks.json`;
const kept: Record<string, Record<string, { text: string }>> = JSON.parse(readFileSync(`${OUT_DIR}/reviews.json`, 'utf8'));
const marks: Record<string, Record<number, llm.Mark[]>> = existsSync(MARKS) ? JSON.parse(readFileSync(MARKS, 'utf8')) : {};
const joinedOf = (tag: string) => `review ${tag}: the swarm, joined again (folded)`;

type Item = { n: number; severity: string; title: string; body: string; by: number[] };
/** The items of a joined answer's main list, with the experts that confirmed each. */
function itemsOf(text: string): Item[] {
  const main = text.split('\n## Not confirmed')[0]!;
  return main.split(/\n(?=### \d+\. )/).slice(1).map((b) => {
    const head = b.split('\n')[0]!;
    const m = /^### (\d+)\. (\w+): (.*?)((?: \[\[\d+\]\])*)$/.exec(head)!;
    return { n: Number(m[1]), severity: m[2]!, title: m[3]!, body: b.split('\n').slice(1).join('\n').replace(/\n\*\*(Confirmed by|Low, confirmed)[\s\S]*$/, '').trim().slice(0, 700), by: [...m[4]!.matchAll(/\[\[(\d+)\]\]/g)].map((x) => Number(x[1])) };
  });
}
const folder = (name: string) => (existsSync(`eval/agents/${name}`) ? `eval/agents/${name}` : `agents/${name}`);
const expert = (name: string) => ({ ...Materials.parse(readAgent(folder(name)).materials), model: process.env.EVAL_MODEL ?? allowedModels[0]! });

const [what, ...args] = process.argv.slice(2);
if (what === 'ask') {
  await llm.refreshPrices();
  await Promise.all(args.flatMap((arg) => {
    const [tag, team] = arg.split('=') as [string, string];
    return TASKS.flatMap((id) => team.split(',').map(async (name, me) => {
      const key = `${id} | ${tag}`;
      if (marks[key]?.[me]) return;
      const t = REVIEWS.find((x) => x.id === id)!;
      const pages = await Promise.all(t.files.map(async (url) => ({ url, text: await (await fetch(url)).text() })));
      const others = itemsOf(kept[id]![joinedOf(tag)]!.text).filter((i) => !i.by.includes(me));
      const about = `# Findings the other experts posted\n\n${others.map((i) => `### ${i.n}. ${i.severity}: ${i.title}\n\n${i.body}`).join('\n\n')}`;
      const r = await llm.mark(expert(name), t.task, pages, about, usdc('3'));
      console.error(`${key} | ${name}: ${r.why ?? `${r.marks.length} marks of ${others.length}`}`);
      if (r.why) return;
      const now = existsSync(MARKS) ? JSON.parse(readFileSync(MARKS, 'utf8')) : {};
      (now[key] ??= {})[me] = r.marks;
      writeFileSync(MARKS, JSON.stringify(now, null, 1));
      Object.assign(marks, now);
    }));
  }));
}

if (what === 'arbiter') {
  // A finding most of its markers refuted goes to the arbiter (policies/arbiter.md) with the refutations and the
  // materials; what it says is kept beside the marks, to be scored against the readers.
  await llm.refreshPrices();
  const ARB = `${OUT_DIR}/arbiter.json`;
  const ruled: Record<string, Record<number, llm.CheckVerdict>> = existsSync(ARB) ? JSON.parse(readFileSync(ARB, 'utf8')) : {};
  const judge = { ...expert('control-1'), name: 'arbiter', expertise: 'The arbiter of a swarm of reviewers.', method: '' };
  await Promise.all(args.flatMap((tag) => TASKS.map(async (id) => {
    const key = `${id} | ${tag}`;
    const t = REVIEWS.find((x) => x.id === id)!;
    const pages = await Promise.all(t.files.map(async (url) => ({ url, text: await (await fetch(url)).text() })));
    const material = pages.map((p) => p.text).join('\n');
    const given = marks[key] ?? {};
    for (const i of itemsOf(kept[id]![joinedOf(tag)]!.text)) {
      if (ruled[key]?.[i.n]) continue;
      const on = Object.values(given).flatMap((ms) => ms.filter((m) => m.id === i.n && m.mark !== 'pass' && grounded(m.quote ?? '', material)));
      const refutes = on.filter((m) => m.mark === 'refute');
      if (refutes.length <= Math.max(i.by.length, 1) + on.filter((m) => m.mark === 'confirm').length) continue;
      const about = `# The finding\n\n### ${i.severity}: ${i.title}\n\n${i.body}\n\n# The refutations\n\n${refutes.map((m) => `- ${m.why ?? ''} The line: \`${m.quote}\``).join('\n')}`;
      const r = await llm.check(judge, t.task, pages, about, usdc('1'), '', 'arbiter');
      if (!r.verdicts[0]) continue;
      const now = existsSync(ARB) ? JSON.parse(readFileSync(ARB, 'utf8')) : {};
      (now[key] ??= {})[i.n] = r.verdicts[0];
      writeFileSync(ARB, JSON.stringify(now, null, 1));
      Object.assign(ruled, now);
      console.error(`${key} #${i.n}: holds ${r.verdicts[0].holds}`);
    }
  })));
}

if (what === 'score') {
  type Label = { severity: string; kind: string };
  /** What the blind reader said of each item of an answer: its own reading of this answer, wherever it was laid out. */
  const labelsOf = (id: string, system: string): Map<number, Label> | null => {
    for (const dir of [`${OUT_DIR}/readings`, `${OUT_DIR}/readings-second`]) {
      if (!existsSync(`${dir}/${id}.map.json`)) continue;
      const name = Object.entries(JSON.parse(readFileSync(`${dir}/${id}.map.json`, 'utf8')) as Record<string, string>).find(([, s]) => s === system)?.[0];
      if (!name) continue;
      const block = readFileSync(`${dir}/${id}.A.txt`, 'utf8').split(/^## +/m).find((b) => b.startsWith(name))!;
      return new Map([...(/^\s*items:\s*(.*)$/m.exec(block)?.[1] ?? '').matchAll(/(\d+):([CHMLI]):([MRNWD]\d*)/g)].map((m) => [Number(m[1]), { severity: m[2]!, kind: m[3]! }]));
    }
    return null;
  };
  for (const tag of args) {
    // `all`: how many experts the team has; every one either found an item or marked it.
    const rules: [string, (s: { found: number; confirm: number; refute: number; all: number }) => boolean][] = [
      ['every item', () => true],
      ['backed by two: found or confirmed', (s) => s.found + s.confirm >= 2],
      ['refuted by none', (s) => s.refute === 0],
      ['backed by all', (s) => s.found + s.confirm >= s.all],
      ['backed by all, refuted by none', (s) => s.found + s.confirm >= s.all && s.refute === 0],
    ];
    const totals = rules.map(() => ({ refs: 0, stated: 0, items: 0, real: 0, wrong: 0, grave: 0 }));
    for (const id of TASKS) {
      const t = REVIEWS.find((x) => x.id === id)!;
      const material = (await Promise.all(t.files.map(async (url) => (await fetch(url)).text()))).join('\n');
      const labels = labelsOf(id, joinedOf(tag));
      const given = marks[`${id} | ${tag}`];
      if (!labels || !given) { console.log(`${id}: ${labels ? 'no marks' : 'no reading'}`); continue; }
      const support = (i: Item) => {
        const on = Object.values(given).flatMap((ms) => ms.filter((m) => m.id === i.n && m.mark !== 'pass' && grounded(m.quote ?? '', material)));
        return { found: Math.max(i.by.length, 1), confirm: on.filter((m) => m.mark === 'confirm').length, refute: on.filter((m) => m.mark === 'refute').length, all: Object.keys(given).length };
      };
      const items = itemsOf(kept[id]![joinedOf(tag)]!.text);
      rules.forEach(([, keep], k) => {
        const kept = items.filter((i) => keep(support(i))).map((i) => labels.get(i.n)).filter((l): l is Label => !!l);
        const s = totals[k]!;
        s.refs += t.findings.length;
        s.stated += new Set(kept.filter((l) => l.kind.startsWith('M')).map((l) => l.kind)).size;
        s.items += kept.length;
        s.real += kept.filter((l) => /^[MR]/.test(l.kind)).length;
        s.wrong += kept.filter((l) => l.kind === 'W').length;
        s.grave += kept.filter((l) => /[CH]/.test(l.severity) && /^[NW]/.test(l.kind)).length;
      });
    }
    console.log(`\n${tag}\n| rule | stated | items | real | wrong | false Critical or High |\n|---|---|---|---|---|---|`);
    rules.forEach(([name], k) => { const s = totals[k]!; console.log(`| ${name} | ${s.stated} of ${s.refs} | ${s.items} | ${Math.round((100 * s.real) / Math.max(s.items, 1))}% | ${s.wrong} | ${s.grave} |`); });
  }
}
