// Ordering on chain. The task's text goes to the runner; the customer's wallet sends USDC with the hash of that
// text into the contract; the swarm answers; the contract pays the experts that delivered and sends the rest back.
// A NEP-413 signature, the same one as in the builder's app, shows the customer its own orders and their
// answers: nobody else's.
import nc from '/vendor/near-connect.js';
import { $, account, busy, getJSON, h, hex, icon, markdown, say, short, units, usd } from '/ui.js';

const MAX_BRIEF = 10_000; // characters, as the runner takes it
const info = await getJSON('/info');
const terms = info.pricing.order; // the contract's own numbers: overhead, per_agent, run_secs
// What an expert costs here, for telling the customer how many fit the budget: the middle rate of those who can work now.
const experts = await getJSON('/agents').catch(() => []);
const rates = experts.map((x) => BigInt(x.rate)).sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
// Who is in the swarm now: the public card of each expert, so a customer sees what it knows before paying.
{
  const who = $('swarmList');
  if (who && experts.length) {
    const head = document.createElement('b'); head.textContent = `In the swarm now: ${experts.length} expert${experts.length === 1 ? '' : 's'}`;
    const list = document.createElement('ul');
    for (const x of experts) {
      const li = document.createElement('li');
      const name = document.createElement('b'); name.textContent = x.id.split('/').pop();
      const what = document.createElement('span'); what.textContent = ` · ${usd(BigInt(x.rate))} USDC · ${String(x.skills).split(/[.:]/)[0]}`;
      li.append(name, what); list.append(li);
    }
    who.append(head, list);
  }
}
const rate = rates.length ? rates[Math.floor(rates.length / 2)] : 1_000_000n;
/** How many experts of the middle rate a budget pays for, with the swarm's overhead and the owner's fee on top. */
const fits = (a) => { const net = (a * 10_000n) / BigInt(10_000 + info.fees.fee_bps) - BigInt(terms.overhead); return net > 0n ? Number(net / (rate + BigInt(terms.per_agent))) : 0; };
/** Why a bigger team, in plain words, for the budget the customer typed. */
const advice = (n) => n >= 3
  ? `About ${n} experts fit this budget: each finding is proved by one and tested by another, one that fails is covered by the rest, and more gets found.`
  : `Only about ${n} expert${n === 1 ? '' : 's'} fit${n === 1 ? 's' : ''} this budget. Give room for 3 (about ${usd(BigInt(Math.ceil(Number((BigInt(terms.overhead) + 3n * (rate + BigInt(terms.per_agent))) * BigInt(10_000 + info.fees.fee_bps) / 10_000n / 10_000n)) * 10_000))} USDC): with two or more, each finding is proved by one expert and tested by another, so fewer false alarms reach you; if one fails, the others still answer; and more experts find more. You pay only for those who deliver.`;
const status = (text, kind) => say($('status'), text, kind);
Object.assign($('network'), { textContent: info.network, className: `pill ${info.network === 'mainnet' ? 'ok' : 'info'}` });
const connector = new nc.NearConnector({ network: info.network === 'mainnet' ? 'mainnet' : 'testnet' });
const minutes = Math.round(terms.run_secs / 60);
$('timeout').textContent = `Not answered in ${minutes >= 1 ? `${minutes} minutes` : `${terms.run_secs} seconds`}: anyone can call refund, and all of it comes back.`;

// ---- the draft: from the experts page, or typed here ----
const DRAFT = 'swarm.order';
const draft = JSON.parse(sessionStorage.getItem(DRAFT) ?? 'null');
if (draft?.brief) $('brief').value = draft.brief;
if (draft?.amount) $('amount').value = draft.amount;
const brief = () => $('brief').value.trim();
const toHex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
/** What the order's hash commits to: a random salt, so a short task cannot be guessed from its hash; the account
 *  that places it, so that nobody else's order can name this task; then the text. */
