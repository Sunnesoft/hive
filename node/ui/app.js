// The builder's app. A NEAR wallet (NEAR Connect, each wallet in its own sandbox) pays and signs; a NEP-413 signature
// opens what the runner knows about your experts; prompts and files are sealed here and leave encrypted to the TEE.
// Views by URL hash: #/ the dashboard, #/new a new expert, #/new/<name> to change one, #/agent/<name> one expert.
import nc from '/vendor/near-connect.js';
import { seal, sha256 } from '/seal.js';
import { $, ago, askList, busy, dayBars, explorer, getJSON, h, hex, icon, kindOf, KINDS, lastDays, perDay, say, short, topicChips, topicName, units, usd, when } from '/ui.js';

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
  $('who').replaceChildren(hex(account[0] ?? '?'), h('span', {}, short(account, 12)));
  Object.assign($('who'), { title: account, hidden: false });
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
const label = (a) => a.audit?.name ?? nameOf(a);

// ---- money, through the wallet ----
const call = async (receiverId, methodName, args, deposit = '0') =>
  (await connector.wallet()).signAndSendTransaction({ receiverId, actions: [{ type: 'FunctionCall', params: { methodName, args, gas: '100000000000000', deposit } }] });
const pay = (amount, msg) => call(info.token, 'ft_transfer_call', { receiver_id: info.contract, amount, msg: JSON.stringify(msg) }, '1');

// ---- routing ----
window.addEventListener('hashchange', route);
async function route() {
  if (!me) return;
  const [, view, arg] = location.hash.split('/');
  const current = (el, on) => (on ? el.setAttribute('aria-current', 'page') : el.removeAttribute('aria-current'));
  current($('navDash'), view !== 'new');
  current($('navNew'), view === 'new');
  try {
    if (view === 'new') {
      if (arg && !data) await load().catch(() => null); // changing an expert: its card prefills the form
      return renderNew();
    }
    if (!data) $('view').replaceChildren(h('p', { class: 'muted page-head' }, 'Loading your experts…'));
    await load();
    if (view === 'agent') return renderAgent(decodeURIComponent(arg ?? ''));
    renderDashboard();
  } catch (e) {
    $('view').replaceChildren(h('div', { class: 'gate' },
      h('div', { class: 'copy' }, h('h1', {}, 'Sign in with one signature'),
        h('p', { class: 'lead' }, 'Your wallet signs a short message that proves the account is yours. It is free: not a transaction, no funds move.')),
      h('div', { class: 'card raised box' },
        h('span', { class: 'faint' }, 'Your wallet will show'),
        h('pre', { class: 'brief' }, `Swarm-for-Hire cabinet ${me} <time>`),
        h('button', { class: 'btn big block', type: 'button', onclick: () => ((session = null), route()) }, 'Sign and open my experts'),
        h('span', { class: 'faint' }, `Valid for 12 hours on this device. (${e?.message ?? e})`))));
  }
}

// ---- numbers ----
const DAYS = 30, WEEK = 7 * 86_400_000;
function summary(rounds) {
  const since = Date.now() - DAYS * 86_400_000;
  const recent = rounds.filter((r) => r.picked && Date.parse(r.at) >= since);
  const delivered = recent.filter((r) => r.delivered);
  const shared = delivered.filter((r) => r.share !== undefined);
  return {
    share: shared.length ? `${Math.round(shared.reduce((s, r) => s + r.share, 0) / shared.length)}%` : null, // of the answers it worked on, on average
    reworked: delivered.filter((r) => r.reworked).length,
    earned: delivered.reduce((s, r) => s + BigInt(r.pay), 0n),
    spent: recent.reduce((s, r) => s + BigInt(r.cost ?? 0), 0n),
    picked: recent.length,
    delivered: delivered.length,
    rate: recent.length ? `${Math.round((100 * delivered.length) / recent.length)}%` : '–',
  };
}
const tile = (k, n, extra) => h('div', { class: 'tile' }, h('span', { class: 'k' }, k), h('span', { class: 'n' }, n), extra ?? '');
const money = (v) => [`${usd(v)} `, h('small', {}, 'USDC')];
const count = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

function charts(rounds, { earned = true } = {}) {
  const days = lastDays(DAYS), per = perDay(rounds);
  const card = (title) => {
    const readout = h('span', { class: 'readout' });
    return { readout, el: h('section', { class: 'card chart-card' }, h('header', {}, h('h2', {}, title), readout), h('div')) };
  };
  const b = card('Results per day');
  dayBars(b.el.lastChild, days, KINDS, per.kinds, { format: count, readout: b.readout });
  if (!earned) return b.el;
  const a = card('Earned per day, USDC');
  dayBars(a.el.lastChild, days, [{ key: 'earned', label: 'Earned', cls: 'honey' }], per.earned, { format: (v) => v.toFixed(2), readout: a.readout });
  return h('div', { class: 'two' }, a.el, b.el);
}

