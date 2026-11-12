// Try your agent on your own questions, before it joins and whenever it fails in the swarm: the same template,
// knowledge search, model and evaluator the swarm uses, with your own NEAR AI key, on your machine. Your
// materials stay in the clear here because nobody else is involved. It never talks to the chain or the market.
//   NEARAI_API_KEY=... node --experimental-strip-types scripts/try.ts agents/auditor "your question" [--prompt]
//   NEARAI_API_KEY=... node --experimental-strip-types scripts/try.ts agents/auditor --audit
//   NEARAI_API_KEY=... node --experimental-strip-types scripts/try.ts agents/auditor "your question" --material Vault.sol [--code]
// --prompt prints the whole prompt the model gets. --audit runs the entry audit and shows what it noticed.
// --material gives the question a customer's file: an expert with "work": "review" then reviews it as in the swarm,
// pass by pass (--code: the task asks for code, so the gravest findings get proofs); any other expert answers with it.
// PROTOCOL_MODEL (default Qwen/Qwen3.8-27B) evaluates and audits; AUDIT_MODEL and EMBED_MODEL as in the runner.
for (const [k, v] of Object.entries({ NEAR_RPC: 'http://127.0.0.1:1', CONTRACT: 'try', RUNNER_ACCOUNT: 'try', MARKET_TOKEN: 'aat_try', PROTOCOL_MODEL: 'Qwen/Qwen3.8-27B', STORE_DIR: '/tmp/swarm-try' }))
  process.env[k] ??= v; // the runner's config wants them; nothing here uses them

const [dir, question] = process.argv.slice(2);
if (!dir || !question) throw new Error('usage: try.ts <agent folder> "<question>" [--prompt] [--material <file>] [--code] | try.ts <agent folder> --audit');
const flag = (name: string) => process.argv.includes(name);
const given = flag('--material') ? process.argv[process.argv.indexOf('--material') + 1] : undefined;
const { readAgent } = await import('./agent-folder.ts');
const { Materials } = await import('../node/src/materials.ts');
const llm = await import('../node/src/llm.ts');
const { audit, docsOf, filesOf } = await import('../node/src/audit.ts');
const { index, search } = await import('../node/src/library.ts');
const { review, reportOf } = await import('../node/src/review.ts');
const { ceiling, MAX_PASSES, partsOf, show, usdc } = await import('../node/src/rules.ts');
const { linksOf } = await import('../node/src/audit.ts');
const { readFileSync } = await import('node:fs');
const { basename } = await import('node:path');

const { card, materials } = readAgent(dir);
const parsed = Materials.safeParse(materials);
if (!parsed.success) throw new Error(`the runner would refuse these materials:\n${parsed.error.message}`);
const m = parsed.data;
await llm.refreshPrices();
const docs = docsOf(m);
console.log(`${m.name}: ${m.model}${m.pass_model ? ` (passes of a review on ${m.pass_model})` : ''}, ${m.knowledge.length} files, ${docs.length} chunks of knowledge`);

if (question === '--audit') {
  const v = await audit(m, card.skills, docs);
  console.log(`\n${v.allow ? 'ADMITTED' : 'DENIED'} (${v.category}): ${v.reason}`);
  for (const f of v.flags) console.log(`\n- ${f.reason}\n  ${f.excerpt.replace(/\n/g, '\n  ')}`);
  process.exit(v.allow ? 0 : 1);
}

const pages = given ? [{ url: `attachment: ${basename(given)}`, text: readFileSync(given, 'utf8') }] : [];
const reviews = m.work === 'review' && pages.length > 0 && docs.length > 0;
// A review that reads all of the knowledge needs no index of it: only a larger knowledge is searched for its closest parts.
const parts = partsOf(filesOf(m)).length; // a file of knowledge is a pass, a long file several
const lib = reviews && parts <= MAX_PASSES ? { chunks: docs, vectors: [] } : await index(docs);
const hold = usdc(card.max_cost);
const paid = async (text: string) => {
  const check = await llm.evaluate(question, question, text);
  console.log(`\nevaluator: ${check.delivered && !check.violation ? 'PAID' : 'NOT PAID'} (${check.why}): ${check.reason}`);
};

if (reviews) {
  console.log(`\na review of ${pages[0]!.url.replace('attachment: ', '')} (${pages[0]!.text.length} characters) with ${Math.min(parts, MAX_PASSES)} parts of the knowledge; your max cost ${show(hold)} USDC`);
  const r = await review({ m, lib, digest: '', links: linksOf(m) }, question, pages, hold, flag('--code'));
  const c = r.counts;
  console.log(`passes read ${c.passes}; findings raised ${c.raised}, in ${c.groups} groups; groups checked ${c.checked}; found by looking at them together ${c.combined}; findings that held ${c.held}; not confirmed but listed ${c.leads}; proofs ${c.proofs}; replies cut at their limit ${c.cut}; cost ${show(r.cost)} USDC${r.why ? `; stopped: ${r.why}` : ''}`);
  if (r.why) process.exit(1);
  const text = reportOf(r);
  console.log(`\n--- contribution ---\n${text}`);
  await paid(text);
  process.exit(0);
}

const found = await search(lib, question);
console.log(`\nknowledge found for the question (${found.chunks.length} chunks, search cost ${show(found.cost)} USDC):`);
for (const c of found.chunks) console.log(`  - ${c.slice(0, 160).replace(/\n/g, ' ')}${c.length > 160 ? '…' : ''}`);

const system = llm.instructions(m, found.chunks);
if (process.argv.includes('--prompt')) console.log(`\n--- prompt ---\n${system}\n\n# Question\n\n${question}\n--- end ---`);
const price = llm.priceOf(m.model);
if (price) console.log(`worst case of this call ${show(ceiling(Buffer.byteLength(system + question + pages.map((p) => p.text).join('')) + 200, price))} USDC; your max cost ${show(hold)}`);

const r = await llm.answer(m, found.chunks, question, pages, hold - found.cost);
console.log(`\n--- answer (${show(r.cost)} USDC${r.why ? `, ${r.why}` : ''}) ---\n${r.text || '(none)'}`);
if (!r.text.trim()) process.exit(1);
await paid(r.text);
