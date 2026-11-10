// Runs in its own thread (see web.ts): untrusted HTML in, at most 20,000 characters of text out.
import { parentPort, workerData } from 'node:worker_threads';
import { convert } from 'html-to-text';

parentPort!.postMessage(convert(String(workerData), { wordwrap: false }).slice(0, 20_000));