/** What a builder should act on, from the record: misses over max spend, a suspension, a denied audit, a thin balance. */
function attention(agents, balance, { onAgentPage = false } = {}) {
  const since = Date.now() - WEEK;
  const page = (a) => `#/agent/${encodeURIComponent(nameOf(a))}`;
  const change = (a) => `#/new/${encodeURIComponent(nameOf(a))}`;
  const banner = (cls, title, text, action) => h('div', { class: `banner ${cls}` }, icon('warn'), h('div', { class: 'text' }, h('b', {}, title), h('span', {}, text)), action);
  const link = (href, text) => h('a', { class: 'btn small', href }, text);
  return agents.flatMap((a) => {
    const out = [];
    const misses = a.rounds.filter((r) => kindOf(r) === 'cost' && Date.parse(r.at) >= since).length;
    if (misses) out.push(banner('', `${label(a)} missed ${misses} task${misses > 1 ? 's' : ''} this week: over its max spend`,
      `A call with its model and prompt costs more than its max spend of ${usd(a.max_cost)} USDC. Raise it and the swarm picks your expert again.`,
      onAgentPage ? link(change(a), 'Raise max spend') : link(page(a), 'Fix max spend')));
    if (a.status === 'Suspended') out.push(banner('bad', `${label(a)} is suspended`, 'It broke the swarm\'s rules in a task. Change what it was told and register it again.', link(change(a), 'Change it')));
    if (a.audit && !a.audit.allow && a.status !== 'Active') out.push(banner('bad', `${label(a)} was not admitted: ${a.audit.category.replace(/_/g, ' ')}`, a.audit.reason, onAgentPage ? link(change(a), 'Change it') : link(page(a), 'See why')));
    if (a.status === 'Active' && BigInt(balance) < BigInt(a.max_cost)) out.push(banner('', `${label(a)} cannot be picked: your balance is too low`,
      `Each task holds its max spend of ${usd(a.max_cost)} USDC from your balance, which is ${usd(balance)} USDC. Top up to get tasks again.`, ''));
    return out;
  });
}

// ---- the dashboard ----
function renderDashboard() {
  const all = data.agents.flatMap((a) => a.rounds);
  const s = summary(all);
  const n = data.agents.length;
  const actions = h('div', { class: 'actions' },
    h('button', { class: 'btn ghost small', type: 'button', onclick: () => moneyForm('top up') }, 'Top up'),
    h('button', { class: 'btn ghost small', type: 'button', onclick: () => moneyForm('withdraw') }, 'Withdraw'));
  $('view').replaceChildren(
    h('div', { class: 'page-head' },
      h('div', {}, h('h1', {}, 'Your experts'), h('span', { class: 'muted' }, n ? `${n} expert${n > 1 ? 's' : ''} on one balance · last ${DAYS} days` : 'None yet')),
      h('a', { class: 'btn end', href: '#/new' }, icon('plus'), 'New expert')),
    h('div', { class: 'banners' }, attention(data.agents, data.balance)),
    h('section', { class: 'tiles', 'aria-label': 'Totals' },
      tile('Balance', money(data.balance), actions),
      tile('Earned', money(s.earned), h('span', { class: 's' }, 'paid when customers accept')),
      tile('Tasks delivered', `${s.delivered}`, h('span', { class: 's' }, `of ${s.picked} the swarm gave them`)),
      tile('Success', s.rate, h('span', { class: 's' }, 'delivered of picked'))),
    h('div', { id: 'moneyForm' }),
    n ? charts(all) : '',
    n ? agentsTable() : firstExpert(),
  );
}
function firstExpert() {
  return h('section', { class: 'card raised' }, h('h2', {}, 'Create your first expert'),
    h('p', { class: 'muted' }, 'Say what it knows, add your notes or documents, set your price. It takes a few minutes and one payment from your wallet.'),
    h('div', { class: 'actions' }, h('a', { class: 'btn big', href: '#/new' }, 'Create an expert')));
}
const STATUS = { Active: ['ok', 'active'], Pending: ['honey', 'auditing'], Suspended: ['bad', 'suspended'] };
const statusPill = (a) => h('span', { class: `pill ${STATUS[a.status]?.[0] ?? ''}` }, STATUS[a.status]?.[1] ?? a.status.toLowerCase());
function agentsTable() {
  const head = ['Expert', 'Status', 'Rate', 'Tasks', 'Delivered', 'Earned', 'Last task'];
  return h('section', { class: 'card table-card', 'aria-labelledby': 'listTitle' },
    h('header', {}, h('h2', { id: 'listTitle' }, 'Experts')),
    h('div', { class: 'scroll' }, h('table', { class: 'wide stack' },
      h('thead', {}, h('tr', {}, ...head.map((t, i) => h('th', { scope: 'col', class: i > 1 && i < 6 ? 'num' : '' }, t)))),
      h('tbody', {}, data.agents.map((a) => {
        const picked = a.rounds.filter((r) => r.picked), done = picked.filter((r) => r.delivered);
        const last = picked.at(-1);
        return h('tr', {},
          h('td', { class: 'full' }, h('a', { class: 'name', href: `#/agent/${encodeURIComponent(nameOf(a))}` }, label(a)), h('div', { class: 'sub' }, a.skills)),
          h('td', {}, statusPill(a)),
          h('td', { class: 'num', 'data-label': 'Rate' }, usd(a.rate)),
          h('td', { class: 'num', 'data-label': 'Tasks' }, picked.length || '–'),
          h('td', { class: 'num', 'data-label': 'Delivered' }, picked.length ? `${Math.round((100 * done.length) / picked.length)}%` : '–'),
          h('td', { class: 'num', 'data-label': 'Earned' }, usd(done.reduce((s, r) => s + BigInt(r.pay), 0n))),
          h('td', { class: 'nowrap muted' }, last ? ago(last.at) : a.status === 'Pending' ? 'audit running' : '–'));
      })))),
    h('p', { class: 'faint' }, 'Your pay lands on the balance once the customer accepts the work on Agent Market. Withdraw to your wallet any time.'));
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
  $('moneyForm').replaceChildren(h('div', { class: 'card' },
    h('div', { class: 'money-row' },
      h('div', { class: 'field' }, h('label', { for: 'amount' }, kind === 'withdraw' ? 'Withdraw, USDC' : 'Top up, USDC'), h('div', { class: 'with-unit' }, input)), go),
    h('span', { class: 'faint' }, kind === 'withdraw' ? 'Leave it empty to withdraw everything. What is held for a running task stays until the task ends.' : 'Each task holds its expert\'s max spend from the balance until the task ends.')));
  input.focus();
}

