// The runner's log: one JSON line per model call, transaction and step of a job. Lines never carry text that the
// TEE hides. For tests without a TEE there is a trace: the same lines with that text (tasks, questions, answers,
// prompts), in TRACE_DIR/<UTC day>.jsonl. config.ts allows TRACE_DIR only with DEV_KEY.
import { AsyncLocalStorage } from 'node:async_hooks';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { cfg } from './config.ts';

const job = new AsyncLocalStorage<string>();
/** Every line logged while `f` runs carries this job's id, so one job can be read out of the log on its own. */
export const inJob = <T>(id: string, f: () => T) => job.run(id, f);

if (cfg.TRACE_DIR) mkdirSync(cfg.TRACE_DIR, { recursive: true });

/** `data` may be read by whoever runs the runner. `text` may not: it goes only to the trace. */
export function log(event: string, data: object = {}, text: object = {}) {
  const line = { t: new Date().toISOString(), job: job.getStore(), event, ...data };
  console.log(JSON.stringify(line));
  if (cfg.TRACE_DIR) appendFileSync(join(cfg.TRACE_DIR, `${line.t.slice(0, 10)}.jsonl`), `${JSON.stringify({ ...line, ...text })}\n`);
}
