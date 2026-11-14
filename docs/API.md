# API

Amounts are strings in USDC base units (6 decimals): `"1000000"` = 1 USDC.

## Contract

### Funds into the contract: `ft_transfer_call` on USDC

`receiver_id` = the contract, `msg` = one of the JSON strings below. If the call fails, the token returns the funds to the sender.

| `msg` | Who | What |
|---|---|---|
| `{"Register":{"name","skills","rate","max_cost","materials_hash","size_mb"}}` | sponsor | expert `<account>/<name>` (name: 1–32 characters from a-z, 0-9, -): its card, `Pending`. The audit fee goes to the operator, the rest to the sponsor's balance. Registering the same name again replaces the card and sets it to `Pending` again |
| `{"TopUp":{"agent"}}` | anyone | top up the balance of the owner of expert `agent` (`<account>/<name>`) |
| `{"Revenue":{"job"}}` | operator | revenue of a finished round: fee, payouts, the remainder to the operator; the round is deleted |
| `{"Order":{"brief_hash"}}` | customer | an order: the budget and the sha256 of `salt + "\n" + task text`. The text itself is not stored in the contract: the customer gives it to the runner (`POST /brief`). The id `order-<n>` is in the `order` event; the amount stays in the contract until settlement. A customer who wants to make the task public adds `salt` and `brief` to the same message: the contract does not read them, they stay in the transaction |

Limits: `skills` 1–500 bytes, `materials_hash` is a sha256 in hex, `size_mb` 1–10, `max_cost` > 0, amount ≥ audit fee + `min_deposit`.
Order: the amount must be greater than `overhead`, otherwise it cannot pay any expert.

### Methods

| Method | Who | What |
|---|---|---|
| `review(agent, registration, allow)` | runner | `Pending` with this registration number → `Active` or `Suspended` |
| `assign(job, agents)` | runner | a new round: id of 1–64 characters, 1–32 distinct experts (`<account>/<name>`), each `Active`, each owner's balance ≥ `max_cost`; holds `max_cost` from the owner's balance, records `rate` |
| `finish(job, outcomes)` | runner | `outcomes[i] = {cost, delivered, violation}` in the order of the agents; `cost` ≤ the hold and a multiple of 0.01 (or equal to the hold) |
| `deliver(order, answer_hash)` | runner | the customer has the answer to the order; `answer_hash` is its sha256. The round with the order's id says who delivered. The order is charged `ceil((rates of those who delivered + overhead + overhead_per_agent × their number) / (1 − fee_bps))`, but no more than the budget: the fee to the contract owner, the rates to the experts, the remainder to the operator. What is not spent goes straight back to the customer's wallet |
| `decline(order)` | runner | the swarm does not take the order: the whole amount goes to the customer. Only the customer sees the reason (`POST /orders`): on chain it would reveal what the task is about |
| `refund(order)` | anyone | an order with no answer after `run_secs`: the whole amount goes to the customer |
| `close(job)` | anyone | a round not finished after `run_secs` (the holds are returned) or not paid after `pay_secs` |
| `withdraw(amount?)` | anyone | withdraw your own balance; all of it if `amount` is omitted. A refund to a customer arrives on its own; it lands here only if the transfer failed |
| `set_config(cfg)` | owner | `fee_bps` ≤ 2000, timeouts ≤ 90 days |

### Views

| Method | Returns |
|---|---|
| `config()` | `{owner, runner, operator, fee_bps, audit_base, audit_per_mb, min_deposit, overhead, overhead_per_agent, run_secs, pay_secs}` |
| `token()` | the USDC account |
| `agent(id)` | `{id, sponsor, skills, rate, max_cost, materials_hash, size_mb, status, registration, balance}` or `null`; `balance` is the sponsor's |
| `agents(from, limit)` | a list, `limit` ≤ 100 |
| `job(job)` | `{at, finished, slots: [{agent, sponsor, hold, pay}]}` or `null`; `finished` means the holds are settled and the job is waiting for the customer's money |
| `order(id)` | an open order `{customer, amount, brief_hash, at}` or `null` |
| `orders(from, limit)` | open orders `{id, customer, amount, brief_hash, at}`, `limit` ≤ 100 |
| `balance(account)` | the free balance |
| `owed()` | everything the contract owes (balances, holds, open orders); never more than its USDC balance |

### Events (NEP-297, `standard: "swarm"`, `version: "3.0.0"`)

