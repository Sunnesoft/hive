// The customers' page: live numbers and the price of an order as the contract counts it. Public data only.
import { $, getJSON, units, usd } from '/ui.js';

const [info, demand, experts] = await Promise.all([getJSON('/info'), getJSON('/demand'), getJSON('/agents')]);
const terms = info.pricing.order; // the contract's own numbers, in units: overhead, per_agent, run_secs

$('active').textContent = info.stats.active;
$('served').textContent = Object.values(demand).reduce((t, n) => t + (n.served ?? 0), 0);
$('earned').textContent = usd(experts.reduce((t, e) => t + BigInt(e.earned), 0n));

// As the contract charges a delivered order: the delivered experts' rates, the overhead, then the owner's fee.
const fee = BigInt(info.fees.fee_bps);
const charge = (rates) => {
  const cost = rates.reduce((s, r) => s + BigInt(r) + BigInt(terms.per_agent), BigInt(terms.overhead));
  return (cost * 10_000n + 9_999n - fee) / (10_000n - fee);
};
$('overhead').textContent = `${usd(terms.overhead)} + ${usd(terms.per_agent)} per expert that delivered`;
$('ownerFee').textContent = `${info.fees.fee_bps / 100}% to its owner`;
$('example').textContent = `${usd(charge(['1.00', '0.90', '0.60'].map(units)))} USDC`;
