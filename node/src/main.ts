// The runner: admits sponsors' agents and serves every hire through the swarm.
// The swarm adds up private knowledge of owners who do not trust each other. State lives on chain, on the
// market and in the store, so the runner can stop and start at any moment.
import { setTimeout as sleep } from 'node:timers/promises';
import { admit, useSeal, warm } from './admit.ts';
import * as chain from './chain.ts';
import { cfg, policyHash } from './config.ts';
import { log } from './log.ts';
import { overBudget, refreshPrices } from './llm.ts';
import * as market from './market.ts';
import * as orders from './orders.ts';
import { bid, serve } from './round.ts';
import { listen, setState } from './server.ts';
import { bootKeys, waitForKey } from './tee.ts';

/** Runs `f` on every item; one item's failure is logged and does not stop the others. */
async function each<T>(items: T[], f: (x: T) => Promise<unknown>) {
  for (const x of items) await f(x).catch((e) => log('error', { error: String(e) }));
}

let [paused, broke] = [false, false];
async function tick() {
  const [agents, config] = await Promise.all([chain.agents(), chain.config()]);
  const { fee_bps, runner } = config;
  if (paused !== (runner !== cfg.RUNNER_ACCOUNT)) log((paused = !paused) ? 'paused' : 'resumed', { runner });
  if (!paused && broke !== (await overBudget())) log((broke = !broke) ? 'out_of_budget' : 'in_budget', { daily_usd: cfg.DAILY_BUDGET_USD });
  setState(paused ? 'paused' : broke ? 'out_of_budget' : 'ready');
  if (paused || broke) return; // the owner stopped us, or today's money is spent: no audits, no rounds, nothing that costs money
  await refreshPrices();
  await each(agents.filter((a) => a.status === 'Pending'), admit);
  agents.forEach(warm);
  // The two doors, each on its own: one being down does not stop the other.
  await each([
    async () => {
      const open = await chain.orders();
      for (const row of await orders.rows(open)) serve(row, fee_bps, orders.door(config));
      orders.sweep(open);
    },
    async () => {
      if (!cfg.MARKET_TOKEN) return;
      if (cfg.BIDS === 'on') await each(await market.board(), (job) => bid(job, agents, fee_bps));
      for (const row of await market.assignments()) serve(row, fee_bps);
    },
  ], (door) => door());
}

const keys = await bootKeys();
useSeal(keys.seal);
chain.useKey(keys.key);
const server = await listen(keys.attestation);
log('attest', { url: `http://0.0.0.0:${(server.address() as { port: number }).port}/attestation`, ...keys.attestation });
setState('waiting_for_key');
await waitForKey(keys.key.getPublicKey().toString()); // powerless until the owner has checked the attestation
setState('ready');
log('ready', { runner: cfg.RUNNER_ACCOUNT, contract: cfg.CONTRACT, sealKey: keys.attestation.sealKey, policies: policyHash });
for (;;) {
  await tick().catch((e) => log('error', { error: String(e) }));
  await sleep(cfg.POLL_MS);
}
