// Agent Market is the customer side: escrow, delivery, disputes. The swarm is one agent there.
// Shapes follow market.near.ai/openapi.json; responses are parsed, never trusted blindly.
import { z } from 'zod';
import { cfg } from './config.ts';
import { MARKET_FEE_BPS, usdc } from './rules.ts';

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

const Attachment = z.object({ filename: z.string(), contentType: z.string(), byteSize: z.number(), downloadUrl: z.string() });
const Brief = z.object({ jobId: z.string(), title: z.string(), description: z.string(), jobKind: z.string(), attachments: z.array(Attachment).default([]) });
export type Attachment = z.infer<typeof Attachment>;
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
export type Message = z.infer<typeof Message>;

const at = (id: string) => `/v1/assignments/${encodeURIComponent(id)}`;

/** The actionable queue: `in_progress` assignments with their job brief. */
export const assignments = () => api('/v1/agents/me/assignments', z.object({ assignments: z.array(Row) })).then((r) => r.assignments);
export const board = () => api('/v1/jobs/board?kind=standard&sort=recent', z.object({ jobs: z.array(BoardJob) })).then((r) => r.jobs);

/** What people wrote on the thread, oldest first: the customer's clarifications and requests for changes, and
 *  the marketplace's own notes (`origin: platform`), such as a dispute ruled `redo`. Our own messages are left out. */
export const thread = (id: string) =>
  api(`${at(id)}/messages?limit=100`, z.object({ messages: z.array(Message) })).then((r) => r.messages.filter((m) => m.senderAgentId === null).reverse());
/** Versions delivered so far, oldest first. */
export const versions = (id: string) =>
  api(`${at(id)}/deliverable/versions`, z.object({ versions: z.array(z.object({ submittedAt: z.string() })) })).then((r) => r.versions);
/** The latest delivered Markdown. */
export const delivered = async (id: string) => (await request(`${at(id)}/deliverable/raw`)).text();
/** A file the customer attached, as text: only text files, at most 2 MB. Fetched with our token, as the market asks. */
/** A customer's attached file as bytes; web.textOf turns it into text (PDF, Markdown, CSV, JSON, code, plain text). */
export async function attachment(a: Attachment) {
  if (a.byteSize > 5_000_000) throw new Error('it is over 5 MB');
  const path = a.downloadUrl.startsWith('http') ? new URL(a.downloadUrl).pathname : a.downloadUrl; // only ever from the market
  return new Uint8Array(await (await request(path)).arrayBuffer());
}

export const bid = (jobId: string, amount: string, proposal: string) =>
  api(`/v1/jobs/${encodeURIComponent(jobId)}/bids`, z.unknown(), { amount, proposal });
/** After start the customer can no longer cancel for free; before it, they can. */
export const start = (id: string) => api(`${at(id)}/start`, z.unknown(), {});
/** Idempotent: the same Markdown again is a no-op, so retries are safe. */
export const submit = (id: string, deliverableMarkdown: string) => api(`${at(id)}/submit`, z.unknown(), { deliverableMarkdown });
/** Hands the assignment back; the customer is refunded in full. */
export const decline = (id: string, reason: 'rejected' | 'failed', detail: string) =>
  api(`${at(id)}/decline`, z.unknown(), { reason, detail: detail.slice(0, 500) });

/** A door is where customers' work comes in and answers go out: Agent Market here, orders placed in the
 *  contract in orders.ts. round.ts serves both the same way. */
export type Door = {
  key: (id: string, round: number) => string; // the job's id on chain
  fee: bigint; // what the door keeps of the price, in basis points
  overhead: bigint; // the protocol's own cost: per task, and per agent that works
  perAgent: bigint;
  thread: (id: string) => Promise<Message[]>;
  versions: (id: string) => Promise<{ submittedAt: string }[]>;
  delivered: (id: string) => Promise<string>;
  attachment: (a: Attachment) => Promise<Uint8Array>;
  start: (id: string) => Promise<unknown>;
  submit: (id: string, markdown: string) => Promise<unknown>;
  decline: (id: string, reason: 'rejected' | 'failed', detail: string) => Promise<unknown>;
};
export const door: Door = {
  key: (id, round) => `${id}#${round}`, // every rework is its own job
  fee: MARKET_FEE_BPS, overhead: usdc(cfg.OVERHEAD_USD), perAgent: usdc(cfg.OVERHEAD_PER_AGENT_USD),
  thread, versions, delivered, attachment, start, submit, decline,
};
