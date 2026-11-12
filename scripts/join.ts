// Seals an agent folder to a runner, ready to register. Usage: join.ts <agents/name> <runner url>
// The folder: agent.json (name, model, skills, rate, max_cost), expertise.md, method.md, knowledge/*.
// Writes <folder>/sealed.bin and prints the Register message; scripts/swarm.sh join sends it and uploads.
// Sponsor: SPONSOR in the environment, the NEAR account that registers. The agent is `<SPONSOR>/<name>`, and that
// id is bound into the seal: the materials open for this agent only.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { usdc } from '../node/src/rules.ts';
import { seal } from '../node/src/seal.ts';
import { readAgent } from './agent-folder.ts';

const [dir, runner] = process.argv.slice(2);
const sponsor = process.env.SPONSOR;
if (!dir || !runner || !sponsor) throw new Error('usage: SPONSOR=<account> join.ts <agent folder> <runner url>');
const { card, materials } = readAgent(dir);

if (!/^[a-z0-9-]{1,32}$/.test(card.name)) throw new Error(`agent.json name "${card.name}": 1-32 of a-z, 0-9 and -`);
if (!card.skills || card.skills.length > 500) throw new Error(`agent.json skills: 1 to 500 characters, the contract takes no more (this one has ${card.skills?.length ?? 0})`);
const id = `${sponsor}/${card.name}`;
const info = await (await fetch(`${runner}/info`, { signal: AbortSignal.timeout(20_000) })).json();
const sealed = seal(Buffer.from(JSON.stringify(materials)), Buffer.from(info.sealKey, 'hex'), id);
const size_mb = Math.max(1, Math.ceil(sealed.length / 2 ** 20));
if (size_mb > 10) throw new Error(`sealed materials are ${size_mb} MB: at most 10`);
writeFileSync(join(dir, 'sealed.bin'), sealed);

const hash = createHash('sha256').update(sealed).digest('hex');
const fee = BigInt(info.fees.audit_base) + BigInt(info.fees.audit_per_mb) * BigInt(size_mb);
const msg = { Register: { name: card.name, skills: card.skills, rate: `${usdc(card.rate)}`, max_cost: `${usdc(card.max_cost)}`, materials_hash: hash, size_mb } };
console.log(JSON.stringify({ id, msg, file: join(dir, 'sealed.bin'), least: `${fee + BigInt(info.fees.min_deposit)}` }));
