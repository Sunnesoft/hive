// The case-books are written from audit reports; the reviews are scored against other audit reports. A report on
// a contract that is scored must never be among the sources of a case-book: this keeps the two apart.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { REVIEWS } from '../../eval/review-tasks.ts';

/** How the report on each scored contract would be named in a list of sources. */
const NAMED: Record<string, string[]> = {
  'bridge audit': ['boss bridge', 'bossbridge'],
  'loan audit': ['thunder loan', 'thunderloan'],
  'second audit': ['t-swap', 'tswap'],
  'convertor audit': ['convertor'],
  'vesting audit': ['token-vesting', 'token vesting'],
  'xref audit': ['xref'],
  'nearx audit': ['nearx', 'near-x', 'near liquid token'], // not the company's name: its Ethereum contract is another contract, and its report may be a source
  'staking farm audit': ['staking-farm', 'staking farm'],
  'registry audit': ['appchain registry', 'appchain-registry', 'octopus network near smart contract security audit'],
  'vote escrow audit': ['ref-ve', 'ref ve '],
  'sweat token audit': ['sweat nep-141', 'sweat token', 'sweat economy token', ' defer ', 'burn model'],
  'mintbase store audit': ['mintbase'],
  'cnear audit': ['cnear'],
  'pot audit': ['potlock'],
  'lambowin audit': ['lambo'],
  'symmio audit': ['symm'],
  'crestal audit': ['crestal'],
  'nextgen audit': ['next generation', 'next-generation', 'eurf'],
  'kinetiq audit': ['kinetiq'],
};
const CASE_BOOKS = ['agents/near-contract-review/CASEBOOK-SOURCES.md', 'eval/agents/solidity-case-book/CASEBOOK-SOURCES.md', 'eval/agents/near-defi-cases/DEFI-SOURCES.md']
  .concat(['eval/agents/near-incidents/INCIDENTS-SOURCES.md', 'eval/agents/rust-contract-review/RUST-SOURCES.md'].filter((f) => existsSync(f)));
const GENERIC = new Set(['core', 'contracts', 'audits']); // repository names that say nothing of whose they are

/** The reports a case-book rests on: the list lines of its sources file, not the sentence that names what was left out. */
const sourcesOf = (file: string) => readFileSync(file, 'utf8').split('\n').filter((l) => l.startsWith('- ')).map((l) => ` ${l.toLowerCase()} `);

test('every scored contract says how its report would be named', () => {
  for (const t of REVIEWS) assert.ok(NAMED[t.id]?.length, `add the names of the report on "${t.id}" to node/test/split.test.ts`);
});

test('no report on a scored contract is a source of a case-book', () => {
  const sources = CASE_BOOKS.flatMap((file) => sourcesOf(file).map((line) => ({ file, line })));
  assert.ok(sources.length > 80, 'the case-books list their sources');
  for (const t of REVIEWS) {
    const repos = t.files.map((url) => /githubusercontent\.com\/[^/]+\/([^/]+)\//.exec(url)?.[1]?.toLowerCase()).filter((r): r is string => !!r && !GENERIC.has(r) && r.length > 5);
    for (const name of new Set([...NAMED[t.id]!, ...repos])) {
      const hit = sources.find((s) => s.line.includes(name));
      assert.equal(hit, undefined, `"${t.id}" is scored, and its report is a source of a case-book: ${hit?.file}: ${hit?.line.trim()}`);
    }
  }
});
