// The wallet page: sign in with NEAR Connect, pay for the agent, open the cabinet with a NEP-413 signature.
// It shows what the runner knows about your agent: never a customer's task, question or answer.
import nc from '/vendor/near-connect.js';

const $ = (id) => document.getElementById(id);
const status = (t) => ($('status').textContent = t);
const usd = (u) => (Number(u) / 1e6).toFixed(2);
const units = (s) => {
  if (!/^\d+(\.\d{1,6})?$/.test(s.trim())) throw new Error(`not a USDC amount: ${s}`);
  const [w, f = ''] = s.trim().split('.');
  return (BigInt(w) * 1_000_000n + BigInt((f + '000000').slice(0, 6))).toString();
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const table = (rows, cols) =>
  `<table><tr>${cols.map(([, h]) => `<th>${esc(h)}</th>`).join('')}</tr>${rows.map((r) => `<tr>${cols.map(([k]) => `<td>${esc(typeof k === 'function' ? k(r) : r[k])}</td>`).join('')}</tr>`).join('')}</table>`;

const info = await (await fetch('/info')).json();
const connector = new nc.NearConnector({ network: info.network === 'mainnet' ? 'mainnet' : 'testnet' });
let account = null;

const call = (receiverId, methodName, args, deposit = '0') =>
  connector.wallet().then((w) => w.signAndSendTransaction({ receiverId, actions: [{ type: 'FunctionCall', params: { methodName, args, gas: '100000000000000', deposit } }] }));
const pay = (amount, msg) => call(info.token, 'ft_transfer_call', { receiver_id: info.contract, amount, msg: JSON.stringify(msg) }, '1');
const act = (what, f) => async () => {
  try {
    status(`${what}...`);
    await f();
    status(`${what}: done.`);
  } catch (e) {
    status(`${what}: ${e.message ?? e}`);
  }
};

connector.on('wallet:signIn', (e) => {
  account = e.accounts[0].accountId;
  $('who').textContent = account;
  $('money').hidden = $('cabinet').hidden = false;
});
connector.on('wallet:signOut', () => location.reload());
$('connect').onclick = act('Connecting', () => connector.connect());

// Arrived from the sealing page with a card to register: the public card only, in the URL fragment.
const fragment = new URLSearchParams(location.hash.slice(1));
const card = fragment.get('card') && JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(fragment.get('card')), (c) => c.charCodeAt(0))));
if (card) {
  $('register').hidden = false;
  $('card').textContent = JSON.stringify(card, null, 2);
  $('deposit').value = usd(fragment.get('deposit') ?? info.fees.min_deposit);
}
$('pay').onclick = act('Registering', () => pay(units($('deposit').value), { Register: card }));
$('topupBtn').onclick = act('Topping up', () => pay(units($('topup').value), { TopUp: { agent: account } }));
$('withdrawBtn').onclick = act('Withdrawing', () => call(info.contract, 'withdraw', $('withdraw').value.trim() ? { amount: units($('withdraw').value) } : {}));

$('open').onclick = act('Opening the cabinet', async () => {
  const message = `Swarm-for-Hire cabinet ${account} ${new Date().toISOString()}`;
  const nonce = crypto.getRandomValues(new Uint8Array(32));
  const signed = await (await connector.wallet()).signMessage({ message, recipient: info.contract, nonce });
  const body = { ...signed, message, nonce: btoa(String.fromCharCode(...nonce)) };
  const res = await fetch('/cabinet', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const c = await res.json();
  if (!res.ok) throw new Error(c.error);
  render(c);
});

function render({ agent, audit, rounds }) {
  if (!agent) return ($('view').innerHTML = '<p>No agent registered for this account yet.</p>');
  const picked = rounds.filter((r) => r.picked);
  const owed = picked.filter((r) => r.delivered).reduce((s, r) => s + BigInt(r.pay), 0n);
  const spent = picked.reduce((s, r) => s + BigInt(r.cost), 0n);
  $('view').innerHTML = `
    <p><b>${esc(agent.status)}</b>, registration ${agent.registration}. Balance ${usd(agent.balance)} USDC; rate ${usd(agent.rate)}, max cost ${usd(agent.max_cost)} per job.</p>
    <p>${esc(agent.skills)}</p>
    <h2>Audit</h2>
    ${audit ? `<p>${audit.allow ? 'Admitted' : 'Denied'} (${esc(audit.category)}): ${esc(audit.reason)}</p>
      ${audit.flags.length ? table(audit.flags, [['reason', 'What the scan noticed'], ['excerpt', 'In your materials']]) : ''}` : '<p class="muted">Not audited yet: upload the sealed materials.</p>'}
    <h2>Rounds</h2>
    <p>Considered ${rounds.length} times, picked ${picked.length}, delivered ${picked.filter((r) => r.delivered).length},
       violations ${picked.filter((r) => r.violation).length}. Owed ${usd(owed)} USDC when customers accept; spent ${usd(spent)} on inference.</p>
    ${table([...rounds].reverse(), [['at', 'When'], ['topic', 'Topic'], [(r) => (r.picked ? 'yes' : 'no'), 'Picked'], [(r) => (r.picked ? r.why : ''), 'Result'], [(r) => (r.picked ? usd(r.cost) : ''), 'Cost'], [(r) => (r.picked ? usd(r.pay) : ''), 'Pay'], ['job', 'Round']])}
    <p class="muted">Results: answered; empty, off_topic, refused, repeated_question (no pay); too_expensive (raise max cost);
       addressed_others, asked_for_score, changed_rules, hidden_content, attack (violations); model_failed, not_checked (our side).
       Debug on your own questions with <code>scripts/try.ts</code>: the same template, search, model and evaluator.</p>`;
}

const demand = await (await fetch('/demand')).json();
const topics = Object.entries(demand).map(([topic, n]) => ({ topic, ...n }));
$('demand').innerHTML = topics.length
  ? table(topics, [['topic', 'Topic'], ['served', 'Served'], ['no_expert', 'No expert'], ['over_budget', 'Over budget'], ['refused', 'Refused']])
  : '<p class="muted">No tasks yet.</p>';
