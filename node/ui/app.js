// The sealing page: builds the materials, seals them here, shows the registration call, uploads the result.
import { seal, sha256 } from '/seal.js';

const $ = (id) => document.getElementById(id);
const MB = 1024 * 1024;
const status = (text) => ($('status').textContent = text);
const units = (s) => {
  if (!/^\d+(\.\d{1,6})?$/.test(s.trim())) throw new Error(`not a USDC amount: ${s}`);
  const [whole, frac = ''] = s.trim().split('.');
  return (BigInt(whole) * 1_000_000n + BigInt((frac + '000000').slice(0, 6))).toString();
};
const usd = (u) => (Number(u) / 1e6).toFixed(2);
const shellQuote = (s) => `'${s.replaceAll("'", "'\\''")}'`; // safe to paste into a shell, whatever the skills say

const info = await (await fetch('/info')).json();
$('sealKey').textContent = info.sealKey;
for (const m of info.models) $('model').append(new Option(m, m));
const fee = (sizeMb) => BigInt(info.fees.audit_base) + BigInt(info.fees.audit_per_mb) * BigInt(sizeMb);
$('minDeposit').textContent = `at least the audit fee + ${usd(info.fees.min_deposit)}`;

let sealed;
$('sealBtn').onclick = async () => {
  try {
    const account = $('account').value.trim();
    const knowledge = await Promise.all([...$('files').files].map(async (f) => ({ name: f.name, text: await f.text() })));
    const materials = { name: $('name').value, model: $('model').value, expertise: $('expertise').value, method: $('method').value, knowledge };
    sealed = await seal(new TextEncoder().encode(JSON.stringify(materials)), info.sealKey, account);
    const sizeMb = Math.max(1, Math.ceil(sealed.length / MB));
    if (sizeMb > 10) throw new Error('sealed materials are larger than 10 MB');
    const hash = await sha256(sealed);
    const card = { skills: $('skills').value.trim(), rate: units($('rate').value), max_cost: units($('maxCost').value), hash, size_mb: sizeMb };
    const deposit = units($('deposit').value);
    const least = fee(sizeMb) + BigInt(info.fees.min_deposit);
    if (BigInt(deposit) < least) throw new Error(`the deposit must be at least ${usd(least)} USDC`);
    const args = JSON.stringify({ receiver_id: info.contract, amount: deposit, msg: JSON.stringify({ Register: card }) });
    $('hash').textContent = hash;
    $('size').textContent = `${sizeMb} MB, audit fee ${usd(fee(sizeMb))} USDC`;
    const fragment = new URLSearchParams({ card: btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(card)))), deposit }); // UTF-8 safe
    $('walletBtn').onclick = () => window.open(`/cabinet.html#${fragment}`, '_blank', 'noopener');
    $('command').textContent = `near contract call-function as-transaction ${info.token} ft_transfer_call json-args ${shellQuote(args)} prepaid-gas '100 Tgas' attached-deposit '1 yoctoNEAR' sign-as ${shellQuote(account)} network-config ${info.network} sign-with-keychain send`;
    $('next').hidden = false;
    status('Sealed. Register, then upload.');
  } catch (e) {
    status(`Error: ${e.message}`);
  }
};

$('uploadBtn').onclick = async () => {
  for (let attempt = 1; ; attempt++) { // until the registration is on chain and the runner has seen it
    const res = await fetch(`/upload/${encodeURIComponent($('account').value.trim())}`, { method: 'POST', body: sealed });
    const body = await res.json();
    if (res.ok) return status('Uploaded. The audit runs within a few minutes; see the result in your cabinet.');
    if (attempt === 30 || ![409, 429].includes(res.status)) return status(`Error: ${body.error}`);
    status(`Waiting for your registration to reach the chain (${attempt}/30)...`);
    await new Promise((ok) => setTimeout(ok, 10_000));
  }
};
