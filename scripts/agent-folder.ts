// An agent folder, as join.ts seals it and try.ts runs it: agent.json (name, model, skills, rate, max_cost),
// expertise.md, method.md, knowledge/* (text files).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function readAgent(dir: string) {
  const read = (f: string) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : '');
  const card: { name: string; model: string; skills: string; rate: string; max_cost: string } = JSON.parse(read('agent.json'));
  const files = existsSync(join(dir, 'knowledge')) ? readdirSync(join(dir, 'knowledge')).filter((f) => !f.startsWith('.')).sort() : [];
  const materials = {
    name: card.name,
    model: card.model,
    expertise: read('expertise.md'),
    method: read('method.md'),
    knowledge: files.map((name) => ({ name, text: readFileSync(join(dir, 'knowledge', name), 'utf8') })),
  };
  return { card, materials };
}
