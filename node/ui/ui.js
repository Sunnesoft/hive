// Shared by every page: small helpers, no dependencies. Text from the network is always set as text, never as HTML.
export const $ = (id) => document.getElementById(id);

/** An element: h('td', { class: 'num' }, '3.00'). Strings become text nodes. */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false).map((c) => (c instanceof Node ? c : String(c))));
  return el;
}

export const usd = (units) => (Number(units) / 1e6).toFixed(2);
/** "12.5" -> "12500000": exact, no floating point. */
export function units(s) {
  const t = String(s).trim();
  if (!/^\d+(\.\d{1,6})?$/.test(t)) throw new Error(`"${s}" is not an amount in USDC`);
  const [w, f = ''] = t.split('.');
  return (BigInt(w) * 1_000_000n + BigInt((f + '000000').slice(0, 6))).toString();
}
export const short = (s, n = 6) => (s && s.length > 2 * n + 1 ? `${s.slice(0, n)}…${s.slice(-n)}` : s ?? '');
export const explorer = (network, account) =>
  network === 'mainnet' ? `https://nearblocks.io/address/${account}` : network === 'testnet' ? `https://testnet.nearblocks.io/address/${account}` : null;
export const account = (network, id) => {
  const link = explorer(network, id);
  return link ? h('a', { href: link, target: '_blank', rel: 'noopener', class: 'mono' }, id) : h('span', { class: 'mono' }, id);
};

export async function getJSON(path, init) {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error ?? `${path}: ${res.status}`), { status: res.status });
  return body;
}

export function say(el, text, kind = '') {
  el.textContent = text;
  el.className = `status ${kind}`;
}
export function busy(button, on) {
  button.disabled = on;
  button.classList.toggle('busy', on);
}

export function ago(iso) {
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Buttons with data-copy="<id>" copy that element's text. */
export function copyButtons(root = document) {
  for (const b of root.querySelectorAll('[data-copy]')) {
    b.addEventListener('click', async () => {
      await navigator.clipboard.writeText($(b.dataset.copy).textContent);
      b.textContent = 'Copied';
      setTimeout(() => (b.textContent = 'Copy'), 1500);
    });
  }
}

const OUTCOMES = [['served', 'Served'], ['no_expert', 'No expert'], ['over_budget', 'Over budget'], ['refused', 'Refused']];
/** Tasks by topic: a stacked bar and the counts. */
export function demandTable(el, demand) {
  const rows = Object.entries(demand).map(([topic, n]) => ({ topic, n, total: OUTCOMES.reduce((s, [k]) => s + (n[k] ?? 0), 0) })).sort((a, b) => b.total - a.total);
  if (!rows.length) return el.replaceChildren(h('p', { class: 'muted' }, 'No tasks yet. Counts appear here as the swarm gets hired.'));
  const max = Math.max(...rows.map((r) => r.total));
  const bar = (r) => {
    const b = h('div', { class: 'bar', role: 'img', 'aria-label': OUTCOMES.map(([k, l]) => `${l} ${r.n[k] ?? 0}`).join(', ') });
    b.style.width = `${Math.max(12, (100 * r.total) / max)}%`;
    for (const [k] of OUTCOMES) if (r.n[k]) { const s = h('span', { class: k }); s.style.flex = String(r.n[k]); b.append(s); }
    return b;
  };
  el.replaceChildren(
    h('div', { class: 'scroll' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Topic'), h('th', {}, ''), ...OUTCOMES.map(([, l]) => h('th', { class: 'num' }, l)))),
      h('tbody', {}, rows.map((r) => h('tr', {}, h('td', {}, r.topic.replace(/_/g, ' ')), h('td', {}, bar(r)), ...OUTCOMES.map(([k]) => h('td', { class: 'num' }, r.n[k] ?? 0))))))),
    h('div', { class: 'legend' }, OUTCOMES.map(([k, l]) => h('span', {}, h('i', { class: `sw-${k}` }), l))),
  );
}
