import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, test } from 'node:test';

// A fake IPFS gateway: serves whatever bytes we put under a CID.
const files = new Map<string, Buffer>();
const gateway = createServer((req, res) => {
  const body = files.get(req.url!.replace('/ipfs/', ''));
  res.writeHead(body ? 200 : 404).end(body);
});
await new Promise<void>((ok) => gateway.listen(0, '127.0.0.1', ok));
process.env.IPFS_GATEWAY = `http://127.0.0.1:${(gateway.address() as AddressInfo).port}`;
after(() => gateway.close());

const { cidOf, InvalidManifest, load } = await import('../src/manifest.ts');
const { allowedModels } = await import('../src/config.ts');
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const put = (json: unknown, served?: Buffer) => {
  const bytes = Buffer.from(typeof json === 'string' ? json : JSON.stringify(json));
  files.set(cidOf(sha(bytes)), served ?? bytes);
  return sha(bytes);
};

test('the CID is the sha256 of the file (CIDv1, raw)', () => {
  const empty = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  assert.equal(cidOf(empty), 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku');
});

test('a valid manifest loads with defaults', async () => {
  const m = await load(put({ name: 'ok', model: allowedModels[0], system: 'Answer.' }));
  assert.deepEqual([m.knowledge, m.tools, m.maxSteps], ['', [], 4]);
});

test("the sponsor's fault denies the agent", async () => {
  for (const bad of ['not json', { name: 'x', model: 'evil/model', system: 's' }, { name: 'x', model: allowedModels[0], system: 's', extra: 1 }]) {
    await assert.rejects(load(put(bad)), InvalidManifest);
  }
});

test('a network fault is retried later, not held against the sponsor', async () => {
  const missing = 'ab'.repeat(32);
  await assert.rejects(load(missing), (e) => !(e instanceof InvalidManifest));
  const swapped = put({ name: 'x' }, Buffer.from('something else'));
  await assert.rejects(load(swapped), (e) => !(e instanceof InvalidManifest) && /wrong bytes/.test(String(e)));
});