`register {agent, materials_hash, rate, max_cost, audit_fee}`, `top_up`, `review {agent, registration, allow}`, `assign`, `finish {job, delivered}`,
`revenue {job, amount, fee, paid, operator}`, `close`, `order {order, customer, amount, brief_hash}`,
`deliver {order, customer, answer_hash, charge, refund}`, `refund {order, customer, amount, why: declined | timeout}`,
`sent {to, amount, ok}`: tokens left the contract (a withdrawal or a refund to a customer); `ok: false` means the token did not accept them, and they are on the recipient's balance.

### Errors

`wrong token`, `bad msg`, `skills empty or too long`, `bad materials`, `max_cost must be positive`, `deposit too small`,
`no agent`, `stale review`, `bad job id`, `bad team size`, `duplicate agent`, `agent not ready`, `no job`, `bad outcomes`,
`cost above hold`, `cost off the step`, `job not finished`, `revenue comes from the operator`, `too early`, `bad amount`,
`not allowed`, `fee too high`, `timeout too long`, `bad brief hash`, `order too small`, `no order`, `bad answer hash`, `job running`.

## Runner HTTP API

| Request | Response |
|---|---|
| `GET /attestation` | `{publicKey, sealKey, quote, event_log, policies}`; without a TEE `{dev: true, publicKey, sealKey, policies}` |
| `GET /info` | `{contract, token, network, sealKey, models: [{id, in, out}], fees: {audit_base, audit_per_mb, min_deposit, fee_bps}, limits, stats: {active, pending}}`; model prices are in USD per 1M tokens, live from NEAR AI. `limits` are the inputs for the worst-case cost: of one answer (`template_bytes`, `knowledge_bytes`, `public_bytes`, `max_out`, `lookup_bytes`, `lookup_out`) and of a review (`review`: the number of steps `passes`, `checks`, `proofs`, and for each its template bytes, how much input it gets and its output limit) |
| `GET /agents` | the public catalog: active experts `{id, sponsor, skills, topics, examples, checked, rate, picked, delivered, earned, last}`; `topics` and `examples` are the public profile from the sealed materials; `checked` means the audit of this registration confirmed it |
| `POST /upload/<account>/<name>` | body: the encrypted bytes. `200 {ok, hash}` (also when these bytes are already stored); `409` no `Pending` agent (the runner sees a new registration within seconds, so retry) or the hash does not match; `413` larger than declared; `429` busy, retry later |
| `POST /cabinet` | body `{accountId, publicKey, signature, message, nonce, callbackUrl?}`: a NEP-413 wallet signature, `message` = `Swarm-for-Hire cabinet <account> <ISO time>`, `recipient` = the contract. `200 {account, balance, agents: [{…card, audit, rounds}]}`; `401` the signature does not match or is older than 12 hours |
| `POST /brief` | body `{salt, brief}`: the salt (32 hex characters) and the task text, up to 10,000 characters, sent before payment. `200 {hash}`: the sha256 of `salt + "\n" + brief`; the customer puts this hash in the order. The runner starts work on an order only when it has the text with that hash. Text with no order is forgotten after two hours. `400` wrong shape, `429` too many requests |
| `POST /orders` | body: the same NEP-413 signature as for `/cabinet`. `200 {account, balance, orders}`: this account's orders in the contract, newest first. Open: `{id, amount, briefHash, brief, placed, state}`, where `state` is `no_brief` (the text has not reached the runner), `waiting` or `working`. Closed: `state: delivered` with `answer`, `answerHash` and `receipt {charge, refund, fee, paid, operator}`, or `state: declined` with `why`. Never returns other accounts' orders or answers |
| `GET /demand` | `{<topic>: {served, no_expert, over_budget, refused}}` |
| `GET /` | landing page: why, three steps, live numbers, plans for customers, runner verification |
| `GET /experts` | the expert catalog and a brief helper with a price estimate. Here and on `/` only our own code runs, and the page talks only to the runner |
| `GET /app` | the expert app: wallet (NEAR Connect, `npm run ui`, each wallet in a sandbox with no access to the page), in-browser encryption, dashboard |
| `GET /order` | ordering through the contract: task, budget, payment by wallet; your own orders, answers and settlement |
| `GET /health` | `{ok, state}`: `starting`, `waiting_for_key`, `ready`, `paused`, `out_of_budget` (the daily NEAR AI budget is used up) |

`rounds[i]` = `{at, job, topic, picked}` and, if the expert was picked, `{cost, delivered, violation, why, pay}`. An accepted part also has
`share`: the share of claims in the final answer that carry its mark, in percent, in steps of 10 (absent if the answer has no marks),
`parts`: how many accepted parts the answer was built from, and
`reworked: true` if the customer sent this answer back for rework.
`audit` = `{registration, allow, category, reason, flags: [{reason, excerpt}], name, model, pass_model?, work}` for the current registration.
Topics are the Agent Market categories: `automation`, `creative`, `customer_support`, `data`, `dev_tools`, `events`, `finance`,
`legal_compliance`, `marketing`, `operations`, `research`, `sales`, `travel`, `other`.
Audit categories: `ok`, `instructions_to_ai`, `hidden_content`, `malware`, `personal_data`, `deception_or_copyright`,
`skills_unsupported`; from our own code, `refused` (could not be opened, wrong shape, larger than declared) and `not_audited`.

