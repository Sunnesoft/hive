import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pdf } from '../../e2e/pdf.ts';
import { direct, linksIn, read, textOf, toText } from '../src/web.ts';

test('private, loopback and metadata addresses are refused before connecting', async () => {
  for (const url of ['https://127.0.0.1/', 'https://localhost/', 'http://169.254.169.254/latest/meta-data', 'https://10.0.0.1/', 'https://[::1]/']) {
    await assert.rejects(read(url), /not allowed|DNS lookup|ENOTFOUND/i, url);
  }
});

test('only https links of the brief are taken, at most ten', () => {
  const brief = 'see https://a.example/x, http://b.example/ and file:///etc/passwd ' + Array.from({ length: 12 }, (_, i) => `https://c${i}.example/`).join(' ');
  assert.deepEqual(linksIn(brief), ['https://a.example/x', ...Array.from({ length: 9 }, (_, i) => `https://c${i}.example/`)]);
});

test('links people paste are read where their content is: GitHub files and repos, public Google Docs and Sheets', () => {
  assert.equal(direct('https://github.com/near/near-sdk-rs/blob/master/README.md'), 'https://raw.githubusercontent.com/near/near-sdk-rs/master/README.md');
  assert.equal(direct('https://github.com/near/near-sdk-rs'), 'https://raw.githubusercontent.com/near/near-sdk-rs/HEAD/README.md');
  assert.equal(direct('https://docs.google.com/document/d/1AbC-d_9/edit?usp=sharing'), 'https://docs.google.com/document/d/1AbC-d_9/export?format=txt');
  assert.equal(direct('https://docs.google.com/spreadsheets/d/XyZ/edit#gid=0'), 'https://docs.google.com/spreadsheets/d/XyZ/export?format=csv');
  assert.equal(direct('https://example.com/spec.pdf'), 'https://example.com/spec.pdf');
});

test('files become text by what they are: PDF, HTML, Markdown; other kinds are refused', async () => {
  assert.match(await textOf(pdf(['Project Alpha budget is 42 thousand.']), 'application/pdf'), /42 thousand/);
  assert.match(await textOf(new TextEncoder().encode('# Notes\n\nplain'), '', 'notes.md'), /plain/);
  assert.match(await textOf(new TextEncoder().encode('<p>Body</p>'), 'text/html'), /Body/);
  await assert.rejects(textOf(new Uint8Array([0, 1, 2]), 'application/zip', 'x.zip'), /cannot read/);
});

test('HTML becomes text in its own thread; scripts do not survive', async () => {
  const text = await toText('<h1>Title</h1><script>alert(1)</script><p>Body</p>');
  assert.match(text, /TITLE|Title/);
  assert.match(text, /Body/);
  assert.doesNotMatch(text, /alert/);
});
