// Joining: the materials are built and sealed here, the public card goes to the wallet tab, the sealed bytes to the runner.
import { seal, sha256 } from '/seal.js';
import { $, busy, copyButtons, getJSON, h, say, usd, units } from '/ui.js';

const MB = 1024 * 1024;
const ACCOUNT = /^(?=.{2,64}$)([a-z\d]+[-_])*[a-z\d]+(\.([a-z\d]+[-_])*[a-z\d]+)*$/;
const [info, attestation] = await Promise.all([getJSON('/info'), getJSON('/attestation')]);
const status = (text, kind) => say($('status'), text, kind);

// ---- header and facts from the runner ----
$('network').textContent = info.network;
$('network').className = `pill ${info.network === 'mainnet' ? 'ok' : 'info'}`;
Object.assign($('tee'), { hidden: false, textContent: attestation.dev ? 'no TEE' : 'TEE quote', className: `pill ${attestation.dev ? 'warn' : 'ok'}` });
$('devNote').hidden = !attestation.dev;
$('sealKey').textContent = info.sealKey;
for (const m of info.models) $('model').append(h('option', { value: m.id }, m.id));
const priceOf = () => info.models.find((m) => m.id === $('model').value);

// ---- knowledge files ----
let files = [];
const addFiles = (list) => {
  for (const f of list) if (/\.(md|txt)$/i.test(f.name) && !files.some((g) => g.name === f.name)) files.push(f);
  renderFiles();
};
function renderFiles() {
  const total = files.reduce((s, f) => s + f.size, 0);
  $('fileList').replaceChildren(
    ...files.map((f) => h('li', {}, h('span', {}, f.name), h('span', { class: 'size' }, `${(f.size / 1024).toFixed(1)} KB`),
      h('button', { class: 'btn ghost small', type: 'button', 'aria-label': `Remove ${f.name}`, onclick: () => ((files = files.filter((g) => g !== f)), renderFiles()) }, 'Remove'))),
    ...(files.length ? [h('li', { class: 'faint' }, `${files.length} file${files.length > 1 ? 's' : ''}, ${(total / MB).toFixed(2)} MB of 10`)] : []),
  );
  changed();
}
$('files').addEventListener('change', (e) => addFiles(e.target.files));
const drop = $('drop');
drop.addEventListener('dragover', (e) => (e.preventDefault(), drop.classList.add('over')));
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => (e.preventDefault(), drop.classList.remove('over'), addFiles(e.dataTransfer.files)));
const chooser = drop.querySelector('label');
chooser.tabIndex = 0;
chooser.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), $('files').click()));

// ---- checks as you type ----
for (const [id, max] of [['skills', 500], ['expertise', 2000], ['method', 8000]]) {
  $(id).addEventListener('input', () => {
    const n = $(id).value.length;
    $(`${id}Count`).textContent = `${n} / ${max}`;
    $(`${id}Count`).classList.toggle('over', n > max);
  });
}
const amount = (id) => {
  try {
    const u = BigInt(units($(id).value));
    $(id).removeAttribute('aria-invalid');
    return u;
  } catch {
    $(id).setAttribute('aria-invalid', 'true');
    return null;
  }
};
const feeFor = (sizeMb) => BigInt(info.fees.audit_base) + BigInt(info.fees.audit_per_mb) * BigInt(sizeMb);

/** The worst one call can cost with this model and these materials, as the runner checks it before picking the expert. */
function worstCall() {
  const p = priceOf();
  if (!p?.in) return null;
  const bytes = info.limits.template_bytes + new Blob([$('expertise').value, $('method').value]).size + info.limits.knowledge_bytes + info.limits.public_bytes;
  return BigInt(Math.ceil(bytes * p.in + info.limits.max_out * p.out)); // USD per 1M tokens x tokens = micro-USD
}

function check() {
  const problems1 = [];
  if (!ACCOUNT.test($('account').value.trim())) problems1.push('your NEAR account');
  if (!$('skills').value.trim() || $('skills').value.length > 500) problems1.push('public skills');
  if (!$('name').value.trim()) problems1.push('a name');
  if (!$('expertise').value.trim()) problems1.push('the expertise');
  if (files.reduce((s, f) => s + f.size, 0) > 10 * MB) problems1.push('knowledge under 10 MB');
  const [rate, maxCost, deposit] = [amount('rate'), amount('maxCost'), amount('deposit')];
  const least = feeFor(Math.max(1, Math.ceil(files.reduce((s, f) => s + f.size, 0) / MB))) + BigInt(info.fees.min_deposit);
  $('depositHint').textContent = `At least ${usd(least)} USDC: the audit fee and ${usd(info.fees.min_deposit)} to start with. You can withdraw the rest any time.`;
  const problems2 = [];
  if (rate === null) problems2.push('the rate');
  if (maxCost === null || maxCost === 0n) problems2.push('the max cost');
  if (deposit === null || deposit < least) problems2.push(`a deposit of at least ${usd(least)}`);

  const worst = worstCall();
  const low = worst !== null && maxCost !== null && maxCost < worst;
  $('worst').className = `note ${low ? 'warn' : ''}`;
  $('worst').replaceChildren(
    h('b', {}, worst === null ? 'No price for this model right now.' : `One call can cost your expert up to ${usd(worst)} USDC with ${$('model').value}.`),
    h('span', { class: 'muted' }, low
      ? 'Your max cost is below that, so the swarm will not pick your expert. Raise it, or shorten the expertise and method.'
      : 'The worst case: all of the prompt and the longest answer. Usually a call costs a fraction of it, and you pay only what it costs, rounded up to a cent.'),
  );
  pill('s1', problems1.length ? 'to fill in' : 'ready', problems1.length ? '' : 'ok');
  pill('s2', problems2.length ? 'to fill in' : 'ready', problems2.length ? '' : 'ok');
  const ok = !problems1.length && !problems2.length;
  $('s3').classList.toggle('locked', !ok);
  $('sealBtn').disabled = !ok;
  if (!sealed) pill('s3', ok ? 'ready to seal' : `needs ${[...problems1, ...problems2].join(', ')}`, ok ? 'honey' : '');
  return { rate, maxCost, deposit };
}
function pill(stage, text, kind = '') {
  $(`${stage}pill`).textContent = text;
  $(`${stage}pill`).className = `pill ${kind}`;
}

