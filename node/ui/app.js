// The sponsor's app. A NEAR wallet (NEAR Connect, each wallet in its own sandbox) pays and signs; a NEP-413 signature
// opens what the runner knows about your experts; prompts and files are sealed here and leave encrypted to the TEE.
// Views by URL hash: #/ the dashboard, #/new a new expert, #/agent/<name> one expert.
import nc from '/vendor/near-connect.js';
import { seal, sha256 } from '/seal.js';
import { $, ago, busy, dayBars, explorer, getJSON, h, kindOf, KINDS, lastDays, perDay, say, short, units, usd } from '/ui.js';

const MB = 1024 * 1024;
const info = await getJSON('/info');
const status = (text, kind) => say($('status'), text, kind);
Object.assign($('network'), { textContent: info.network, className: `pill ${info.network === 'mainnet' ? 'ok' : 'info'}` });
const connector = new nc.NearConnector({ network: info.network === 'mainnet' ? 'mainnet' : 'testnet' });

// ---- session: one wallet step signs in and proves the account; the signature opens the cabinet for 12 hours ----
const SESSION = 'swarm.session';
let me = null;
let session = JSON.parse(localStorage.getItem(SESSION) ?? 'null'); // { account, body, at }
const fresh = (s) => s && Date.now() - s.at < 11 * 3_600_000;
const challenge = () => ({ message: `Swarm-for-Hire cabinet ${me} ${new Date().toISOString()}`, nonce: crypto.getRandomValues(new Uint8Array(32)) });
const b64 = (bytes) => btoa(String.fromCharCode(...bytes));

function remember(account, signed, message, nonce) {
  session = { account, at: Date.now(), body: { ...signed, accountId: account, message, nonce: b64(nonce) } };
  localStorage.setItem(SESSION, JSON.stringify(session));
}
async function signIn() {
  const c = challenge();
  const signed = await (await connector.wallet()).signMessage({ message: c.message, recipient: info.contract, nonce: c.nonce });
  remember(me, signed, c.message, c.nonce);
}
function signedIn(account) {
  me = account;
  if (session?.account !== account) session = null;
  Object.assign($('who'), { textContent: short(account, 12), title: account });
  $('connect').hidden = true;
  $('disconnect').hidden = false;
  $('appNav').hidden = false;
  route();
}
connector.on('wallet:signIn', (e) => signedIn(e.accounts[0].accountId));
connector.on('wallet:signOut', () => (localStorage.removeItem(SESSION), location.reload()));
connector.wallet().then((w) => w.getAccounts()).then((a) => a?.[0] && signedIn(a[0].accountId), () => {}); // connected before

async function connect(button) {
  busy(button, true);
  try {
    await connector.connect(); // then the wallet:signIn event opens the dashboard, which asks for the one signature
    status('');
  } catch (e) {
    status(`Could not connect: ${e?.message ?? e}`, 'bad');
  } finally {
    busy(button, false);
  }
}
$('connect').onclick = () => connect($('connect'));
$('disconnect').onclick = () => connector.disconnect().then(() => (localStorage.removeItem(SESSION), location.reload()));
$('gateConnect').onclick = () => connect($('gateConnect'));

// ---- data ----
let data = null; // { account, balance, agents: [...] }
async function load() {
  if (!fresh(session)) await signIn();
  data = await getJSON('/cabinet', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(session.body) }).catch(async (e) => {
    if (e.status !== 401) throw e;
    await signIn(); // expired or from another wallet: sign again once
    return getJSON('/cabinet', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(session.body) });
  });
  return data;
}
const nameOf = (a) => a.id.slice(a.id.indexOf('/') + 1);

// ---- money, through the wallet ----
const call = async (receiverId, methodName, args, deposit = '0') =>
  (await connector.wallet()).signAndSendTransaction({ receiverId, actions: [{ type: 'FunctionCall', params: { methodName, args, gas: '100000000000000', deposit } }] });
const pay = (amount, msg) => call(info.token, 'ft_transfer_call', { receiver_id: info.contract, amount, msg: JSON.stringify(msg) }, '1');

