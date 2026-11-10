import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchPage, linksIn, toText } from '../src/web.ts';

test('private, loopback and metadata addresses are refused before connecting', async () => {
  for (const url of ['https://127.0.0.1/', 'https://localhost/', 'http://169.254.169.254/latest/meta-data', 'https://10.0.0.1/', 'https://[::1]/']) {
    await assert.rejects(fetchPage(url), /not allowed|DNS lookup|ENOTFOUND/i, url);
  }
});

test('only https links of the brief are taken, at most five', () => {
  const brief = 'see https://a.example/x, http://b.example/ and file:///etc/passwd ' + [1, 2, 3, 4, 5].map((i) => `https://c${i}.example/`).join(' ');
  assert.deepEqual(linksIn(brief), ['https://a.example/x', 'https://c1.example/', 'https://c2.example/', 'https://c3.example/', 'https://c4.example/']);
});

test('HTML becomes text in its own thread; scripts do not survive', async () => {
  const text = await toText('<h1>Title</h1><script>alert(1)</script><p>Body</p>');
  assert.match(text, /TITLE|Title/);
  assert.match(text, /Body/);
  assert.doesNotMatch(text, /alert/);
});
