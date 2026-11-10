import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allowedModels } from '../src/config.ts';
import { Refused, unseal } from '../src/materials.ts';
import { devSecret, open, publicKeyOf, seal } from '../src/seal.ts';
// @ts-expect-error: plain JavaScript for the browser, no types
import { seal as sealInBrowser } from '../ui/seal.js';

const runner = devSecret('ed25519:test');
const good = { name: 'ok', model: allowedModels[0], expertise: 'Knows dates.', knowledge: [{ name: 'notes.md', text: 'It launches on 2027-03-14.' }] };
const sealFor = (sponsor: string, json: unknown) => seal(Buffer.from(JSON.stringify(json)), publicKeyOf(runner), sponsor);

test('sealed materials open only in the runner, only for their sponsor', () => {
  const sealed = sealFor('alice.near', good);
  assert.equal(sealed.includes(Buffer.from('2027-03-14')), false);
  assert.deepEqual(unseal(sealed, runner, 'alice.near'), { ...good, method: '' });
  assert.throws(() => unseal(sealed, runner, 'copycat.near'), Refused); // a copy registered by someone else
  assert.throws(() => unseal(sealed, devSecret('ed25519:other'), 'alice.near'), Refused); // another runner
  const tampered = Buffer.from(sealed);
  tampered[50]! ^= 1;
  assert.throws(() => open(tampered, runner, 'alice.near'));
});

test('the browser seals exactly like the runner expects', async () => {
  const sealed: Uint8Array = await sealInBrowser(Buffer.from(JSON.stringify(good)), publicKeyOf(runner).toString('hex'), 'alice.near');
  assert.deepEqual(unseal(sealed, runner, 'alice.near'), { ...good, method: '' });
});

test('materials are text with a known shape: no extra fields, an allowed model, invisible characters removed', () => {
  assert.throws(() => unseal(sealFor('a.near', { ...good, tools: ['fetch'] }), runner, 'a.near'), Refused);
  assert.throws(() => unseal(sealFor('a.near', { ...good, model: 'evil/model' }), runner, 'a.near'), Refused);
  assert.throws(() => unseal(seal(Buffer.from('not json'), publicKeyOf(runner), 'a.near'), runner, 'a.near'), Refused);
  assert.equal(unseal(sealFor('a.near', { ...good, expertise: 'Knows​ dates.' }), runner, 'a.near').expertise, 'Knows dates.');
});
