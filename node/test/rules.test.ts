import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alike, budget, bySeverity, ceiling, clip, coarse, findingsIn, fit, grounded, groupsOf, microUsd, partition, partsOf, piecesOf, provenance, quote, ready, rivals, share, sharesOf, showFinding, usdc, usedOf, type Agent } from '../src/rules.ts';

const U = 1_000_000n;

test('USDC amounts parse exactly', () => {
  assert.equal(usdc('1.13'), 1_130_000n);
  assert.equal(usdc('25.000000000000'), 25n * U); // how Agent Market writes escrow
  assert.equal(usdc('0.000001'), 1n);
});

test('costs are coarse: up to the next cent, never above the hold', () => {
  assert.equal(coarse(1n, U), 10_000n);
  assert.equal(coarse(10_000n, U), 10_000n);
  assert.equal(coarse(10_001n, U), 20_000n);
  assert.equal(coarse(2n * U, U), U);
  assert.equal(coarse(15_000n, 12_345n), 12_345n); // the contract takes the hold itself too
});

test('token costs: USD per 1M tokens times tokens is micro-USD, rounded up', () => {
  assert.equal(microUsd({ inputTokens: 1_000, outputTokens: 200 }, { in: 1, out: 5 }), 2_000n);
  assert.equal(microUsd({ inputTokens: 1 }, { in: 0.1, out: 0 }), 1n);
  assert.equal(ceiling(20_000, { in: 1, out: 5 }), microUsd({ inputTokens: 20_000, outputTokens: 4_000 }, { in: 1, out: 5 }));
});

test('the budget for agents: what the customer pays after both fees and the overhead', () => {
  assert.equal(budget(10n * U, 500, U / 2n), 8_525_000n); // 10 -> 9.5 -> 9.025 -> 8.525
  assert.ok(budget(U / 10n, 500, U / 2n) < 0n); // too cheap for any team
});

test('the team is the longest prefix of picks the budget covers', () => {
  const picks = [{ rate: 3n * U }, { rate: 2n * U }, { rate: 4n * U }, { rate: U / 10n }];
  assert.deepEqual(fit(picks, 5n * U + U / 5n, U / 10n), picks.slice(0, 2));
  assert.deepEqual(fit(picks, U, U / 10n), []);
});

test('a quote covers the rates and the overhead after both fees', () => {
  const price = quote([3n * U, 2n * U], 500, U / 2n, U / 10n);
  assert.equal(price % 10_000n, 0n);
  assert.ok(budget(price, 500, U / 2n) >= 5n * U + 2n * (U / 10n));
});

test('only active agents with money for one more job are ready', () => {
  const a = (status: Agent['status'], balance: bigint): Agent =>
    ({ id: 'a.near/x', sponsor: 'a.near', skills: '', rate: '0', max_cost: `${U}`, materials_hash: '', size_mb: 1, status, registration: 1, balance: `${balance}` });
  assert.equal(ready([a('Active', U), a('Active', U - 1n), a('Pending', 9n * U), a('Suspended', 9n * U)]).length, 1);
});

test('sharesOf: each contribution\'s part of the marks, to the nearest ten percent', () => {
  assert.deepEqual([...sharesOf('A [[0]]. B [[2]][[0]]. C [[0]].')].sort(), [[0, 80], [2, 30]]); // 3 of 4 and 1 of 4, each rounded on its own
  assert.deepEqual([...sharesOf('One [[1]]. Two [[0]].')].sort(), [[0, 50], [1, 50]]);
  assert.equal(sharesOf('No marks at all.').size, 0);
});

test('usedOf: an expert\'s part of the answers against an equal split, from rounds in a team only', () => {
  assert.equal(usedOf([{ share: 30, parts: 3 }, { share: 20, parts: 3 }]), 0.8); // 0.9 and 0.6 of an equal part
  assert.equal(usedOf([{ share: 40, parts: 3 }, { share: 50, parts: 2 }]), 1.1);
  assert.equal(usedOf([{ share: 100, parts: 1 }, {}, { share: 50 }]), null); // alone, or nothing recorded: unknown
});

test('rivals: the agents whose parts are used clearly more than the pick\'s, at no higher price, best first', () => {
  const a = (id: string, used: number | null, rate = 1n) => ({ id, used, rate });
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
  assert.deepEqual(ids(rivals(a('pick', 0.8), [a('y', 1.0), a('x', 1.1)])), ['x', 'y']); // 0.2 above counts, exactly
  assert.deepEqual(ids(rivals(a('pick', 0.8), [a('x', 0.9)])), []); // under the margin: no difference
  assert.deepEqual(ids(rivals(a('pick', 0.8), [a('dear', 1.5, 2n)])), []); // never a dearer one
  assert.deepEqual(ids(rivals(a('pick', null), [a('x', 1.5)])), []); // a new agent is not replaced
  assert.deepEqual(ids(rivals(a('pick', 0.8), [a('new', null)])), []); // nor does one replace
});

