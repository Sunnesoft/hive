// Agent Market is the customer side: escrow, delivery, disputes. The swarm is one agent there.
// Shapes follow market.near.ai/openapi.json; responses are parsed, never trusted blindly.
import { z } from 'zod';
import { cfg } from './config.ts';

async function request(path: string, body?: unknown) {
  const res = await fetch(`${cfg.MARKET_URL}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${cfg.MARKET_TOKEN}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`market ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res;
}
const api = async <T>(path: string, schema: z.ZodType<T>, body?: unknown) => schema.parse(await (await request(path, body)).json());

const Brief = z.object({ jobId: z.string(), title: z.string(), description: z.string(), jobKind: z.string() });
const Row = z.object({
  assignment: z.object({
    assignmentId: z.string(),
    status: z.string(), // in_progress | submitted | accepted | disputed | dispute_resolved | cancelled
    escrowAmount: z.string(), // what the customer paid, in USD
    startedAt: z.string().nullable(),
    submittedAt: z.string().nullable(), // set again after delivery: the customer asked for changes
    deliverableUrl: z.string().nullable(), // set once anything was delivered
  }),
  job: Brief,
});
const BoardJob = Brief.extend({ budgetToken: z.string(), budgetAmount: z.string().nullish() });
const Message = z.object({ body: z.string(), origin: z.string(), senderAgentId: z.string().nullable(), createdAt: z.string() });
export type Row = z.infer<typeof Row>;
export type BoardJob = z.infer<typeof BoardJob>;

const at = (id: string) => `/v1/assignments/${encodeURIComponent(id)}`;

/** The actionable queue: `in_progress` assignments with their job brief. */
export const assignments = () => api('/v1/agents/me/assignments', z.object({ assignments: z.array(Row) })).then((r) => r.assignments);
export const board = () => api('/v1/jobs/board?kind=standard&sort=recent', z.object({ jobs: z.array(BoardJob) })).then((r) => r.jobs);

/** What the customer wrote on the thread, oldest first: clarifications and requests for changes. */
export const thread = (id: string) =>
  api(`${at(id)}/messages?limit=100`, z.object({ messages: z.array(Message) })).then((r) =>
    r.messages.filter((m) => m.senderAgentId === null && m.origin !== 'platform').reverse());
/** Versions delivered so far, oldest first. */
export const versions = (id: string) =>
  api(`${at(id)}/deliverable/versions`, z.object({ versions: z.array(z.object({ submittedAt: z.string() })) })).then((r) => r.versions);
/** The latest delivered Markdown. */
export const delivered = async (id: string) => (await request(`${at(id)}/deliverable/raw`)).text();

export const bid = (jobId: string, amount: string, proposal: string) =>
  api(`/v1/jobs/${encodeURIComponent(jobId)}/bids`, z.unknown(), { amount, proposal });
/** After start the customer can no longer cancel for free; before it, they can. */
export const start = (id: string) => api(`${at(id)}/start`, z.unknown(), {});
/** Idempotent: the same Markdown again is a no-op, so retries are safe. */
export const submit = (id: string, deliverableMarkdown: string) => api(`${at(id)}/submit`, z.unknown(), { deliverableMarkdown });
/** Hands the assignment back; the customer is refunded in full. */
export const decline = (id: string, reason: 'rejected' | 'failed', detail: string) =>
  api(`${at(id)}/decline`, z.unknown(), { reason, detail: detail.slice(0, 500) });
