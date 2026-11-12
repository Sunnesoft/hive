// Ordering on chain. The task's text goes to the runner; the customer's wallet sends USDC with the hash of that
// text into the contract; the swarm answers; the contract pays the experts that delivered and sends the rest back.
// A NEP-413 signature, the same one as in the builder's app, shows the customer its own orders and their
// answers: nobody else's.
import nc from '/vendor/near-connect.js';
import { $, account, busy, getJSON, h, hex, icon, markdown, say, short, units, usd } from '/ui.js';

const MAX_BRIEF = 10_000; // characters, as the runner takes it
const info = await getJSON('/info');
const terms = info.pricing.order; // the contract's own numbers: overhead, per_agent, run_secs
const status = (text, kind) => say($('status'), text, kind);
Object.assign($('network'), { textContent: info.network, className: `pill ${info.network === 'mainnet' ? 'ok' : 'info'}` });
const connector = new nc.NearConnector({ network: info.network === 'mainnet' ? 'mainnet' : 'testnet' });
const minutes = Math.round(terms.run_secs / 60);
$('timeout').textContent = `Not answered in ${minutes >= 1 ? `${minutes} minutes` : `${terms.run_secs} seconds`}: anyone can send it back to you.`;

// ---- the draft: from the experts page, or typed here ----
const DRAFT = 'swarm.order';
const draft = JSON.parse(sessionStorage.getItem(DRAFT) ?? 'null');
if (draft?.brief) $('brief').value = draft.brief;
if (draft?.amount) $('amount').value = draft.amount;
const brief = () => $('brief').value.trim();
const toHex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
/** What the order's hash commits to: a random salt, so a short task cannot be guessed from its hash, then the text. */
const briefHash = async (salt, text) => toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}\n${text}`))));
const json = (body) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
// Tasks handed to the runner from this browser, by hash, until their orders are answered: to send one again if it got lost.
const SENT = 'swarm.briefs';
const sent = () => JSON.parse(localStorage.getItem(SENT) ?? '{}');
const keep = (hash, value) => localStorage.setItem(SENT, JSON.stringify(Object.fromEntries(Object.entries({ ...sent(), [hash]: value }).filter(([, v]) => v).slice(-20))));
const amount = () => { try { return BigInt(units($('amount').value)); } catch { return null; } };

// ---- session: the same signature as the builder's app, good for 12 hours ----
const SESSION = 'swarm.session';
let me = null;
let session = JSON.parse(localStorage.getItem(SESSION) ?? 'null'); // { account, body, at }
const fresh = (s) => s && s.account === me && Date.now() - s.at < 11 * 3_600_000;
const b64 = (b) => btoa(String.fromCharCode(...b));
async function signIn() {
  const [message, nonce] = [`Swarm-for-Hire cabinet ${me} ${new Date().toISOString()}`, crypto.getRandomValues(new Uint8Array(32))];
  const signed = await (await connector.wallet()).signMessage({ message, recipient: info.contract, nonce });
  session = { account: me, at: Date.now(), body: { ...signed, accountId: me, message, nonce: b64(nonce) } };
  localStorage.setItem(SESSION, JSON.stringify(session));
}
const mine = () => getJSON('/orders', json(session.body));
async function load() {
  if (!fresh(session)) await signIn();
  return mine().catch(async (e) => {
    if (e.status !== 401) throw e;
    await signIn(); // expired or from another wallet: sign again once
    return mine();
  });
}

function signedIn(id) {
  me = id;
  $('who').replaceChildren(hex(id[0] ?? '?'), h('span', {}, short(id, 12)));
  Object.assign($('who'), { title: id, hidden: false });
  $('connect').hidden = true;
  $('disconnect').hidden = false;
  form();
  refresh().catch((e) => status(`Could not load your orders: ${e?.message ?? e}`, 'bad'));
}
connector.on('wallet:signIn', (e) => signedIn(e.accounts[0].accountId));
connector.on('wallet:signOut', () => (localStorage.removeItem(SESSION), location.reload()));
connector.wallet().then((w) => w.getAccounts()).then((a) => a?.[0] && signedIn(a[0].accountId), () => {}); // connected before
async function connect(button) {
  busy(button, true);
  try {
    await connector.connect();
    status('');
  } catch (e) {
    status(`Could not connect: ${e?.message ?? e}`, 'bad');
  } finally {
    busy(button, false);
  }
}
$('connect').onclick = () => connect($('connect'));
$('disconnect').onclick = () => connector.disconnect().then(() => (localStorage.removeItem(SESSION), location.reload()));

// ---- the form ----
const call = async (receiverId, methodName, args, deposit = '0') =>
  (await connector.wallet()).signAndSendTransaction({ receiverId, actions: [{ type: 'FunctionCall', params: { methodName, args, gas: '100000000000000', deposit } }] });

function form() {
  const [size, a] = [brief().length, amount()];
  $('size').textContent = size > MAX_BRIEF ? `${size} of ${MAX_BRIEF} characters: too long` : size > MAX_BRIEF / 2 ? `${size} of ${MAX_BRIEF} characters` : '';
  $('place').textContent = me ? (a ? `Place order: ${usd(a)} USDC` : 'Place order') : 'Connect wallet';
  $('amountHint').textContent = `The most this task may cost. You pay the rates of the experts that delivered, ${usd(terms.overhead)} + ${usd(terms.per_agent)} per expert for the swarm and ${info.fees.fee_bps / 100}% to its owner; the rest returns to your wallet by itself.`;
}
async function place() {
  if (!me) return connect($('place'));
  const [text, a] = [brief(), amount()];
  if (!text) return (status('Write your task first: it is what the swarm answers.', 'bad'), $('brief').focus());
  if (text.length > MAX_BRIEF) return status(`The task is too long: ${text.length} of ${MAX_BRIEF} characters. Shorten it, or put the details behind a link.`, 'bad');
  if (!a || a <= BigInt(terms.overhead)) return (status(`The budget must be above ${usd(terms.overhead)} USDC, or it could pay no expert.`, 'bad'), $('amount').focus());
  busy($('place'), true);
  try {
    // The text first, to the runner; then the money, with the hash that names the text. The runner cannot swap it:
    // the hash is computed here as well.
    const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await briefHash(salt, text);
    if ((await getJSON('/brief', json({ salt, brief: text }))).hash !== hash) throw new Error('the runner named the task by another hash');
    keep(hash, { salt, brief: text });
    status('Confirm the payment in your wallet…', 'wait');
    await call(info.token, 'ft_transfer_call', { receiver_id: info.contract, amount: `${a}`, msg: JSON.stringify({ Order: $('publish').checked ? { hash, salt, brief: text } : { hash } }) }, '1');
    sessionStorage.removeItem(DRAFT);
    $('brief').value = '';
    status('Your order is in the contract. The swarm takes it within a minute; the answer appears below.', 'ok');
    watch(30);
  } catch (e) {
    status(`The order was not placed: ${e?.message ?? e}`, 'bad');
  } finally {
    busy($('place'), false);
    form();
  }
}
$('brief').addEventListener('input', form);
$('amount').addEventListener('input', form);
$('place').onclick = place;

// ---- the customer's orders ----
const STATE = { no_brief: ['warn', 'the task\'s text is missing'], waiting: ['info', 'waiting for the swarm'], working: ['honey', 'experts at work'], delivered: ['ok', 'answered'], declined: ['warn', 'declined, refunded'] };
/** The runner lost, or never got, the text of an open order: hand it over again if this browser has it. */
const resend = (o) => (sent()[o.hash] ? getJSON('/brief', json(sent()[o.hash])).then(() => true, () => false) : false);
const placed = (o) => new Date(o.placed * 1000).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function receipt(o) {
  const r = o.receipt;
  if (!r) return h('span', { class: 'faint' }, `Budget ${usd(o.amount)} USDC. The contract has settled it: see its events for the amounts.`);
  const experts = r.paid.filter(([, paid]) => BigInt(paid) > 0n);
  return h('dl', { class: 'sum-list' },
    experts.flatMap(([id, paid]) => [h('dt', {}, account(info.network, id.split('/')[0]), h('span', { class: 'mono' }, `/${id.split('/')[1]}`)), h('dd', {}, usd(paid))]),
    h('dt', {}, 'The swarm\'s work'), h('dd', {}, usd(r.operator)),
    h('dt', {}, `Its owner, ${info.fees.fee_bps / 100}%`), h('dd', {}, usd(r.fee)),
    h('dt', { class: 'total' }, 'You paid'), h('dd', {}, usd(r.charge)),
    h('dt', {}, 'Returned to your wallet'), h('dd', { class: 'ok' }, usd(r.refund)));
}
function card(o) {
  const [kind, label] = STATE[o.state] ?? ['', o.state];
  return h('article', { class: 'card order' },
    h('header', {}, h('b', { class: 'mono' }, o.id), h('span', { class: `pill ${kind}` }, label), h('span', { class: 'faint end' }, `${placed(o)} · budget ${usd(o.amount)} USDC`)),
    h('details', {}, h('summary', {}, 'Your task'), h('pre', { class: 'brief' }, o.brief ?? sent()[o.hash]?.brief ?? '(its text is not here)'),
      h('span', { class: 'faint hash' }, `In the contract, this task is the hash ${o.hash}`)),
    o.state === 'delivered' ? [h('div', { class: 'answer-text' }, markdown(o.answer)), receipt(o), h('span', { class: 'faint hash' }, `sha256 of this answer, as the contract recorded it: ${o.answerHash}`)] : '',
    o.state === 'no_brief' ? h('div', { class: 'note warn' }, h('b', {}, 'The swarm does not have the text of this task'),
      h('span', {}, sent()[o.hash] ? 'Sending it again from this browser…' : `It was placed from another browser or device. Open this page there, or get all ${usd(o.amount)} USDC back ${Math.round(terms.run_secs / 60)} minutes after it was placed.`)) : '',
    o.state === 'declined' ? h('div', { class: 'note warn' }, h('b', {}, 'The swarm declined this task'), h('span', {}, o.why), h('span', {}, `All ${usd(o.amount)} USDC went back to your wallet.`)) : '',
    o.state === 'waiting' ? h('span', { class: 'muted' }, 'The swarm reads the task and picks the experts it needs.') : '',
    o.state === 'working' ? h('span', { class: 'muted' }, 'Each expert is answering its own question; then each answer is checked and one answer is composed.') : '');
}

let timer = 0;
/** Looks again every few seconds while something is on its way, or for `ticks` more times after an order was placed. */
function watch(ticks = 0) {
  clearTimeout(timer);
  timer = setTimeout(() => refresh(ticks - 1).catch(() => watch(ticks - 1)), 4_000);
}
async function refresh(ticks = 0) {
  const data = await load();
  for (const o of data.orders) {
    if (o.state === 'no_brief') void resend(o);
    else if (o.state === 'delivered' || o.state === 'declined') keep(o.hash, null); // answered: the text is in the order's record now
  }
  $('orders').replaceChildren(...(data.orders.length ? data.orders.map(card) : [h('p', { class: 'muted' }, 'No orders yet. Place one above.')]));
  // A refund goes to the wallet by itself; only one that bounced waits here, in the customer's balance in the contract.
  const waiting = BigInt(data.balance);
  const take = h('button', { class: 'btn small', type: 'button', onclick: () => {
    busy(take, true);
    call(info.contract, 'withdraw', {}).then(() => refresh(), (e) => status(`Not withdrawn: ${e?.message ?? e}`, 'bad')).finally(() => busy(take, false));
  } }, 'Withdraw');
  $('banners').replaceChildren(...(waiting > 0n ? [h('div', { class: 'banner' }, icon('wallet'), h('span', { class: 'text' }, h('b', {}, `${usd(waiting)} USDC is waiting for you in the contract`), h('span', {}, 'A payment to your wallet did not go through, or you earned it as a builder.')), take)] : []));
  if (ticks > 0 || data.orders.some((o) => ['no_brief', 'waiting', 'working'].includes(o.state))) watch(ticks);
}

form();
