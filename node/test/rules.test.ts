import assert from 'node:assert/strict';
import { test } from 'node:test';
import { budget, ceiling, coarse, fit, microUsd, provenance, quote, ready, usdc, type Agent } from '../src/rules.ts';

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
    ({ account: 'a', skills: '', rate: '0', max_cost: `${U}`, hash: '', size_mb: 1, status, registration: 1, balance: `${balance}` });
  assert.equal(ready([a('Active', U), a('Active', U - 1n), a('Pending', 9n * U), a('Suspended', 9n * U)]).length, 1);
});

test('provenance strips the source marks and remembers which were used', () => {
  const { text, used } = provenance('It launches on 2027-03-14 [[0]]. The code is BLUE-HERON [[2]][[0]].');
  assert.equal(text, 'It launches on 2027-03-14. The code is BLUE-HERON.');
  assert.deepEqual([...used].sort(), [0, 2]);
});
