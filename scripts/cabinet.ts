// The sponsor's cabinet from the command line, signed with the account's key from ~/.near-credentials
// (near-cli-rs `save-to-legacy-keychain`), exactly as a wallet signs it in the app. With --orders: a customer's
// own orders placed in the contract, with their answers, as on /order. Usage:
//   node --experimental-strip-types scripts/cabinet.ts <account> <runner url> [testnet|mainnet] [--orders]
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { KeyPair, KeyPairSigner, type KeyPairString } from 'near-api-js';

const orders = process.argv.includes('--orders');
const [account, runner, network = account?.endsWith('.near') ? 'mainnet' : 'testnet'] = process.argv.slice(2).filter((a) => a !== '--orders');
if (!account || !runner) throw new Error('usage: cabinet.ts <account> <runner url> [testnet|mainnet] [--orders]');
const { private_key } = JSON.parse(readFileSync(join(homedir(), '.near-credentials', network, `${account}.json`), 'utf8'));
const info = await (await fetch(`${runner}/info`)).json();
const [message, nonce] = [`Swarm-for-Hire cabinet ${account} ${new Date().toISOString()}`, randomBytes(32)];
const signed = await new KeyPairSigner(KeyPair.fromString(private_key as KeyPairString)).signNep413Message(account, { message, recipient: info.contract, nonce });
const body = { accountId: account, publicKey: signed.publicKey.toString(), signature: Buffer.from(signed.signature).toString('base64'), message, nonce: nonce.toString('base64') };
const res = await fetch(`${runner}/${orders ? 'orders' : 'cabinet'}`, { method: 'POST', body: JSON.stringify(body) });
console.log(JSON.stringify(await res.json(), null, 2));
process.exit(res.ok ? 0 : 1);