// ---- routing ----
window.addEventListener('hashchange', route);
async function route() {
  if (!me) return;
  const [, view, arg] = location.hash.split('/');
  $('navDash').toggleAttribute('aria-current', !view);
  $('navNew').toggleAttribute('aria-current', view === 'new');
  try {
    if (view === 'new') return renderNew();
    if (!data) $('view').replaceChildren(h('p', { class: 'muted' }, 'Loading your experts…'));
    await load();
    if (view === 'agent') return renderAgent(decodeURIComponent(arg ?? ''));
    renderDashboard();
  } catch (e) {
    $('view').replaceChildren(h('section', { class: 'gate card' }, h('h2', {}, 'Sign in to see your experts'),
      h('p', { class: 'muted' }, `Your wallet signs a short message: free, not a transaction. (${e?.message ?? e})`),
      h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => ((session = null), route()) }, 'Sign in'))));
  }
}

// ---- the dashboard ----
const DAYS = 30;
function summary(rounds) {
  const since = Date.now() - DAYS * 86_400_000;
  const recent = rounds.filter((r) => r.picked && Date.parse(r.at) >= since);
  const delivered = recent.filter((r) => r.delivered);
  return {
    earned: delivered.reduce((s, r) => s + BigInt(r.pay), 0n),
    spent: recent.reduce((s, r) => s + BigInt(r.cost), 0n),
    picked: recent.length,
    delivered: delivered.length,
    rate: recent.length ? `${Math.round((100 * delivered.length) / recent.length)}%` : '–',
  };
}
const tile = (n, k, extra) => h('div', { class: 'tile' }, h('span', { class: 'n' }, n), h('span', { class: 'k' }, k), extra ?? '');
function charts(rounds) {
  const days = lastDays(DAYS), { earned, kinds } = perDay(rounds);
  const a = h('div', { class: 'card' }, h('h3', {}, 'Earned per day, USDC'), h('div'));
  const b = h('div', { class: 'card' }, h('h3', {}, 'Results per day'), h('div'));
  dayBars(a.lastChild, days, [{ key: 'earned', label: 'Earned (paid when customers accept)', cls: 'honey' }], earned, { format: (v) => v.toFixed(v < 10 ? 2 : 0) });
  dayBars(b.lastChild, days, KINDS, kinds);
  return h('div', { class: 'two' }, a, b);
}

function renderDashboard() {
  const all = data.agents.flatMap((a) => a.rounds);
  const s = summary(all);
  const money = h('div', { class: 'actions money-actions' },
    h('button', { class: 'btn ghost small', type: 'button', onclick: () => moneyForm('top up') }, 'Top up'),
    h('button', { class: 'btn ghost small', type: 'button', onclick: () => moneyForm('withdraw') }, 'Withdraw'));
  $('view').replaceChildren(
    h('section', { class: 'bar-head' }, h('h1', {}, 'Your experts'), h('a', { class: 'btn', href: '#/new' }, 'New expert')),
    h('section', { 'aria-label': 'Totals' }, h('div', { class: 'tiles' },
      tile(usd(data.balance), 'balance, USDC', money),
      tile(usd(s.earned), `earned in ${DAYS} days, USDC`),
      tile(`${s.delivered}`, `tasks delivered in ${DAYS} days`),
      tile(s.rate, 'delivered of picked'))),
    h('div', { id: 'moneyForm' }),
    data.agents.length ? charts(all) : '',
    data.agents.length ? agentsTable() : firstExpert(),
  );
}
function firstExpert() {
  return h('section', { class: 'gate card' }, h('h2', {}, 'Create your first expert'),
    h('p', { class: 'muted' }, 'Describe what it knows, add your notes or documents, set your price. It takes a few minutes and one payment from your wallet.'),
    h('div', { class: 'actions' }, h('a', { class: 'btn big', href: '#/new' }, 'Create an expert')));
}
const STATUS = { Active: 'ok', Pending: 'honey', Suspended: 'bad' };
function agentsTable() {
  return h('section', {}, h('div', { class: 'scroll' }, h('table', { class: 'clickable' },
    h('thead', {}, h('tr', {}, ...['Expert', 'Status', 'Rate', 'Tasks', 'Delivered', 'Earned', 'Last task'].map((t, i) => h('th', { class: i > 1 && i < 6 ? 'num' : '' }, t)))),
    h('tbody', {}, data.agents.map((a) => {
      const picked = a.rounds.filter((r) => r.picked), done = picked.filter((r) => r.delivered);
      const open = () => (location.hash = `#/agent/${encodeURIComponent(nameOf(a))}`);
      return h('tr', { tabindex: '0', onclick: open, onkeydown: (e) => e.key === 'Enter' && open() },
        h('td', {}, h('b', {}, a.audit?.name ?? nameOf(a)), h('div', { class: 'faint' }, short(a.skills, 40))),
        h('td', {}, h('span', { class: `pill ${STATUS[a.status]}` }, a.status === 'Pending' ? 'auditing' : a.status.toLowerCase())),
        h('td', { class: 'num' }, usd(a.rate)),
        h('td', { class: 'num' }, picked.length),
        h('td', { class: 'num' }, picked.length ? `${Math.round((100 * done.length) / picked.length)}%` : '–'),
        h('td', { class: 'num' }, usd(done.reduce((s, r) => s + BigInt(r.pay), 0n))),
        h('td', {}, picked.at(-1) ? ago(picked.at(-1).at) : '–'));
    })))));
}