test('findingsIn reads findings however a model draws the heading, and showFinding writes what it reads', () => {
  const text = [
    'Some words before the first finding are dropped.',
    '### High | `refund` | the ether is sent before the player is cleared',
    'A contract re-enters refund and is paid again.',
    'Evidence: `payable(msg.sender).sendValue(entranceFee);`',
    'Fix: clear the player first.',
    '',
    '**2. Medium — `enterRaffle` — duplicates are checked with a nested loop**',
    'Each entry costs more gas than the last.',
    '## Low: no event on withdrawal',
  ].join('\n');
  const [a, b, c] = findingsIn(text);
  assert.deepEqual(a, { severity: 'High', where: 'refund', title: 'the ether is sent before the player is cleared', how: 'A contract re-enters refund and is paid again.', evidence: '`payable(msg.sender).sendValue(entranceFee);`', fix: 'clear the player first.' });
  assert.deepEqual([b!.severity, b!.where, b!.title, b!.how], ['Medium', 'enterRaffle', 'duplicates are checked with a nested loop', 'Each entry costs more gas than the last.']);
  assert.deepEqual([c!.severity, c!.where, c!.title], ['Low', '', 'no event on withdrawal']);
  assert.deepEqual(findingsIn(showFinding(a!, 1)), [a]);
  assert.deepEqual(findingsIn('NOT CONFIRMED: the call is guarded.'), []);
  assert.deepEqual(findingsIn('High-risk functions are listed below.\nLow gas use is not a finding.'), []); // prose, not headings
});

test('bySeverity puts the gravest first and keeps the order of equals', () => {
  const f = (severity: 'High' | 'Low' | 'Critical', title: string) => ({ severity, title });
  assert.deepEqual(bySeverity([f('Low', 'a'), f('High', 'b'), f('Critical', 'c'), f('High', 'd')]).map((x) => x.title), ['c', 'b', 'd', 'a']);
});

test('groupsOf joins only what is close to every member: no chain of neighbours merges two different things', () => {
  const at = [0, 1, 2, 10]; // on a line; "close" is within 1.5 of each other
  const close = (i: number, j: number) => Math.abs(at[i]! - at[j]!) <= 1.5;
  assert.deepEqual(groupsOf(4, close), [[0, 1], [2], [3]]); // 2 is close to 1 but not to 0: its own group
  assert.deepEqual(groupsOf(0, close), []);
});

test('grounded: evidence counts when a stretch of it stands in the material word for word', () => {
  const material = 'function refund(uint256 playerIndex) public {\n    payable(msg.sender).sendValue(entranceFee);\n    players[playerIndex] = address(0);\n}';
  assert.equal(grounded('`payable(msg.sender).sendValue(entranceFee);` comes before the player is cleared', material), true);
  assert.equal(grounded('payable(msg.sender).sendValue(entranceFee);   players[playerIndex] = address(0);', material), true); // spaces and line breaks aside
  assert.equal(grounded('`withdrawAll(address to)` has no guard', material), false); // not in the material
  assert.equal(grounded('line 12', material), false); // too short to point at anything
  assert.equal(grounded('`function refund(uint256 playerIndex) public { ... players[playerIndex] = address(0);`', material), true); // a quote with "..." counts by its pieces
  assert.equal(grounded('`payable( msg.sender ).sendValue( entranceFee );`', material), true); // laid out with other spaces: the same line
  assert.equal(grounded('`function refund(uint256 playerIndex) public { ... selfdestruct(owner);`', material), true); // one true piece is enough to point at the place
  assert.equal(grounded('`selfdestruct(owner); ... delegatecall(target);`', material), false);
});

test('piecesOf packs chunks of knowledge into the parts a review reads, in order, none over its size', () => {
  const [a, b, c, d] = ['a'.repeat(600), 'b'.repeat(500), 'c'.repeat(400), 'd'.repeat(1_000)];
  assert.deepEqual(piecesOf([a, b, c, d], 1_000), [a, `${b}\n---\n${c}`, d]); // b and c fit together; nothing lost, nothing reordered
  assert.deepEqual(piecesOf([]), []);
  // Chunks of at most 1,500 with five to a part always fit 16 parts of 9,000: what review.ts relies on for a large knowledge.
  const worst = Array.from({ length: 80 }, (_, i) => 'x'.repeat(i % 2 ? 1_500 : 1_499));
  assert.ok(piecesOf(worst).length <= 16);
});

