// The runner: admits sponsors' agents and serves every hire through the swarm.
// The swarm adds up private knowledge of owners who do not trust each other. State lives on chain, on the
// market and in the store, so the runner can stop and start at any moment.
import { setTimeout as sleep } from 'node:timers/promises';
import { admit, useSeal, warm } from './admit.ts';
import * as chain from './chain.ts';
import { cfg, log, policyHash } from './config.ts';
import { refreshPrices } from './llm.ts';
import * as market from './market.ts';
import { bid, serve } from './round.ts';
import { listen, setState } from './server.ts';
import { bootKeys, waitForKey } from './tee.ts';

/** Runs `f` on every item; one item's failure is logged and does not stop the others. */
async function each<T>(items: T[], f: (x: T) => Promise<unknown>) {
  for (const x of items) await f(x).catch((e) => log('error', { error: String(e) }));
}

let paused = false;
async function tick() {
  const [agents, { fee_bps, runner }] = await Promise.all([chain.agents(), chain.config()]);
  if (paused !== (runner !== cfg.RUNNER_ACCOUNT)) log((paused = !paused) ? 'paused' : 'resumed', { runner });
  setState(paused ? 'paused' : 'ready');
  if (paused) return; // the owner stopped us: no audits, no rounds, nothing that costs money
  await refreshPrices();
  await each(agents.filter((a) => a.status === 'Pending'), admit);
  agents.forEach(warm);
  if (cfg.BIDS === 'on') await each(await market.board(), (job) => bid(job, agents, fee_bps));
  for (const row of await market.assignments()) serve(row, fee_bps);
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