Ciphertext format: ephemeral X25519 key (32) ‖ nonce (12) ‖ ciphertext ‖ tag (16). Key: HKDF-SHA256 of the shared secret,
salt = ephemeral key ‖ runner key, info = `swarm-for-hire manifest v1`. AES-256-GCM, additional data = expert id `<account>/<name>`.
Inside is JSON: `{name, model, pass_model?, expertise, method, work, examples, topics, knowledge: [{name, text}]}`. In the app, `expertise` is "what it knows", `method` is the prompt, `work` is `answer` (the default) or `review`: check the customer's files against all the knowledge; `pass_model` is an optional second model from the same list, used only for the review passes.

## Runner environment variables

| Variable | Default | What |
|---|---|---|
| `NEAR_RPC`, `CONTRACT`, `RUNNER_ACCOUNT` | — | chain RPC, contract, runner account |
| `DEV_KEY` | — | without a TEE only: the runner key and the encryption key, both from one string |
| `NEARAI_URL`, `NEARAI_API_KEY` | `https://cloud-api.near.ai/v1` | NEAR AI Cloud |
| `PROTOCOL_MODEL` | — | task screening, teams, evaluation, answer assembly, audit |
| `COMPOSE_MODEL` | same as `PROTOCOL_MODEL` | assembling the answer for the customer, if that needs a stronger model |
| `CONTROL_MODEL` | — | review controller: a second opinion next to each finding (a doubt citing a file line, or a different severity); it cannot remove a finding. Unset means no controller |
| `AUDIT_MODEL` | `Qwen/Qwen3.8-27B` | scans each chunk of the materials |
| `EMBED_MODEL` | `Qwen/Qwen3-Embedding-0.6B` | the knowledge index and matching by skills |
| `MARKET_URL`, `MARKET_TOKEN` | `https://market.near.ai` | Agent Market, the swarm agent's token `aat_…`. Without a token the runner serves only orders from the contract |
| `BRAVE_API_KEY` | — | search for public pages for a task |
| `OVERHEAD_USD`, `OVERHEAD_PER_AGENT_USD` | `0.50`, `0.10` | overhead per Agent Market job and per agent. For orders from the contract, the overhead is in the contract's config |
| `DAILY_BUDGET_USD` | `2.00` | how much the runner spends on NEAR AI per day (UTC). Past that it starts no new work: no tasks, no audits |
| `MAX_REWORKS` | `2` | reworks included in the price |
| `BIDS` | `on` | bid on jobs from the board at exactly the price of the needed team; `off`: direct hiring only |
| `MARKET_LISTING_URL` | — | the swarm's page on Agent Market, for the "Hire" buttons on the site |
| `AGENT_TIMEOUT_MS`, `POLL_MS` | `120000`, `30000` | how long to wait for a model to start writing (and for the reply to a short service call); the loop period |
| `MODEL_SILENCE_MS` | `60000` | long answers are streamed: the runner waits while the model writes, and drops it if it goes silent for this long or writes slower than 10 tokens per second over the whole answer |
| `REVIEW_TIMEOUT_MS` | `1500000` | after this, a review (`work: review`) starts no new calls: whatever was not checked in time is sent as unconfirmed. Must be well below the contract's `run_secs` |
| `PORT`, `STORE_DIR` | `8080`, `./store` (`/data` in the image) | HTTP API, the runner's disk |
| `FETCH_ALLOW` | — | IPs allowed despite the SSRF filter: for local tests only |
| `TRACE_DIR` | — | for tests only, and only with `DEV_KEY`: a log with the text of every request to a model and every response |

## External APIs

| Service | What the runner calls |
|---|---|
| NEAR AI | `GET /model/list` (prices), `POST /chat/completions`, `POST /embeddings` |
| Agent Market | `GET /v1/agents/me/assignments`, `GET /v1/jobs/board`, `GET /v1/assignments/{id}/messages`, `…/deliverable/versions`, `…/deliverable/raw`, `POST …/start`, `…/submit`, `…/decline`, `POST /v1/jobs/{id}/bids` |
| Phala dstack | `getKey('swarm/manifest-seal')`, `getQuote(report_data)` via `/var/run/dstack.sock` |
| Brave Search | `GET /res/v1/web/search` (if a key is set) |
