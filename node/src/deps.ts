// What the customer's files refer to, read as part of their materials, whatever the language: the files their
// relative imports name (Rust `mod x;`, Solidity `import "./X.sol"`, JS and TS `import … from './x'`, Python
// `from .x import …`), in the same repository at the same commit; the libraries a manifest takes by path or by
// git (Cargo.toml); and npm packages (Solidity's `@openzeppelin/…` among them) at the exact version package.json
// names, from unpkg. A package with no version written down is not read: a line of it could not be checked against
// what the customer builds. A finding's proof may then stand on a line of a library the code calls, and whoever
// tests the proof reads the same line.
import { gunzipSync } from 'node:zlib';
import { bytesOf, jsonOf, PUBLIC_CHARS, read, type Page } from './web.ts';

const FETCHABLE = /^https:\/\/(raw\.githubusercontent\.com|unpkg\.com)\//;
const MAX_FILES = 40; // files read of what the materials refer to
export const REFERRED_CHARS = 110_000; // the most of them added to the materials

const dirOf = (url: string) => url.slice(0, url.lastIndexOf('/') + 1);
const ext = (url: string) => /\.(\w+)$/.exec(url.split('?')[0]!)?.[1] ?? '';
const repoOf = (url: string) => /^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\//.exec(url)?.[0] ?? /^https:\/\/unpkg\.com\/(@[^/]+\/)?[^/@]+@[^/]+\//.exec(url)?.[0] ?? '';

/** The files a source file names by relative path, each as the URLs it may be at; and the packages it names. */
function refsOf(url: string, text: string): { files: string[][]; packages: string[] } {
  const files: string[][] = [];
  const packages: string[] = [];
  const at = (rel: string, tries: string[]) => files.push(tries.map((t) => new URL(rel + t, dirOf(url)).href));
  switch (ext(url)) {
    case 'rs': {
      const file = url.slice(url.lastIndexOf('/') + 1);
      const base = /^(lib|main|mod)\.rs$/.test(file) ? '' : `${file.replace(/\.rs$/, '')}/`;
      for (const m of text.matchAll(/^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+(\w+)\s*;/gm)) at(`${base}${m[1]}`, ['.rs', '/mod.rs']);
      break;
    }
    case 'sol':
      for (const m of text.matchAll(/^\s*import\s+(?:[^'";]*?\s+from\s+)?["']([^"']+)["']/gm)) (m[1]!.startsWith('.') ? at(m[1]!, ['']) : packages.push(m[1]!));
      break;
    case 'ts': case 'tsx': case 'js': case 'mjs': case 'cjs':
      for (const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["']([^"']+)["']/g)) {
        if (m[1]!.startsWith('.')) at(m[1]!, ext(m[1]!) ? [''] : ['.ts', '.tsx', '.js', '/index.ts', '/index.js']);
        else if (/\.\w+$/.test(m[1]!)) packages.push(m[1]!);
      }
      break;
    case 'py':
      for (const m of text.matchAll(/^\s*from\s+(\.+)([\w.]*)\s+import/gm)) at(`${'../'.repeat(m[1]!.length - 1)}${m[2]!.replace(/\./g, '/')}`, ['.py', '/__init__.py']);
      break;
  }
  return { files, packages };
}

/** The libraries a Cargo.toml takes by path or by git, as the URLs of their lib.rs. */
function cargoLibraries(url: string, toml: string): { name: string; lib: string; also?: string }[] {
  const deps = toml.split(/^\[/m).filter((s) => /^(workspace\.)?dependencies\]/.test(s)).join('\n'); // not dev- or build-dependencies
  return [...deps.matchAll(/^([\w-]+)\s*=\s*\{([^}]*)\}/gm)].flatMap((m) => {
    const [name, spec] = [m[1]!, m[2]!];
    const path = /path\s*=\s*"([^"]+)"/.exec(spec)?.[1];
    if (path) return [{ name, lib: new URL(`${path.replace(/\/$/, '')}/src/lib.rs`, dirOf(url)).href }];
    const git = /git\s*=\s*"https:\/\/github\.com\/([^/"]+)\/([^/"]+?)(?:\.git)?"/.exec(spec);
    const ref = /(?:rev|tag|branch)\s*=\s*"([^"]+)"/.exec(spec)?.[1];
    const crate = /package\s*=\s*"([^"]+)"/.exec(spec)?.[1] ?? name;
    return git && ref ? [{ name, lib: `https://raw.githubusercontent.com/${git[1]}/${git[2]}/${ref}/src/lib.rs`, also: `https://raw.githubusercontent.com/${git[1]}/${git[2]}/${ref}/${crate}/src/lib.rs` }] : [];
  });
}

