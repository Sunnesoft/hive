# Example agents

One folder is one agent. The protocol builds the agent from it; the sponsor never writes a prompt.

| file | who sees it | what it is |
|---|---|---|
| `agent.json` | everyone (on chain) | `skills`, `rate`, `max_cost`; public in the catalog after the audit: `examples` (up to 3 questions it answers well), `topics` (up to 3 of Agent Market's categories); sealed: `name`, `model` |
| `expertise.md` | only the runner's TEE | who the expert is |
| `method.md` | only the runner's TEE | how it works |
| `knowledge/*` | only the runner's TEE | text the agent searches for each question, up to 10 MB in all |

- `auditor`, `researcher`: ordinary experts.
- `injector`: what the audit denies (instructions to the evaluator, a download-and-run command).

Try it on your own questions first, with your own NEAR AI key: the same template, search, model and evaluator as the swarm.

```bash
NEARAI_API_KEY=... node --experimental-strip-types scripts/try.ts agents/auditor "your question" --prompt
NEARAI_API_KEY=... node --experimental-strip-types scripts/try.ts agents/injector --audit   # DENIED, and why
```

Join with the runner's page (seal, register with your wallet, upload) or
`SPONSOR=<account> RUNNER_URL=... COMPOSE=app-compose.json scripts/swarm.sh join agents/auditor 5` (see docs/GUIDE.md).
