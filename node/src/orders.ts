// The contract's own door. A customer places an order on chain: USDC with the hash of the work's description.
// The description itself comes to the runner (POST /brief) and is used only if it hashes to what the order
// names: the contract never holds the text, and nobody but the customer and the runner has to see it.
// The swarm answers once; the contract pays the experts that delivered and sends the rest back to the customer.
// There are no reworks and no disputes here: the customer pays only for parts that passed their check, and
// gets everything back if the swarm declines. The answer is kept for its customer alone (server.ts).
import { createHash } from 'node:crypto';
import * as chain from './chain.ts';
import type { Door, Row } from './market.ts';
import * as store from './store.ts';

export const MAX_BRIEF = 10_000; // characters of an order's description
const SALT = /^[0-9a-f]{32}$/;

/** What the contract did with an order's money when the answer was delivered. */
export type Receipt = { charge: string; refund: string; fee: string; paid: [agent: string, amount: string][]; operator: string };
type Placed = { id: string; customer: string; amount: string; hash: string; brief: string | null; placed: number };
export type Settled = Placed & { at: string } & ({ state: 'delivered'; answer: string; answerHash: string; receipt: Receipt | null } | { state: 'declined'; why: string });
type Brief = { salt: string; brief: string; at: string };

/** What an order's hash commits to: a random salt, so a short task cannot be guessed from its hash, then the text. */
export const briefHash = (salt: string, brief: string) => createHash('sha256').update(`${salt}\n${brief}`).digest('hex');

/** Takes a description ahead of its order and says which hash names it, or null if it is not one we take. */
export async function keepBrief(salt: unknown, brief: unknown) {
  if (typeof salt !== 'string' || typeof brief !== 'string' || !SALT.test(salt) || !brief.trim() || brief.length > MAX_BRIEF) return null;
  const hash = briefHash(salt, brief);
  await store.keepBrief(hash, { salt, brief, at: new Date().toISOString() } satisfies Brief);
  return hash;
}
const briefOf = (hash: string) => store.briefOf<Brief>(hash).then((b) => (b && briefHash(b.salt, b.brief) === hash ? b.brief : null));

const MAX_REASON = 200; // bytes, as the contract takes it
function short(text: string) {
  let s = text.slice(0, MAX_REASON);
  while (Buffer.byteLength(s) > MAX_REASON) s = s.slice(0, -1);
  return s;
}
const decimal = (units: string) => `${BigInt(units) / 1_000_000n}.${`${BigInt(units) % 1_000_000n}`.padStart(6, '0')}`;
const placed = async (id: string, o: Omit<chain.Order, 'id'>): Promise<Placed> =>
  ({ id, customer: o.customer, amount: o.amount, hash: o.hash, brief: await briefOf(o.hash), placed: o.at });

function receiptOf(events: chain.Event[]): Receipt | null {
  const [d, r] = [events.find((e) => e.event === 'deliver')?.data, events.find((e) => e.event === 'revenue')?.data];
  return d && r ? { charge: d.charge, refund: d.refund, fee: r.fee, paid: r.paid, operator: r.operator } : null;
}

/** Open orders whose description has reached us, as round.ts serves any task: the brief is the description, the
 *  money is the order's amount. An order without its text waits; after run_secs anyone sends it back. */
export async function rows(orders: chain.Order[]): Promise<Row[]> {
  const briefs = await Promise.all(orders.map((o) => briefOf(o.hash)));
  return orders.flatMap((o, i) => (briefs[i] === null ? [] : [{
    assignment: { assignmentId: o.id, status: 'in_progress', escrowAmount: decimal(o.amount), startedAt: 'placed', submittedAt: null, deliverableUrl: null },
    job: { jobId: o.id, title: '', description: briefs[i]!, jobKind: 'standard', attachments: [] },
  }]));
}

/** Every step is safe to repeat: an order that is no longer open was settled already. */
export const door = (c: chain.Config): Door => ({
  key: (id) => id, // the job of an order has the order's id: one round, no reworks
  fee: 0n, overhead: BigInt(c.overhead), perAgent: BigInt(c.overhead_per_agent),
  thread: async () => [],
  versions: async () => [],
  delivered: async () => '',
  start: async () => {},
  attachment: async () => { throw new Error('an order carries no files: put links in the brief'); },
  async submit(id, answer) {
    const o = await chain.order(id);
    if (!o) return;
    const answerHash = createHash('sha256').update(answer).digest('hex');
    const record = { ...(await placed(id, o)), at: new Date().toISOString(), state: 'delivered' as const, answer, answerHash };
    await store.keepOrder<Settled>({ ...record, receipt: null }); // first, so a paid answer is never lost; shown only once the order is settled
    await store.keepOrder<Settled>({ ...record, receipt: receiptOf(await chain.deliver(id, answerHash)) });
    await store.dropBrief(o.hash); // the text now lives in the order's record
  },
  async decline(id, _reason, detail) {
    const o = await chain.order(id);
    if (!o) return;
    const record = await placed(id, o);
    await chain.refuse(id, short(detail));
    await store.keepOrder<Settled>({ ...record, at: new Date().toISOString(), state: 'declined', why: detail });
    await store.dropBrief(o.hash);
  },
});

/** A customer's orders, newest first: open ones from the chain, settled ones from the store. */
export async function of(customer: string) {
  const open = (await chain.recentOrders()).filter((o) => o.customer === customer);
  const waiting = await Promise.all(open.map(async (o) => {
    const p = await placed(o.id, o);
    return { ...p, state: p.brief === null ? 'no_brief' as const : (await chain.job(o.id)) ? 'working' as const : 'waiting' as const };
  }));
  const kept = await Promise.all((await store.ordersOf(customer)).map((id) => store.orderOf<Settled>(id)));
  const settled = kept.filter((r): r is Settled => !!r && !open.some((o) => o.id === r.id));
  return [...waiting, ...settled].sort((a, b) => b.placed - a.placed || b.id.localeCompare(a.id));
}

let swept = 0;
/** Now and then forgets descriptions that came two hours ago and whose order never did. */
export function sweep(open: chain.Order[]) {
  if (Date.now() - swept < 600_000) return;
  swept = Date.now();
  void store.sweepBriefs(new Set(open.map((o) => o.hash)), 2 * 3_600_000).catch(() => {});
}
