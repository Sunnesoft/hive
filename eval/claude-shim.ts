// NEAR AI's place, taken on this machine: the review runs its own code, and every call it makes is answered by a
// Claude model through the `claude` command, with the same instructions, the same prompt, the same form (a JSON
// schema the model fills in) and the same room to write. Embeddings by the same Qwen3-Embedding-0.6B, under ollama.
// So that what the swarm adds can be seen on another model, at no cost at NEAR AI.
//   CLAUDE_MODEL=claude-haiku-5-5 node --experimental-strip-types eval/claude-shim.ts [port]
// Every model name is priced as DeepSeek is at NEAR AI, so every limit set in money cuts where it would there.
// Not carried over: temperature (the command has no such setting; every call samples as the model does by default),
// and thinking cannot be turned off: the model thinks at SHIM_EFFORT (low by default, the nearest to NEAR AI's
// calls, which are asked to answer at once), in room of its own beside the room the call gives the answer. While
// it thinks, or waits its turn, the stream says so every few seconds, as a model that reasons does. A reply cut at
// its limit ends there: the command would go on in a second message, no model at NEAR AI does.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.argv[2] ?? 8787);
const MODEL = process.env.CLAUDE_MODEL ?? 'claude-haiku-5-5';
const AT_ONCE = Number(process.env.CLAUDE_AT_ONCE ?? 12); // calls answered at once; the rest wait their turn
const OLLAMA = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
const EMBEDDER = process.env.OLLAMA_EMBED ?? 'qwen3-embedding:0.6b';
const EFFORT = process.env.SHIM_EFFORT ?? 'low';
const THINKING_ROOM = Number(process.env.SHIM_THINKING_ROOM ?? 32_000); // output tokens the model may think in, besides the answer's
const PRICE = { in: 0.3, out: 1.2 }; // USD per 1M tokens: DeepSeek-V4.1-Flash at NEAR AI
const EMPTY = mkdtempSync(join(tmpdir(), 'claude-shim-')); // the command runs where there is no project to read
const say = (line: string) => console.error(`${new Date().toISOString().slice(11, 19)} ${line}`);

// The command runs as a session of its own: none of the settings of the session that started the stand-in.
const CLEAN = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^CLAUDE|^MAX_THINKING/.test(k)));
const children = new Set<ReturnType<typeof spawn>>();
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => { for (const c of children) c.kill(); process.exit(0); }); // no call outlives the stand-in
// The model's calls count against the plan of whoever is signed in to `claude`, the one this session runs on too:
// at the first warning that the plan's limit is near, no new call is started, so the run cannot use it up.
let warned = '';
let running = 0;
const waiting: (() => void)[] = [];
async function turn<T>(work: () => Promise<T>) {
  if (running >= AT_ONCE) await new Promise<void>((go) => waiting.push(go));
  running++;
  try { return await work(); } finally { running--; waiting.shift()?.(); }
}

type Message = { role: string; content: string | { type: string; text?: string }[] };
type Asked = { model: string; messages: Message[]; max_tokens?: number; stream?: boolean; response_format?: { type: string; json_schema?: { schema: object } } };
type Said = { text: string; input: number; output: number; finish: 'stop' | 'length'; usd: number };
const textOf = (c: Message['content']) => (typeof c === 'string' ? c : c.map((p) => p.text ?? '').join(''));

/** One call of the `claude` command. `piece` gets the reply as it is written; with a schema, the JSON of the form
 *  at once at the end: the command takes it as the input of a tool it adds, checks it against the schema and has
 *  the model fill it in again if it does not fit. */
