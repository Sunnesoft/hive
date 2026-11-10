// Sign-in with a NEAR wallet (NEP-413). The wallet signs "Swarm-for-Hire cabinet <account> <time>" for this
// contract with a full-access key of the account. We check the signature here first, so a forged request
// costs nothing, and only then ask the chain whether the key is a full-access key of that account.
// Nothing is stored: no sessions, no passwords. A signature is good for twelve hours: it opens statistics, never money.
import { createHash } from 'node:crypto';
import { PublicKey } from 'near-api-js';
import { z } from 'zod';
import { provider } from './chain.ts';
import { cfg } from './config.ts';

export const SignedIn = z.object({
  accountId: z.string().max(64),
  publicKey: z.string().startsWith('ed25519:'),
  signature: z.string().max(200), // base64, as wallets return it
  message: z.string().max(200),
  nonce: z.string().max(100), // base64 of 32 bytes
  callbackUrl: z.string().max(500).optional(), // redirect wallets sign it too
});
export type SignedIn = z.infer<typeof SignedIn>;

export const cabinetMessage = (account: string, at = new Date()) => `Swarm-for-Hire cabinet ${account} ${at.toISOString()}`;

const u32 = (n: number) => Buffer.from(new Uint32Array([n]).buffer); // little-endian, as borsh
const str = (s: string) => Buffer.concat([u32(Buffer.byteLength(s)), Buffer.from(s)]);

/** What a NEP-413 wallet signs: sha256 of the tag 2^31+413 and the borsh payload {message, nonce, recipient, callbackUrl}. */
export const nep413 = (message: string, nonce: Buffer, recipient: string, callbackUrl?: string) =>
  createHash('sha256')
    .update(Buffer.concat([u32(2 ** 31 + 413), str(message), nonce, str(recipient), callbackUrl === undefined ? Buffer.from([0]) : Buffer.concat([Buffer.from([1]), str(callbackUrl)])]))
    .digest();

/** The account that signed, or null. */
export async function signer(s: SignedIn): Promise<string | null> {
  const m = /^Swarm-for-Hire cabinet (\S+) (\S+)$/.exec(s.message);
  const age = m ? Date.now() - Date.parse(m[2]!) : NaN;
  const nonce = Buffer.from(s.nonce, 'base64');
  if (!m || m[1] !== s.accountId || !(age > -60_000 && age < 12 * 3_600_000) || nonce.length !== 32) return null;
  const signed = (() => {
    try {
      return PublicKey.fromString(s.publicKey).verify(nep413(s.message, nonce, cfg.CONTRACT, s.callbackUrl), Buffer.from(s.signature, 'base64'));
    } catch {
      return false;
    }
  })();
  if (!signed) return null;
  const key = await provider.viewAccessKey({ accountId: s.accountId, publicKey: s.publicKey }).catch(() => null);
  return key?.permission === 'FullAccess' ? s.accountId : null;
}