function moneyForm(kind) {
  const input = h('input', { id: 'amount', inputmode: 'decimal', placeholder: kind === 'withdraw' ? 'all' : '5.00' });
  const go = h('button', { class: 'btn', type: 'button' }, kind === 'withdraw' ? 'Withdraw' : 'Top up');
  go.onclick = async () => {
    busy(go, true);
    try {
      if (kind === 'withdraw') await call(info.contract, 'withdraw', input.value.trim() ? { amount: units(input.value) } : {});
      else {
        if (!data.agents.length) throw new Error('create an expert first: its registration brings your first deposit');
        await pay(units(input.value || '5'), { TopUp: { agent: data.agents[0].id } }); // any of your experts: the balance is yours
      }
      status(kind === 'withdraw' ? 'Withdrawn to your wallet.' : 'Added to your balance.', 'ok');
      await load();
      renderDashboard();
    } catch (e) {
      status(`${kind}: ${e?.message ?? e}`, 'bad');
    } finally {
      busy(go, false);
    }
  };
  $('moneyForm').replaceChildren(h('div', { class: 'card inline-form' },
    h('label', { for: 'amount' }, kind === 'withdraw' ? 'Withdraw, USDC' : 'Top up, USDC'), h('div', { class: 'with-unit' }, input), go,
    h('span', { class: 'faint' }, kind === 'withdraw' ? 'What is held for a running task stays until the task ends.' : 'Each task holds your expert\'s max cost from the balance until it ends.')));
  input.focus();
}

// ---- one expert ----
const RESULTS = {
  answered: ['ok', 'delivered', 'Delivered its part: earns its rate once the customer accepts.'],
  empty: ['', 'empty answer', 'The model returned nothing. Check the prompt and the files for this topic.'],
  off_topic: ['', 'off topic', 'It answered something else. Make "what it knows" match what the expert really knows.'],
  refused: ['', 'refused', 'It refused without a reason. Check that the prompt does not forbid what the expert promises.'],
  repeated_question: ['', 'no substance', 'It repeated the question. Add substance to the files.'],
  too_expensive: ['warn', 'over max cost', 'The question did not fit your max cost. Raise it, or shorten the prompt.'],
  addressed_others: ['bad', 'violation', 'It spoke to the evaluator or other agents. The expert is suspended until you register it again.'],
  asked_for_score: ['bad', 'violation', 'It asked for a score or payment.'],
  changed_rules: ['bad', 'violation', 'It tried to change the rules.'],
  hidden_content: ['bad', 'violation', 'It carried hidden markers or secrets.'],
  attack: ['bad', 'violation', 'It attacked other agents.'],
  model_failed: ['info', 'model failed', 'NEAR AI failed on this call. Not your fault, and not charged.'],
  model_unavailable: ['info', 'model gone', 'The model left NEAR AI. Register again with another model.'],
  not_checked: ['info', 'not checked', 'The evaluator failed on our side.'],
};
const result = (r) => (r.picked ? RESULTS[r.why] ?? ['', r.why, ''] : ['', 'not picked', 'Another expert fit the task better, or the budget ran out.']);

