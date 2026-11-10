// The landing page: live numbers, demand, plans, and the runner's facts for anyone who checks. Public data only.
import { $, account, demandTable, getJSON, h, short, usd } from '/ui.js';

const [info, attestation, demand, experts] = await Promise.all([getJSON('/info'), getJSON('/attestation'), getJSON('/demand'), getJSON('/agents')]);

const sum = (k) => Object.values(demand).reduce((t, n) => t + (n[k] ?? 0), 0);
$('active').textContent = info.stats.active;
$('served').textContent = sum('served');
$('missing').textContent = sum('no_expert');
$('earned').textContent = usd(experts.reduce((t, e) => t + BigInt(e.earned), 0n));
demandTable($('demand'), demand);

if (info.pricing.listing) for (const a of [$('hireBtn'), $('marketLink')]) a.href = info.pricing.listing;
const board = $('plans').lastElementChild;
$('plans').replaceChildren(...info.pricing.plans.map((p) => h('div', { class: 'plan' }, h('b', {}, p.name), h('span', { class: 'price' }, `${Number(p.usd)} USDC`), h('span', { class: 'muted' }, p.what))), board);
$('reworks').textContent = `${info.pricing.reworks} rounds of changes within your task are included in every plan.`;

Object.assign($('tee'), { textContent: attestation.dev ? 'development: no TEE' : 'TEE quote', className: `pill ${attestation.dev ? 'warn' : 'ok'}` });
$('netName').textContent = info.network;
$('contract').replaceChildren(account(info.network, info.contract));
$('token').replaceChildren(account(info.network, info.token));
$('sealKey').textContent = info.sealKey;
$('policies').textContent = short(attestation.policies, 10);
$('policies').title = attestation.policies;
