// Sealing. A sponsor seals its materials to the runner's X25519 key; only the runner's TEE can open them.
// The sponsor's account is bound in as associated data, so a copy registered by anyone else does not open.
// Format: ephemeral public key (32) | nonce (12) | ciphertext | tag (16). The browser twin is node/ui/seal.js.
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import { x25519 } from '@noble/curves/ed25519';

const INFO = 'swarm-for-hire manifest v1'; // fixed: changing it breaks every sealed upload
const keyOf = (shared: Uint8Array, eph: Uint8Array, to: Uint8Array) =>
  Buffer.from(hkdfSync('sha256', shared, Buffer.concat([eph, to]), INFO, 32));

export const publicKeyOf = (secret: Uint8Array) => Buffer.from(x25519.getPublicKey(secret));

/** The runner's secret when there is no TEE: derived from its dev key, so one env var is enough. */
export const devSecret = (devKey: string) => createHash('sha256').update(`swarm seal|${devKey}`).digest();

export function seal(plain: Uint8Array, to: Uint8Array, sponsor: string): Buffer {
  const eph = x25519.utils.randomSecretKey();
  const ephPub = x25519.getPublicKey(eph);
  const nonce = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keyOf(x25519.getSharedSecret(eph, to), ephPub, to), nonce, { authTagLength: 16 }).setAAD(Buffer.from(sponsor));
  return Buffer.concat([ephPub, nonce, c.update(plain), c.final(), c.getAuthTag()]);
}

/** Throws if the bytes were not sealed to this key for this sponsor, or were changed. */
export function open(sealed: Uint8Array, secret: Uint8Array, sponsor: string): Buffer {
  const b = Buffer.from(sealed);
  if (b.length < 32 + 12 + 16) throw new Error('too short to be sealed');
  const [ephPub, nonce, body, tag] = [b.subarray(0, 32), b.subarray(32, 44), b.subarray(44, -16), b.subarray(-16)];
  const key = keyOf(x25519.getSharedSecret(secret, ephPub), ephPub, publicKeyOf(secret));
  const d = createDecipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 }).setAAD(Buffer.from(sponsor)).setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]);
}