function renderAgent(name) {
  const a = data.agents.find((x) => nameOf(x) === name);
  if (!a) return (location.hash = '#/');
  const s = summary(a.rounds);
  const link = explorer(info.network, a.owner);
  const audit = a.audit
    ? h('section', { class: 'card' }, h('header', {}, h('h2', {}, 'Audit'), h('span', { class: `pill ${a.audit.allow ? 'ok' : 'bad'}` }, a.audit.allow ? 'admitted' : `denied: ${a.audit.category.replace(/_/g, ' ')}`)),
        h('p', {}, a.audit.reason),
        ...(a.audit.flags.length ? [h('p', { class: 'muted' }, 'What the scan noticed in your materials (only you see this):'), ...a.audit.flags.map((f) => h('div', { class: 'note warn' }, h('b', {}, f.reason), h('pre', {}, f.excerpt)))] : []))
    : h('section', { class: 'note' }, h('b', {}, a.status === 'Pending' ? 'The audit is running.' : 'No audit on record.'), h('span', { class: 'muted' }, a.status === 'Pending' ? 'It usually takes a few minutes. This page shows the result when you come back.' : 'This runner keeps no audit for this registration.'));
  $('view').replaceChildren(
    h('a', { href: '#/', class: 'back' }, '← All experts'),
    h('section', { class: 'bar-head' }, h('div', {}, h('h1', {}, a.audit?.name ?? name), h('div', { class: 'mono faint' }, a.id)), h('span', { class: `pill ${STATUS[a.status]}` }, a.status === 'Pending' ? 'auditing' : a.status.toLowerCase())),
    h('p', { class: 'lead' }, a.skills),
    h('div', { class: 'tiles' }, tile(`${s.picked}`, `tasks in ${DAYS} days`), tile(s.rate, 'delivered of picked'), tile(usd(s.earned), 'earned, USDC'), tile(usd(s.spent), 'spent on inference, USDC')),
    charts(a.rounds),
    tasks(a.rounds),
    audit,
    h('section', { class: 'card' }, h('h2', {}, 'Settings'),
      h('dl', { class: 'kv' },
        h('dt', {}, 'Rate'), h('dd', { class: 'mono' }, `${usd(a.rate)} USDC per task`),
        h('dt', {}, 'Max cost'), h('dd', { class: 'mono' }, `${usd(a.max_cost)} USDC per task`),
        h('dt', {}, 'Model'), h('dd', { class: 'mono' }, a.audit?.model ?? 'sealed'),
        h('dt', {}, 'Registration'), h('dd', { class: 'mono' }, `#${a.registration}, ${a.size_mb} MB sealed`),
        h('dt', {}, 'Owner'), h('dd', {}, link ? h('a', { href: link, target: '_blank', rel: 'noopener', class: 'mono' }, a.owner) : a.owner)),
      h('p', { class: 'faint' }, 'To change the prompt, files, price or model, register the expert again under the same name: it gets a new audit, and its record stays.'),
      h('div', { class: 'actions' }, h('a', { class: 'btn ghost', href: `#/new/${encodeURIComponent(name)}` }, 'Change this expert'))),
  );
}

