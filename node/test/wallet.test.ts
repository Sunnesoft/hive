import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { KeyPair, KeyPairSigner } from 'near-api-js';
import { cabinetMessage, nep413, signer } from '../src/wallet.ts';

const key = KeyPair.fromRandom('ed25519');

test('our NEP-413 digest is what a NEAR signer signs', async () => {
  const [message, nonce] = [cabinetMessage('alice.near'), randomBytes(32)];
  for (const callbackUrl of [undefined, 'https://swarm.example/cabinet.html']) {
    const signed = await new KeyPairSigner(key).signNep413Message('alice.near', { message, recipient: 'swarm.test.near', nonce, ...(callbackUrl ? { callbackUrl } : {}) });
    assert.ok(key.getPublicKey().verify(nep413(message, nonce, 'swarm.test.near', callbackUrl), signed.signature));
    assert.ok(!key.getPublicKey().verify(nep413(message, nonce, 'other.near', callbackUrl), signed.signature)); // bound to our contract
  }
});

test('a stale, foreign or malformed sign-in is refused before asking the chain', async () => {
  const signIn = async (account: string, at: Date, by = key) => {
    const [message, nonce] = [cabinetMessage(account, at), randomBytes(32)];
    const s = await new KeyPairSigner(by).signNep413Message(account, { message, recipient: 'swarm.test.near', nonce });
    return { accountId: account, publicKey: s.publicKey.toString(), signature: Buffer.from(s.signature).toString('base64'), message, nonce: nonce.toString('base64') };
  };
  assert.equal(await signer(await signIn('alice.near', new Date(Date.now() - 3_600_000))), null); // an hour old
  assert.equal(await signer({ ...(await signIn('alice.near', new Date())), accountId: 'bob.near' }), null); // someone else's message
  assert.equal(await signer({ ...(await signIn('alice.near', new Date())), signature: Buffer.alloc(64).toString('base64') }), null);
  assert.equal(await signer({ ...(await signIn('alice.near', new Date())), nonce: 'AA==' }), null);
});