/** An npm package's file at the exact version a package.json of the materials names, or nothing. */
function npmFile(spec: string, versions: Map<string, string>) {
  const parts = spec.split('/');
  const name = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!;
  const version = versions.get(name)?.replace(/^[=v]/, '');
  return version && /^\d+\.\d+\.\d+[\w.-]*$/.test(version) ? { name, url: `https://unpkg.com/${name}@${version}/${parts.slice(name.split('/').length).join('/')}` } : undefined;
}

/** Names a file uses, and how many of them another file defines: what a library's file holds of what the code uses. */
const usedNames = (text: string) => new Set([...text.matchAll(/\b([A-Za-z_]\w{2,})(!?)\s*[(<{!:.]/g)].map((m) => m[1]!));
const defines = (text: string, names: Set<string>) =>
  [...text.matchAll(/\b(?:macro_rules!\s*|fn\s+|struct\s+|enum\s+|trait\s+|type\s+|const\s+|contract\s+|library\s+|interface\s+|function\s+|modifier\s+|class\s+|def\s+)([A-Za-z_]\w*)/g)].filter((m) => names.has(m[1]!)).length;


/** The crates Rust files take from outside: the roots of their `use` paths that are neither the language's own nor
 *  the code's own modules. A crate of the customer's workspace (`model`, say) may be named too: a crate of that name
 *  on crates.io is read only if it defines what the code uses, so an unrelated one is dropped. */
const NOT_CRATES = new Set(['std', 'core', 'alloc', 'crate', 'self', 'super', 'proc_macro', 'test']);
export function cratesUsed(pages: Page[]): string[] {
  const rs = pages.filter((p) => /\.rs$/.test(p.url));
  const own = new Set(rs.flatMap((p) => [p.url.slice(p.url.lastIndexOf('/') + 1).replace(/\.rs$/, ''), ...[...p.text.matchAll(/\bmod\s+(\w+)/g)].map((m) => m[1]!)]));
  const roots = rs.flatMap((p) => [...p.text.matchAll(/^\s*(?:pub(?:\([^)]*\))?\s+)?use\s+(?:::)?([a-z][a-z0-9_]*)::/gm), ...p.text.matchAll(/\bextern\s+crate\s+([a-z][a-z0-9_]*)/g)].map((m) => m[1]!));
  return [...new Set(roots)].filter((n) => !NOT_CRATES.has(n) && !own.has(n));
}

/** The exact versions the materials name: Cargo.lock's, or a Cargo.toml's requirement ("5.30", "^1.2"). */
function versionsNamed(pages: Page[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const p of pages.filter((x) => x.url.endsWith('Cargo.toml'))) {
    for (const m of p.text.matchAll(/^([\w-]+)\s*=\s*(?:"([^"]+)"|\{[^}]*version\s*=\s*"([^"]+)"[^}]*\})/gm)) out.set(m[1]!.replace(/-/g, '_'), (m[2] ?? m[3])!);
  }
  for (const p of pages.filter((x) => x.url.endsWith('Cargo.lock'))) {
    for (const m of p.text.matchAll(/\[\[package\]\]\s*name = "([^"]+)"\s*version = "([^"]+)"/g)) out.set(m[1]!.replace(/-/g, '_'), `=${m[2]!}`);
  }
  return out;
}

