// An expert's tool: checks of a contract that code can make with no model (NEAR's Rust, and Solidity), each on the lines it found.
// What a model reading a contract knows and still does not apply is often a pattern: a method that asks for one
// yoctoNEAR and cannot be paid, an integer JSON cannot carry, the predecessor read inside a callback. Found by
// code, they are found every time, and they cost nothing. Each is a candidate: it is checked as any finding is.
import type { Finding } from './rules.ts';

type Fn = { name: string; attrs: string; params: string; body: string; head: string; exposed: boolean };

/** The functions of the files, with their attributes and bodies, and whether the contract exposes them. */
function functionsOf(text: string): Fn[] {
  const exposedImpls: [number, number][] = [];
  for (const m of text.matchAll(/#\[(?:near_bindgen|near(?:\([^\]]*\))?)\]\s*impl[^{]*\{/g)) {
    let depth = 1, i = m.index! + m[0].length;
    for (; i < text.length && depth; i++) depth += text[i] === '{' ? 1 : text[i] === '}' ? -1 : 0;
    exposedImpls.push([m.index!, i]);
  }
  const out: Fn[] = [];
  for (const m of text.matchAll(/((?:[ \t]*(?:#\[[^\]]*\]|\/\/\/)[^\n]*\n)*)[ \t]*(pub\s+|pub\([^)]*\)\s+)?fn\s+(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)[^{;]*\{/g)) {
    let depth = 1, i = m.index! + m[0].length;
    for (; i < text.length && depth; i++) depth += text[i] === '{' ? 1 : text[i] === '}' ? -1 : 0;
    const inside = exposedImpls.some(([a, b]) => m.index! > a && m.index! < b);
    out.push({ name: m[3]!, attrs: m[1] ?? '', params: m[4] ?? '', body: text.slice(m.index! + m[0].length, i - 1), head: m[0].trim().split('\n').at(-1)!.trim(), exposed: inside && m[2]?.trim() === 'pub' });
  }
  return out;
}
const lineWith = (body: string, re: RegExp) => body.split('\n').find((l) => re.test(l))?.trim() ?? '';
const finding = (severity: Finding['severity'], where: string, title: string, how: string, lines: string[], fix: string): Finding =>
  ({ severity, where, title, how, evidence: lines.filter(Boolean).map((l) => `\`${l.replace(/`/g, "'")}\``).join('\n'), fix });

/** The checks, each a rule NEAR's documentation or its audits state. */
export function lint(pages: { url: string; text: string }[]): Finding[] {
  const found: Finding[] = [...lintSolidity(pages)];
  const rs = pages.filter((p) => p.url.endsWith('.rs'));
  const all = rs.flatMap((p) => functionsOf(p.text).map((f) => ({ ...f, file: p.url.split('/').slice(-2).join('/') })));
  const checksDeposit = (body: string) => /(assert|require)!?\s*\([^;]*(attached_deposit|amount|deposit)[^;]*(>|>=|!=)\s*(0|\w)/i.test(body);
  // Functions that take the attached deposit as an amount and never check it is there: a payable method that calls one inherits it.
  const unchecked = new Set(all.filter((f) => /attached_deposit\s*\(\s*\)/.test(f.body) && !checksDeposit(f.body)).map((f) => f.name));
  for (const f of all) {
    const where = `${f.name} (${f.file})`;
    const payable = /#\[payable\]/.test(f.attrs);
    const callback = /#\[private\]/.test(f.attrs) || /callback|_resolve|^resolve_|^on_/.test(f.name);
    if (f.exposed && !payable && /assert_one_yocto\s*\(\s*\)/.test(f.body))
      found.push(finding('Medium', where, `${f.name} asserts one yoctoNEAR but is not #[payable], so no call of it can succeed`,
        `A method without #[payable] panics when any deposit is attached, and assert_one_yocto() panics unless exactly one yoctoNEAR is attached: every call of ${f.name} fails, so what it does can never be done.`,
        [f.head, lineWith(f.body, /assert_one_yocto/)], `Mark ${f.name} #[payable].`));
    const raw = [...f.params.matchAll(/\b(\w+)\s*:\s*(u128|i128|u64|i64)\b/g)].find((x) => /128/.test(x[2]!) || /amount|balance|deposit|fee|price|stake|supply/i.test(x[1]!));
    if (f.exposed && !callback && raw)
      found.push(finding('Low', where, `${f.name} takes ${raw[1]} as a ${raw[2]}, which JSON cannot carry exactly above 2^53`,
        `Arguments of a public method arrive as JSON, whose numbers lose precision above 2^53: a ${raw[2]} amount sent by a wallet or a script is rounded or rejected. near-sdk's U128 and U64 carry it as a string.`,
        [f.head], `Take ${raw[1]} as near_sdk::json_types::${raw[2]!.toUpperCase()}.`));
    const pred = f.body.split('\n').find((l) => /predecessor_account_id\s*\(\s*\)/.test(l) && !/current_account_id|assert|require/.test(l))?.trim();
    if (callback && pred)
      found.push(finding('High', where, `The callback ${f.name} takes predecessor_account_id() as the user, but in a callback it is the contract itself`,
        `A callback is called by the contract, so env::predecessor_account_id() there is the contract's own account, not the user who started the call: whatever it pays back or records for that account goes to the contract.`,
        [pred], `Pass the user's account to the callback as an argument.`));
    const calls = [...unchecked].find((n) => n !== f.name && new RegExp(`\\b${n}\\s*\\(`).test(f.body));
    if (f.exposed && payable && !checksDeposit(f.body) && (unchecked.has(f.name) || calls) && /deposit|stake|donate|lock|buy|mint/i.test(f.name))
      found.push(finding('Low', where, `${f.name} takes the attached deposit without asserting that one is attached`,
        `${f.name} is payable and uses env::attached_deposit() as the amount${calls ? ` (through ${calls})` : ''}, and nothing rejects zero: it can be called with nothing attached, and what it records or schedules then runs for nothing.`,
        [f.head, lineWith(f.body, unchecked.has(f.name) ? /attached_deposit/ : new RegExp(`\\b${calls}\\s*\\(`))], `Assert that the attached deposit is above zero (or above the minimum) in ${f.name}.`));
    const done = f.body.split('\n').find((l) => /\b\w*(paid|done|claimed|settled|processed|completed)\w*\s*=\s*(Some|true)/i.test(l))?.trim();
    if (callback && done)
      found.push(finding('Low', where, `${f.name} marks the work done only in the callback, after the transfer was scheduled`,
        `The state that says it is done is written when the callback lands, blocks after the call that scheduled the transfer: until then nothing stops the same transfer from being scheduled again.`,
        [done], `Record the state before scheduling the transfer, and undo it in the callback if the transfer failed.`));
  }
  return found;
}

/** The functions of Solidity files, with their bodies. */
function solidityFunctions(text: string) {
  const out: { name: string; head: string; body: string }[] = [];
  for (const m of text.matchAll(/function\s+(\w+)\s*\(([^)]*)\)([^{;]*)\{/g)) {
    let depth = 1, i = m.index! + m[0].length;
    for (; i < text.length && depth; i++) depth += text[i] === '{' ? 1 : text[i] === '}' ? -1 : 0;
    out.push({ name: m[1]!, head: m[0].replace(/\s+/g, ' ').trim(), body: text.slice(m.index! + m[0].length, i - 1) });
  }
  return out;
}
const firstLine = (body: string, re: RegExp) => body.split('\n').find((l) => re.test(l))?.trim() ?? '';

/** Checks Solidity's own audits report again and again, each on the line it found. Kept are the ones that, read
 *  blind against five audited projects, raised no false alarm; reentrancy, unchecked ERC-20 transfers, block values
 *  and division order were dropped: nine false alarms, against nothing an audit had. */
export function lintSolidity(pages: { url: string; text: string }[]): Finding[] {
  const found: Finding[] = [];
  for (const page of pages.filter((p) => p.url.endsWith('.sol'))) {
    const file = page.url.split('/').slice(-1)[0]!;
    if (/^\s*(interface|library)\s/m.test(page.text) && !/^\s*(abstract\s+)?contract\s/m.test(page.text)) continue;
    for (const f of solidityFunctions(page.text)) {
      const where = `${f.name} (${file})`;
      const origin = firstLine(f.body, /tx\.origin/);
      if (origin && /require|if\s*\(|==|!=/.test(origin))
        found.push(finding('High', where, `${f.name} authorizes by tx.origin`, `tx.origin is the account that signed the transaction, not the caller: a contract the user is lured to call can call ${f.name} in the user's name and pass the check.`, [origin], 'Check msg.sender instead of tx.origin.'));
      for (const line of f.body.split('\n').filter((l) => /\.call\s*\{[^}]*\}\s*\(|\.call\s*\(/.test(l) && !/=[^=]*\.call|require\s*\(|return\s/.test(l)))
        found.push(finding('Medium', where, `${f.name} makes a low-level call and does not check that it succeeded`, `A low-level call returns false instead of reverting when the callee fails: ${f.name} carries on as if the call had gone through, and the funds or the action it stood for are lost.`, [line.trim()], 'Check the returned success flag and revert if it is false.'));
      const rec = firstLine(f.body, /ecrecover\s*\(|ECDSA\.recover\s*\(/);
      if (rec && !/nonce|nonces|block\.chainid|DOMAIN_SEPARATOR|_hashTypedData|used\w*\[/i.test(f.body))
        found.push(finding('High', where, `${f.name} accepts a signature with no nonce or domain, so it can be replayed`, `Nothing in ${f.name} marks a signature as used or binds it to this chain and contract: the same signature can be submitted again, or on another chain or deployment.`, [rec], 'Bind the signed message to a nonce, the chain id and this contract (EIP-712), and mark it used.'));
    }
  }
  return found;
}
