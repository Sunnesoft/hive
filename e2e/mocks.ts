// Stand-ins for the outside services: just enough of their HTTP APIs for the runner.
// The "models" follow fixed rules, so the money on chain is exact and checkable.
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';

type Handler = (method: string, path: string, body: any, auth: string | undefined) => [number, unknown];

async function listen(handle: Handler) {
  const server = createServer(async (req: IncomingMessage, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const [status, json] = handle(req.method!, req.url!, raw ? JSON.parse(raw) : undefined, req.headers.authorization);
    res.writeHead(status, { 'content-type': 'application/json' }).end(Buffer.isBuffer(json) ? json : JSON.stringify(json));
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() };
}

export const STEP = { in: 1_000, out: 200 }; // tokens every model call reports
export const PRICE = { in: 1_000, out: 5_000 }; // 1e-9 USD per token: $1 and $5 per 1M

/** NEAR AI: a price list and a chat endpoint whose answers follow fixed rules by system prompt. */
export async function nearai(models: string[]) {
  const agentCalls: string[] = []; // everything each agent call saw, to check that agents stay isolated
  const composed: { previous: string }[] = [];
  const toolResults: string[] = [];
  const reply = (content: string | null, tool_calls?: unknown) => [200, {
    id: 'x', object: 'chat.completion', created: 0, model: 'mock',
    choices: [{ index: 0, message: { role: 'assistant', content, tool_calls }, finish_reason: tool_calls ? 'tool_calls' : 'stop' }],
    usage: { prompt_tokens: STEP.in, completion_tokens: STEP.out, total_tokens: STEP.in + STEP.out },
  }] as [number, unknown];
  const cost = (amount: number) => ({ amount, scale: 9, currency: 'USD' });

  // Embeddings: which words occur, hashed into 1024 buckets, so search works by shared words.
  const bag = (text: string) => {
    const v = new Array(1024).fill(0);
    for (const w of text.toLowerCase().match(/[a-z0-9-]+/g) ?? []) v[[...w].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 1024] = 1;
    return v;
  };

  const server = await listen((method, path, body) => {
    if (method === 'POST' && path === '/v1/embeddings') {
      const input: string[] = Array.isArray(body.input) ? body.input : [body.input];
      const data = input.map((t, index) => ({ object: 'embedding', index, embedding: bag(t) }));
      return [200, { object: 'list', data, model: body.model, usage: { prompt_tokens: 10 * input.length, total_tokens: 10 * input.length } }];
    }
    if (method === 'GET' && path.startsWith('/v1/model/list'))
      return [200, { models: models.map((modelId) => ({ modelId, inputCostPerToken: cost(PRICE.in), outputCostPerToken: cost(PRICE.out) })) }];
    const msgs: { role: string; content: string }[] = body.messages;
    const system = msgs.find((m) => m.role === 'system')?.content ?? '';
    const user = msgs.find((m) => m.role === 'user')?.content ?? '';
    const json = (x: unknown) => reply(JSON.stringify(x));
    if (system.startsWith('You review an AI agent')) return json({ allow: !/OVERRIDE/.test(user), reason: 'mock review' });
    if (system.startsWith('You review a task')) return json({ allow: !/malware/i.test(user), reason: 'mock screening' });
    if (system.startsWith('You route a task')) {
      // An agent is asked when the task names the topic of its skills ("<topic>: <what exactly>").
      const { task, agents } = JSON.parse(user) as { task: string; agents: { id: number; skills: string }[] };
      const asked = agents.filter((a) => task.includes(a.skills.split(':')[0]!));
      return json({ questions: asked.map((a) => ({ id: a.id, question: `What do your notes say about ${a.skills}?` })) });
    }
    if (system.startsWith('You write the final answer')) {
      const { previous, contributions } = JSON.parse(user) as { previous: string; contributions: { id: number; text: string }[] };
      composed.push({ previous });
      const answer = `Answer: ${contributions.map((c) => c.text).join(' ')}${previous ? ' Revised: it launches at 09:00 UTC.' : ''}`;
      const score = (t: string) => (t.includes('2027-03-14') ? 6 : t.includes('BLUE-HERON') ? 4 : 0);
      return json({ answer, scores: contributions.map((c) => ({ id: c.id, score: score(c.text), violation: false })) });
    }
    // An agent answers from its private knowledge and the library chunks it was given.
    // One with tools first tries the cloud metadata host.
    agentCalls.push(JSON.stringify(msgs));
    const knowledge = /<knowledge>\n([\s\S]*?)\n<\/knowledge>/.exec(system)?.[1] ?? '';
    const library = /<library>\n([\s\S]*?)\n<\/library>/.exec(system)?.[1] ?? '';
    const found = library.split('\n').filter((l) => l.includes('Project Alpha')).join(' ');
    const tool = msgs.find((m) => m.role === 'tool');
    if (body.tools?.length && !tool) {
      const args = JSON.stringify({ url: 'http://169.254.169.254/latest/meta-data/' });
      return reply(null, [{ id: 'call_1', type: 'function', function: { name: 'fetch_url', arguments: args } }]);
    }
    if (tool) toolResults.push(JSON.stringify(tool.content));
    return reply(`From my notes: ${knowledge} ${found}`.trim());
  });
  return { ...server, agentCalls, composed, toolResults };
}

type Row = {
  assignment: { assignmentId: string; status: string; startedAt: string | null; deliverableUrl: string | null };
  job: { jobId: string; title: string; description: string; jobKind: string };
};
type Message = { body: string; origin: string; senderAgentId: string | null };

/** Agent Market: an assignment queue with start, submit, decline, a thread and delivered versions. */
export async function market(token: string, jobs: { id: string; title: string; description: string }[]) {
  const rows = new Map<string, Row>(jobs.map((j) => [j.id, {
    assignment: { assignmentId: j.id, status: 'in_progress', startedAt: null, deliverableUrl: null },
    job: { jobId: `job-${j.id}`, title: j.title, description: j.description, jobKind: 'standard' },
  }]));
  const versions = new Map<string, string[]>(jobs.map((j) => [j.id, []]));
  const threads = new Map<string, Message[]>(jobs.map((j) => [j.id, []])); // newest first, as the API returns
  const declined = new Map<string, { reason: string; detail: string }>();

  const server = await listen((method, url, body, auth) => {
    if (auth !== `Bearer ${token}`) return [401, { error: 'unauthorized' }];
    const path = url.split('?')[0]!;
    if (method === 'GET' && path === '/v1/agents/me/assignments')
      return [200, { assignments: [...rows.values()].filter((r) => r.assignment.status === 'in_progress') }];
    if (method === 'GET' && path === '/v1/jobs/board') return [200, { jobs: [] }];
    const [, , , rawId, ...rest] = path.split('/'); // /v1/assignments/{id}/{action...}
    const id = decodeURIComponent(rawId ?? '');
    const row = rows.get(id);
    if (!row) return [404, { error: 'not_found' }];
    const a = row.assignment;
    const route = `${method} ${rest.join('/')}`;
    if (route === 'GET messages') return [200, { messages: threads.get(id), total: threads.get(id)!.length, workerActivity: {} }];
    if (route === 'GET deliverable/versions') return [200, { versions: versions.get(id)!.map((_, i) => ({ version: i + 1, files: [], submittedAt: '' })) }];
    if (route === 'GET deliverable/raw') return [200, Buffer.from(versions.get(id)!.at(-1) ?? '')];
    if (route === 'POST start') return [200, { startedAt: (a.startedAt ??= new Date().toISOString()) }];
    if (route === 'POST submit') {
      versions.get(id)!.push(body.deliverableMarkdown);
      Object.assign(a, { status: 'submitted', deliverableUrl: `mock://${id}` });
      return [200, a];
    }
    if (route === 'POST decline') {
      declined.set(id, body);
      a.status = 'cancelled';
      return [200, a];
    }
    return [404, { error: 'not_found' }];
  });
  /** The customer sends the work back with feedback: the assignment is in progress again. */
  const requestChanges = (id: string, feedback: string) => {
    threads.get(id)!.unshift({ body: feedback, origin: 'direct', senderAgentId: null });
    rows.get(id)!.assignment.status = 'in_progress';
  };
  return { ...server, versions, declined, requestChanges };
}

/** Any web host: serves files by path, byte for byte. */
export async function host(files: Map<string, Buffer>) {
  return listen((_method, path) => {
    const body = files.get(path);
    return body ? [200, body] : [404, { error: 'not found' }];
  });
}
