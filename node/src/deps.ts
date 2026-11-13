// What the customer's files refer to, read as part of their materials, whatever the language: the files their
// relative imports name (Rust `mod x;`, Solidity `import "./X.sol"`, JS and TS `import … from './x'`, Python
// `from .x import …`), in the same repository at the same commit; the libraries a manifest takes by path or by
// git (Cargo.toml); and npm packages (Solidity's `@openzeppelin/…` among them) at the exact version package.json
// names, from unpkg. A package with no version written down is not read: a line of it could not be checked against
// what the customer builds. A finding's proof may then stand on a line of a library the code calls, and whoever
// tests the proof reads the same line.
import { read, type Page } from './web.ts';

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
function cargoLibraries(url: string, toml: string): { name: string; lib: string }[] {
  const deps = toml.split(/^\[/m).filter((s) => /^(workspace\.)?dependencies\]/.test(s)).join('\n'); // not dev- or build-dependencies
  return [...deps.matchAll(/^([\w-]+)\s*=\s*\{([^}]*)\}/gm)].flatMap((m) => {
    const [name, spec] = [m[1]!, m[2]!];
    const path = /path\s*=\s*"([^"]+)"/.exec(spec)?.[1];
    if (path) return [{ name, lib: new URL(`${path.replace(/\/$/, '')}/src/lib.rs`, dirOf(url)).href }];
    const git = /git\s*=\s*"https:\/\/github\.com\/([^/"]+)\/([^/"]+?)(?:\.git)?"/.exec(spec);
    const ref = /(?:rev|tag|branch)\s*=\s*"([^"]+)"/.exec(spec)?.[1];
    return git && ref ? [{ name, lib: `https://raw.githubusercontent.com/${git[1]}/${git[2]}/${ref}/src/lib.rs` }] : [];
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
    for (const { name, lib: root } of cargoLibraries(p.url, p.text)) {
      const got = await get([root]);
      if (got) { lib.push({ name, url: got }); await walk(got, fetched.get(got)!); }
    }
  }
  const used = usedNames([...pages.map((p) => p.text), ...own.map((u) => fetched.get(u)!)].join('\n'));
  const libs = lib.map((l) => ({ ...l, score: defines(fetched.get(l.url)!, used) })).filter((l) => l.score > 0).sort((a, b) => b.score - a.score);
  const out: Page[] = [];
  let room = REFERRED_CHARS;
  const add = (url: string, label: string) => {
    const text = fetched.get(url)!;
    if (text.length > room || out.some((p) => p.url === url)) return;
    room -= text.length;
    out.push({ url, text: `// ${label}\n${text}` });
  };
  for (const url of own) add(url, 'a file of the same code, named by an import of the files given');
  for (const l of libs) add(l.url, `the library ${l.name}, which the code imports; for reference: findings are about the code itself`);
  if (named.size) out.push({ url: 'referred: libraries not read', text: `Libraries the code imports with no exact version in its materials, so not read: ${[...named].join(', ')}.` });
  return out;
}