test('partsOf: a file of knowledge is a pass, a long file several; too many parts are packed across files', () => {
  const [a, b, c] = [['a'.repeat(400)], ['b'.repeat(700), 'B'.repeat(700)], ['c'.repeat(300)]];
  assert.deepEqual(partsOf([a, b, c], 1_000, 16).map((p) => p.length), [400, 700, 700, 300]); // b is too long for one part
  assert.deepEqual(partsOf([a, b, c], 1_000, 3).map((p) => p.replace(/[^a-cB]/g, '').length), [400, 700, 1_000]); // four parts are over the limit: packed in order
  assert.deepEqual(partsOf([]), []);
});

test('findingsIn: evidence may be quoted in a fence; other code and a proof are not part of the finding', () => {
  const text = ['### High | refund() | The player is cleared after the ether is sent', 'A contract re-enters refund().', 'Evidence:', '```solidity', 'payable(msg.sender).sendValue(entranceFee);', '```', 'Fix: Clear the player first.', 'Proof of concept (written, not run):', '```solidity', 'function test_reenter() public {}', '```', '### Low | fee() | Rounds down', 'Dust is lost.', '```', '### High | not() | a heading inside code is code', '```'].join('\n');
  const [first, second, ...rest] = findingsIn(text);
  assert.equal(first!.evidence, 'payable(msg.sender).sendValue(entranceFee);');
  assert.equal(first!.fix, 'Clear the player first.'); // nothing of the proof
  assert.deepEqual([second!.title, second!.how, rest.length], ['Rounds down', 'Dust is lost.', 0]);
});

test('partition: a model may join findings, never drop one: what it did not name, or named wrongly, stands alone', () => {
  assert.deepEqual(partition(5, [[0, 3], [1, 4]]), [[0, 3], [1, 4], [2]]);
  assert.deepEqual(partition(4, [[0, 1], [1, 2]]), [[0, 1], [2], [3]]); // 1 is taken: the second group is left with one item, so it is no group
  assert.deepEqual(partition(3, [[0, 7, -1, 1.5], [2, 2]]), [[0], [1], [2]]); // numbers outside the list and repeats join nothing
  assert.deepEqual(partition(2, []), [[0], [1]]);
});

test('alike: two findings worded alike are close by their words; two different ones in the same place are not', () => {
  const replay = 'withdrawTokensToL1 | Signatures can be replayed\nA signed withdrawal has no nonce, so the same signature withdraws again.';
  const again = 'withdrawTokensToL1 | Signature replay: a withdrawal signature can be used again\nThe signed message has no nonce and the same signature is accepted twice.';
  const mint = 'depositTokensToL2 | Tokens of the vault can be deposited by anyone\nfrom may be the vault itself, which approved the bridge, so L2 tokens are minted for nothing.';
  assert.ok(alike(replay, again) >= 0.6, String(alike(replay, again)));
  assert.ok(alike(replay, mint) < 0.3, String(alike(replay, mint)));
  assert.equal(alike('', replay), 0);
  assert.equal(alike(replay, replay), 1);
});

test('clip cuts a text to a number of bytes, never through the middle of a character', () => {
  assert.equal(clip('short', 100), 'short');
  assert.equal(clip('abcdef', 3), 'abc');
  assert.equal(clip('ааа', 5), 'аа'); // two bytes a letter: the third would be cut in half
  assert.ok(Buffer.byteLength(clip('日本語のテキスト', 10)) <= 10);
});

test('provenance strips the source marks and remembers which were used', () => {
  const { text, used } = provenance('It launches on 2027-03-14 [[0]]. The code is BLUE-HERON [[2]][[0]].');
  assert.equal(text, 'It launches on 2027-03-14. The code is BLUE-HERON.');
  assert.deepEqual([...used].sort(), [0, 2]);
});

test('a round\'s share of revenue pays its experts exactly after the owner\'s fee, rounded up', () => {
  const owed = 5n * U;
  const amount = share(owed, 500);
  assert.equal(amount, 5_263_158n);
  assert.ok(amount - (amount * 500n) / 10_000n >= owed); // what is left after the fee covers the experts
  assert.equal(share(95n * U, 500), 100n * U); // exact when it divides
});
