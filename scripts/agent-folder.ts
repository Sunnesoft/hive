// An agent folder, as join.ts seals it and try.ts runs it: agent.json (name, model, skills, rate, max_cost, the
// public profile: examples, up to 3 questions it answers well, and topics, up to 3 of Agent Market's categories;
// "work": "review" for an expert that goes through a customer's files with all of its knowledge, and with it
// "pass_model", a cheaper model for the passes of that review, and "review": {"checks"}, how many checks it pays
// for at most),
// expertise.md, method.md, knowledge/* (text files).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function readAgent(dir: string) {
  const read = (f: string) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : '');
  const card: { name: string; model: string; skills: string; rate: string; max_cost: string; examples?: string[]; topics?: string[]; work?: 'answer' | 'review'; pass_model?: string; review?: { checks?: number } } = JSON.parse(read('agent.json'));
  const files = existsSync(join(dir, 'knowledge')) ? readdirSync(join(dir, 'knowledge')).filter((f) => !f.startsWith('.')).sort() : [];
  const materials = {
    name: card.name,
    model: card.model,
    ...(card.pass_model ? { pass_model: card.pass_model } : {}), // a cheaper model for the passes of a review
    expertise: read('expertise.md'),
    method: read('method.md'),
    work: card.work ?? 'answer',
    ...(card.review ? { review: card.review } : {}), // how deep a review goes, if the expert says
    examples: card.examples ?? [],
    topics: card.topics ?? [],
    knowledge: files.map((name) => ({ name, text: readFileSync(join(dir, 'knowledge', name), 'utf8') })),
  };
  return { card, materials };
}
