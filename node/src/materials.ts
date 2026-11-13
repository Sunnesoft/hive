// What a sponsor brings, as the runner sees it after opening the upload inside the TEE.
// A sponsor brings knowledge, not instructions: the agent's behaviour is our template (policies/agent.md),
// and these materials are reference data inside it. Only text is accepted, and nothing in it is ever run.
import { z } from 'zod';
import { allowedModels } from './config.ts';
import { TOPICS } from './rules.ts';
import { clean } from './safety.ts';
import { open } from './seal.ts';

const Text = (max: number) => z.string().max(max).transform(clean);

export const Materials = z.strictObject({
  name: Text(60).pipe(z.string().min(1)),
  model: z.string().refine((m) => allowedModels.includes(m), 'model not allowed'),
  // A second, cheaper model for the passes of a review: reading the materials with every part of the knowledge is
  // most of a review's input, and raising candidates asks less of a model than judging them. The checks, the
  // proofs and every answer stay with `model`.
  pass_model: z.string().refine((m) => allowedModels.includes(m), 'model not allowed').optional(),
  expertise: Text(2_000).pipe(z.string().min(1)), // who the expert is and what they know
  method: Text(8_000).default(''), // how they work: a checklist, an approach
  // 'review': given materials, the agent goes through them with every part of its knowledge and checks each finding
  // (review.ts); without materials, and for 'answer', it answers once from the knowledge closest to the question.
  work: z.enum(['answer', 'review']).default('answer'),
  // What a review spends is the expert's: every call is paid from its hold, and a reply is as long as what is left
  // there pays for. An expert that wants to spend less says so in its method ("only High and Medium") or here: how
  // many checks at most. Left out, every finding raised is checked while the money lasts.
  review: z.strictObject({ checks: z.number().int().min(1).optional() }).optional(),
  // Public, shown in the catalog so customers can choose; audited like the rest: the material must back them.
  examples: z.array(Text(200).pipe(z.string().min(1))).max(3).default([]), // questions it answers well
  topics: z.array(z.enum(TOPICS)).max(3).default([]), // where customers find it
  knowledge: z.array(z.strictObject({ name: Text(200), text: Text(10_000_000) })).max(1_000).default([]),
});
export type Materials = z.infer<typeof Materials>;

/** The sponsor's fault (deny the agent), as opposed to our trouble (try again later). */
export class Refused extends Error {}

export const MAX_BYTES = 10 * 1024 * 1024;

/** Opens a sponsor's sealed upload and checks its shape. */
export function unseal(sealed: Uint8Array, secret: Uint8Array, account: string): Materials {
  let json: unknown;
  try {
    json = JSON.parse(open(sealed, secret, account).toString('utf8'));
  } catch {
    throw new Refused('not sealed to this runner for this account, or not JSON');
  }
  const parsed = Materials.safeParse(json);
  if (!parsed.success) throw new Refused(z.prettifyError(parsed.error));
  return parsed.data;
}