const MAX_CRATES = 6; // crates read from crates.io for one task
const CRATE_BYTES = 5_000_000; // the largest crate archive read
type Version = { num: string; yanked: boolean };
/** The version of a crate to read: the exact one, or the newest that meets the requirement, or the newest of all. */
function pick(versions: Version[], want: string | undefined): string | undefined {
  const ok = versions.filter((v) => !v.yanked && !/-/.test(v.num)).map((v) => v.num);
  if (!want) return ok[0];
  const exact = want.replace(/^=/, '');
  if (want.startsWith('=')) return ok.find((v) => v === exact) ?? versions.find((v) => v.num === exact)?.num;
  const [major, minor = '0'] = want.replace(/^[\^~]/, '').split('.');
  return ok.find((v) => { const [a, b] = v.split('.'); return a === major && (major !== '0' || b === minor) && Number(b) >= Number(minor); }) ?? ok[0];
}
/** A .crate archive's Rust sources, by their path inside the crate. */
export function sourcesIn(archive: Uint8Array): Map<string, string> {
  const tar = gunzipSync(archive);
  const out = new Map<string, string>();
  const text = new TextDecoder();
  for (let at = 0; at + 512 <= tar.length;) {
    const head = tar.subarray(at, at + 512);
    if (head.every((b) => b === 0)) break;
    const field = (from: number, len: number) => text.decode(head.subarray(from, from + len)).replace(/\0.*$/s, '');
    const name = [field(345, 155), field(0, 100)].filter(Boolean).join('/');
    const size = parseInt(field(124, 12).trim() || '0', 8);
    const body = tar.subarray(at + 512, at + 512 + size);
    if (/\.rs$/.test(name) && (field(156, 1) === '0' || field(156, 1) === '')) out.set(name.replace(/^[^/]+\//, ''), text.decode(body));
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}
/** A crate's sources from crates.io at the version the materials name, or its newest release. */
async function crateSources(name: string, want: string | undefined) {
  const dashed = name.replace(/_/g, '-');
  for (const id of [...new Set([dashed, name])]) {
    const info = await jsonOf<{ versions?: Version[] }>(`https://crates.io/api/v1/crates/${id}`).catch(() => null);
    const version = info?.versions && pick(info.versions, want);
    if (!version) continue;
    const archive = await bytesOf(`https://static.crates.io/crates/${id}/${id}-${version}.crate`, CRATE_BYTES).catch(() => null);
    if (archive) return { id, version, named: !!want, files: sourcesIn(archive) };
  }
  return null;
}

/** Everything the materials refer to and do not hold: first what is the customer's own (the same repository, the
 *  same crate), then what of the libraries defines what the code uses. Each is labelled as what it is. */
export async function referred(pages: Page[]): Promise<Page[]> {
  const have = new Set(pages.map((p) => p.url));
  const fetched = new Map<string, string>();
  const get = async (urls: string[]) => {
    for (const url of urls) {
      if (have.has(url) || fetched.has(url)) return '';
      if (fetched.size >= MAX_FILES || !FETCHABLE.test(url)) continue;
      const text = await read(url).catch(() => '');
      if (text && !/^\s*<!DOCTYPE|^Cannot find/i.test(text)) { fetched.set(url, text); return url; }
    }
    return '';
  };
  // A Rust file belongs to the crate whose src/ it is in; the crate most given files are in is the customer's.
  const crateOf = (url: string) => (ext(url) === 'rs' ? url.replace(/(\/src\/).*$/, '$1') : repoOf(url));
  const count = new Map<string, number>();
  for (const p of pages) if (/\.(rs|sol|tsx?|m?js|py)$/.test(p.url)) count.set(crateOf(p.url), (count.get(crateOf(p.url)) ?? 0) + 1);
  const main = [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const versions = new Map<string, string>();
  for (const p of pages.filter((x) => x.url.endsWith('package.json'))) {
    try { const j = JSON.parse(p.text); for (const [k, v] of Object.entries({ ...j.dependencies, ...j.devDependencies })) versions.set(k, String(v)); } catch { /* not JSON */ }
  }
  const own: string[] = [];
  const lib: { name: string; url: string }[] = [];
  const named = new Set<string>(); // packages named with no version to read them at
  const walk = async (url: string, text: string, depth = 0): Promise<void> => {
    if (depth > 6) return;
    const { files, packages } = refsOf(url, text);
    for (const tries of files) {
      const got = await get(tries);
      if (!got) continue;
      (crateOf(got) === main ? own.push(got) : lib.push({ name: crateOf(got).split('/').filter(Boolean).slice(-2).join('/'), url: got }));
      await walk(got, fetched.get(got)!, depth + 1);
    }
    for (const spec of packages) {
      const f = npmFile(spec, versions);
      if (!f) { named.add(spec.split('/').slice(0, spec.startsWith('@') ? 2 : 1).join('/')); continue; }
      const got = await get([f.url]);
      if (got) { lib.push({ name: f.name, url: got }); await walk(got, fetched.get(got)!, depth + 1); }
    }
  };
  for (const p of pages) await walk(p.url, p.text);
  // A Rust file given without its crate root: the root names the crate's other modules.
  if (main.endsWith('/src/')) { const root = await get([`${main}lib.rs`]); if (root) { own.push(root); await walk(root, fetched.get(root)!); } }
  for (const p of pages.filter((x) => x.url.endsWith('Cargo.toml'))) {
    for (const { name, lib: root, also } of cargoLibraries(p.url, p.text)) {
      const got = await get(also ? [root, also] : [root]);
      if (got) { lib.push({ name, url: got }); await walk(got, fetched.get(got)!); }
    }
  }
  // The crates the code uses from crates.io, at the version the materials name or their newest release: a step of
  // a proof that the standard's resolver decides is then read, by everyone who tests it, on the resolver's code.
  const wanted = versionsNamed(pages);
  const already = new Set(lib.map((l) => l.name.replace(/-/g, '_')));
  for (const crate of cratesUsed(pages).filter((c) => !already.has(c)).slice(0, MAX_CRATES)) {
    const got = await crateSources(crate, wanted.get(crate)).catch(() => null);
    if (!got) continue;
    for (const [path, text] of got.files) {
      if (!path.startsWith('src/')) continue; // the crate itself, not its tests, examples or benches
      const url = `https://docs.rs/crate/${got.id}/${got.version}/source/${path}`;
      fetched.set(url, text);
      lib.push({ name: `${got.id} ${got.version}${got.named ? '' : ' (the newest release: the materials name no version)'}`, url });
    }
  }
  const used = usedNames([...pages.map((p) => p.text), ...own.map((u) => fetched.get(u)!)].join('\n'));
  // By what a file defines of what the code uses, for its length: a crate's large root (near-sdk's lib.rs, 64 kB)
  // must not take the room of the small file that holds the function a finding stands on.
  const libs = lib.map((l) => { const text = fetched.get(l.url)!; const score = defines(text, used); return { ...l, score, rank: score / (1 + text.length / 8_000) }; })
    .filter((l) => l.score > 0).sort((a, b) => b.rank - a.rank);
  const out: Page[] = [];
  // What the experts get is the customer's files and these together, within PUBLIC_CHARS: the rest of the room.
  let room = Math.min(REFERRED_CHARS, PUBLIC_CHARS - pages.reduce((n, p) => n + p.text.length, 0) - 2_000);
  const add = (url: string, label: string) => {
    const text = fetched.get(url)!;
    if (text.length > room || out.some((p) => p.url === url)) return;
    room -= text.length;
    out.push({ url, text: `// ${label}\n${text}`, first: 0 });
  };
  for (const url of own) add(url, 'a file of the same code, named by an import of the files given');
  for (const l of libs) add(l.url, `the library ${l.name}, which the code imports; for reference: findings are about the code itself`);
  if (named.size) out.push({ url: 'referred: libraries not read', text: `Libraries the code imports with no exact version in its materials, so not read: ${[...named].join(', ')}.` });
  return out;
}

/** The public files a step of a review asked for, to decide on code it did not have (a library function the code
 *  calls): raw files on GitHub or unpkg, or a crate's file named as docs.rs names it
 *  (docs.rs/crate/<crate>/<version>/source/<path>, the version "latest" for the newest release). Within `room`. */
export async function needed(urls: string[], room: number): Promise<Page[]> {
  // A step may name a file in a sentence ("the source of X (docs.rs/crate/x/latest/source/src/a.rs)"): its address is
  // taken out of the words around it, with or without its https://.
  const addresses = [...new Set(urls.flatMap((u) => [...u.matchAll(/(?:https:\/\/)?((?:docs\.rs\/crate|raw\.githubusercontent\.com|unpkg\.com)\/[^\s)'"`,;]+)/g)].map((m) => `https://${m[1]!.replace(/[.]+$/, '')}`)))];
  const out: Page[] = [];
  for (const url of addresses.slice(0, 3)) {
    const crate = /^https:\/\/docs\.rs\/crate\/([\w-]+)\/([^/]+)\/source\/(.+)$/.exec(url.trim());
    let text = '';
    if (crate) {
      const got = await crateSources(crate[1]!, crate[2] === 'latest' ? undefined : `=${crate[2]}`).catch(() => null);
      text = got?.files.get(crate[3]!) ?? '';
    } else if (FETCHABLE.test(url)) text = await read(url).catch(() => '');
    if (!text || /^\s*<!DOCTYPE/i.test(text) || text.length > room) continue;
    room -= text.length;
    out.push({ url, text: `// a file of a library the code calls, read because a step asked for it\n${text}`, first: 0 });
  }
  return out;
}
