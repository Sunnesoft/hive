import assert from 'node:assert/strict';
import { test } from 'node:test';
import { digestOf, listOf, reportOf, type Joined } from '../src/review.ts';
import { provenance, sharesOf, type Finding } from '../src/rules.ts';

const drain: Finding = { severity: 'High', where: 'withdraw()', title: 'Anyone can withdraw the pool', how: 'withdraw() sends the whole balance to msg.sender.', evidence: '`payable(msg.sender).transfer(address(this).balance);`', fix: 'Add onlyOwner.' };
const dust: Finding = { severity: 'Low', where: 'fee()', title: 'The fee rounds to zero', how: 'amount * 3 / 1000 is 0 below 334.', evidence: '`return amount * 3 / 1000;`', fix: 'Round up.' };

test('a review as one contribution: the count by severity, then every finding with its evidence, fix and proof', () => {
  const text = reportOf({ findings: [{ ...drain, proof: '```solidity\nfunction test_drain() public {}\n```' }, dust], counts: { passes: 3, raised: 9, groups: 5, checked: 5, held: 2, proofs: 1 } });
  assert.match(text, /^Checked findings: 2 \(1 High, 1 Low\)\./);
  assert.match(text, /### 1\. High: Anyone can withdraw the pool\n\n\*Where:\* withdraw\(\)\.\n\nwithdraw\(\) sends/);
  assert.match(text, /\*\*Evidence:\*\* `payable\(msg\.sender\)/);
  assert.match(text, /\*\*Proof\*\* \(written, not run\):\n\n```solidity\nfunction test_drain/);
  assert.ok(text.indexOf('### 2. Low: The fee rounds to zero') > text.indexOf('**Fix:** Add onlyOwner.'));
});

test('a review that found nothing says what it did, not nothing', () => {
  const text = reportOf({ findings: [], counts: { passes: 4, raised: 1, groups: 1, checked: 1, held: 0, proofs: 0 } });
  assert.match(text, /^Checked findings: none\. .*4 parts of its checklist and raised 1 candidate; none held/);
});

test('the composer gets the titles of a review only', () => {
  const digest = digestOf([drain, dust]);
  assert.match(digest, /^Checked findings/);
  assert.match(digest, /1\. High \| withdraw\(\) \| Anyone can withdraw the pool\n2\. Low \| fee\(\) \| The fee rounds to zero$/);
  assert.ok(!digest.includes('payable') && !digest.includes('onlyOwner')); // no evidence, no fix: nothing for it to reword
  assert.match(digestOf([]), /^Checked findings: none/);
});

test('the list the customer gets: who found each finding, as marks for the record and as words for the reader', () => {
  const joined: Joined[] = [{ ...drain, by: [0, 2] }, { ...dust, by: [2] }];
  const list = listOf(joined, 2);
  assert.match(list, /^## Findings\n\n2 \(1 High, 1 Low\)\./);
  assert.match(list, /### 1\. High: Anyone can withdraw the pool \[\[0\]\] \[\[2\]\]\n\n\*Where:\* withdraw\(\)\. \*Found by 2 of 2 experts\.\*/);
  assert.match(list, /### 2\. Low: The fee rounds to zero \[\[2\]\]\n\n\*Where:\* fee\(\)\. \*Found by 1 of 2 experts\.\*/);
  assert.deepEqual([...sharesOf(list)], [[0, 30], [2, 70]]); // one mark of three, two of three
  assert.ok(!provenance(list).text.includes('[[')); // the customer's copy carries no marks
  assert.ok(!listOf([{ ...drain, by: [0] }], 1).includes('Found by')); // one expert: nothing to compare
});
