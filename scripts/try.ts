// Try your agent on your own questions, before it joins and whenever it fails in the swarm: the same template,
// knowledge search, model and evaluator the swarm uses, with your own NEAR AI key, on your machine. Your
// materials stay in the clear here because nobody else is involved. It never talks to the chain or the market.
//   NEARAI_API_KEY=... node --experimental-strip-types scripts/try.ts agents/auditor "your question" [--prompt]
//   NEARAI_API_KEY=... node --experimental-strip-types scripts/try.ts agents/auditor --audit
// --prompt prints the whole prompt the model gets. --audit runs the entry audit and shows what it noticed.
// PROTOCOL_MODEL (default z-ai/glm-5.3) evaluates and audits; AUDIT_MODEL and EMBED_MODEL as in the runner.
for (const [k, v] of Object.entries({ NEAR_RPC: 'http://127.0.0.1:1', CONTRACT: 'try', RUNNER_ACCOUNT: 'try', MARKET_TOKEN: 'aat_try', PROTOCOL_MODEL: 'z-ai/glm-5.3', STORE_DIR: '/tmp/swarm-try' }))
  process.env[k] ??= v; // the runner's config wants them; nothing here uses them

const [dir, question] = process.argv.slice(2);
if (!dir || !question) throw new Error('usage: try.ts <agent folder> "<question>" [--prompt] | try.ts <agent folder> --audit');
const { readAgent } = await import('./agent-folder.ts');
const { Materials } = await import('../node/src/materials.ts');
const llm = await import('../node/src/llm.ts');
const { audit, docsOf } = await import('../node/src/audit.ts');
const { index, search } = await import('../node/src/library.ts');
const { ceiling, show, usdc } = await import('../node/src/rules.ts');

const { card, materials } = readAgent(dir);
const parsed = Materials.safeParse(materials);
if (!parsed.success) throw new Error(`the runner would refuse these materials:\n${parsed.error.message}`);
const m = parsed.data;
await llm.refreshPrices();
const docs = docsOf(m);
console.log(`${m.name}: ${m.model}, ${m.knowledge.length} files, ${docs.length} chunks of knowledge`);

if (question === '--audit') {
  const v = await audit(m, card.skills, docs);
  console.log(`\n${v.allow ? 'ADMITTED' : 'DENIED'} (${v.category}): ${v.reason}`);
  for (const f of v.flags) console.log(`\n- ${f.reason}\n  ${f.excerpt.replace(/\n/g, '\n  ')}`);
  process.exit(v.allow ? 0 : 1);
}

const lib = await index(docs);
const found = await search(lib, question);
console.log(`\nknowledge found for the question (${found.chunks.length} chunks, search cost ${show(found.cost)} USDC):`);
for (const c of found.chunks) console.log(`  - ${c.slice(0, 160).replace(/\n/g, ' ')}${c.length > 160 ? '…' : ''}`);

const system = llm.instructions(m, found.chunks);
if (process.argv.includes('--prompt')) console.log(`\n--- prompt ---\n${system}\n\n# Question\n\n${question}\n--- end ---`);
const price = llm.priceOf(m.model);
const hold = usdc(card.max_cost);
if (price) console.log(`worst case of this call ${show(ceiling(Buffer.byteLength(system + question) + 20, price))} USDC; your max cost ${show(hold)}`);

const r = await llm.answer(m, found.chunks, question, [], hold - found.cost);
console.log(`\n--- answer (${show(r.cost)} USDC${r.why ? `, ${r.why}` : ''}) ---\n${r.text || '(none)'}`);
if (!r.text.trim()) process.exit(1);
const check = await llm.evaluate(question, question, r.text);
console.log(`\nevaluator: ${check.delivered && !check.violation ? 'PAID' : 'NOT PAID'} (${check.why}): ${check.reason}`);
