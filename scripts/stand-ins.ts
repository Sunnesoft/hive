// Stand-ins for NEAR AI and Agent Market, for a runner on a real chain before it has real keys (.env.testnet).
// The "models" are not models: an expert is picked when its profile shares words with the task, and it answers
// with the lines of its own knowledge closest to the question; the composer joins them, marked as a stand-in.
//   node --experimental-strip-types scripts/stand-ins.ts      NEAR AI :18091, Agent Market :18092, control :18093
// Control: POST :18093/hire {"description": "...", "escrow": "10"}; POST :18093/changes/<id> {"feedback": "..."};
//          GET :18093/tasks (what was delivered or declined).
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import * as mock from '../e2e/mocks.ts';

const models: string[] = JSON.parse(readFileSync(new URL('../policies/models.json', import.meta.url), 'utf8'));
await mock.nearai([...models, 'z-ai/glm-5.3', 'Qwen/Qwen3-Embedding-0.6B'], 18091, { general: true });
const market = await mock.market('aat_stand_in', 18092);
const tasks: string[] = [];

createServer(async (req, res) => {
  let raw = '';
  for await (const part of req) raw += part;
  const body = raw ? JSON.parse(raw) : {};
  const send = (status: number, json: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(json, null, 2));
  if (req.method === 'POST' && req.url === '/hire') {
    const id = `task-${tasks.length + 1}-${Date.now()}`;
    market.hire({ id, title: String(body.description).slice(0, 60), description: String(body.description), escrow: String(body.escrow ?? '10') });
    tasks.push(id);
    return send(200, { id });
  }
  const changes = /^\/changes\/(.+)$/.exec(req.url ?? '');
  if (req.method === 'POST' && changes) return (await market.requestChanges(decodeURIComponent(changes[1]!), String(body.feedback)), send(200, { ok: true }));
  if (req.method === 'GET' && req.url === '/tasks') return send(200, tasks.map((id) => ({ id, delivered: market.delivered(id), declined: market.declined.get(id) ?? null })));
  send(404, { error: 'not found' });
}).listen(18093, '127.0.0.1');
console.log('stand-ins: NEAR AI http://127.0.0.1:18091/v1, Agent Market http://127.0.0.1:18092, control http://127.0.0.1:18093');