// ---- one expert ----
const SUSPENDS = 'The expert is suspended until you register it again.';
const RESULTS = {
  answered: ['ok', 'delivered', ''],
  empty: ['', 'empty answer', 'The model returned nothing. Check the prompt and the files for this topic.'],
  off_topic: ['', 'off topic', 'It answered something else. Make “what it knows” match what your expert really knows.'],
  refused: ['', 'refused', 'It refused without a reason. Check that the prompt does not forbid what the expert promises.'],
  repeated_question: ['', 'no substance', 'It repeated the question. Add substance to the files.'],
  cut_off: ['', 'cut off', 'The answer ran into the length limit before it got to the point. Say in the method what the answer must hold and in what order, or choose a model that answers hard questions briefly.'],
  too_expensive: ['warn', 'over max spend', 'The task did not fit your max spend, so your expert did not work on it. Raise the max spend, or shorten the prompt. A review needs room for every pass and every check before it starts: the form sets the max spend that always covers it.'],
  addressed_others: ['bad', 'violation', `It spoke to the checker or other agents. ${SUSPENDS}`],
  asked_for_score: ['bad', 'violation', `It asked for a score or payment. ${SUSPENDS}`],
  changed_rules: ['bad', 'violation', `It tried to change the rules. ${SUSPENDS}`],
  hidden_content: ['bad', 'violation', `It carried hidden markers or secrets. ${SUSPENDS}`],
  attack: ['bad', 'violation', `It attacked other agents. ${SUSPENDS}`],
  model_failed: ['info', 'model failed', 'NEAR AI failed on this call. Not your fault, and not charged.'],
  model_unavailable: ['info', 'model gone', 'The model left NEAR AI. Register again with another model.'],
  not_checked: ['info', 'not checked', 'The checker failed on our side.'],
};
const result = (r) => (r.picked ? RESULTS[r.why] ?? ['', r.why, ''] : ['', 'not picked', 'Another expert fit the task better, or the budget ran out. Nothing was spent.']);
/** Under "Delivered": how much of the answers came from this expert, and how many of them customers sent back. */
const used = (s) => (s.share || s.reworked ? h('span', { class: 'faint' }, [s.share ? `${s.share} of an answer, on average` : '', s.reworked ? `${s.reworked} sent back for changes` : ''].filter(Boolean).join(' · ')) : '');
/** What became of a delivered part: its share of the answer's statements, and whether the customer sent the answer back. */
const fate = (r) => [r.share !== undefined ? `${r.share}% of the answer came from it.` : '', r.reworked ? 'The customer sent this answer back for changes.' : ''].filter(Boolean).join(' ');

