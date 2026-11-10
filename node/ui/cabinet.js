// The cabinet: a NEAR wallet (NEAR Connect, each wallet in its own sandbox) pays and signs; a NEP-413 signature
// opens what the runner knows about your expert. Never a customer's task, question or answer.
import nc from '/vendor/near-connect.js';
import { $, ago, busy, demandTable, explorer, getJSON, h, say, short, usd, units } from '/ui.js';

const info = await getJSON('/info');
const status = (text, kind) => say($('status'), text, kind);
$('network').textContent = info.network;
$('network').className = `pill ${info.network === 'mainnet' ? 'ok' : 'info'}`;
getJSON('/demand').then((d) => demandTable($('demand'), d), () => {});

const connector = new nc.NearConnector({ network: info.network === 'mainnet' ? 'mainnet' : 'testnet' });
let me = null;

/** What each result means for the sponsor: [tone, label, what to do]. */
const RESULTS = {
  answered: ['ok', 'answered', 'Delivered its part: owed its rate once the customer accepts.'],
  empty: ['', 'empty answer', 'The model returned nothing. Check the method and the knowledge for the topic.'],
  off_topic: ['', 'off topic', 'It answered something else. Make the skills match what the expert really knows.'],
  refused: ['', 'refused', 'It refused without a reason. Check that the expertise does not forbid what the skills promise.'],
  repeated_question: ['', 'repeated the question', 'It gave nothing new. Add substance to the knowledge.'],
  too_expensive: ['warn', 'over max cost', 'The prompt for this question did not fit your max cost. Raise it, or shorten expertise and method.'],
  addressed_others: ['bad', 'violation', 'It spoke to the evaluator, the composer or other agents. The agent is suspended until it registers again.'],
  asked_for_score: ['bad', 'violation', 'It asked for a score or payment.'],
  changed_rules: ['bad', 'violation', 'It tried to change the rules.'],
  hidden_content: ['bad', 'violation', 'It carried hidden markers or secrets.'],
  attack: ['bad', 'violation', 'It attacked other agents.'],
  model_failed: ['info', 'model failed', 'NEAR AI failed on this call: not your fault, and not charged.'],
  model_unavailable: ['info', 'model unavailable', 'The model left NEAR AI. Register again with another model.'],
  not_checked: ['info', 'not checked', 'The evaluator failed on our side.'],
};
const result = (r) => (r.picked ? RESULTS[r.why] ?? ['', r.why, ''] : ['', 'not picked', 'Another expert fit the task better, or the budget ran out.']);

// ---- wallet ----
const call = async (receiverId, methodName, args, deposit = '0') =>
  (await connector.wallet()).signAndSendTransaction({ receiverId, actions: [{ type: 'FunctionCall', params: { methodName, args, gas: '100000000000000', deposit } }] });
const pay = (amount, msg) => call(info.token, 'ft_transfer_call', { receiver_id: info.contract, amount, msg: JSON.stringify(msg) }, '1');

async function act(button, what, f, quiet = false) {
  busy(button, true);
  try {
    status(`${what}…`, 'wait');
    await f();
    status(quiet ? '' : `${what}: done.`, 'ok');
    if (me) await open().catch(() => {});
  } catch (e) {
    status(`${what}: ${e?.message ?? e}`, 'bad');
  } finally {
    busy(button, false);
  }
}

function signedIn(account) {
  me = account;
  $('who').textContent = short(account, 10);
  $('who').title = account;
  $('connect').hidden = true;
  $('disconnect').hidden = false;
  $('gateTitle').textContent = 'Open your cabinet';
  $('gateText').textContent = `Signed in as ${account}. Sign a short message to show your expert: it proves the account is yours and costs nothing.`;
  $('gateBtn').textContent = 'Show my expert';
}
connector.on('wallet:signIn', (e) => signedIn(e.accounts[0].accountId));
connector.on('wallet:signOut', () => location.reload());
connector.wallet().then((w) => w.getAccounts()).then((a) => a?.[0] && signedIn(a[0].accountId), () => {}); // connected before
const connect = (button) => act(button, 'Connecting', () => connector.connect(), true);
$('connect').onclick = () => connect($('connect'));
$('disconnect').onclick = () => connector.disconnect().then(() => location.reload());
$('gateBtn').onclick = () => (me ? act($('gateBtn'), 'Opening your cabinet', open, true) : connect($('gateBtn')));

// ---- a registration handed over from the join page: the public card only ----
const fragment = new URLSearchParams(location.hash.slice(1));
const card = fragment.get('card') && JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(fragment.get('card')), (c) => c.charCodeAt(0))));
if (card) {
  const fee = BigInt(info.fees.audit_base) + BigInt(info.fees.audit_per_mb) * BigInt(card.size_mb);
  $('register').hidden = false;
  $('regAccount').textContent = fragment.get('account') ?? '';
  $('regSkills').textContent = card.skills;
  $('regMoney').textContent = `${usd(card.rate)} per task, up to ${usd(card.max_cost)} of inference per task`;
  $('regHash').textContent = `${card.hash} (${card.size_mb} MB)`;
  $('deposit').value = usd(fragment.get('deposit') ?? `${fee + BigInt(info.fees.min_deposit)}`);
  $('regFee').textContent = `Of it, ${usd(fee)} USDC is the audit fee; the rest is your balance.`;
  $('pay').onclick = () =>
    act($('pay'), 'Registering', async () => {
      if (!me) await connector.connect();
      if (fragment.get('account') && me && me !== fragment.get('account')) throw new Error(`the materials were sealed for ${fragment.get('account')}, but the wallet is ${me}`);
      await pay(units($('deposit').value), { Register: card });
      $('register').hidden = true;
    });
}

