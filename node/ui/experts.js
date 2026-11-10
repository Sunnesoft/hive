// The public catalog: active experts with their record; a brief with the experts the customer picked, and its price.
import { $, ago, copyButtons, getJSON, h, quote, usd } from '/ui.js';

const [info, experts] = await Promise.all([getJSON('/info'), getJSON('/agents')]);
if (info.pricing.listing) $('hire').href = info.pricing.listing;
const picked = new Set();

function card(e) {
  const rate = e.picked ? Math.round((100 * e.delivered) / e.picked) : null;
  const box = h('input', { type: 'checkbox', id: `x-${e.id}`, checked: picked.has(e.id), onchange: () => (box.checked ? picked.add(e.id) : picked.delete(e.id), compose()) });
  return h('label', { class: 'expert', for: `x-${e.id}` },
    box,
    h('div', {},
      h('div', { class: 'row' }, h('span', { class: 'mono' }, e.id), h('span', { class: 'price' }, `${usd(e.rate)} USDC`)),
      h('p', {}, e.skills),
      h('div', { class: 'faint' }, e.picked ? `${e.delivered} of ${e.picked} tasks delivered (${rate}%) · last ${ago(e.last)}` : 'new: no tasks yet')));
}

function list() {
  const q = $('search').value.trim().toLowerCase();
  const shown = experts.filter((e) => !q || `${e.id} ${e.skills}`.toLowerCase().includes(q));
  $('list').replaceChildren(...(shown.length ? shown.map(card) : [h('p', { class: 'muted' }, experts.length ? 'No expert matches.' : 'No experts yet. Be the first: ', experts.length ? '' : h('a', { href: '/app' }, 'create one'))]));
}

function compose() {
  const chosen = experts.filter((e) => picked.has(e.id));
  $('picked').replaceChildren(...(chosen.length
    ? chosen.map((e) => h('button', { type: 'button', 'aria-pressed': 'true', title: 'Remove', onclick: () => (picked.delete(e.id), list(), compose()) }, `${e.id} ×`))
    : [h('span', { class: 'faint' }, 'none: the swarm chooses')]));
  const task = $('task').value.trim() || '<your task>';
  $('brief').textContent = chosen.length ? `${task}\n\nExperts: ${chosen.map((e) => e.id).join(', ')}` : task;

  if (!chosen.length) {
    $('estimate').replaceChildren(h('b', {}, 'Pick a plan on Agent Market.'), h('span', { class: 'muted' }, `${info.pricing.plans.map((p) => `${p.name} ${Number(p.usd)} USDC`).join(' · ')}. The swarm builds the best team the plan pays for, or bids on a task you post on the board.`));
    return;
  }
  const price = quote(chosen.map((e) => e.rate), info.pricing, info.fees.fee_bps);
  const plan = info.pricing.plans.find((p) => BigInt(Math.round(Number(p.usd) * 1e6)) >= price);
  $('estimate').replaceChildren(
    h('b', {}, `About ${usd(price)} USDC for these ${chosen.length} expert${chosen.length > 1 ? 's' : ''}.`),
    h('span', { class: 'muted' }, plan ? `The ${plan.name} plan (${Number(plan.usd)} USDC) covers them; the swarm may add experts the task needs within it.` : `Above the largest plan: post the task on the board with a budget of ${usd(price)} USDC or more.`),
  );
}

$('search').addEventListener('input', list);
$('task').addEventListener('input', compose);
copyButtons();
list();
compose();