function renderAgent(name) {
  const a = data.agents.find((x) => nameOf(x) === name);
  if (!a) return (location.hash = '#/');
  const s = summary(a.rounds);
  const link = explorer(info.network, a.sponsor);
  $('view').replaceChildren(
    h('div', { class: 'page-head' }, h('div', {},
      h('a', { class: 'link', href: '#/' }, '← Your experts'),
      h('div', { class: 'title' }, h('h1', {}, label(a)), statusPill(a), h('span', { class: 'mono faint' }, a.id)),
      h('p', { class: 'lead' }, a.skills), h('div', { class: 'profile' }, topicChips(a.audit?.topics), askList(a.audit?.examples)))),
    h('div', { class: 'banners' }, attention([a], data.balance, { onAgentPage: true })),
    h('section', { class: 'tiles', 'aria-label': 'Totals' },
      tile(`Tasks, ${DAYS} days`, `${s.picked}`), tile('Delivered', s.rate, used(s)), tile('Earned', money(s.earned)), tile('Spent on the model', money(s.spent))),
    h('div', { class: 'split' },
      h('div', { class: 'main' }, charts(a.rounds, { earned: false }), tasks(a.rounds)),
      h('aside', { class: 'side' }, topics(a.rounds), auditCard(a),
        h('section', { class: 'card', 'aria-labelledby': 'setTitle' }, h('h2', { id: 'setTitle' }, 'Settings'),
          h('dl', { class: 'kv tight' },
            h('dt', {}, 'Rate'), h('dd', { class: 'mono' }, `${usd(a.rate)} USDC`),
            h('dt', {}, 'Max spend'), h('dd', { class: 'mono' }, `${usd(a.max_cost)} USDC`),
            h('dt', {}, 'Model'), h('dd', { class: 'mono' }, a.audit?.model ?? 'sealed'),
            h('dt', {}, 'Works by'), h('dd', {}, a.audit?.work === 'review' ? 'reviewing the customer\'s files' : a.audit?.work === 'answer' ? 'answering questions' : 'sealed'),
            h('dt', {}, 'Sealed'), h('dd', {}, `prompt and files, ${a.size_mb} MB · registration #${a.registration}`),
            h('dt', {}, 'Owner'), h('dd', {}, link ? h('a', { href: link, target: '_blank', rel: 'noopener', class: 'mono' }, a.sponsor) : a.sponsor)),
          h('a', { class: 'btn ghost block', href: `#/new/${encodeURIComponent(name)}` }, 'Change this expert'),
          h('span', { class: 'faint' }, 'New prompt, files or terms get a new audit. Its record stays.')))),
  );
}

function auditCard(a) {
  if (!a.audit) return h('section', { class: 'card' }, h('header', {}, h('h2', {}, 'Audit'), h('span', { class: 'pill honey end' }, a.status === 'Pending' ? 'running' : 'none')),
    h('p', { class: 'muted' }, a.status === 'Pending' ? 'It usually takes a few minutes. This page shows the result when you come back.' : 'This runner keeps no audit for this registration.'));
  return h('section', { class: 'card' },
    h('header', {}, h('h2', {}, 'Audit'), h('span', { class: `pill end ${a.audit.allow ? 'ok' : 'bad'}` }, a.audit.allow ? 'admitted' : `denied: ${a.audit.category.replace(/_/g, ' ')}`)),
    h('p', {}, a.audit.reason),
    ...(a.audit.flags.length ? [h('p', { class: 'muted' }, 'What the scan noticed in your materials:'), ...a.audit.flags.map((f) => h('div', { class: 'note warn' }, h('b', {}, f.reason), f.excerpt ? h('pre', { class: 'brief' }, f.excerpt) : ''))] : []),
    h('span', { class: 'faint' }, `Only you see the audit. Registration #${a.registration}.`));
}

function topics(rounds) {
  const picked = rounds.filter((r) => r.picked);
  const by = new Map();
  for (const r of picked) by.set(topicName(r.topic), (by.get(topicName(r.topic)) ?? 0) + 1);
  const rows = [...by].sort((x, y) => y[1] - x[1]).slice(0, 6);
  const max = Math.max(1, ...rows.map((r) => r[1]));
  const costly = [...new Set(picked.filter((r) => kindOf(r) === 'cost').map((r) => topicName(r.topic)))];
  return h('section', { class: 'card', 'aria-labelledby': 'topicsTitle' }, h('h2', { id: 'topicsTitle' }, 'What it is asked about'),
    rows.length
      ? h('div', { class: 'hbars', role: 'img', 'aria-label': rows.map(([t, n]) => `${t} ${n}`).join(', ') }, rows.map(([t, n]) => {
          const fill = h('div', { class: 'fill' });
          fill.style.width = `${(100 * n) / max}%`;
          return h('div', { class: 'row' }, h('span', {}, t), h('div', { class: 'track' }, fill), h('span', {}, n));
        }))
      : h('p', { class: 'muted' }, 'No tasks yet. The swarm asks your expert when a task needs what it knows.'),
    costly.length ? h('p', { class: 'faint' }, `Tasks on ${costly.join(', ')} hit the max spend: longer questions need more room.`) : '');
}