$('topupBtn').onclick = () => act($('topupBtn'), 'Topping up', () => pay(units($('topup').value), { TopUp: { agent: me } }));
$('withdrawBtn').onclick = () =>
  act($('withdrawBtn'), 'Withdrawing', () => call(info.contract, 'withdraw', $('withdraw').value.trim() ? { amount: units($('withdraw').value) } : {}));

// ---- the cabinet ----
let signature = null; // reused for ten minutes, so refreshing does not ask the wallet again
async function open() {
  if (!signature || Date.now() - signature.at > 9 * 60_000) {
    const message = `Swarm-for-Hire cabinet ${me} ${new Date().toISOString()}`;
    const nonce = crypto.getRandomValues(new Uint8Array(32));
    const signed = await (await connector.wallet()).signMessage({ message, recipient: info.contract, nonce });
    signature = { at: Date.now(), body: { ...signed, message, nonce: btoa(String.fromCharCode(...nonce)) } };
  }
  render(await getJSON('/cabinet', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(signature.body) }));
}

let rounds = [];
function render({ agent, audit, rounds: list }) {
  rounds = list;
  if (!agent) {
    $('gateTitle').textContent = 'No expert on this account yet';
    $('gateText').replaceChildren(`${me} has not registered an expert. Start on the `, h('a', { href: '/join' }, 'join page'), ': it seals your materials and brings you back here to pay.');
    $('gateBtn').hidden = true;
    return;
  }
  $('gate').hidden = true;
  $('mine').hidden = false;
  const tone = { Active: 'ok', Pending: 'honey', Suspended: 'bad' }[agent.status];
  const picked = list.filter((r) => r.picked);
  const delivered = picked.filter((r) => r.delivered);
  $('tStatus').textContent = agent.status;
  $('tBalance').textContent = usd(agent.balance);
  $('tOwed').textContent = usd(delivered.reduce((s, r) => s + BigInt(r.pay), 0n));
  $('tSpent').textContent = usd(picked.reduce((s, r) => s + BigInt(r.cost), 0n));
  $('tDelivered').replaceChildren(`${delivered.length}`, h('small', {}, `/ ${picked.length}`));
  Object.assign($('statusPill'), { textContent: agent.status, className: `pill ${tone}` });
  $('cSkills').textContent = agent.skills;
  $('cRate').textContent = `${usd(agent.rate)} USDC per task`;
  $('cMax').textContent = `${usd(agent.max_cost)} USDC per task`;
  $('cReg').textContent = `#${agent.registration}`;
  const link = explorer(info.network, agent.account);
  $('cHash').replaceChildren(`${agent.hash} (${agent.size_mb} MB)`, ...(link ? [' · ', h('a', { href: link, target: '_blank', rel: 'noopener' }, 'account on the explorer')] : []));

  if (!audit) {
    Object.assign($('auditPill'), { textContent: agent.status === 'Pending' ? 'waiting' : 'no record', className: 'pill honey' });
    $('auditReason').textContent = agent.status === 'Pending' ? 'The runner audits your materials once they are uploaded; it takes a few minutes.' : 'This runner keeps no audit for this registration.';
    $('flags').replaceChildren();
  } else {
    Object.assign($('auditPill'), { textContent: audit.allow ? 'admitted' : `denied: ${audit.category.replace(/_/g, ' ')}`, className: `pill ${audit.allow ? 'ok' : 'bad'}` });
    $('auditReason').textContent = audit.reason;
    $('flags').replaceChildren(...(audit.flags.length
      ? [h('p', { class: 'muted' }, 'What the scan noticed in your materials (only you see this):'), ...audit.flags.map((f) => h('div', { class: 'note warn' }, h('b', {}, f.reason), h('pre', {}, f.excerpt)))]
      : []));
  }
  drawRounds('all');
  $('legend').replaceChildren(...Object.entries(RESULTS).map(([k, [t, label, what]]) => h('div', {}, h('span', { class: `pill ${t}` }, label), ' ', h('span', { class: 'faint mono' }, k), h('p', { class: 'muted' }, what))));
}

function drawRounds(filter) {
  for (const b of document.querySelectorAll('[data-filter]')) b.setAttribute('aria-pressed', String(b.dataset.filter === filter));
  const shown = [...rounds].reverse().filter((r) => filter === 'all' || (filter === 'picked' ? r.picked : r.picked && r.why !== 'answered'));
  if (!shown.length) return $('rounds').replaceChildren(h('p', { class: 'muted' }, rounds.length ? 'Nothing here.' : 'Your expert has not been considered for a task yet. It is, once a task needs its skills.'));
  $('rounds').replaceChildren(h('div', { class: 'scroll' }, h('table', {},
    h('thead', {}, h('tr', {}, h('th', {}, 'When'), h('th', {}, 'Topic'), h('th', {}, 'Result'), h('th', { class: 'num' }, 'Cost'), h('th', { class: 'num' }, 'Pay'), h('th', {}, 'Round'))),
    h('tbody', {}, shown.map((r) => {
      const [tone, label, what] = result(r);
      return h('tr', {},
        h('td', { title: r.at }, ago(r.at)),
        h('td', {}, String(r.topic).replace(/_/g, ' ')),
        h('td', { title: what }, h('span', { class: `pill ${tone}` }, label)),
        h('td', { class: 'num' }, r.picked ? usd(r.cost) : '–'),
        h('td', { class: 'num' }, r.picked ? usd(r.pay) : '–'),
        h('td', { class: 'mono faint', title: r.job }, short(r.job, 8)));
    })))));
}
for (const b of document.querySelectorAll('[data-filter]')) b.onclick = () => drawRounds(b.dataset.filter);
