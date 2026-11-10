// The public catalog: active experts with their record; a brief with the experts the customer picked, and its price.
import { $, ago, getJSON, h, quote, units, usd } from '/ui.js';

const [info, experts] = await Promise.all([getJSON('/info'), getJSON('/agents')]);
const { pricing } = info;
if (pricing.listing) for (const a of document.querySelectorAll('a.hire')) a.href = pricing.listing;
const picked = new Set();

/** The ✕ on a picked expert: SVG needs its own namespace, so not h(). */
function cross() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', 'M6 6l12 12M18 6L6 18');
  svg.append(p);
  return svg;
}

function card(e) {
  const box = h('input', { type: 'checkbox', id: `x-${e.id}`, checked: picked.has(e.id), onchange: () => (box.checked ? picked.add(e.id) : picked.delete(e.id), compose()) });
  const record = e.picked
    ? [h('span', {}, h('b', {}, e.picked), e.picked === 1 ? ' task' : ' tasks'), h('span', {}, h('b', {}, `${Math.round((100 * e.delivered) / e.picked)}%`), ' delivered'), h('span', {}, `last ${ago(e.last)}`)]
    : [h('span', {}, 'new: no tasks yet')];
  return h('li', {}, h('label', { class: 'expert', for: `x-${e.id}` },
    box,
    h('span', { class: 'body' },
      h('span', { class: 'idline' }, h('span', { class: 'mono' }, e.id)),
      h('span', { class: 'skills' }, e.skills),
      h('span', { class: 'stats' }, record)),
    h('span', { class: 'rate' }, h('b', {}, usd(e.rate)), h('span', {}, 'USDC a task'))));
}

function list() {
  const q = $('search').value.trim().toLowerCase();
  const shown = experts.filter((e) => !q || `${e.id} ${e.skills}`.toLowerCase().includes(q));
  $('count').textContent = `${shown.length} of ${experts.length} expert${experts.length === 1 ? '' : 's'} · most delivered first`;
  $('list').replaceChildren(...(shown.length ? shown.map(card) : [h('li', { class: 'muted' },
    experts.length ? 'No expert knows that yet. Post the task anyway: the swarm tells builders what customers need.' : 'No experts yet. ', experts.length ? '' : h('a', { href: '/builders' }, 'Be the first'))]));
}

function compose() {
  const chosen = experts.filter((e) => picked.has(e.id));
  $('picked').replaceChildren(...(chosen.length
    ? chosen.map((e) => h('button', { type: 'button', 'aria-label': `Remove ${e.id}`, onclick: () => (picked.delete(e.id), list(), compose()) }, e.id, cross()))
    : [h('span', { class: 'faint' }, 'None: the swarm picks all of them.')]));
  const task = $('task').value.trim() || '<your task>';
  $('brief').textContent = chosen.length ? `${task}\n\nExperts: ${chosen.map((e) => e.id).join(', ')}` : task;

  if (!chosen.length) {
    $('planName').textContent = 'a plan';
    $('estimate').replaceChildren(h('b', {}, 'Pick a plan on Agent Market'),
      h('span', { class: 'muted' }, `${pricing.plans.map((p) => `${p.name} ${Number(p.usd)} USDC`).join(' · ')}. The swarm builds the best team the plan pays for, or bids on a task you post on the board.`));
    return;
  }
  const rates = chosen.reduce((s, e) => s + BigInt(e.rate), 0n);
  const overhead = BigInt(units(pricing.overhead)) + BigInt(units(pricing.per_agent)) * BigInt(chosen.length);
  const price = quote(chosen.map((e) => e.rate), pricing, info.fees.fee_bps);
  const plan = pricing.plans.find((p) => BigInt(units(p.usd)) >= price);
  $('planName').textContent = plan ? plan.name : 'the board';
  const pct = (bps) => `${bps / 100}%`;
  $('estimate').replaceChildren(
    h('dl', { class: 'sum-list' },
      h('dt', {}, 'Experts\' rates'), h('dd', {}, usd(rates)),
      h('dt', {}, `Swarm, ${pricing.overhead} + ${pricing.per_agent} per expert`), h('dd', {}, usd(overhead)),
      h('dt', {}, `Fees, ${pct(info.fees.fee_bps)} runner + ${pct(pricing.market_fee_bps)} market`), h('dd', {}, usd(price - rates - overhead))),
    h('hr'),
    h('div', { class: 'total' }, h('span', {}, 'About'), h('span', { class: 'num-big' }, `${usd(price)} `, h('small', {}, 'USDC')),
      h('span', { class: `pill ${plan ? 'ok' : 'honey'}` }, plan ? `fits ${plan.name}, ${Number(plan.usd)}` : 'post for a bid')),
    h('span', { class: 'faint' }, `The swarm may add an expert your task needs, within the plan. ${['No', 'One', 'Two', 'Three', 'Four', 'Five'][pricing.reworks] ?? pricing.reworks} round${pricing.reworks === 1 ? '' : 's'} of changes included.`),
  );
}

$('search').addEventListener('input', list);
$('task').addEventListener('input', compose);
$('copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('brief').textContent).catch(() => {});
  $('copy').textContent = 'Copied';
  setTimeout(() => ($('copy').textContent = 'Copy brief'), 1500);
});
list();
compose();