const briefHash = async (salt, customer, text) => toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}\n${customer}\n${text}`))));
const json = (body) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
// Tasks handed to the runner from this browser, by hash, until their orders are answered: to send one again if it got lost.
const SENT = 'swarm.briefs';
const sent = () => JSON.parse(localStorage.getItem(SENT) ?? '{}');
const keep = (hash, value) => localStorage.setItem(SENT, JSON.stringify(Object.fromEntries(Object.entries({ ...sent(), [hash]: value }).filter(([, v]) => v).slice(-20))));
const amount = () => { try { return BigInt(units($('amount').value)); } catch { return null; } };

// ---- session: the same signature as the builder's app, good for 12 hours ----
const SESSION = 'swarm.session';
let me = null;
let placing = false; // while an order is being placed, the wallet is asked one thing at a time
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
  if (!placing) refresh().catch((e) => status(`Could not load your orders: ${e?.message ?? e}`, 'bad'));
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
  $('amountHint').textContent = `The most this task may cost. You pay the rates of the experts that delivered, shared among them by what their findings that held were worth, ${usd(terms.overhead)} + ${usd(terms.per_agent)} per expert for the swarm and ${info.fees.fee_bps / 100}% to its owner; the rest returns to your wallet by itself.`;
  $('teamHint').textContent = a ? advice(fits(a)) : '';
}
async function place() {
  placing = true;
  if (!me) {
    // Connecting is the first half of placing: once the wallet answers, go on to the payment without a second click.
    await connect($('place'));
    for (let i = 0; i < 50 && !me; i++) await new Promise((r) => setTimeout(r, 200));
    if (!me) return void (placing = false);
  }
  const [text, a] = [brief(), amount()];
  if (!text) return (status('Write your task first: it is what the swarm answers.', 'bad'), $('brief').focus());
  if (text.length > MAX_BRIEF) return status(`The task is too long: ${text.length} of ${MAX_BRIEF} characters. Shorten it, or put the details behind a link.`, 'bad');
  if (!a || a <= BigInt(terms.overhead)) return (status(`The budget must be above ${usd(terms.overhead)} USDC, or it could pay no expert.`, 'bad'), $('amount').focus());
  busy($('place'), true);
  try {
    // The text first, to the runner; then the money, with the hash that names the text. The runner cannot swap it:
    // the hash is computed here as well.
    const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await briefHash(salt, me, text);
    if ((await getJSON('/brief', json({ salt, customer: me, brief: text }))).hash !== hash) throw new Error('the runner named the task by another hash');
    keep(hash, { salt, customer: me, brief: text });
    status('Confirm the payment in your wallet…', 'wait');
    const sent = await call(info.token, 'ft_transfer_call', { receiver_id: info.contract, amount: `${a}`, msg: JSON.stringify({ Order: $('publish').checked ? { brief_hash: hash, salt, brief: text } : { brief_hash: hash } }) }, '1');
    sessionStorage.removeItem(DRAFT);
    $('brief').value = '';
    const tx = sent?.transaction?.hash ?? sent?.transaction_outcome?.id;
    const explorer = info.network === 'mainnet' ? 'https://nearblocks.io/txns/' : 'https://testnet.nearblocks.io/txns/';
    status('Order placed. Your budget is held by the contract; the swarm takes the order within a minute and answers within 30 minutes. Follow it in “Your orders” below: the answer appears there.', 'ok');
    if (tx) $('status').append(' ', h('a', { href: explorer + tx, target: '_blank', rel: 'noopener' }, 'See the transaction'));
    $('mineTitle')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    watch(30);
  } catch (e) {
    status(`The order was not placed: ${e?.message ?? e}`, 'bad');
  } finally {
    placing = false;
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
const resend = (o) => (sent()[o.briefHash] ? getJSON('/brief', json(sent()[o.briefHash])).then(() => true, () => false) : false);
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
    h('details', {}, h('summary', {}, 'Your task'), h('pre', { class: 'brief' }, o.brief ?? sent()[o.briefHash]?.brief ?? '(its text is not here)'),
      h('span', { class: 'faint hash' }, `In the contract, this task is the hash ${o.briefHash}`)),
    // The answer is long: folded by default, so the list of orders stays readable; its first lines say what it found.
    o.state === 'delivered' ? [h('details', { class: 'answer-fold' }, h('summary', {}, `The answer${/Findings\s*\n+\s*(\d+)/.exec(o.answer ?? '')?.[1] ? `: ${/Findings\s*\n+\s*(\d+)/.exec(o.answer)[1]} findings` : ''}`), h('div', { class: 'answer-text' }, markdown(o.answer))), receipt(o), h('span', { class: 'faint hash' }, `sha256 of this answer, as the contract recorded it: ${o.answerHash}`)] : '',
    o.state === 'no_brief' ? h('div', { class: 'note warn' }, h('b', {}, 'The swarm does not have the text of this task'),
      h('span', {}, sent()[o.briefHash] ? 'Sending it again from this browser…' : `It was placed from another browser or device. Open this page there, or get all ${usd(o.amount)} USDC back ${Math.round(terms.run_secs / 60)} minutes after it was placed.`)) : '',
    o.state === 'declined' ? h('div', { class: 'note warn' }, h('b', {}, 'The swarm declined this task'), h('span', {}, o.why), h('span', {}, `All but 0.05 of its ${usd(o.amount)} USDC went back to your wallet: 0.05 paid for the check of the task.`)) : '',
    o.state === 'waiting' ? h('span', { class: 'muted' }, 'The swarm reads the task and picks the experts it needs.') : '',
    o.state === 'working' ? h('span', { class: 'muted' }, 'Experts are reviewing; a second expert tests each finding, then one answer is composed.') : '');
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
    else if (o.state === 'delivered' || o.state === 'declined') keep(o.briefHash, null); // answered: the text is in the order's record now
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