// ---- seal, register, upload ----
let sealed = null; // { bytes, card, deposit }
function changed() {
  if (sealed) {
    sealed = null; // what was sealed is not what is on the page any more
    for (const s of ['s4', 's5']) $(s).classList.add('locked');
    $('s3').classList.remove('done');
    $('sealed').hidden = true;
    status('You changed something: seal again.', 'wait');
  }
  check();
}
for (const id of ['account', 'skills', 'name', 'model', 'expertise', 'method', 'rate', 'maxCost', 'deposit']) $(id).addEventListener('input', changed);
$('model').addEventListener('change', () => {
  const p = priceOf();
  $('modelPrice').textContent = p?.in ? `$${p.in} in, $${p.out} out per 1M tokens, live from NEAR AI` : 'Price unknown right now';
  changed();
});
$('model').dispatchEvent(new Event('change'));

$('sealBtn').onclick = async () => {
  busy($('sealBtn'), true);
  try {
    const { rate, maxCost, deposit } = check();
    const account = $('account').value.trim();
    const knowledge = await Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() })));
    const materials = { name: $('name').value.trim(), model: $('model').value, expertise: $('expertise').value, method: $('method').value, knowledge };
    const bytes = await seal(new TextEncoder().encode(JSON.stringify(materials)), info.sealKey, account);
    const sizeMb = Math.max(1, Math.ceil(bytes.length / MB));
    if (sizeMb > 10) throw new Error('Sealed, the materials are over 10 MB. Remove some knowledge.');
    const card = { skills: $('skills').value.trim(), rate: `${rate}`, max_cost: `${maxCost}`, hash: await sha256(bytes), size_mb: sizeMb };
    if (deposit < feeFor(sizeMb) + BigInt(info.fees.min_deposit)) throw new Error(`The deposit must be at least ${usd(feeFor(sizeMb) + BigInt(info.fees.min_deposit))} USDC.`);
    sealed = { bytes, card, deposit: `${deposit}`, account };

    $('size').textContent = `${(bytes.length / 1024).toFixed(1)} KB (${sizeMb} MB declared)`;
    $('hash').textContent = card.hash;
    $('fee').textContent = `${usd(feeFor(sizeMb))} USDC, to the operator, for the audit inside the TEE`;
    $('sealed').hidden = false;
    $('s3').classList.add('done');
    pill('s3', 'sealed', 'ok');
    $('s4').classList.remove('locked');
    $('s5').classList.remove('locked');
    pill('s4', 'pay the deposit', 'honey');
    pill('s5', 'after registering');
    const args = JSON.stringify({ receiver_id: info.contract, amount: sealed.deposit, msg: JSON.stringify({ Register: card }) });
    const q = (s) => `'${s.replaceAll("'", "'\\''")}'`; // safe to paste into a shell, whatever the skills say
    $('command').textContent = `near contract call-function as-transaction ${info.token} ft_transfer_call json-args ${q(args)} prepaid-gas '100 Tgas' attached-deposit '1 yoctoNEAR' sign-as ${q(account)} network-config ${info.network} sign-with-keychain send`;
    status('Sealed. Nothing has left this page yet.', 'ok');
  } catch (e) {
    status(e.message, 'bad');
  } finally {
    busy($('sealBtn'), false);
  }
};

$('walletBtn').onclick = () => {
  const card = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(sealed.card)))); // UTF-8 safe
  window.open(`/cabinet#${new URLSearchParams({ card, deposit: sealed.deposit, account: sealed.account })}`, '_blank', 'noopener');
  pill('s4', 'confirm in the wallet tab', 'honey');
  status('Confirm the payment in the wallet tab, then upload here.', 'wait');
};

$('uploadBtn').onclick = async () => {
  busy($('uploadBtn'), true);
  try {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(`/upload/${encodeURIComponent(sealed.account)}`, { method: 'POST', body: sealed.bytes });
      const body = await res.json().catch(() => ({}));
      if (res.ok) break;
      if (attempt === 30 || ![409, 429].includes(res.status)) throw new Error(body.error ?? `upload failed (${res.status})`);
      status(`Waiting for your registration to reach the chain… (${attempt * 10} s)`, 'wait');
      await new Promise((ok) => setTimeout(ok, 10_000));
    }
    $('s4').classList.add('done');
    $('s5').classList.add('done');
    pill('s4', 'registered', 'ok');
    pill('s5', 'uploaded', 'ok');
    $('doneNote').hidden = false;
    status('Uploaded. The audit runs now.', 'ok');
  } catch (e) {
    status(e.message, 'bad');
  } finally {
    busy($('uploadBtn'), false);
  }
};

copyButtons();
check();
