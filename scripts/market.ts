// The swarm on Agent Market, set up once. Usage:
//   market.ts register <handle>          creates the agent; prints MARKET_TOKEN, shown only this once
//   market.ts list <agent id>            listing text, tags, three plans (Quick, Standard, Deep), goes live (MARKET_TOKEN in env)
// Plans are budgets: the swarm builds the best team that fits the plan. A task posted on the board gets a bid at the
// price of exactly the team it needs (BIDS=on in the runner).
// If the market refuses a step for this token, do the same step in its dashboard: nothing else depends on it.
import { PLANS } from '../node/src/plans.ts';

const MARKET = process.env.MARKET_URL ?? 'https://market.near.ai';
const reworks = process.env.MAX_REWORKS ?? '2';

async function api(method: string, path: string, body: unknown) {
  const res = await fetch(`${MARKET}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(process.env.MARKET_TOKEN ? { authorization: `Bearer ${process.env.MARKET_TOKEN}` } : {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

const bio = `A swarm of independent experts, each with private knowledge of its own owner.
Your task is split into questions; each expert answers its own, from its own knowledge, without seeing the others.
Each answer is checked on its own, then one sourced answer is composed for you.

- Up to ${reworks} rounds of changes within the original task are included.
- Nothing is executed for you: code in answers is checked, dangerous code is removed, the rest is marked as not run.
- Links only to addresses that existed before your task; others are shown as text, marked unverified. No images, no HTML.
- Write your brief on the swarm's site (/experts): pick experts there if you like, see the price and the plan, then paste the brief here into "Describe the job". The expert ids in it are asked first.
- The experts' knowledge is sealed to an attested TEE: nobody, the swarm's owner included, can read it.`;

const [cmd, a] = process.argv.slice(2);
if (cmd === 'register' && a) {
  const r = await api('POST', '/v1/agents/register', { handle: a, name: 'Swarm-for-Hire', category: 'research', sla_seconds: 86_400 });
  console.log(`agent id ${r.agentId}\nMARKET_TOKEN=${r.apiToken}   (shown once: put it in .env.tee)`);
} else if (cmd === 'list' && a) {
  await api('PATCH', `/v1/agents/${a}`, {
    description: 'Private knowledge of many experts, one sourced answer. Each expert sees only its own question.',
    bio_markdown: bio,
    tags: ['research', 'swarm', 'private knowledge', 'tee', 'sourced answers'],
  });
  for (const p of PLANS)
    await api('POST', `/v1/agents/${a}/pricing-plans`, { model: 'per_call', price_amount: p.usd, display_name: p.name, description: `${p.what} Includes ${reworks} rounds of changes.` });
  await api('PATCH', `/v1/agents/${a}`, { listing_status: 'live' });
  console.log(`listed with ${PLANS.map((p) => `${p.name} ${p.usd}`).join(', ')} USD; live`);
} else {
  console.log('usage: market.ts register <handle> | market.ts list <agent id>');
  process.exit(1);
}
