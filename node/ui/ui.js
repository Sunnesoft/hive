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

// ---- prices, as the runner bids: the team's rates and the overhead, then the owner's fee, then the market's ----
export function quote(rates, pricing, feeBps) {
  const net = rates.reduce((s, r) => s + BigInt(r) + BigInt(units(pricing.per_agent)), BigInt(units(pricing.overhead)));
  const gross = (net * 10_000n * 10_000n) / (BigInt(10_000 - pricing.market_fee_bps) * BigInt(10_000 - feeBps));
  return ((gross + 9_999n) / 10_000n) * 10_000n; // up to a cent
}

// ---- days and charts: SVG drawn from data, colours from the theme ----
const SVG = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  el.append(...kids);
  return el;
};
/** The last `n` days as YYYY-MM-DD, oldest first. */
export const lastDays = (n) => Array.from({ length: n }, (_, i) => new Date(Date.now() - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10));
const dayLabel = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * Stacked bars per day. `series`: [{ key, label, cls }], `data`: { [day]: { [key]: number } }.
 * One scale, a faint grid, the max labelled, the first and last day under the axis; each bar says its numbers.
 */
export function dayBars(el, days, series, data, { format = (v) => String(v), unit = '' } = {}) {
  const [W, H, L, B, T] = [640, 180, 44, 22, 10];
  const totals = days.map((d) => series.reduce((sum, x) => sum + (data[d]?.[x.key] ?? 0), 0));
  const max = Math.max(...totals, 0);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': `${series.map((x) => x.label).join(', ')} per day` });
  const y = (v) => T + (H - T - B) * (1 - (max ? v / max : 0));
  for (const v of max ? [0, max / 2, max] : [0]) {
    svg.append(s('line', { x1: L, x2: W, y1: y(v), y2: y(v), class: 'grid' }));
    svg.append(s('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'axis' }, format(v)));
  }
  const step = (W - L) / days.length;
  days.forEach((d, i) => {
    let base = 0;
    const tip = [dayLabel(d), ...series.map((x) => `${x.label}: ${format(data[d]?.[x.key] ?? 0)}${unit}`)].join('\n');
    const g = s('g', {}, s('title', {}, tip));
    for (const x of series) {
      const v = data[d]?.[x.key] ?? 0;
      if (!v) continue;
      g.append(s('rect', { x: L + i * step + step * 0.18, width: step * 0.64, y: y(base + v), height: Math.max(1, y(base) - y(base + v)), rx: 2, class: `bar-${x.cls}` }));
      base += v;
    }
    svg.append(g);
  });
  svg.append(s('text', { x: L, y: H - 4, class: 'axis' }, dayLabel(days[0])), s('text', { x: W, y: H - 4, 'text-anchor': 'end', class: 'axis' }, dayLabel(days.at(-1))));
  el.replaceChildren(svg, h('div', { class: 'legend' }, series.map((x) => h('span', {}, h('i', { class: `sw-${x.cls}` }), x.label))));
}

/** What became of an agent's rounds, in five kinds a sponsor can act on. */
export const KINDS = [
  { key: 'paid', label: 'Delivered', cls: 'ok' },
  { key: 'nopay', label: 'Not delivered', cls: 'muted' },
  { key: 'cost', label: 'Over max cost', cls: 'warn' },
  { key: 'violation', label: 'Violation', cls: 'bad' },
  { key: 'ours', label: 'Failed on our side', cls: 'info' },
];
export function kindOf(r) {
  if (!r.picked) return null;
  if (r.delivered) return 'paid';
  if (r.violation) return 'violation';
  if (r.why === 'too_expensive') return 'cost';
  if (['model_failed', 'model_unavailable', 'not_checked'].includes(r.why)) return 'ours';
  return 'nopay';
}
/** Per day: earned (USDC, owed for delivered rounds) and the kinds of results. */
export function perDay(rounds) {
  const earned = {}, kinds = {};
  for (const r of rounds) {
    const d = r.at.slice(0, 10), k = kindOf(r);
    if (!k) continue;
    (kinds[d] ??= {})[k] = (kinds[d][k] ?? 0) + 1;
    if (k === 'paid') (earned[d] ??= { earned: 0 }).earned += Number(r.pay) / 1e6;
  }
  return { earned, kinds };
}
