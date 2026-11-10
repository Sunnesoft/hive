// Sealing in the browser, the twin of node/src/seal.ts (test/seal.test.ts keeps them in step):
// X25519 + HKDF-SHA256 + AES-256-GCM, the sponsor's account as associated data.
// Output: ephemeral public key (32) | nonce (12) | ciphertext | tag (16).
const utf8 = (s) => new TextEncoder().encode(s);
const INFO = utf8('swarm-for-hire manifest v1');
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((at, p) => (out.set(p, at), at + p.length), 0);
  return out;
};
export const fromHex = (hex) => Uint8Array.from(hex.match(/../g) ?? [], (b) => parseInt(b, 16));
export const toHex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const sha256 = async (bytes) => toHex(await crypto.subtle.digest('SHA-256', bytes));

/** Seals `plain` (bytes) to the runner's seal key (hex) for `sponsor` (a NEAR account). */
export async function seal(plain, sealKeyHex, sponsor) {
  const to = fromHex(sealKeyHex);
  const eph = await crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
  const ephPub = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey));
  const peer = await crypto.subtle.importKey('raw', to, { name: 'X25519' }, false, []);
  const shared = await crypto.subtle.deriveBits({ name: 'X25519', public: peer }, eph.privateKey, 256);
  const ikm = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  const params = { name: 'HKDF', hash: 'SHA-256', salt: concat(ephPub, to), info: INFO };
  const key = await crypto.subtle.deriveKey(params, ikm, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const body = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: utf8(sponsor) }, key, plain);
  return concat(ephPub, nonce, new Uint8Array(body));
}