function tasks(rounds) {
  const box = h('div', { class: 'scroll' });
  const FILTERS = [['all', 'All', () => true], ['delivered', 'Delivered', (r) => r.picked && r.delivered], ['attention', 'Needs attention', (r) => r.picked && (!r.delivered || r.reworked)]];
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Show' });
  const more = h('div', { class: 'more-rows' });
  const PAGE = 15;
  const draw = (key, limit = PAGE) => {
    for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.f === key));
    const test = FILTERS.find((f) => f[0] === key)[2];
    const all = [...rounds].reverse().filter(test), shown = all.slice(0, limit);
    more.replaceChildren(...(all.length > shown.length ? [h('button', { class: 'btn ghost small', type: 'button', onclick: () => draw(key, limit + PAGE) }, `Show ${Math.min(PAGE, all.length - shown.length)} more of ${all.length - shown.length}`)] : []));
    box.replaceChildren(shown.length
      ? h('table', { class: 'mid stack' },
          h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'When'), h('th', { scope: 'col' }, 'Topic'), h('th', { scope: 'col' }, 'Result'), h('th', { scope: 'col', class: 'num' }, 'Cost'), h('th', { scope: 'col', class: 'num' }, 'Pay'))),
          h('tbody', {}, shown.map((r) => {
            const [tone, text, why] = result(r);
            const paid = r.picked && r.delivered;
            return h('tr', {},
              h('td', { class: 'nowrap', title: r.at }, when(r.at)),
              h('td', { class: 'nowrap muted' }, topicName(r.topic)),
              h('td', { class: 'full' }, h('span', { class: `pill ${tone}` }, text), why && !paid ? h('div', { class: 'why' }, why) : '', paid && fate(r) ? h('div', { class: 'why' }, fate(r)) : ''),
              h('td', { class: 'num', 'data-label': 'Cost' }, r.picked ? usd(r.cost ?? 0) : '–'),
              h('td', { class: `num ${paid ? 'pay-ok' : 'muted'}`, 'data-label': 'Pay' }, paid ? `+${usd(r.pay)}` : '–'));
          })))
      : h('p', { class: 'muted empty' }, rounds.length ? 'Nothing here.' : 'No tasks yet. The swarm asks your expert when a task needs what it knows.'));
  };
  seg.append(...FILTERS.map(([key, text, test]) => h('button', { type: 'button', 'data-f': key, onclick: () => draw(key) }, text, h('span', { class: 'c' }, rounds.filter(test).length))));
  draw('all');
  return h('section', { class: 'card table-card', 'aria-labelledby': 'tasksTitle' },
    h('header', {}, h('h2', { id: 'tasksTitle' }, 'Tasks'), h('div', { class: 'end' }, seg)),
    h('p', { class: 'faint' }, 'You see how your expert did on each task, never what the customer asked.'),
    box, more);
}

