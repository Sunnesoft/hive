// The overview: what this runner is, what it has done, what tasks needed. Public data only.
import { $, account, demandTable, getJSON, h, short, usd } from '/ui.js';

const [info, attestation, demand] = await Promise.all([getJSON('/info'), getJSON('/attestation'), getJSON('/demand')]);

$('network').textContent = info.network;
$('network').className = `pill ${info.network === 'mainnet' ? 'ok' : 'info'}`;
const tee = $('tee');
tee.hidden = false;
tee.textContent = attestation.dev ? 'no TEE' : 'TEE quote';
tee.className = `pill ${attestation.dev ? 'warn' : 'ok'}`;
if (attestation.dev) {
  $('teeNote').className = 'note warn';
  $('teeNote').replaceChildren(h('b', {}, 'Development mode: this runner has no TEE.'), h('span', {}, 'Its keys come from a setting, so they prove nothing. Seal only test materials to it.'));
}

$('active').textContent = info.stats.active;
$('pending').textContent = info.stats.pending;
const totals = Object.values(demand).reduce((t, n) => ({ served: t.served + (n.served ?? 0), missing: t.missing + (n.no_expert ?? 0) }), { served: 0, missing: 0 });
$('served').textContent = totals.served;
$('missing').textContent = totals.missing;

$('netName').textContent = info.network;
$('contract').replaceChildren(account(info.network, info.contract));
$('token').replaceChildren(account(info.network, info.token), h('span', { class: 'muted' }, ' (USDC)'));
$('fees').textContent = `audit ${usd(info.fees.audit_base)} + ${usd(info.fees.audit_per_mb)} per MB, then at least ${usd(info.fees.min_deposit)} USDC on balance`;
$('ownerFee').textContent = `${info.fees.fee_bps / 100}%`;
$('sealKey').textContent = info.sealKey;
$('sealKey').title = 'X25519 key sponsors seal their materials to';
$('policies').textContent = short(attestation.policies, 10);
$('policies').title = attestation.policies;
demandTable($('demand'), demand);
