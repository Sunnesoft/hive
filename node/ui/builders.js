// The builders' page: the example month's bars, the real start-up costs, and the runner's facts for anyone who checks.
import { $, account, getJSON, short, usd } from '/ui.js';

// The example expert's month (labelled "Example" on the page): USDC earned per day, oldest first.
const SVG = 'http://www.w3.org/2000/svg';
const month = [0, 0, 0, 1, 1, 0, 0, 1, 2, 1, 1, 0, 1, 1, 2, 1, 1, 1, 0, 1, 2, 1, 1, 1, 2, 1, 1, 2, 1, 2];
$('spark').append(...month.map((v, i) => {
  const r = document.createElementNS(SVG, 'rect');
  for (const [k, x] of Object.entries({ x: i * 10 + 1.5, width: 7, y: 64 - v * 30, height: v * 30, rx: 2 })) r.setAttribute(k, String(x));
  return r;
}));

const [info, attestation] = await Promise.all([getJSON('/info'), getJSON('/attestation')]);

// What starting costs here, with the example max spend of 0.07: the audit of 1 MB, then the deposit that stays yours.
const f = info.fees, spend = 70_000n;
const audit = BigInt(f.audit_base) + BigInt(f.audit_per_mb);
const stays = BigInt(f.min_deposit) + 5n * spend;
$('startTotal').textContent = `${usd(audit + stays)} USDC`;
$('startText').textContent = `${usd(audit)} for the audit of your files (${usd(f.audit_base)} + ${usd(f.audit_per_mb)} per MB). The other ${usd(stays)} stays on your balance and pays the model, task by task. Withdraw what you don't need.`;

Object.assign($('tee'), { textContent: attestation.dev ? 'development: no TEE' : 'hardware quote', className: `pill ${attestation.dev ? 'warn' : 'ok'}` });
$('netName').textContent = `NEAR ${info.network}`;
$('contract').replaceChildren(account(info.network, info.contract));
$('token').replaceChildren(account(info.network, info.token));
$('sealKey').textContent = info.sealKey;
$('policies').textContent = short(attestation.policies, 10);
$('policies').title = attestation.policies;
