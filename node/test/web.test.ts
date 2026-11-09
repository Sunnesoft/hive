import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FetchInput, fetchText } from '../src/web.ts';

test('only https URLs reach the tool', () => {
  assert.equal(FetchInput.safeParse({ url: 'http://169.254.169.254/latest/meta-data' }).success, false);
  assert.equal(FetchInput.safeParse({ url: 'file:///etc/passwd' }).success, false);
  assert.equal(FetchInput.safeParse({ url: 'https://example.com/' }).success, true);
});

test('private, loopback and metadata addresses are refused before connecting', async () => {
  for (const url of ['https://127.0.0.1/', 'https://localhost/', 'https://169.254.169.254/', 'https://10.0.0.1/', 'https://[::1]/']) {
    await assert.rejects(fetchText(url), /not allowed|DNS lookup/i, url);
  }
});