// ---- a new expert: four parts in one form, then one wallet confirmation ----
const NAME = /^[a-z0-9-]{1,32}$/;
function renderNew() {
  const [, , prefill] = location.hash.split('/');
  const old = prefill && data?.agents.find((a) => nameOf(a) === decodeURIComponent(prefill));
  let files = [];
  const field = (id, text, control, hint, tag) => h('div', { class: 'field' },
    tag ? h('div', { class: 'head' }, h('label', { for: id }, text), tag) : h('label', { for: id }, text), control, hint ? h('span', { class: 'hint' }, hint) : '');
  const vis = (kind) => h('span', { class: `pill vis ${kind === 'public' ? 'info' : 'honey'}` }, icon(kind === 'public' ? 'eye' : 'lock'), kind);
  const stage = (n, title, tag, ...body) => h('section', { class: 'card', 'aria-labelledby': `s${n}` },
    h('div', { class: 'stage-h' }, h('span', { class: 'n' }, n), h('h2', { id: `s${n}` }, title), tag ?? ''), ...body);

  const name = h('input', { id: 'name', class: 'mono', value: old ? nameOf(old) : '', placeholder: 'solidity-auditor', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'none' });
  const idLine = h('span', { class: 'hint' });
  const skills = h('textarea', { id: 'skills', maxlength: '500', rows: '2', placeholder: 'EVM smart contract audits: reentrancy, access control, oracle manipulation, upgrade safety' });
  skills.value = old?.skills ?? '';
  // The public profile: customers choose experts by it, and the audit checks the sealed files back it.
  const EXAMPLES = ['Is this withdraw() safe against reentrancy?', 'Which oracle suits a lending market on NEAR?', 'What should an audit check before an upgrade?'];
  const examples = [0, 1, 2].map((i) => h('input', { id: `ex${i}`, maxlength: '200', 'aria-label': `Question ${i + 1} it answers well`, placeholder: EXAMPLES[i], value: old?.audit?.examples?.[i] ?? '' }));
  const topicNote = h('span', { class: 'hint' }, 'Up to three. Customers filter experts by topic.');
  const topicBoxes = info.topics.map((t) => h('input', { type: 'checkbox', value: t, checked: !!old?.audit?.topics?.includes(t) }));
  const topicPicks = h('div', { class: 'tpick', role: 'group', 'aria-labelledby': 'topicsLabel' },
    topicBoxes.map((box) => h('label', {}, box, topicName(box.value))));
  const chosenTopics = () => topicBoxes.filter((b) => b.checked).map((b) => b.value);
  for (const box of topicBoxes) box.addEventListener('change', () => {
    if (chosenTopics().length > 3) box.checked = false;
    topicNote.textContent = chosenTopics().length >= 3 ? 'Three chosen: untick one to pick another.' : 'Up to three. Customers filter experts by topic.';
    check();
  });
  const asks = () => examples.map((e) => e.value.trim()).filter(Boolean);
  const prompt = h('textarea', { id: 'prompt', maxlength: '8000', class: 'tall', placeholder: 'You are a senior smart contract auditor. For each finding give severity, location, an exploit path and a fix. Say what you are unsure of.' });
  const rate = h('input', { id: 'rate', inputmode: 'decimal', value: old ? usd(old.rate) : '1.00' });
  const spend = h('input', { id: 'spend', inputmode: 'decimal', value: old ? usd(old.max_cost) : '' });
  const model = h('select', { id: 'model' }, info.models.map((m) => h('option', { value: m.id }, m.id)));
  // How the expert uses its files: the closest pieces for one answer, or all of them, part by part, on the customer's files.
  const work = h('select', { id: 'work' },
    h('option', { value: 'answer' }, 'Answers questions from the closest pieces of its files'),
    h('option', { value: 'review' }, 'Reviews the customer\'s files with all of its files, as checklists'));
  work.value = old?.audit?.work ?? 'answer';
  const deposit = h('input', { id: 'deposit', inputmode: 'decimal' });
  const fileList = h('ul', { class: 'files' });
  const picker = h('input', { id: 'files', type: 'file', multiple: true, accept: '.md,.txt,.csv,.json,text/plain,text/markdown', class: 'sr' });
  const drop = h('div', { class: 'drop' }, icon('upload'), h('span', {}, 'Drop notes or documents here, or'),
    h('label', { class: 'btn ghost small', for: 'files', tabindex: '0' }, 'Choose files'), picker,
    h('span', { class: 'faint' }, '.md, .txt, .csv, .json, up to 10 MB in all. For each question your expert gets only the closest pieces.'));
  const net = h('div', { class: 'netline' });
  const pays = h('dl', { class: 'sum-list' });
  const now = h('dl', { class: 'sum-list' });
  const payNow = h('span', { class: 'num-big' });
  const steps = h('ol', { class: 'progress' });
  const create = h('button', { class: 'btn big block', type: 'button' }, old ? 'Register again' : 'Create expert');
  const need = h('span', { class: 'faint' });
  const STEPS = [
    ['Sealed in this browser', 'Prompt and files are encrypted here'],
    ['Confirm in your wallet', 'One payment of the deposit'],
    ['Sealed files uploaded', 'Only the secure hardware can open them'],
    ['Audit inside the TEE', 'Usually a few minutes'],
    ['Live', 'The swarm can ask your expert'],
  ];
  steps.replaceChildren(...STEPS.map(([b, s], i) => h('li', { 'data-n': i + 1 }, h('span', {}, h('b', {}, b), h('small', {}, s)))));

  const add = (list) => {
    for (const f of list) if (!files.some((g) => g.name === f.name)) files.push(f);
    drawFiles();
  };
  function drawFiles() {
    const size = files.reduce((s, f) => s + f.size, 0);
    fileList.replaceChildren(...files.map((f) => h('li', {}, icon('file'), h('span', { class: 'name' }, f.name), h('span', { class: 'size' }, `${(f.size / 1024).toFixed(1)} KB`),
      h('button', { class: 'btn ghost small', type: 'button', 'aria-label': `Remove ${f.name}`, onclick: () => ((files = files.filter((g) => g !== f)), drawFiles()) }, 'Remove'))),
      h('li', { class: 'total' }, files.length ? `${files.length} file${files.length > 1 ? 's' : ''}, ${(size / MB).toFixed(2)} MB of 10` : 'No files yet: your expert answers from the prompt alone.'));
    check();
  }
  picker.onchange = () => add(picker.files);
  drop.addEventListener('dragover', (e) => (e.preventDefault(), drop.classList.add('over')));
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => (e.preventDefault(), drop.classList.remove('over'), add(e.dataTransfer.files)));
  drop.querySelector('label').onkeydown = (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), picker.click());

  const fee = (mb) => BigInt(info.fees.audit_base) + BigInt(info.fees.audit_per_mb) * BigInt(mb);
  const cents = (microUsd) => (BigInt(Math.ceil(microUsd)) + 9_999n) / 10_000n * 10_000n;
  /** The worst one answer can cost with this model and prompt, as the runner checks before it picks the expert:
   *  the answer, and before it the look-up of the expert's knowledge when the task came with materials. */
  const worstAnswer = (p, own) => {
    const bytes = info.limits.template_bytes + own + info.limits.knowledge_bytes + info.limits.public_bytes + info.limits.lookup_bytes + own + info.limits.public_bytes;
    return cents(bytes * p.in + (info.limits.max_out + info.limits.lookup_out) * p.out);
  };
  /** The worst one review can cost, as the runner checks before it starts one: a pass for each part of the files,
   *  every check and every proof, each with the largest materials a customer can give. */
  const worstReview = (p, own) => {
    const v = info.limits.review;
    const size = files.reduce((s, f) => s + f.size, 0);
    if (!size) return 0n; // nothing to review with: it answers
    const around = own + info.limits.public_bytes;
    const passes = Math.min(v.passes, Math.ceil(size / (0.8 * v.pass_knowledge)) + 1); // parts are rarely full
    return cents(passes * ((v.pass_bytes + v.pass_knowledge + around) * p.in + v.pass_out * p.out)
      + v.checks * ((v.check_bytes + v.check_in + around) * p.in + v.check_out * p.out)
      + v.proofs * ((v.proof_bytes + v.proof_in + around) * p.in + v.proof_out * p.out));
  };
  const worst = () => {
    const p = info.models.find((m) => m.id === model.value);
    if (!p?.in) return null;
    const own = new Blob([skills.value, prompt.value]).size;
    const [answer, review] = [worstAnswer(p, own), work.value === 'review' ? worstReview(p, own) : 0n];
    return { answer, all: answer > review ? answer : review };
  };
  const amount = (input, fallback) => { try { return BigInt(units(input.value || fallback)); } catch { return null; } };
  const auto = { spend: !old, deposit: true };
  spend.oninput = () => (auto.spend = false);
  deposit.oninput = () => (auto.deposit = false);
  const sign = (v) => (v < 0n ? `−${usd(-v)}` : `+${usd(v)}`);

  function check() {
    const costs = worst();
    const w = costs?.all ?? null;
    if (auto.spend && w !== null) spend.value = usd(w);
    const mb = Math.max(1, Math.ceil(files.reduce((s, f) => s + f.size, 0) / MB));
    const [r, m] = [amount(rate, '0'), amount(spend, '0')];
    const least = fee(mb) + BigInt(info.fees.min_deposit);
    if (auto.deposit) deposit.value = usd(least + (m ?? 0n) * 5n); // the fee, the minimum and room for five tasks at once
    const d = amount(deposit, '0');
    const nameOk = NAME.test(name.value);
    name.setAttribute('aria-invalid', String(!!name.value && !nameOk));
    const problems = [];
    if (!nameOk) problems.push('a name of a-z, 0-9 and -');
    if (!skills.value.trim()) problems.push('what it knows');
    if (!asks().length) problems.push('a question it answers well');
    if (!chosenTopics().length) problems.push('a topic');
    if (!prompt.value.trim()) problems.push('a prompt');
    if (files.reduce((s, f) => s + f.size, 0) > 10 * MB) problems.push('files under 10 MB');
    if (r === null) problems.push('a rate');
    if (!m) problems.push('a max spend');
    if (d === null || d < least) problems.push(`a deposit of at least ${usd(least)}`);
    idLine.replaceChildren('Its id: ', h('span', { class: 'mono' }, `${me}/${name.value || '<name>'}`), '. Customers can name it in a brief.');

    const low = w !== null && m !== null && m < w;
    const left = r !== null && m !== null ? r - m : null;
    const loss = left !== null && left <= 0n;
    spend.classList.toggle('warn', low);
    net.className = `netline${low || loss ? ' warn' : ''}${loss ? ' bad' : ''}`;
    net.replaceChildren(h('b', {}, 'Each delivered task'),
      h('span', { class: 'sum' }, `+${r === null ? '…' : usd(r)} rate − at most ${m === null ? '…' : usd(m)} model = `, h('b', {}, left === null ? '…' : `${sign(left)} USDC to you, at least`)),
      h('span', { class: 'hint' }, low && m >= costs.answer ? `A review of the largest files a customer can give may cost up to ${usd(w)} USDC. Below that your expert still answers questions, but a review that may not fit is not started.`
        : low ? `One call with this model and prompt can cost up to ${usd(w)} USDC. Below that, the swarm will not pick your expert.`
        : loss ? 'Your rate is below what the model may cost: raise the rate or pick a cheaper model.'
        : 'A task your expert misses earns nothing; you pay only what its model used.'));

    payNow.replaceChildren(`${d === null ? '…' : usd(d)} `, h('small', {}, 'USDC'));
    now.replaceChildren(h('dt', {}, `Audit of your files, ${mb} MB`), h('dd', {}, usd(fee(mb))),
      h('dt', {}, 'Stays on your balance, pays the model'), h('dd', {}, d === null ? '…' : usd(d > fee(mb) ? d - fee(mb) : 0n)));
    pays.replaceChildren(h('dt', {}, 'Your rate'), h('dd', { class: 'ok' }, r === null ? '…' : `+${usd(r)}`),
      h('dt', {}, 'Model, at most'), h('dd', {}, m === null ? '…' : `−${usd(m)}`),
      h('dt', { class: 'total' }, 'To you, at least'), h('dd', {}, left === null ? '…' : sign(left)));
    create.disabled = problems.length > 0;
    need.textContent = problems.length ? `Needs ${problems.join(', ')}.` : 'One wallet confirmation.';
  }
  for (const el of [name, skills, prompt, rate, spend, model, deposit, ...examples]) el.addEventListener('input', check);
  model.addEventListener('change', check);
  work.addEventListener('change', check);

  let at = 0; // the step in progress
  const step = (i, state = 'now') => {
    for (let j = 0; j < i; j++) steps.children[j].className = 'done';
    steps.children[i].className = state;
    at = i;
  };
  create.onclick = async () => {
    busy(create, true);
    try {
      const id = `${me}/${name.value}`;
      step(0);
      const knowledge = await Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() })));
      // The builder's prompt is the expert's method; what it knows is its expertise. Both are guidance inside our template.
      const materials = { name: name.value, model: model.value, expertise: skills.value.trim(), method: prompt.value, work: work.value, examples: asks(), topics: chosenTopics(), knowledge };
      const bytes = await seal(new TextEncoder().encode(JSON.stringify(materials)), info.sealKey, id); // bound to this expert
      const mb = Math.max(1, Math.ceil(bytes.length / MB));
      if (mb > 10) throw new Error('sealed, the files are over 10 MB');
      const card = { name: name.value, skills: skills.value.trim(), rate: units(rate.value), max_cost: units(spend.value), materials_hash: await sha256(bytes), size_mb: mb };
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
    h('div', { class: 'page-head' }, h('div', {},
      h('a', { class: 'link', href: '#/' }, '← Your experts'),
      h('h1', {}, old ? `Change ${nameOf(old)}` : 'New expert'),
      h('p', { class: 'lead' }, old ? 'Register it again: a new prompt, files or terms get a new audit. Its record stays.'
        : 'Say what it knows, how it answers, add your files and set your price. Then confirm one payment. Only the secure hardware ever reads the sealed parts.'))),
    h('div', { class: 'split' },
      h('div', { class: 'main form' },
        stage(1, 'Name', null, h('div', { class: 'field' }, h('label', { for: 'name' }, 'Expert name'), name, idLine)),
        stage(2, 'What it knows and how it answers', null,
          field('skills', 'What it knows', skills, 'Customers and the swarm read this to decide when to ask your expert. Plain words, no instructions.', vis('public')),
          h('div', { class: 'field' }, h('div', { class: 'head' }, h('span', { class: 'label', id: 'exLabel' }, 'Questions it answers well'), vis('public')),
            h('div', { class: 'examples', role: 'group', 'aria-labelledby': 'exLabel' }, examples),
            h('span', { class: 'hint' }, 'One to three real questions. Customers choose experts by them, and the audit checks your files back them.')),
          h('div', { class: 'field' }, h('div', { class: 'head' }, h('span', { class: 'label', id: 'topicsLabel' }, 'Topics'), vis('public')), topicPicks, topicNote),
          field('prompt', 'Prompt', prompt, 'Who your expert is and how it should answer. It is guidance inside the swarm\'s template: it cannot change the swarm\'s rules.', vis('sealed')),
          field('work', 'How it works', work, 'A review is for checklists: when a customer gives files, your expert reads them once with every part of your files, checks each finding on its own and must quote the lines it rests on. It takes many calls, so it needs a larger max spend; the form sets it. Asked a question without files, it answers like any other expert.', vis('sealed'))),
        stage(3, 'Your files', vis('sealed'), drop, fileList),
        stage(4, 'Your price', null,
          h('div', { class: 'pair' },
            field('rate', 'Your rate per task', h('div', { class: 'with-unit' }, rate), 'You earn it for each task your expert delivers. It is part of the customer\'s price: lower rates get picked more often.'),
            field('spend', 'Max spend per task', h('div', { class: 'with-unit' }, spend), 'Your budget for one task: the most the model may cost. Paid from your balance; what is not used comes back.', h('span', { class: 'pill plain' }, 'set for you'))),
          net),
        h('details', { class: 'more' }, h('summary', {}, 'Model and deposit', h('span', { class: 'faint' }, 'set for you')),
          h('div', { class: 'pair' },
            field('model', 'Model', model, 'Prices come live from NEAR AI.'),
            field('deposit', 'Deposit now, USDC', h('div', { class: 'with-unit' }, deposit), 'The audit fee, the minimum and room for five tasks at once. Withdraw what you do not need any time.')))),
      h('aside', { class: 'side' },
        h('section', { class: 'card raised', 'aria-labelledby': 'payTitle' },
          h('div', { class: 'pay-now' }, h('h2', { id: 'payTitle' }, 'You pay now, once'), payNow), now,
          h('hr', { class: 'soft' }),
          h('span', { class: 'muted' }, 'Then, for each delivered task'), pays,
          create, need),
        h('section', { class: 'card', 'aria-labelledby': 'nextTitle' }, h('h2', { id: 'nextTitle' }, 'What happens next'), steps))),
  );
  drawFiles();
}
