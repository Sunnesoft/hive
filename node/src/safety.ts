// What we treat as dangerous in text: on the way in (sponsor materials) and on the way out (answers).

/** Zero-width, bidi-override and Unicode-tag characters: invisible to people, readable by models. */
const INVISIBLE = /[­᠎​-‏‪-‮⁠-⁤⁦-⁯﻿\u{E0000}-\u{E007F}]/gu;
export const clean = (s: string) => s.normalize('NFC').replace(INVISIBLE, '');

/** Code that should never reach a customer, whatever a model thinks of it. */
const DANGEROUS: [string, RegExp][] = [
  ['downloads and runs code', /\b(curl|wget|iwr|Invoke-WebRequest)\b[^\n]*(\|\s*(ba|z)?sh\b|\|\s*iex\b|&&\s*(ba|z)?sh\b)/i],
  ['runs decoded or fetched code', /\b(eval|exec|Function)\s*\(\s*(atob|Buffer\.from|base64|b64decode|fetch|requests\.get|urllib)/i],
  ['encoded PowerShell', /powershell[^\n]*\s-e(nc|ncodedcommand)?\s/i],
  ['opens a reverse shell', /\b(nc|ncat|netcat)\b[^\n]*\s-e\s|\/dev\/tcp\/|socket\.connect[^\n]*subprocess/i],
  ['wipes data', /\brm\s+-rf\s+(\/|~)(\s|$|\*)|\bmkfs\.|\bformat\s+[a-z]:/i],
  ['mines crypto', /xmrig|stratum\+tcp|coinhive|cryptonight/i],
  ['takes keys, cookies or wallets', /\.ssh\/id_(rsa|ed25519)|wallet\.dat|document\.cookie|localStorage\.getItem\(\s*['"](token|key|seed)/i],
];
export const dangers = (code: string) => DANGEROUS.filter(([, r]) => r.test(code)).map(([what]) => what);

/** A URL shown as text that no Markdown renderer turns into a link. */
export const defang = (url: string) => url.replace(/^\w+:\/\//, '').replace(/\./g, '[.]');