function tasks(rounds) {
  const box = h('div');
  const draw = (filter) => {
    for (const b of chips.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.f === filter));
    const shown = [...rounds].reverse().filter((r) => filter === 'all' || (filter === 'delivered' ? r.picked && r.delivered : r.picked && !r.delivered));
    box.replaceChildren(shown.length
      ? h('div', { class: 'scroll' }, h('table', {},
          h('thead', {}, h('tr', {}, h('th', {}, 'When'), h('th', {}, 'Topic'), h('th', {}, 'Result'), h('th', { class: 'num' }, 'Cost'), h('th', { class: 'num' }, 'Pay'))),
          h('tbody', {}, shown.map((r) => {
            const [tone, label, what] = result(r);
            return h('tr', {}, h('td', { title: r.at }, ago(r.at)), h('td', {}, String(r.topic).replace(/_/g, ' ')),
              h('td', { title: what }, h('span', { class: `pill ${tone}` }, label), h('div', { class: 'faint why' }, kindOf(r) && kindOf(r) !== 'paid' ? what : '')),
              h('td', { class: 'num' }, r.picked ? usd(r.cost) : '–'), h('td', { class: 'num' }, r.picked ? usd(r.pay) : '–'));
          }))))
      : h('p', { class: 'muted' }, rounds.length ? 'Nothing here.' : 'No tasks yet. The swarm asks your expert when a task needs what it knows.'));
  };
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Show' },
    ...[['all', 'All'], ['delivered', 'Delivered'], ['problems', 'Needs attention']].map(([f, l]) => h('button', { type: 'button', 'data-f': f, onclick: () => draw(f) }, l)));
  draw('all');
  return h('section', {}, h('div', { class: 'bar-head' }, h('h2', {}, 'Tasks'), chips), box);
}