function claude(a: Asked, piece: (s: string) => void, stopped: AbortSignal): Promise<Said> {
  const system = a.messages.filter((m) => m.role === 'system').map((m) => textOf(m.content)).join('\n\n');
  const prompt = a.messages.filter((m) => m.role !== 'system').map((m) => textOf(m.content)).join('\n\n');
  const schema = a.response_format?.type === 'json_schema' ? a.response_format.json_schema?.schema : undefined;
  const args = ['-p', '--model', MODEL, '--effort', EFFORT, '--system-prompt', system || 'You are a helpful assistant.', '--tools', '', '--strict-mcp-config', '--setting-sources', '',
    '--no-session-persistence', '--output-format', 'stream-json', '--include-partial-messages', '--verbose', ...(schema ? ['--json-schema', JSON.stringify(schema)] : [])];
  const child = spawn('claude', args, { cwd: EMPTY, env: { ...CLEAN, CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(Math.max(256, a.max_tokens ?? 8_000) + THINKING_ROOM) }, stdio: ['pipe', 'pipe', 'pipe'] });
  children.add(child);
  child.on('close', () => children.delete(child));
  child.stdin.end(prompt);
  stopped.addEventListener('abort', () => child.kill());
  return new Promise((done, fail) => {
    const said: Said = { text: '', input: 0, output: 0, finish: 'stop', usd: 0 };
    const blocks = new Map<number, string>(); // index -> what the block is: text, or the form's tool
    let [rest, form, errors, settled] = ['', '', '', false];
    const finish = () => { if (!settled) { settled = true; child.kill(); done(said); } };
    child.stderr.on('data', (d) => { errors += d; });
    child.stdout.on('data', (d) => {
      const lines = (rest + d).split('\n');
      rest = lines.pop()!;
      for (const line of lines.filter(Boolean)) {
        let m: { type: string; event?: any; is_error?: boolean; result?: string; total_cost_usd?: number; structured_output?: unknown };
        try { m = JSON.parse(line); } catch { continue; }
        const e = m.event;
        if (m.type === 'stream_event' && e) {
          if (e.type === 'message_start') { const u = e.message.usage; said.input += u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0); }
          if (e.type === 'content_block_start') blocks.set(e.index, e.content_block.type === 'tool_use' ? e.content_block.name : e.content_block.type);
          if (e.type === 'content_block_delta') {
            const kind = blocks.get(e.index);
            if (schema && kind === 'StructuredOutput') form += e.delta.partial_json ?? '';
            if (!schema && kind === 'text' && e.delta.text) { said.text += e.delta.text; piece(e.delta.text); }
          }
          if (e.type === 'content_block_start' && e.content_block.name === 'StructuredOutput') form = ''; // a form the command found wrong is filled in again
          if (e.type === 'message_delta') {
            said.output += e.usage?.output_tokens ?? 0;
            if (e.delta?.stop_reason === 'max_tokens') said.finish = 'length';
            if (!schema && e.delta?.stop_reason) finish(); // a reply cut at its limit is not continued, as no model's is
          }
        }
        if (m.type === 'rate_limit_event' && (m as any).rate_limit_info?.status !== 'allowed' && !warned) { warned = JSON.stringify((m as any).rate_limit_info); say(`LIMIT WARNING, no new calls: ${warned}`); }
        if (m.type === 'result') {
          said.usd = m.total_cost_usd ?? 0;
          // A form is given whole once the command has checked it against the schema: the last one, if none passed.
          if (schema) { said.text = m.structured_output ? JSON.stringify(m.structured_output) : form; if (said.text) piece(said.text); }
          if (m.is_error && !said.text) { settled = true; fail(new Error(String(m.result).slice(0, 300))); } else finish();
        }
      }
    });
    child.on('close', (code) => { if (!settled) { settled = true; if (said.text) done(said); else fail(new Error(`claude exited ${code}: ${errors.slice(-300)}`)); } });
  });
}

const chunk = (id: string, model: string, delta: object, finish: string | null, usage?: object) =>
  `data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, delta, finish_reason: finish }], ...(usage ? { usage } : {}) })}\n\n`;

