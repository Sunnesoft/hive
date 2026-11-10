// Hiring, the customer's way: write the task, pick experts if you like, see the price, then hire the swarm on
// Agent Market with the brief copied and the steps spelled out. Payment and acceptance happen there.
import { $, ago, getJSON, h, quote, units, usd } from '/ui.js';

const [info, experts] = await Promise.all([getJSON('/info'), getJSON('/agents')]);
const { pricing } = info;
const picked = new Set();
const listing = pricing.listing; // the swarm's own page on Agent Market, when the runner knows it
$('open').href = listing ?? 'https://market.near.ai';
$('openHint').textContent = listing ? 'Its page opens in a new tab.' : 'Agent Market opens in a new tab: search for “Swarm-for-Hire” there.';

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
    experts.length ? 'No expert knows that yet. Hire anyway: the swarm tells builders what customers need.' : 'No experts yet. ', experts.length ? '' : h('a', { href: '/builders' }, 'Be the first'))]));
}

const task = () => $('task').value.trim();
const briefText = () => {
  const chosen = experts.filter((e) => picked.has(e.id));
  const body = task() || '<your task>';
  return chosen.length ? `${body}\n\nExperts: ${chosen.map((e) => e.id).join(', ')}` : body;
};
let plan = null; // the plan the brief fits, once experts are picked

function compose() {
  const chosen = experts.filter((e) => picked.has(e.id));
  $('picked').replaceChildren(...(chosen.length
    ? chosen.map((e) => h('button', { type: 'button', 'aria-label': `Remove ${e.id}`, onclick: () => (picked.delete(e.id), list(), compose()) }, e.id, cross()))
    : [h('span', { class: 'faint' }, 'None: the swarm picks all of them.')]));
  $('brief').textContent = briefText();
  $('f1').className = task() ? 'done' : 'now';
  $('f2').className = chosen.length ? 'done' : '';
  $('need').textContent = '';

  if (!chosen.length) {
    plan = null;
    $('barPrice').replaceChildren(h('span', {}, 'Plans from '), h('b', {}, `${Number(pricing.plans[0].usd)} USDC`));
    $('estimate').replaceChildren(h('b', {}, 'Choose a plan on Agent Market'),
      h('span', { class: 'muted' }, `${pricing.plans.map((p) => `${p.name} ${Number(p.usd)} USDC`).join(' · ')}. The swarm builds the best team the plan pays for, or bids on a task you post on the board.`));
    return;
  }
  const rates = chosen.reduce((s, e) => s + BigInt(e.rate), 0n);
  const overhead = BigInt(units(pricing.overhead)) + BigInt(units(pricing.per_agent)) * BigInt(chosen.length);
  const price = quote(chosen.map((e) => e.rate), pricing, info.fees.fee_bps);
  plan = pricing.plans.find((p) => BigInt(units(p.usd)) >= price) ?? null;
  const pct = (bps) => `${bps / 100}%`;
  $('barPrice').replaceChildren(h('span', {}, 'About '), h('b', {}, `${usd(price)} USDC`), h('span', { class: 'faint' }, plan ? ` · ${plan.name}` : ' · a bid'));
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

/** Copies text; where the clipboard API is not allowed (a page not on https), the old way, then selection. */
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const t = h('textarea', { class: 'sr', readonly: true }, text);
    document.body.append(t);
    t.select();
    const ok = document.execCommand?.('copy') ?? false;
    t.remove();
    return ok;
  }
}
function select(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  getSelection().removeAllRanges();
  getSelection().addRange(range);
}

async function hire() {
  if (!task()) {
    $('need').textContent = 'Write your task first: it is what the swarm answers.';
    $('task').focus();
    return;
  }
  const text = briefText();
  $('brief2').textContent = text;
  $('planPick').textContent = plan ? `the ${plan.name} plan, ${Number(plan.usd)} USDC` : 'a plan that fits your task';
  const ok = await copy(text);
  $('copied').replaceChildren(ok
    ? h('span', {}, h('b', {}, 'Your brief is copied.'), ' Paste it on Agent Market in step 3.')
    : h('span', {}, h('b', {}, 'Copy the brief below'), ' and paste it on Agent Market in step 3.'));
  if (!ok) select($('brief2'));
  $('compose').hidden = true;
  $('hire').hidden = false;
  $('bar').hidden = true;
  document.body.classList.remove('has-bar');
  $('f3').className = 'now';
  $('panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('hireTitle').focus({ preventScroll: true });
}

$('search').addEventListener('input', list);
$('task').addEventListener('input', compose);
$('next').addEventListener('click', hire);
$('barNext').addEventListener('click', hire);
$('back').addEventListener('click', () => {
  $('hire').hidden = true;
  $('compose').hidden = false;
  $('bar').hidden = false;
  document.body.classList.add('has-bar');
  $('f3').className = '';
  $('task').focus();
});
$('copyAgain').addEventListener('click', async () => {
  const ok = await copy($('brief2').textContent);
  $('copyAgain').textContent = ok ? 'Copied' : 'Select the brief above and copy it';
  if (!ok) select($('brief2'));
  setTimeout(() => ($('copyAgain').textContent = 'Copy the brief again'), 2000);
});
list();
compose();
