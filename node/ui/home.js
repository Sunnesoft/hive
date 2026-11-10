// The customers' page: live numbers, the plans and the price formula as the runner bids. Public data only.
import { $, getJSON, h, quote, units, usd } from '/ui.js';

const [info, demand, experts] = await Promise.all([getJSON('/info'), getJSON('/demand'), getJSON('/agents')]);
const { pricing } = info;

$('active').textContent = info.stats.active;
$('served').textContent = Object.values(demand).reduce((t, n) => t + (n.served ?? 0), 0);
$('earned').textContent = usd(experts.reduce((t, e) => t + BigInt(e.earned), 0n));

if (pricing.listing) for (const a of document.querySelectorAll('a.hire')) a.href = pricing.listing;
const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five'];
const rounds = `${WORDS[pricing.reworks] ?? pricing.reworks} round${pricing.reworks === 1 ? '' : 's'} of changes`;
$('reworks').textContent = `${rounds} included.`;
$('reworksTitle').textContent = rounds;

const featured = pricing.plans[Math.floor(pricing.plans.length / 2)]?.name;
const bid = $('planList').lastElementChild;
$('planList').replaceChildren(...pricing.plans.map((p) => h('div', { class: `plan${p.name === featured ? ' featured' : ''}` },
  p.name === featured ? h('span', { class: 'title' }, h('b', {}, p.name), h('span', { class: 'tag' }, 'most tasks')) : h('b', {}, p.name),
  h('span', { class: 'price' }, `${Number(p.usd)} `, h('small', {}, 'USDC')),
  h('span', {}, p.what))), bid);

const pct = (bps) => `${bps / 100}%`;
$('overhead').textContent = `${pricing.overhead} + ${pricing.per_agent} per expert`;
$('ownerFee').textContent = `${pct(info.fees.fee_bps)} runner`;
$('marketFee').textContent = `${pct(pricing.market_fee_bps)} Agent Market`;
$('example').textContent = `${usd(quote(['1.00', '0.90', '0.60'].map(units), pricing, info.fees.fee_bps))} USDC`;
