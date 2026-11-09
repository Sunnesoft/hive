import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allowedModels } from '../src/config.ts';
import { InvalidManifest, parse } from '../src/manifest.ts';
import { devSecret, open, publicKeyOf, seal } from '../src/seal.ts';

const runner = devSecret('ed25519:test');
const sealFor = (sponsor: string, json: unknown) => seal(Buffer.from(JSON.stringify(json)), publicKeyOf(runner), sponsor);
const good = { name: 'ok', model: allowedModels[0], skills: 'Answers questions.', system: 'Answer.' };

test('a sealed manifest opens only in the runner, only for its sponsor', () => {
  const sealed = sealFor('alice.near', good);
  assert.equal(sealed.includes(Buffer.from('Answer.')), false); // nothing readable on chain
  assert.deepEqual(parse(sealed, runner, 'alice.near'), { ...good, knowledge: '', tools: [], maxSteps: 4 });
  assert.throws(() => parse(sealed, runner, 'copycat.near'), InvalidManifest); // a copy under another account
  assert.throws(() => parse(sealed, devSecret('ed25519:other'), 'alice.near'), InvalidManifest); // another key
  const tampered = Buffer.from(sealed);
  tampered[50]! ^= 1;
  assert.throws(() => open(tampered, runner, 'alice.near'));
});

test("the sponsor's mistakes deny the agent", () => {
  const { skills: _, ...noSkills } = good;
  for (const bad of [{ ...good, model: 'evil/model' }, { ...good, extra: 1 }, { ...good, maxSteps: 99 }, noSkills]) {
    assert.throws(() => parse(sealFor('alice.near', bad), runner, 'alice.near'), InvalidManifest);
  }
  assert.throws(() => parse(seal(Buffer.from('not json'), publicKeyOf(runner), 'a'), runner, 'a'), InvalidManifest);
});
