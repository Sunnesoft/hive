// What anyone checks before trusting the runner: the quote is genuine Intel TDX (scripts/verify.ts asks
// Intel's collateral), it vouches for this signing key and seal key, and the event log, which names the
// app and its compose, replays to the quote's RTMR3. Pure functions, no I/O.
import { createHash } from 'node:crypto';

/** What the runner publishes at GET /attestation (and logs as `attest`). */
export type Attestation = { publicKey: string; sealKey: string; quote: string; event_log: string; policies: string };
export type Event = { imr: number; digest: string; event: string; event_payload: string };
export type Check = { what: string; ok: boolean; detail?: string };

const RUNTIME_EVENT = 0x08000001; // dstack's runtime event type
const sha384 = (b: Uint8Array) => createHash('sha384').update(b).digest('hex');
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

/** report_data the runner asks for: sha256(signing public key) | seal public key. */
export const reportDataOf = (publicKey: string, sealKey: string) =>
  createHash('sha256').update(publicKey).digest('hex') + sealKey;

/** The digests a dstack runtime event's name and payload give: v1 binary, v2 canonical JSON. */
const digestsOf = (e: Event) => {
  const type = Buffer.alloc(4);
  type.writeUInt32LE(RUNTIME_EVENT);
  return [
    sha384(Buffer.concat([type, Buffer.from(`:${e.event}:`), Buffer.from(e.event_payload, 'hex')])),
    sha384(Buffer.from(JSON.stringify({ name: e.event, payload: e.event_payload, type: RUNTIME_EVENT }))),
  ];
};

/** Does a dstack runtime event's digest commit to its name and payload? A log that leaves the digest out (dstack
 *  0.5.12 does) is checked by the replay alone: the digest is computed from what the event says. */
export const digestMatches = (e: Event) => !e.digest || digestsOf(e).includes(e.digest);

/** The digest an event extends RTMR3 with: the one it carries, or, where it carries none, the one its name and
 *  payload give. A computed digest is the stricter check: nothing in the log is taken on trust. */
const digestOf = (e: Event) => e.digest || digestsOf(e)[0]!;

/** RTMR3 replayed from the event log: each runtime event extends it with its digest. */
export const replayRtmr3 = (events: Event[]) =>
  events.filter((e) => e.imr === 3).reduce((mr, e) => sha384(Buffer.from(mr + digestOf(e), 'hex')), '00'.repeat(48));

/** Everything that can be checked offline against the TD report of an already verified quote. */
export function inspect(a: Attestation, report: { reportData: Uint8Array; rtMr3: Uint8Array }) {
  const events: Event[] = JSON.parse(a.event_log).filter((e: Event) => e.imr === 3);
  const payload = (name: string) => events.find((e) => e.event === name)?.event_payload;
  const checks: Check[] = [
    { what: 'report_data commits to the signing key and the seal key', ok: hex(report.reportData) === reportDataOf(a.publicKey, a.sealKey) },
    { what: 'the event log replays to the quote\'s RTMR3', ok: replayRtmr3(events) === hex(report.rtMr3) },
    { what: 'every runtime event matches its digest', ok: events.every(digestMatches) },
  ];
  return { checks, appId: payload('app-id'), composeHash: payload('compose-hash') };
}
