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

const SVG = 'http://www.w3.org/2000/svg';
/** An SVG element: svg('rect', { x: 1, y: 2 }). */
export const svg = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  el.append(...kids);
  return el;
};
const PATHS = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  warn: 'M12 3l10 18H2z M12 10v5 M12 18v.5',
  file: 'M6 3h8l4 4v14H6z M14 3v4h4',
  upload: 'M12 16V4 M7 9l5-5 5 5 M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  lock: 'M8 11V8a4 4 0 0 1 8 0v3 M7 11h10a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z',
  plus: 'M12 5v14 M5 12h14',
  wallet: 'M5 6h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z M16 12.5h2 M3 9h13a2 2 0 0 0 2-2V6',
};
/** A stroke icon by name; `cls` picks its colour (see svg.icon in ui.css). */
export const icon = (name, cls = '') => svg('svg', { viewBox: '0 0 24 24', class: `icon ${cls}`, 'aria-hidden': 'true' }, svg('path', { d: PATHS[name] }));
/** The hexagon avatar with a letter. */
export const hex = (letter, size = 26) => svg('svg', { class: 'hex', width: size, height: size, viewBox: '0 0 40 40', 'aria-hidden': 'true' },
  svg('polygon', { points: '20,2 36,11 36,29 20,38 4,29 4,11' }), svg('text', { x: 20, y: 25.5, 'text-anchor': 'middle' }, letter.toUpperCase()));

/** An expert's public profile as customers read it: its topics, and questions it answers well. */
export const topicName = (t) => String(t ?? 'other').replace(/_/g, ' ');
export const topicChips = (topics) => (topics?.length ? h('span', { class: 'topics' }, topics.map((t) => h('span', { class: 'topic' }, topicName(t)))) : '');
export const askList = (examples) => (examples?.length
  ? h('span', { class: 'asks' }, h('span', { class: 'asks-h' }, 'Answers questions like'), examples.map((q) => h('span', { class: 'q' }, q)))
  : '');

