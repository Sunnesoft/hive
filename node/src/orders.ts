// The contract's own door. A customer places an order on chain: USDC with the work in words. The swarm
// answers once; the contract pays the experts that delivered and sends the rest back to the customer.
// There are no reworks and no disputes here: the customer pays only for parts that passed their check,
// and gets everything back if the swarm declines. The answer is kept for its customer alone (server.ts).
import { createHash } from 'node:crypto';
import * as chain from './chain.ts';
import type { Door, Row } from './market.ts';
import * as store from './store.ts';

/** What the contract did with an order's money when the answer was delivered. */
export type Receipt = { charge: string; refund: string; fee: string; paid: [agent: string, amount: string][]; operator: string };
type Placed = { id: string; customer: string; amount: string; brief: string; placed: number };
export type Settled = Placed & { at: string } & ({ state: 'delivered'; answer: string; hash: string; receipt: Receipt | null } | { state: 'declined'; why: string });

const MAX_REASON = 200; // bytes, as the contract takes it
function short(text: string) {
  let s = text.slice(0, MAX_REASON);
  while (Buffer.byteLength(s) > MAX_REASON) s = s.slice(0, -1);
  return s;
}
const decimal = (units: string) => `${BigInt(units) / 1_000_000n}.${`${BigInt(units) % 1_000_000n}`.padStart(6, '0')}`;
const placed = (id: string, o: Omit<chain.Order, 'id'>): Placed => ({ id, customer: o.customer, amount: o.amount, brief: o.brief, placed: o.at });

function receiptOf(events: chain.Event[]): Receipt | null {
  const [d, r] = [events.find((e) => e.event === 'deliver')?.data, events.find((e) => e.event === 'revenue')?.data];
  return d && r ? { charge: d.charge, refund: d.refund, fee: r.fee, paid: r.paid, operator: r.operator } : null;
}

/** Open orders as round.ts serves any task: the brief is the description, the money is the order's amount. */
export const rows = (orders: chain.Order[]): Row[] =>
  orders.map((o) => ({
    assignment: { assignmentId: o.id, status: 'in_progress', escrowAmount: decimal(o.amount), startedAt: 'placed', submittedAt: null, deliverableUrl: null },
    job: { jobId: o.id, title: '', description: o.brief, jobKind: 'standard', attachments: [] },
  }));

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
    const hash = createHash('sha256').update(answer).digest('hex');
    const record = { ...placed(id, o), at: new Date().toISOString(), state: 'delivered' as const, answer, hash };
    await store.keepOrder<Settled>({ ...record, receipt: null }); // first, so a paid answer is never lost; shown only once the order is settled
    await store.keepOrder<Settled>({ ...record, receipt: receiptOf(await chain.deliver(id, hash)) });
  },
  async decline(id, _reason, detail) {
    const o = await chain.order(id);
    if (!o) return;
    await chain.refuse(id, short(detail));
    await store.keepOrder<Settled>({ ...placed(id, o), at: new Date().toISOString(), state: 'declined', why: detail });
  },
});

/** A customer's orders, newest first: open ones from the chain, settled ones from the store. */
export async function of(customer: string) {
  const open = (await chain.recentOrders()).filter((o) => o.customer === customer);
  const waiting = await Promise.all(open.map(async (o) => ({ ...placed(o.id, o), state: (await chain.job(o.id)) ? 'working' as const : 'waiting' as const })));
  const kept = await Promise.all((await store.ordersOf(customer)).map((id) => store.orderOf<Settled>(id)));
  const settled = kept.filter((r): r is Settled => !!r && !open.some((o) => o.id === r.id));
  return [...waiting, ...settled].sort((a, b) => b.placed - a.placed || b.id.localeCompare(a.id));
}
