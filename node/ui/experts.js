// Hiring, the customer's way: write the task, pick experts if you like, see the price, then hire the swarm on
// Agent Market with the brief copied and the steps spelled out. Payment and acceptance happen there.
// Or the same brief goes to /order: the customer pays into the contract from a wallet and the contract settles.
import { $, account, ago, askList, getJSON, h, icon, quote, topicChips, topicName, units, usd } from '/ui.js';

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

// How well an expert's public profile matches the task, in shared words: a hint for the customer, free, in the
// browser. The swarm's own choice is made by its router, with the whole task in view.
const STOP = new Set('about after also because been before being could does doing done each from have here into just know like make many more most much need only other over please same should some such tell than that their them then there these they this those very want what when where which while will with would your'.split(' '));
const stem = (w) => (w.length > 5 ? w.slice(0, 5) : w);
const words = (text) => new Set((text.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []).filter((w) => !STOP.has(w)));
function match(e, asked) {
  if (!asked.size) return [];
  const mine = new Map([...words(`${e.skills} ${e.examples.join(' ')} ${e.topics.map(topicName).join(' ')}`)].map((w) => [stem(w), w]));
  return [...new Set([...asked].map(stem))].filter((s) => mine.has(s)).map((s) => mine.get(s));
}
let topic = ''; // the topic filter, '' for all

function card(e, hits) {
  const box = h('input', { type: 'checkbox', id: `x-${e.id}`, checked: picked.has(e.id), onchange: () => (box.checked ? picked.add(e.id) : picked.delete(e.id), compose()) });
  const record = e.picked
    ? [h('span', {}, h('b', {}, e.picked), e.picked === 1 ? ' task' : ' tasks'), h('span', {}, h('b', {}, `${Math.round((100 * e.delivered) / e.picked)}%`), ' delivered'), h('span', {}, `last ${ago(e.last)}`)]
    : [h('span', {}, 'new: no tasks yet')];
  return h('li', {}, h('label', { class: 'expert', for: `x-${e.id}` },
    box,
    h('span', { class: 'body' },
      h('span', { class: 'idline' }, h('span', { class: 'mono' }, e.id), topicChips(e.topics)),
      hits.length ? h('span', { class: 'fits' }, icon('check'), `Fits your task: ${hits.slice(0, 4).join(', ')}`) : '',
      h('span', { class: 'skills' }, e.skills),
      askList(e.examples),
      h('span', { class: 'stats' }, record,
        e.checked ? h('span', { class: 'checked', title: 'The audit read its sealed files: they back this profile.' }, icon('check'), 'profile checked by the audit') : '',
        h('span', {}, 'by ', account(info.network, e.owner)))),
    h('span', { class: 'rate' }, h('b', {}, usd(e.rate)), h('span', {}, 'USDC a task'))));
}

function filters() {
  const counts = new Map();
  for (const e of experts) for (const t of e.topics) counts.set(t, (counts.get(t) ?? 0) + 1);
  const chip = (t, label, n) => h('button', { type: 'button', 'aria-pressed': String(topic === t), onclick: () => ((topic = t), filters(), list()) }, label, h('span', { class: 'n' }, n));
  $('topics').replaceChildren(...(counts.size ? [chip('', 'All', experts.length), ...[...counts].sort((a, b) => b[1] - a[1]).map(([t, n]) => chip(t, topicName(t), n))] : []));
}

function list() {
  const q = $('search').value.trim().toLowerCase();
  const asked = words(task());
  const shown = experts
    .filter((e) => (!topic || e.topics.includes(topic)) && (!q || `${e.id} ${e.skills} ${e.examples.join(' ')} ${e.topics.map(topicName).join(' ')}`.toLowerCase().includes(q)))
    .map((e) => ({ e, hits: match(e, asked) }))
    .sort((a, b) => b.hits.length - a.hits.length); // stable: most delivered first among equals
  $('count').textContent = `${shown.length} of ${experts.length} expert${experts.length === 1 ? '' : 's'} · ${asked.size ? 'best fit for your task first' : 'most delivered first'}`;
  $('list').replaceChildren(...(shown.length ? shown.map(({ e, hits }) => card(e, hits)) : [h('li', { class: 'muted' },
    experts.length ? 'No expert knows that yet. Hire anyway: the swarm tells builders what customers need.' : 'No experts yet. ', experts.length ? '' : h('a', { href: '/builders' }, 'Be the first'))]));
}

function task() {
  return $('task').value.trim();
}
/** The material links the customer listed: https only, one per line, as the runner will read them. */
const links = () => [...new Set($('links').value.split(/\s+/).map((l) => l.trim()).filter((l) => /^https:\/\/\S+$/.test(l)))].slice(0, 10);
const briefText = () => {
  const chosen = experts.filter((e) => picked.has(e.id));
  const parts = [task() || '<your task>'];
  if (links().length) parts.push(`Materials:\n${links().map((l) => `- ${l}`).join('\n')}`);
  if (chosen.length) parts.push(`Experts: ${chosen.map((e) => e.id).join(', ')}`);
  return parts.join('\n\n');
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

/** The same brief as an order in the contract: its budget covers the picked experts, or the smallest plan. */
function orderOnChain() {
  if (!task()) {
    $('need').textContent = 'Write your task first: it is what the swarm answers.';
    $('task').focus();
    return;
  }
  const chosen = experts.filter((e) => picked.has(e.id));
  const cost = chosen.reduce((s, e) => s + BigInt(e.rate) + BigInt(pricing.order.per_agent), BigInt(pricing.order.overhead));
  const cents = (cost * 10_000n / BigInt(10_000 - info.fees.fee_bps) + 9_999n) / 10_000n; // with the owner's fee on top, up to a cent
  const amount = chosen.length ? `${cents / 100n}.${`${cents % 100n}`.padStart(2, '0')}` : Number(pricing.plans[0].usd).toFixed(2);
  sessionStorage.setItem('swarm.order', JSON.stringify({ brief: briefText(), amount }));
  location.href = '/order';
}
$('chainHint').textContent = `The contract pays the experts and returns the rest. No marketplace fee; one answer, no changes or disputes; your task is public on chain.`;
$('chain').addEventListener('click', orderOnChain);
$('search').addEventListener('input', list);
$('task').addEventListener('input', () => (compose(), list()));
$('links').addEventListener('input', compose);
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
filters();
list();
compose();
