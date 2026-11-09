import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chunk, nearest } from '../src/library.ts';
import { devSecret, libraryAad, open, publicKeyOf, seal } from '../src/seal.ts';

test('chunks pack paragraphs, cut long ones, never exceed the size', () => {
  const text = ['a'.repeat(30), 'b'.repeat(30), 'c'.repeat(95), 'd'.repeat(10)].join('\n\n');
  const parts = chunk(text, 64);
  assert.ok(parts.every((p) => p.length <= 64));
  assert.equal(parts.join('').replace(/\s/g, ''), text.replace(/\s/g, ''));
  assert.equal(parts[0], `${'a'.repeat(30)}\n\n${'b'.repeat(30)}`);
});

test('nearest returns the closest chunks first', () => {
  const lib = { chunks: ['x', 'y', 'z'], vectors: [[1, 0], [0, 1], [0.7, 0.7]].map((v) => Float32Array.from(v)) };
  assert.deepEqual(nearest(lib, [0, 2], 2), ['y', 'z']);
});

test("a manifest's ciphertext does not open as a library, nor the reverse", () => {
  const runner = devSecret('ed25519:test');
  const asManifest = seal(Buffer.from('{}'), publicKeyOf(runner), 'alice.near');
  const asLibrary = seal(Buffer.from('notes'), publicKeyOf(runner), libraryAad('alice.near'));
  assert.throws(() => open(asManifest, runner, libraryAad('alice.near')));
  assert.throws(() => open(asLibrary, runner, 'alice.near'));
  assert.equal(open(asLibrary, runner, libraryAad('alice.near')).toString(), 'notes');
});
