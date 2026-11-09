// The fixture is a real dstack GetQuote response from github.com/Dstack-TEE/dstack (verifier/fixtures,
// Apache-2.0). The quote is parsed offline; checking Intel's signature needs the network (scripts/verify.ts).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Quote } from '@phala/dcap-qvl';
import { digestMatches, inspect, replayRtmr3, reportDataOf, type Event } from '../src/attest.ts';

const fixture = JSON.parse(readFileSync(new URL('fixtures/dstack-getquote.json', import.meta.url), 'utf8'));
const td = Quote.parse(Buffer.from(fixture.quote, 'hex')).report.asTd10()!;
const events: Event[] = JSON.parse(fixture.event_log);

test('a real event log replays to the quote RTMR3, and every runtime event matches its digest', () => {
  assert.equal(replayRtmr3(events), Buffer.from(td.rtMr3).toString('hex'));
  assert.ok(events.filter((e) => e.imr === 3).every(digestMatches));
});

test('a changed event payload is caught', () => {
  const forged = events.map((e) => (e.event === 'compose-hash' ? { ...e, event_payload: 'ff'.repeat(32) } : e));
  assert.equal(forged.filter((e) => e.imr === 3).every(digestMatches), false);
});

test('report_data must carry both keys', () => {
  const a = { publicKey: 'ed25519:x', sealKey: 'ab'.repeat(32), quote: '', event_log: fixture.event_log, policies: '' };
  const ours = { reportData: Buffer.from(reportDataOf(a.publicKey, a.sealKey), 'hex'), rtMr3: td.rtMr3 };
  const { checks, composeHash } = inspect(a, ours);
  assert.deepEqual(checks.map((c) => c.ok), [true, true, true]);
  assert.match(composeHash!, /^[0-9a-f]{64}$/);
  assert.equal(inspect({ ...a, sealKey: 'cd'.repeat(32) }, ours).checks[0]!.ok, false); // a swapped seal key
});
