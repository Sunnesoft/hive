import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chunk, nearest, pack, unpack } from '../src/library.ts';

test('chunks pack paragraphs, cut long ones, never exceed the size', () => {
  const text = ['a'.repeat(30), 'b'.repeat(30), 'c'.repeat(95), 'd'.repeat(10)].join('\n\n');
  const parts = chunk(text, 64);
  assert.ok(parts.every((p) => p.length <= 64));
  assert.equal(parts.join('').replace(/\s/g, ''), text.replace(/\s/g, ''));
  assert.equal(parts[0], `${'a'.repeat(30)}\n\n${'b'.repeat(30)}`);
});

test('nearest returns the closest chunks first', () => {
  const lib = { chunks: ['x', 'y', 'z'], vectors: [[1, 0], [0, 1], [0.7, 0.7]].map((v) => Float32Array.from(v)) };
  assert.deepEqual(nearest(lib, [[0, 2]], 2), ['y', 'z']);
});

test('nearest with several queries gives each its best chunk before any gets its second', () => {
  const lib = { chunks: ['x', 'y', 'z'], vectors: [[1, 0], [0, 1], [0.7, 0.7]].map((v) => Float32Array.from(v)) };
  assert.deepEqual(nearest(lib, [[0, 1], [1, 0]], 2), ['y', 'x']); // not 'y' and its runner-up 'z'
  assert.deepEqual(nearest(lib, [[0, 1], [0, 1]], 2), ['y', 'z']); // the same best for both: then the next
  assert.deepEqual(nearest(lib, [[0, 1], [1, 0]], 5), ['y', 'x', 'z']); // never more than there are
});

test('an index packed for the disk comes back as it was, and bytes that are not an index are refused', () => {
  const vectors = [Float32Array.from([0.5, -0.25, 0.125]), Float32Array.from([1, 0, -1])];
  const back = unpack(pack(vectors));
  assert.deepEqual(back.map((v) => [...v]), vectors.map((v) => [...v]));
  assert.deepEqual(unpack(pack([])), []);
  assert.throws(() => unpack(pack(vectors).subarray(0, 12)), /not a packed index/);
});
