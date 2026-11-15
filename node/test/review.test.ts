import assert from 'node:assert/strict';
import { test } from 'node:test';
import { digestOf, hotSpots, listOf, reportOf, type Joined, apartIfGraver } from '../src/review.ts';
import { provenance, sharesOf, type Finding } from '../src/rules.ts';

const drain: Finding = { severity: 'High', where: 'withdraw()', title: 'Anyone can withdraw the pool', how: 'withdraw() sends the whole balance to msg.sender.', evidence: '`payable(msg.sender).transfer(address(this).balance);`', fix: 'Add onlyOwner.' };
const mint: Finding = { severity: 'High', where: 'deposit()', title: 'Shares are minted for nothing', how: 'deposit() credits shares before the transfer.', evidence: '', fix: '' };
const loose: Finding = { severity: 'Medium', where: 'fee()', title: 'The fee can be set to anything', how: 'setFee has no bound.', evidence: '', fix: '' };
const dust: Finding = { severity: 'Low', where: 'fee()', title: 'The fee rounds to zero', how: 'amount * 3 / 1000 is 0 below 334.', evidence: '`return amount * 3 / 1000;`', fix: 'Round up.' };

test('a review as one contribution: the count by severity, then every finding with its evidence, fix and proof', () => {
  const text = reportOf({ findings: [{ ...drain, proof: '```solidity\nfunction test_drain() public {}\n```' }, dust], leads: [], counts: { own: 0, passes: 3, raised: 9, groups: 5, checked: 5, combined: 0, held: 2, leads: 0, proofs: 1, cut: 0, unpaid: 0 } });
  assert.match(text, /^Checked findings: 2 \(1 High, 1 Low\)\./);
  assert.match(text, /### 1\. High: Anyone can withdraw the pool\n\n\*Where:\* withdraw\(\)\.\n\nwithdraw\(\) sends/);
  assert.match(text, /\*\*Evidence:\*\* `payable\(msg\.sender\)/);
  assert.match(text, /\*\*Test\*\* \(written, not run\):\n\n```solidity\nfunction test_drain/);
  assert.ok(text.indexOf('### 2. Low: The fee rounds to zero') > text.indexOf('**Fix:** Add onlyOwner.'));
});

test('a finding joined from several wordings shows all the others under it: nothing a pass raised is hidden', () => {
  const text = reportOf({ findings: [{ ...drain, also: ['withdraw() has no owner check', 'The pool can be emptied by any caller', 'a', 'b', 'c'] }], leads: [], counts: { own: 0, passes: 2, raised: 6, groups: 6, checked: 6, combined: 0, held: 1, leads: 0, proofs: 0, cut: 0, unpaid: 0 } });
  assert.match(text, /withdraw\(\) sends the whole balance to msg\.sender\.\n\n\*The same was raised as:\* withdraw\(\) has no owner check; The pool can be emptied by any caller; a; b; c\n\n\*\*Evidence:\*\*/);
});

test('a review that found nothing says what it did, not nothing', () => {
  const text = reportOf({ findings: [], leads: [], counts: { own: 0, passes: 4, raised: 1, groups: 1, checked: 1, combined: 0, held: 0, leads: 0, proofs: 0, cut: 0, unpaid: 0 } });
  assert.match(text, /^Checked findings: none\. .*4 parts of its checklist and raised 1 candidate; none was confirmed/);
});

test('what the check did not confirm is listed after the findings: a grave one whole, with what its check said, a Medium one in a line', () => {
  const text = reportOf({ findings: [drain], leads: [{ ...mint, checkSaid: 'The transfer comes first.' }, loose], counts: { own: 0, passes: 4, raised: 3, groups: 2, checked: 2, combined: 0, held: 1, leads: 1, proofs: 0, cut: 0, unpaid: 0 } });
  assert.match(text, /Not confirmed: 2\. [^\n]*\n\n### 2\. High, not confirmed: Shares are minted for nothing\n\n\*Where:\* deposit\(\)\.\n\ndeposit\(\) credits shares before the transfer\.\n\n\*Its check said:\* The transfer comes first\.\n\n- \*\*Medium\*\*, fee\(\): The fee can be set to anything$/);
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
  assert.match(list, /## Not confirmed\n\n1 more point was raised[^\n]*The grave ones are given whole[^\n]*\n\n### 3\. High, not confirmed: Shares are minted for nothing\n\n\*Where:\* deposit\(\)\. \*Raised by 2 of 2 experts\.\*\n\ndeposit\(\) credits shares before the transfer\.$/);
  assert.match(listOf({ findings: [], leads: [{ ...loose, seen: [0, 1] }, { ...loose, title: 'Another', seen: [1] }] }, 2), /- \*\*Medium\*\*, fee\(\): The fee can be set to anything \*\(raised by 2 of 2 experts\)\*\n- \*\*Medium\*\*, fee\(\): Another$/);
  assert.ok(!listOf({ findings: [{ ...drain, by: [0], seen: [0] }], leads: [] }, 1).includes('Found by')); // one expert: nothing to compare
  assert.match(listOf({ findings: [], leads: [{ ...mint, seen: [1] }] }, 2), /^## Findings\n\nNo finding was confirmed/);
});

test('findings sorted as the same stand together, each in its own words, and a doubted one keeps its place', () => {
  const list = listOf({ findings: [{ ...drain, by: [0], seen: [0] }, { ...mint, severity: 'Medium', sortedWith: drain.title, by: [1], seen: [1] }, { ...dust, second: 'it doubts this. Dust is meant.', doubted: true, by: [0], seen: [0] }], leads: [] }, 2);
  assert.match(list, /### 2\. Medium: Shares are minted for nothing \[\[1\]\]\n\n\*Where:\* deposit\(\)\. \*Found by 1 of 2 experts\.\*\n\n\*Sorted with "Anyone can withdraw the pool" above as the same finding; kept apart in case it is not\.\*/);
  assert.match(list, /doubts 1 of them: its word stands under each/);
  assert.match(list, /### 3\. Low: The fee rounds to zero[\s\S]*\*Second opinion, from the controller:\* it doubts this\. Dust is meant\./);
  assert.ok(!list.includes('## Findings the controller doubts'));
});

test('a finding one expert confirmed and another only raised is one finding: found by both, the confirming expert\'s', () => {
  const list = listOf({ findings: [{ ...drain, by: [1], seen: [0, 1, 2] }], leads: [] }, 3);
  assert.match(list, /Anyone can withdraw the pool \[\[1\]\]\n\n\*Where:\* withdraw\(\)\. \*Found by 3 of 3 experts\.\*/);
  assert.deepEqual([...sharesOf(list)], [[1, 100]]);
});

test('what a review spends is the expert\'s: a reply is as long as the money left pays for; a loop stops it', async () => {
  const llm = await import('../src/llm.ts');
  const { repeats, REPLY_MOST } = await import('../src/rules.ts');
  const price = { in: 0.3, out: 1.2 }; // USD per 1M tokens: micro-USD per token
  assert.equal(llm.limitFor(price, 10_000, 1_000_000n), REPLY_MOST); // a dollar left: the reply is not held back by money
  assert.equal(llm.limitFor(price, 10_000, 9_000n), Math.floor((9_000 - 3_000) / 1.2)); // six thousandths of a dollar after the prompt
  assert.ok(llm.limitFor(price, 10_000, 2_000n) < 0); // the prompt alone costs more than is left: not sent
  const finding = (n: number) => `### Medium | f${n} | a different flaw number ${n} in its own words, with its own place and its own fix\n`;
  assert.equal(repeats(Array.from({ length: 60 }, (_, n) => finding(n)).join('')), false); // a long reply of different findings goes on
  const loop = '### Critical | beneficiary.rs | claim_callback and claim_all_callback state update on failed transfer\n'.repeat(12);
  assert.equal(repeats(finding(1) + loop), true); // one finding said over and over is a loop
  assert.equal(repeats(`${'-'.repeat(3_000)}${' '.repeat(3_000)}`), false); // layout is no loop
  const { Materials } = await import('../src/materials.ts');
  const { allowedModels } = await import('../src/config.ts');
  const base = { name: 'x', model: allowedModels[0]!, expertise: 'Reviews.', work: 'review' as const };
  assert.equal(Materials.parse(base).review, undefined); // said nothing: every finding raised is checked while the money lasts
  assert.deepEqual(Materials.parse({ ...base, review: { checks: 10 } }).review, { checks: 10 });
  assert.ok(!Materials.safeParse({ ...base, review: { pass_room: 1_000 } }).success); // no room of the protocol's to set
});

test('the answer gives first what experts confirmed each on their own, then one expert\'s word, with another expert\'s doubt under it', () => {
  const both: Joined = { ...dust, title: 'Both found it', by: [0, 1], seen: [0, 1] };
  const crossed: Joined = { ...drain, by: [0], seen: [0], crossed: { by: 1, holds: true, said: 'It holds.' } };
  const doubted: Joined = { ...mint, by: [1], seen: [1], crossed: { by: 0, holds: false, said: 'The guard stops it. The line it points at: `require(x)`' } };
  const list = listOf({ findings: [doubted, crossed, both], leads: [] }, 2);
  const at = (s: string) => list.indexOf(s);
  assert.ok(at('**Confirmed by two or more experts**') < at('### 1. Low: Both found it') && at('### 1. Low: Both found it') < at('**Confirmed by one expert**:'));
  assert.ok(at('**Confirmed by one expert**:') < at('### 2. High: Shares are minted for nothing') && at('**Confirmed by one expert**:') < at('### 3. High: Anyone can withdraw the pool'));
  assert.match(list, /Another expert of the team checked it and doubts it:\* The guard stops it\./); // the doubt is said, the finding stays
  assert.ok(!list.includes('It holds.')); // a second expert's agreement raises nothing: it agreed with false findings
  assert.ok(!/doubts it:\*[^\n]*\[\[/.test(list)); // the checker's word is no part of the answer that is its
  assert.ok(!listOf({ findings: [crossed], leads: [] }, 1).includes('Confirmed by')); // one expert: no tiers
});

test('hot spots: places where two experts left notes, or one could not settle a suspicion, and no two experts agree yet', () => {
  const at = (where: string, title: string): Finding => ({ severity: 'Medium', where, title, how: 'how', evidence: '', fix: '' });
  const reviews = [
    { id: 0, findings: [at('withdraw_minter in minting.rs', 'minter cannot leave')], unsure: [at('nft_revoke', 'refund without removal')], open: [] },
    { id: 1, findings: [], unsure: [at('withdraw_minter', 'yocto kept')], open: [{ where: 'nft_approve in approvals.rs', suspicion: 'approvals may grow without bound', to_check: 'a cap on approvals' }] },
    { id: 2, findings: [at('nft_transfer_call', 'not transferred first')], unsure: [], open: [] },
  ];
  const settled: Joined[] = [{ ...at('nft_transfer_call', 'not transferred first'), by: [2, 0], seen: [2, 0] }];
  const spots = hotSpots(reviews, settled);
  assert.deepEqual(spots.map((x) => x.place), ['withdraw_minter', 'nft_approve']); // two experts at one place first; one open question too
  assert.equal(spots[0]!.notes.length, 2);
  assert.ok(!spots.some((x) => x.place === 'nft_revoke')); // one expert's one note, and no open question: not a hot spot
  assert.ok(!spots.some((x) => x.place === 'nft_transfer_call')); // two experts agree there already
});

test('repeats folded into one finding never hide a graver wording: it stays a finding of its own', () => {
  const at = (severity: string, title: string) => ({ f: { severity, where: 'core.rs, ft_resolve_transfer', title, how: '', evidence: '', fix: '' } as never, held: true });
  const callback = at('High', 'ft_resolve_transfer is public: anyone moves a holder\'s balance to an account it names');
  const lows = [at('Low', 'the resolver does not re-check the denylist'), at('Low', 'a refund reaches a restricted sender'), at('Medium', 'a restricted receiver keeps tokens')];
  const parts = apartIfGraver([...lows, callback]);
  assert.equal(parts.length, 2);
  assert.ok(parts.some((g) => g.length === 1 && g[0] === callback));
  assert.deepEqual(apartIfGraver(lows.slice(0, 2)), [lows.slice(0, 2)]); // repeats of one weight stay folded
});

test('a finding its finder withdrew on a line of the materials, and nobody confirmed, leaves the proved: it stands in brief below the notes', () => {
  const t = (over: Partial<NonNullable<Joined['trial']>>) => ({ proved: true, withdrawn: false, confirm: 0, note: 0, refute: 0, confirmedBy: [], ...over });
  const list = listOf({ findings: [
    { ...drain, by: [0], seen: [0], trial: t({ withdrawn: true }) },
    { ...mint, by: [1], seen: [1], trial: t({ withdrawn: true, confirm: 1, confirmedBy: [0] }) },
  ], leads: [] }, 2);
  assert.match(list, /\*\*Proved, not yet backed by a second expert\*\*: 1 finding\./);
  assert.match(list, /\*\*Withdrawn by the expert who found it\*\*: 1 point, each in brief\./);
  assert.ok(list.indexOf('Withdrawn by the expert') > list.indexOf('Shares are minted for nothing')); // the confirmed one stays among the proved
  assert.ok(list.indexOf('Anyone can withdraw the pool') > list.indexOf('Withdrawn by the expert'));
});

test('a step is placed by code at its file and line: where a line stands twice, at the place that holds the whole quote', async () => {
  const { lineAt, linkOf } = await import('../src/review.ts');
  const url = 'https://raw.githubusercontent.com/o/r/abc/src/defer.rs';
  const text = ['pub trait Callback {', '    fn on_record(&mut self, receiver_id: AccountId, amount: U128);', '}', '', 'impl Callback for Contract {', '    #[private]', '    fn on_record(&mut self, receiver_id: AccountId, amount: U128) {', '        if !is_promise_success() {'].join('\n');
  const at = lineAt('fn on_record(&mut self, receiver_id: AccountId, amount: U128) {', [{ url, text }]);
  assert.deepEqual(at, { url, n: 7 }); // the impl, under #[private]: not the trait's line 2
  assert.equal(linkOf(at!), 'https://github.com/o/r/blob/abc/src/defer.rs#L7');
  assert.deepEqual(lineAt('fn on_record(&mut self, receiver_id: AccountId, amount: U128) {', [{ url, text: `// a label\n${text}`, first: 0 }]), { url, n: 7 }); // a label above the file is not a line of it
  assert.equal(lineAt('None,', [{ url, text }]), undefined); // too short to place
});

test('the function a step stands in is given whole, from the attributes above its head to its end', async () => {
  const { fnAt } = await import('../src/review.ts');
  const text = ['impl Callback for Contract {', '    /// Called back by the holding account.', '    #[private]', '    fn on_record(&mut self, amount: U128) {', '        if !is_promise_success() {', '            panic_str("failed");', '        }', '        self.mint(amount);', '    }', '', '    fn other(&self) {}', '}'].join('\n');
  const page = { url: 'https://raw.githubusercontent.com/o/r/abc/src/defer.rs', text };
  assert.deepEqual(fnAt(page, 8), { from: 2, text: text.split('\n').slice(1, 9).join('\n') }); // the doc comment and #[private] come with it
  assert.equal(fnAt(page, 1), undefined); // a line in no function
  const sol = ['contract Vault {', '    // only the owner', '    function sweep(address to) external onlyOwner {', '        payable(to).transfer(address(this).balance);', '    }', '}'].join('\n');
  assert.equal(fnAt({ url: 'u', text: sol }, 4)?.from, 2);
});