async function completion(a: Asked, res: ServerResponse) {
  if (warned && !process.env.SHIM_PAST_WARNING) { res.writeHead(503, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: `the plan's limit is near: ${warned}` } })); return; }
  const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const stopped = new AbortController();
  res.on('close', () => { if (!res.writableFinished) stopped.abort(); });
  let [started, wrote] = [false, false];
  const at = Date.now();
  const open = () => { if (!started) { started = true; res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' }); } };
  const piece = (s: string) => { if (a.stream) { open(); wrote = true; res.write(chunk(id, a.model, { content: s }, null)); } };
  // A sign of life while the model thinks or waits: what the caller gets as reasoning, outside the answer.
  const alive: NodeJS.Timeout | undefined = a.stream ? setInterval(() => {
    if (res.destroyed || res.writableEnded) return clearInterval(alive); // the caller gave up
    open();
    res.write(chunk(id, a.model, { reasoning_content: '.' }, null));
  }, 10_000) : undefined;
  try {
    let said: Said | undefined;
    for (let attempt = 0; !said; attempt++) {
      try { said = await turn(() => claude(a, piece, stopped.signal)); } catch (e) {
        if (wrote || stopped.signal.aborted || attempt >= 2) throw e; // once a reply is under way, a failure is the reply's
        say(`retry after: ${String(e).slice(0, 160)}`);
        await new Promise((r) => setTimeout(r, 10_000 * (attempt + 1)));
      }
    }
    const usage = { prompt_tokens: said.input, completion_tokens: said.output, total_tokens: said.input + said.output };
    say(`${a.response_format ? 'form' : 'text'} ${said.input} in, ${said.output} out, ${said.finish}, ${Math.round((Date.now() - at) / 1000)} s, $${said.usd.toFixed(4)} at Claude (${running} running, ${waiting.length} waiting)`);
    clearInterval(alive);
    if (a.stream) {
      open();
      res.end(`${chunk(id, a.model, {}, said.finish, usage)}data: [DONE]\n\n`);
    } else {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: a.model, choices: [{ index: 0, message: { role: 'assistant', content: said.text }, finish_reason: said.finish }], usage }));
    }
  } catch (e) {
    clearInterval(alive);
    say(`failed: ${String(e).slice(0, 200)}`);
    if (!started) { res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: String(e).slice(0, 300) } })); } else res.destroy();
  }
}

async function embeddings(b: { input: string | string[] }, res: ServerResponse) {
  const input = Array.isArray(b.input) ? b.input : [b.input];
  const r = await fetch(`${OLLAMA}/api/embed`, { method: 'POST', body: JSON.stringify({ model: EMBEDDER, input }) });
  if (!r.ok) { res.writeHead(502); res.end(); return; }
  const { embeddings: vectors } = (await r.json()) as { embeddings: number[][] };
  const tokens = Math.ceil(input.join('').length / 4);
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ object: 'list', model: EMBEDDER, data: vectors.map((embedding, index) => ({ object: 'embedding', index, embedding })), usage: { prompt_tokens: tokens, total_tokens: tokens } }));
}

/** NEAR AI's list of models with their prices, as llm.refreshPrices reads it: one entry for any name asked. */
const NAMES = ['deepseek-ai/DeepSeek-V4.1-Flash-1017', 'Qwen/Qwen3.8-27B', 'Qwen/Qwen3-Embedding-0.6B', MODEL, ...(process.env.CLAUDE_NAMES ?? '').split(',').filter(Boolean)];
const cost = (perMillion: number) => ({ amount: Math.round(perMillion * 1e3), scale: 9 });
const catalog = { models: NAMES.map((modelId) => ({ modelId, inputCostPerToken: cost(PRICE.in), outputCostPerToken: cost(PRICE.out) })) };

// A caller that went away (a run stopped mid-call) closes its socket: writing to it must not stop the stand-in for all.
process.on('uncaughtException', (e) => console.log(`${new Date().toISOString().slice(11, 19)} ignored: ${String(e).slice(0, 120)}`));
createServer((req, res) => {
  res.on('error', () => {});
  req.on('error', () => {});
  const path = (req.url ?? '').replace(/^\/v1/, '').split('?')[0];
  if (req.method === 'GET' && path === '/model/list') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(catalog)); return; }
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : {};
    if (path === '/chat/completions') void completion(body, res);
    else if (path === '/embeddings') void embeddings(body, res).catch(() => { res.writeHead(502); res.end(); });
    else if (path === '/billing/costs') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ requests: [] })); }
    else { res.writeHead(404); res.end(); }
  });
}).listen(PORT, '127.0.0.1', () => say(`NEAR AI's place on http://127.0.0.1:${PORT}/v1: ${MODEL}, ${AT_ONCE} at once; embeddings by ${EMBEDDER}`));
