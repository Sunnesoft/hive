import assert from 'node:assert/strict';
import { test } from 'node:test';
import { digestOf, listOf, reportOf, type Joined } from '../src/review.ts';
import { provenance, sharesOf, type Finding } from '../src/rules.ts';

const drain: Finding = { severity: 'High', where: 'withdraw()', title: 'Anyone can withdraw the pool', how: 'withdraw() sends the whole balance to msg.sender.', evidence: '`payable(msg.sender).transfer(address(this).balance);`', fix: 'Add onlyOwner.' };
const mint: Finding = { severity: 'High', where: 'deposit()', title: 'Shares are minted for nothing', how: 'deposit() credits shares before the transfer.', evidence: '', fix: '' };
const dust: Finding = { severity: 'Low', where: 'fee()', title: 'The fee rounds to zero', how: 'amount * 3 / 1000 is 0 below 334.', evidence: '`return amount * 3 / 1000;`', fix: 'Round up.' };

test('a review as one contribution: the count by severity, then every finding with its evidence, fix and proof', () => {
  const text = reportOf({ findings: [{ ...drain, proof: '```solidity\nfunction test_drain() public {}\n```' }, dust], leads: [], counts: { passes: 3, raised: 9, groups: 5, checked: 5, held: 2, leads: 0, proofs: 1, cut: 0 } });
  assert.match(text, /^Checked findings: 2 \(1 High, 1 Low\)\./);
  assert.match(text, /### 1\. High: Anyone can withdraw the pool\n\n\*Where:\* withdraw\(\)\.\n\nwithdraw\(\) sends/);
  assert.match(text, /\*\*Evidence:\*\* `payable\(msg\.sender\)/);
  assert.match(text, /\*\*Proof\*\* \(written, not run\):\n\n```solidity\nfunction test_drain/);
  assert.ok(text.indexOf('### 2. Low: The fee rounds to zero') > text.indexOf('**Fix:** Add onlyOwner.'));
});

test('a finding joined from several wordings shows the others under it: nothing a pass raised is hidden', () => {
  const text = reportOf({ findings: [{ ...drain, also: ['withdraw() has no owner check', 'The pool can be emptied by any caller', 'a', 'b', 'c'] }], leads: [], counts: { passes: 2, raised: 6, groups: 6, checked: 6, held: 1, leads: 0, proofs: 0, cut: 0 } });
  assert.match(text, /withdraw\(\) sends the whole balance to msg\.sender\.\n\n\*The same was raised as:\* withdraw\(\) has no owner check; The pool can be emptied by any caller; a; b; and 1 more\n\n\*\*Evidence:\*\*/);
});

test('a review that found nothing says what it did, not nothing', () => {
  const text = reportOf({ findings: [], leads: [], counts: { passes: 4, raised: 1, groups: 1, checked: 1, held: 0, leads: 0, proofs: 0, cut: 0 } });
  assert.match(text, /^Checked findings: none\. .*4 parts of its checklist and raised 1 candidate; none was confirmed/);
});

test('what the check did not confirm is listed after the findings, in a line each, as not confirmed', () => {
  const text = reportOf({ findings: [drain], leads: [mint], counts: { passes: 4, raised: 3, groups: 2, checked: 2, held: 1, leads: 1, proofs: 0, cut: 0 } });
  assert.match(text, /Not confirmed: 1\. [^\n]*\n\n- \*\*High\*\*, deposit\(\): Shares are minted for nothing$/);
  assert.ok(text.indexOf('Not confirmed') > text.indexOf('**Fix:** Add onlyOwner.'));
});

test('the composer gets the titles of a review only', () => {
  const digest = digestOf({ findings: [drain, dust], leads: [mint] });
  assert.match(digest, /^Checked findings/);
  assert.match(digest, /1\. High \| withdraw\(\) \| Anyone can withdraw the pool\n2\. Low \| fee\(\) \| The fee rounds to zero\nRaised and not confirmed[^\n]*: 1\.$/);
  assert.ok(!digest.includes('payable') && !digest.includes('onlyOwner') && !digest.includes('minted')); // no evidence, no fix, no leads: nothing for it to reword
  assert.match(digestOf({ findings: [], leads: [] }), /^Checked findings: none/);
});

test('the list the customer gets: who found each finding, as marks for the record and as words for the reader', () => {
  const joined: Joined[] = [{ ...drain, by: [0, 2], seen: [0, 2] }, { ...dust, by: [2], seen: [2] }];
  const list = listOf({ findings: joined, leads: [{ ...mint, seen: [0, 2] }] }, 2);
  assert.match(list, /^## Findings\n\n2 \(1 High, 1 Low\)\./);
  assert.match(list, /### 1\. High: Anyone can withdraw the pool \[\[0\]\] \[\[2\]\]\n\n\*Where:\* withdraw\(\)\. \*Found by 2 of 2 experts\.\*/);
  assert.match(list, /### 2\. Low: The fee rounds to zero \[\[2\]\]\n\n\*Where:\* fee\(\)\. \*Found by 1 of 2 experts\.\*/);
  assert.deepEqual([...sharesOf(list)], [[0, 30], [2, 70]]); // one mark of three, two of three
  assert.ok(!provenance(list).text.includes('[[')); // the customer's copy carries no marks
  assert.match(list, /## Not confirmed\n\n1 more point was raised[^\n]*\n\n- \*\*High\*\*, deposit\(\): Shares are minted for nothing \*\(raised by 2 of 2 experts\)\*$/);
  assert.ok(!listOf({ findings: [{ ...drain, by: [0], seen: [0] }], leads: [] }, 1).includes('Found by')); // one expert: nothing to compare
  assert.match(listOf({ findings: [], leads: [{ ...mint, seen: [1] }] }, 2), /^## Findings\n\nNo finding was confirmed/);
});

test('a finding one expert confirmed and another only raised is one finding: found by both, the confirming expert\'s', () => {
  const list = listOf({ findings: [{ ...drain, by: [1], seen: [0, 1, 2] }], leads: [] }, 3);
  assert.match(list, /Anyone can withdraw the pool \[\[1\]\]\n\n\*Where:\* withdraw\(\)\. \*Found by 3 of 3 experts\.\*/);
  assert.deepEqual([...sharesOf(list)], [[1, 100]]);
});
