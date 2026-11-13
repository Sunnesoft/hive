// Lays out the answers of one review task for readers that must not know whose they are (READER.md): each answer
// under a random two-letter name, the audit's findings, and the contract as the experts got it. Who is who is kept
// outside the folder, where score.ts finds it.
//   node --experimental-strip-types eval/lay.ts <task id> <folder for the readers> [<pattern: which answers>]
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUT_DIR, REVIEWS } from './review-tasks.ts';

const [id, out, only] = process.argv.slice(2) as [string, string, string | undefined];
const t = REVIEWS.find((x) => x.id === id);
if (!t || !out) throw new Error(`usage: lay.ts <task id> <folder> [<pattern>]; tasks: ${REVIEWS.map((x) => `"${x.id}"`).join(', ')}`);
const answers: Record<string, { text: string }> = JSON.parse(readFileSync(`${OUT_DIR}/reviews.json`, 'utf8'))[id] ?? {};
const wanted = new RegExp(only ?? '.');
const order = (s: string) => createHash('sha256').update(`${id}\n${out}\n${s}`).digest('hex'); // a shuffle that names cannot be guessed from
const systems = Object.keys(answers).filter((s) => answers[s]!.text.trim() && wanted.test(s)).sort((a, b) => order(a).localeCompare(order(b)));
mkdirSync(out, { recursive: true });
const names: Record<string, string> = {};
systems.forEach((system, i) => {
  const h = order(system);
  const name = `${String.fromCharCode(65 + (parseInt(h.slice(0, 4), 16) % 26))}${String.fromCharCode(65 + (parseInt(h.slice(4, 8), 16) % 26))}${i}`; // the digit keeps two names apart
  names[name] = system;
  writeFileSync(join(out, `${name}.md`), `${answers[system]!.text.replace(/\s*\[\[\d+\]\]/g, '')}\n`); // the marks of who found what would give the swarm away
});
writeFileSync(join(out, 'findings.md'), `# The ${t.findings.length} reference findings (from the audit report published for this contract)\n\n${t.findings.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n`);
const pages = await Promise.all(t.files.map(async (url) => `// ===== file: ${url.split('/').slice(-2).join('/')} =====\n${await (await fetch(url)).text()}`));
const contract = t.platform === 'NEAR' ? 'contract.rs' : 'contract.sol';
writeFileSync(join(out, contract), pages.join('\n\n'));
mkdirSync(`${OUT_DIR}/readings`, { recursive: true });
writeFileSync(`${OUT_DIR}/readings/${id}.map.json`, JSON.stringify(names, null, 2));
console.log(`${id}: ${systems.length} answers as ${Object.keys(names).join(', ')}; ${contract}, ${pages.reduce((n, p) => n + p.length, 0)} characters; ${t.findings.length} findings`);