// ---- Markdown, as the swarm's answers use it, built as DOM nodes: text is always text, links only to https ----
const unescaped = (s) => s.replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, '$1');
function inline(text) {
  const out = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https:\/\/[^\s)]+)\)|<(https:\/\/[^\s>]+)>|\*([^*\n]+)\*|(?<![\p{L}\p{N}])_([^_\n]+)_(?![\p{L}\p{N}])/gu;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(unescaped(text.slice(last, m.index)));
    const link = (href, label) => h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, label);
    out.push(m[1] != null ? h('b', {}, unescaped(m[1])) : m[2] != null ? h('code', {}, m[2]) : m[3] != null ? link(m[4], unescaped(m[3]))
      : m[5] != null ? link(m[5], m[5]) : h('i', {}, unescaped(m[6] ?? m[7])));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(unescaped(text.slice(last)));
  return out;
}
/** Headings, lists, quotes, rules, code blocks and paragraphs; anything else stays plain text. */
export function markdown(text) {
  const root = h('div', { class: 'md' });
  const lines = String(text).split('\n');
  let [list, para] = [null, []];
  const flush = () => (para.length && root.append(h('p', {}, inline(para.join('\n')))), (para = []));
  const block = (el) => (flush(), (list = null), root.append(el));
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const [head, item] = [/^(#{1,4})\s+(.*)$/.exec(line), /^\s*(?:[-*+]|(\d+)[.)])\s+(.*)$/.exec(line)];
    if (/^```/.test(line)) {
      const code = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) code.push(lines[i]);
      block(h('pre', { class: 'brief' }, code.join('\n')));
    } else if (head) block(h(`h${head[1].length + 2}`, {}, inline(head[2])));
    else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) block(h('hr'));
    else if (/^>\s?/.test(line)) block(h('blockquote', {}, inline(line.replace(/^>\s?/, ''))));
    else if (item) {
      flush();
      if (!list) root.append((list = h(item[1] ? 'ol' : 'ul')));
      list.append(h('li', {}, inline(item[2].replace(/\s*\\$/, ''))));
    } else if (list && /^\s+\S/.test(line)) list.lastChild.append(h('br'), ...inline(line.trim().replace(/\s*\\$/, ''))); // an indented line goes on with the item above: its nodes, not the list of them as text
    else if (!line.trim()) (flush(), (list = null));
    else para.push(line);
  }
  flush();
  return root;
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
export const when = (iso) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// ---- prices, as the runner bids: the team's rates and the overhead, then the owner's fee, then the market's ----
export function quote(rates, pricing, feeBps) {
  const net = rates.reduce((s, r) => s + BigInt(r) + BigInt(units(pricing.per_agent)), BigInt(units(pricing.overhead)));
  const gross = (net * 10_000n * 10_000n) / (BigInt(10_000 - pricing.market_fee_bps) * BigInt(10_000 - feeBps));
  return ((gross + 9_999n) / 10_000n) * 10_000n; // up to a cent
}

// ---- days and charts: SVG drawn from data, colours from the theme ----
/** The last `n` days as YYYY-MM-DD, oldest first. */
export const lastDays = (n) => Array.from({ length: n }, (_, i) => new Date(Date.now() - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10));
const dayLabel = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * Stacked bars per day. `series`: [{ key, label, cls }], `data`: { [day]: { [key]: number } }.
 * One scale, a faint grid, the max labelled, the first and last day under the axis; each day says its numbers in a
 * tooltip and, on hover, in `readout` (the last day until then). The legend carries each series' total.
 */
export function dayBars(el, days, series, data, { format = (v) => String(v), readout = null } = {}) {
  const W = innerWidth < 600 ? 360 : 640, [H, L, B, T] = [W < 600 ? 170 : 190, 40, 22, 10]; // narrow screens: fewer units, so the labels stay readable
  const totals = days.map((d) => series.reduce((sum, x) => sum + (data[d]?.[x.key] ?? 0), 0));
  const max = Math.max(...totals, 0);
  const chart = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': `${series.map((x) => x.label).join(', ')} per day, last ${days.length} days` });
  const y = (v) => T + (H - T - B) * (1 - (max ? v / max : 0));
  for (const v of max ? [max / 2, max] : []) {
    chart.append(svg('line', { x1: L, x2: W, y1: y(v), y2: y(v), class: 'grid' }), svg('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'axis' }, format(v)));
  }
  chart.append(svg('line', { x1: L, x2: W, y1: y(0), y2: y(0), class: 'base' }), svg('text', { x: L - 6, y: y(0) + 4, 'text-anchor': 'end', class: 'axis' }, format(0)));
  const step = (W - L) / days.length;
  const say = (d) => {
    if (!readout) return;
    const parts = series.filter((x) => data[d]?.[x.key]).map((x) => `${format(data[d][x.key])} ${x.label.toLowerCase()}`);
    readout.replaceChildren(`${dayLabel(d)} · `, h('b', {}, parts.length ? parts.join(', ') : 'nothing'));
  };
  const groups = days.map((d, i) => {
    const tip = [dayLabel(d), ...series.map((x) => `${x.label}: ${format(data[d]?.[x.key] ?? 0)}`)].join('\n');
    const g = svg('g', { class: 'day' }, svg('title', {}, tip), svg('rect', { x: L + i * step, y: T, width: step, height: H - T - B, rx: 3, class: 'hit' }));
    let base = 0;
    for (const x of series) {
      const v = data[d]?.[x.key] ?? 0;
      if (!v) continue;
      const top = y(base + v), bottom = y(base);
      g.append(svg('rect', { x: L + i * step + step * 0.16, width: step * 0.68, y: top, height: Math.max(1, bottom - top - (base ? 1.5 : 0)), rx: 2, class: `bar-${x.cls}` }));
      base += v;
    }
    g.addEventListener('mouseenter', () => { for (const o of groups) o.classList.remove('on'); g.classList.add('on'); say(d); });
    return g;
  });
  chart.append(...groups, svg('text', { x: L, y: H - 4, class: 'axis' }, dayLabel(days[0])), svg('text', { x: W, y: H - 4, 'text-anchor': 'end', class: 'axis' }, dayLabel(days.at(-1))));
  chart.addEventListener('mouseleave', () => { for (const o of groups) o.classList.remove('on'); say(days.at(-1)); });
  say(days.at(-1));
  const sum = (key) => days.reduce((t, d) => t + (data[d]?.[key] ?? 0), 0);
  el.replaceChildren(chart, h('ul', { class: 'legend', 'aria-label': 'Legend' }, series.map((x) => h('li', {}, h('i', { class: `sw-${x.cls}` }), x.label, h('b', {}, format(sum(x.key)))))));
}

/** What became of an agent's rounds, in five kinds a sponsor can act on; stacked in this order. */
export const KINDS = [
  { key: 'paid', label: 'Delivered', cls: 'ok' },
  { key: 'nopay', label: 'Not delivered', cls: 'muted' },
  { key: 'cost', label: 'Over max spend', cls: 'warn' },
  { key: 'ours', label: 'Failed on our side', cls: 'info' },
  { key: 'violation', label: 'Violation', cls: 'bad' },
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