// ---- a new expert: three steps in one form, then one wallet confirmation ----
const NAME = /^[a-z0-9-]{1,32}$/;
function renderNew() {
  const [, , prefill] = location.hash.split('/');
  const old = prefill && data?.agents.find((a) => nameOf(a) === decodeURIComponent(prefill));
  let files = [];
  const field = (id, label, control, hint) => h('div', { class: 'field' }, h('label', { for: id }, label), control, hint ? h('span', { class: 'hint' }, hint) : '');
  const name = h('input', { id: 'name', value: old ? nameOf(old) : '', placeholder: 'solidity-auditor', autocomplete: 'off', spellcheck: 'false' });
  const skills = h('textarea', { id: 'skills', maxlength: '500', placeholder: 'EVM smart contract audits: reentrancy, access control, oracle manipulation, upgrade safety' });
  skills.value = old?.skills ?? '';
  const prompt = h('textarea', { id: 'prompt', maxlength: '8000', class: 'tall', placeholder: 'You are a senior smart contract auditor. For each finding give severity, location, an exploit path and a fix. Say what you are unsure of.' });
  const rate = h('input', { id: 'rate', inputmode: 'decimal', value: old ? usd(old.rate) : '1.00' });
  const model = h('select', { id: 'model' }, info.models.map((m) => h('option', { value: m.id }, m.id)));
  const maxCost = h('input', { id: 'maxCost', inputmode: 'decimal', value: old ? usd(old.max_cost) : '' });
  const deposit = h('input', { id: 'deposit', inputmode: 'decimal' });
  const fileList = h('ul', { class: 'files' });
  const picker = h('input', { id: 'files', type: 'file', multiple: true, accept: '.md,.txt,.csv,.json,text/plain,text/markdown', hidden: true });
  const drop = h('div', { class: 'drop' }, h('span', { class: 'muted' }, 'Drop text files here (.md, .txt, .csv, .json), up to 10 MB in all. For each question your expert gets only the closest pieces.'),
    h('label', { class: 'btn ghost small', for: 'files', tabindex: '0' }, 'Choose files'), picker, fileList);
  const totals = h('div', { class: 'note' });
  const steps = h('ol', { class: 'progress', hidden: true });
  const create = h('button', { class: 'btn big', type: 'button' }, old ? 'Register again' : 'Create expert');
  const need = h('span', { class: 'faint' });

  const add = (list) => {
    for (const f of list) if (!files.some((g) => g.name === f.name)) files.push(f);
    drawFiles();
  };
  function drawFiles() {
    const size = files.reduce((s, f) => s + f.size, 0);
    fileList.replaceChildren(...files.map((f) => h('li', {}, h('span', {}, f.name), h('span', { class: 'size' }, `${(f.size / 1024).toFixed(1)} KB`),
      h('button', { class: 'btn ghost small', type: 'button', onclick: () => ((files = files.filter((g) => g !== f)), drawFiles()) }, 'Remove'))),
      ...(files.length ? [h('li', { class: 'faint' }, `${files.length} file${files.length > 1 ? 's' : ''}, ${(size / MB).toFixed(2)} MB of 10`)] : []));
    check();
  }
  picker.onchange = () => add(picker.files);
  drop.addEventListener('dragover', (e) => (e.preventDefault(), drop.classList.add('over')));
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => (e.preventDefault(), drop.classList.remove('over'), add(e.dataTransfer.files)));
  drop.querySelector('label').onkeydown = (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), picker.click());

  const fee = (mb) => BigInt(info.fees.audit_base) + BigInt(info.fees.audit_per_mb) * BigInt(mb);
  /** The worst one call can cost with this model and prompt, as the runner checks before it picks the expert. */
  const worst = () => {
    const p = info.models.find((m) => m.id === model.value);
    if (!p?.in) return null;
    const bytes = info.limits.template_bytes + new Blob([skills.value, prompt.value]).size + info.limits.knowledge_bytes + info.limits.public_bytes;
    return (BigInt(Math.ceil(bytes * p.in + info.limits.max_out * p.out)) + 9_999n) / 10_000n * 10_000n;
  };
  const amount = (input, fallback) => { try { return BigInt(units(input.value || fallback)); } catch { return null; } };
  let auto = { maxCost: !old, deposit: true };
  maxCost.oninput = () => (auto.maxCost = false);
  deposit.oninput = () => (auto.deposit = false);

  function check() {
    const w = worst();
    if (auto.maxCost && w !== null) maxCost.value = usd(w);
    const mb = Math.max(1, Math.ceil(files.reduce((s, f) => s + f.size, 0) / MB));
    const [r, m] = [amount(rate, '0'), amount(maxCost, '0')];
    const least = fee(mb) + BigInt(info.fees.min_deposit);
    const suggested = least + (m ?? 0n) * 5n; // the fee and room for five tasks at once
    if (auto.deposit) deposit.value = usd(suggested);
    const d = amount(deposit, '0');
    const problems = [];
    if (!NAME.test(name.value)) problems.push('a name of a-z, 0-9 and -');
    if (!skills.value.trim()) problems.push('what it knows');
    if (!prompt.value.trim()) problems.push('a prompt');
    if (files.reduce((s, f) => s + f.size, 0) > 10 * MB) problems.push('files under 10 MB');
    if (r === null) problems.push('a rate');
    if (!m) problems.push('a max cost');
    if (d === null || d < least) problems.push(`a deposit of at least ${usd(least)}`);
    const low = w !== null && m !== null && m < w;
    totals.className = `note ${low ? 'warn' : ''}`;
    totals.replaceChildren(
      h('b', {}, `You pay ${d === null ? '…' : usd(d)} USDC now: ${usd(fee(mb))} for the audit, the rest stays on your balance.`),
      h('span', { class: 'muted' }, `Your expert will be ${me}/${name.value || '<name>'}. Each task holds up to ${m === null ? '…' : usd(m)} USDC of inference from your balance and pays you ${r === null ? '…' : usd(r)} USDC when your expert delivers.`),
      ...(low ? [h('span', {}, `One call can cost up to ${usd(w)} USDC with this model: below that, the swarm will not pick your expert.`)] : []));
    create.disabled = problems.length > 0;
    need.textContent = problems.length ? `Needs ${problems.join(', ')}.` : 'One wallet confirmation.';
  }
  for (const el of [name, skills, prompt, rate, model, maxCost, deposit]) el.addEventListener('input', check);
  model.addEventListener('change', check);

  let at = 0; // the step in progress
  const step = (i, state = 'now') => {
    for (let j = 0; j < i; j++) steps.children[j].className = 'done';
    steps.children[i].className = state;
    at = i;
  };
  create.onclick = async () => {
    busy(create, true);
    steps.hidden = false;
    steps.replaceChildren(...['Sealing in this browser', 'Confirm the payment in your wallet', 'Waiting for the chain, then uploading the sealed files', 'Audit inside the TEE'].map((t) => h('li', {}, t)));
    try {
      const id = `${me}/${name.value}`;
      step(0);
      const knowledge = await Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() })));
      // The sponsor's prompt is the expert's method; what it knows is its expertise. Both are guidance inside our template.
      const materials = { name: name.value, model: model.value, expertise: skills.value.trim(), method: prompt.value, knowledge };
      const bytes = await seal(new TextEncoder().encode(JSON.stringify(materials)), info.sealKey, id); // bound to this expert
      const mb = Math.max(1, Math.ceil(bytes.length / MB));
      if (mb > 10) throw new Error('sealed, the files are over 10 MB');
      const card = { name: name.value, skills: skills.value.trim(), rate: units(rate.value), max_cost: units(maxCost.value), hash: await sha256(bytes), size_mb: mb };
      step(1);
      await pay(units(deposit.value), { Register: card });
      step(2);
      for (let t = 1; ; t++) {
        const res = await fetch(`/upload/${encodeURIComponent(me)}/${encodeURIComponent(name.value)}`, { method: 'POST', body: bytes });
        if (res.ok) break;
        const body = await res.json().catch(() => ({}));
        if (t === 30 || ![409, 429].includes(res.status)) throw new Error(body.error ?? `upload failed (${res.status})`);
        await new Promise((ok) => setTimeout(ok, 10_000)); // the runner sees a new registration within seconds
      }
      step(3);
      status('Your expert is registered. The audit takes a few minutes.', 'ok');
      data = null;
      setTimeout(() => (location.hash = `#/agent/${encodeURIComponent(name.value)}`), 1500);
    } catch (e) {
      step(at, 'failed');
      status(`${e?.message ?? e}`, 'bad');
    } finally {
      busy(create, false);
    }
  };

  $('view').replaceChildren(
    h('section', { class: 'hero' }, h('h1', {}, old ? `Change ${name.value}` : 'New expert'),
      h('p', { class: 'lead' }, old ? 'Register it again: new prompt, files or terms get a new audit. Its record stays.' : 'Three things: what it knows, how it answers, and your files. The swarm builds the agent around them; nobody but the TEE reads them.')),
    h('section', { class: 'card' },
      h('div', { class: 'two' },
        field('name', 'Name', name, 'Lowercase letters, digits and dashes. Its id is your account and this name.'),
        field('rate', 'Your rate per task, USDC', h('div', { class: 'with-unit' }, rate), 'What you earn each time your expert delivers its part.')),
      field('skills', 'What it knows · public', skills, 'Customers and the swarm read this to decide when to ask your expert. Plain words, no instructions.'),
      field('prompt', 'Prompt · sealed', prompt, 'Who your expert is and how it should answer. It goes into the swarm\'s template as guidance; it cannot change the swarm\'s rules.'),
      h('div', { class: 'field' }, h('span', {}, h('b', {}, 'Files · sealed')), drop),
      h('details', {}, h('summary', {}, 'Model, max cost and deposit'),
        h('div', { class: 'two' },
          field('model', 'Model', model, 'Prices come live from NEAR AI.'),
          field('maxCost', 'Max cost per task, USDC', h('div', { class: 'with-unit' }, maxCost), 'Set from the worst case of one call; change it if you like.')),
        field('deposit', 'Deposit now, USDC', h('div', { class: 'with-unit' }, deposit), 'The audit fee plus room for five tasks at once. Withdraw what you do not need any time.')),
      totals,
      h('div', { class: 'actions' }, create, need),
      steps),
  );
  check();
}
