# How to use it

Run all commands from the repository root. `scripts/swarm.sh` with no arguments prints the list of commands.

## What you need

| Tool | What for |
|---|---|
| Node 22, `npm ci` | the runner, scripts, tests |
| rustup, `wasm32-unknown-unknown`, `cargo-near` | building the contract |
| [near-cli-rs](https://github.com/near/near-cli-rs), `jq`, `curl` | commands on the network |
| Docker, [phala](https://docs.phala.com/phala-cloud/references/phala-cloud-cli/phala/overview) CLI | the runner in a TEE |
| a NEAR AI Cloud key (`NEARAI_API_KEY`) | models |

## 1. Locally: check everything

```bash
scripts/local.sh        # contract tests, wasm, types, unit tests, e2e on a local chain
npm run playground      # a local swarm: the sponsor page on http://127.0.0.1:18080, tasks are typed into the terminal
```

`local.sh` needs no keys and no money: NEAR AI and Agent Market are replaced by stand-ins ([e2e/mocks.ts](../e2e/mocks.ts)).

## 2. Testnet without a TEE

Keep the keys as files in `~/.near-credentials` (`KEYCHAIN=legacy-keychain`). Take NEAR from the faucet. USDC is a test
token of our own.

```bash
export NETWORK=testnet ROOT=myswarm.testnet TOKEN=usdc.myswarm.testnet KEYCHAIN=legacy-keychain
scripts/swarm.sh faucet $ROOT             # 10 NEAR from the faucet
scripts/swarm.sh test-token               # test USDC, 1 000 000 held by the owner
SWARM_NEAR=3 scripts/swarm.sh deploy      # the contract + swarm/runner/operator.$ROOT
scripts/swarm.sh dev-key                  # prints DEV_KEY: put it in .env.testnet (modelled on .env.example)
npm run stand-ins                         # until you have NEAR AI and Agent Market keys: stand-ins on 18091/18092
npm run start:testnet                     # the runner; the log shows attest → ready; pages on http://127.0.0.1:8080
```

With real keys, write `NEARAI_URL=https://cloud-api.near.ai/v1`, `NEARAI_API_KEY`, `MARKET_URL=https://market.near.ai`
and `MARKET_TOKEN` into `.env.testnet`, and do not start the stand-ins. With the stand-ins, hire the swarm like this:
`curl -X POST 127.0.0.1:18093/hire -d '{"description":"Project Alpha: when does it launch?"}'`; the answer is at `GET 127.0.0.1:18093/tasks`
(the stand-ins' rules: [e2e/mocks.ts](../e2e/mocks.ts)).

A runner without a TEE says so openly in `/attestation`, and `verify` will not pass it. For a sponsor on testnet:

```bash
scripts/swarm.sh faucet bob.testnet && scripts/swarm.sh fund bob.testnet 20    # NEAR from the faucet, 20 test USDC
SPONSOR=bob.testnet RUNNER_URL=http://127.0.0.1:8080 TRUST_DEV_RUNNER=1 scripts/swarm.sh join agents/auditor 5
scripts/swarm.sh status bob.testnet       # after a minute: Active or Suspended
node --experimental-strip-types scripts/cabinet.ts bob.testnet http://127.0.0.1:8080   # the cabinet, signed with the key from ~/.near-credentials
```

In a browser: open `http://127.0.0.1:8080/app`, connect a wallet (in testnet mode), click "New expert" and confirm
once. The dashboard and the experts' pages are there too. The wallet's account needs test USDC: `scripts/swarm.sh fund <account> 20`.

### For a customer: an order through the contract

```bash
scripts/swarm.sh faucet carol.testnet && scripts/swarm.sh fund carol.testnet 20   # NEAR from the faucet, 20 test USDC
export CUSTOMER=carol.testnet RUNNER_URL=http://127.0.0.1:8080
scripts/swarm.sh order "Is this staking contract safe to deploy on NEAR? https://github.com/you/project" 5
scripts/swarm.sh answers                  # after a minute or two: the answer, who was paid how much, how much came back
scripts/swarm.sh refund order-1           # if the swarm is silent longer than run_secs: get the whole budget back
```

The task's text goes to the runner. The contract holds the budget and the hash of the text (`PUBLISH=1` puts the text
itself into the transaction too). The contract does the settlement: the rates to the experts who delivered, the
overhead, 5% to the owner, and the rest straight to the customer's wallet. In a browser, do the same on
`http://127.0.0.1:8080/order`. A brief with a choice of experts is easier to put together on `/experts`; then click
"Or order on chain". This path does not need Agent Market: without `MARKET_TOKEN` the runner serves only orders from
the contract.

### For a sponsor: debugging and the cabinet

```bash
NEARAI_API_KEY=... node --experimental-strip-types scripts/try.ts agents/auditor "Is this vault safe? ..." --prompt
NEARAI_API_KEY=... node --experimental-strip-types scripts/try.ts agents/auditor --audit
```

The first command shows the pieces of knowledge it found, the whole prompt, the answer, the evaluator's verdict and
the worst-case spending against the ceiling. The second shows whether the agent passes the audit and what the scan
noticed in the materials.

An expert with checklists declares `"work": "review"` in `agent.json` (in the app, the "How it works" field). Then it
reads the customer's files with all of its knowledge, part by part, and checks each finding separately
([how this works](PROTOCOL.md#the-round-of-a-task)). A review takes dozens of calls, so it needs a higher ceiling
(`max_cost`): the form sets one that covers the worst case. A trial run on your own file:

```bash
NEARAI_API_KEY=... node --experimental-strip-types scripts/try.ts eval/agents/solidity-attack-paths "Audit this contract ..." --material Vault.sol --code
```

It prints how many parts were read, how many findings were raised, how many were confirmed and not confirmed, and
the spending. The expert itself decides how much a review spends: it pays for it. A model's reply can be as long as
what is left of the hold pays for, and everything is checked while the money lasts. To spend less, say so in
`method.md` ("only High and Medium") or limit the checks: `"review": {"checks": 20}` in `agent.json`.
One file in `knowledge/` is one pass: put into one file what is checked together. `--code` means
"the task asks for code": the gravest findings get proofs. You can see how the expert works in the swarm in the app at
`<runner>/app`: sign in with a wallet; top-ups and withdrawals are there too. For each task it shows the outcome with
a hint on what to change (for example, `cut off`: the reply hit the length limit). An accepted part has two more
signals: what share of the final answer came from the expert, and whether the customer sent that answer back for
rework. The expert's owner never sees the task itself: fix the expert by these signals and on your own questions,
then register it again.

## 3. The swarm's agent on Agent Market

Agent Market runs on mainnet. Create the swarm's agent and list it:

```bash
node --experimental-strip-types scripts/market.ts register swarm-for-hire   # prints MARKET_TOKEN once
MARKET_TOKEN=aat_... node --experimental-strip-types scripts/market.ts list <agent id>   # three plans: Quick 3, Standard 10, Deep 30
```

If the market does not let you take a step with the agent's token, take it in the market.near.ai dashboard. The
description must say how many reworks the price includes (`MAX_REWORKS`, 2 by default). Put the address of the
swarm's page on the market into `MARKET_LISTING_URL`: the "Hire" buttons on the site lead there.

Agent Market payouts come to the swarm's account. The operator forwards each one to the contract (see step 6).
To try this with the contract on testnet, the operator forwards the same amount in test USDC.

## 4. The runner in a TEE (Phala Cloud)

```bash
scripts/swarm.sh image ghcr.io/<you>/swarm-runner   # build, push, write the digest into docker-compose.yml
# docker-compose.yml: fill in NEAR_RPC, CONTRACT, RUNNER_ACCOUNT, the models. Everything in it goes into the attestation.
cat > .env.tee <<'EOF'
NEARAI_API_KEY=...
MARKET_TOKEN=aat_...
BRAVE_API_KEY=
EOF
scripts/swarm.sh tee-deploy                         # phala deploy; the secrets are encrypted for the TEE
```

In the Phala dashboard, find the address of port 8080 (like `https://<app-id>-8080.<gateway>`). Save the app's
`app-compose.json` to the repository root and publish it: without it, sponsors cannot check the runner (`join`
requires it). Then:

```bash
scripts/swarm.sh verify https://<app-id>-8080.<gateway> app-compose.json      # all ✓
scripts/swarm.sh runner-key https://<app-id>-8080.<gateway> app-compose.json  # check + a key for the runner
phala logs                                                                     # waiting_for_key → ready
```

After each restart of the CVM, the signing key is new: repeat `runner-key` and delete the old key
(`near account delete-keys runner.$ROOT ...`). The encryption key stays the same: uploaded materials still open.

**What the machine costs.** Phala charges for every hour the machine runs; the bill does not depend on the number of
tasks. `tee-deploy` names the smallest size itself, `tdx.small` (1 vCPU, 2 GB; the runner takes about 120 MB): $0.058
an hour plus a 40 GB disk, about $1.5 a day together ([prices as of 2026-11-12](https://cloud.phala.com/about/instance-types)).
For another size: `TEE_SIZE=tdx.medium`.

```bash
phala apps                    # what is deployed: there should be one machine
scripts/swarm.sh tee-stop     # stop: you pay only for the disk, about $0.13 a day
scripts/swarm.sh tee-delete   # delete: you pay nothing; the uploaded materials are lost
```

Running `tee-deploy` again can create a second machine: check `phala apps` after it. To update the running machine,
use the same `phala deploy` command from [scripts/swarm.sh](../scripts/swarm.sh) with `--cvm-id swarm-runner`. The
Phala key is in `~/.phala-cloud/credentials.json`. With it, anyone can start a machine of any size at your expense, so
the runner is not given it and it is not written into `.env.tee`.

## 5. Mainnet

The same as on testnet, but with `NETWORK=mainnet`, `ROOT=<yours>.near`,
`TOKEN=17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1` (USDC on NEAR), and without `test-token` and
`dev-key`. The runner runs only in a TEE (step 4). Sponsors join through the runner's page or with
`SPONSOR=bob.near RUNNER_URL=https://... COMPOSE=app-compose.json scripts/swarm.sh join agents/auditor 5`:
`join` checks the quote, the compose file and the runner's key, and only then encrypts.

## 6. Every day

| What | Who | Command |
|---|---|---|
| forward the payouts for all accepted work (to every expert who delivered, in every round) | operator | `scripts/swarm.sh payouts` (can run from cron; `--dry` only shows them) |
| a dispute was settled by splitting the payment | operator | `scripts/swarm.sh payouts --received <assignment>=<amount received, USDC>` |
| check the books | anyone | `scripts/swarm.sh status [account]`: `books OK` |
| withdraw money | anyone | `scripts/swarm.sh withdraw <account> [usdc]` |
| close a stuck task | anyone | `scripts/swarm.sh close '<assignment>#<round>'` |
| top up an expert's balance | sponsor | the app at `/app`, or `SPONSOR=bob.near scripts/swarm.sh top-up bob.near/auditor 10` |
| stop the runner | owner | `scripts/swarm.sh pause`, then `resume`: takes effect at once, moves no money |
| change a setting | owner | `scripts/swarm.sh set fee_bps 300` announces the change; after `delay_secs`, `scripts/swarm.sh apply-config` (anyone) puts it into force, and `cancel-config` cancels it. With a delay of 0 it takes effect at once |
| turn on the settings delay | owner | `scripts/swarm.sh set delay_secs 172800` (two days): after that, the delay itself also changes only after the delay |
| upgrade the contract and keep its state | owner | `scripts/swarm.sh upgrade`: the new code and the state migration in one transaction |

## What the runner's log means

| Event | Meaning | What to do |
|---|---|---|
| `attest` | the runner is up; here are its keys | check it and give it the key (`runner-key`) |
| `waiting_for_key` | no key has been given yet | `runner-key` or `dev-key` |
| `ready` | it is working | — |
| `paused`, `resumed` | the owner stopped the runner or resumed it | — |
| `uploaded` | a sponsor uploaded materials | the audit runs in the next cycle |
| `reviewed` | the decision on an agent: `allow` and the rule (`category`); the reason and the excerpts are only in the sponsor's cabinet | — |
| `no_agents` | no agents are ready for the task yet | after a restart, wait for indexing; otherwise, sponsors are needed |
| `brief` | the runner took the text of a coming order under its hash | — |
| `task`, `screened`, `team`, `materials` | the steps of one task: the size, the topic, who was considered and who was taken (`replaced`: whom the runner replaced with whom, by the usage score), how many materials were read | — |
| `llm` | one NEAR AI call: the step (`step`; for an expert, `lookup`, a look-up in the materials, and `agent`, the answer; for a review, `read` (its own reading), `pass`, `check`, `combine` (what the findings give together), `same` (which findings are about the same thing), `proof`, and `findings`, the findings' embeddings; `summary`, the paragraph before the findings; `control`, the controller, if one is set), the model, the tokens (`in`, `out`, and of those `reasoning`), the price in `micro_usd`, the time; `error` if the call failed | expensive or slow: change the model |
| `tx` | a runner transaction: the method, the arguments, the hash and the contract's events | `error`: check the RPC and the runner's key |
| `contribution` | one expert's part: the spending, whether it counted and under which rule; `work` is `answer` or `review`; a review also has counts: parts read (`passes`), findings raised (`raised`), groups (`groups`), checked (`checked`), confirmed (`held`), not confirmed but shown (`leads`), proofs (`proofs`), replies cut off at the limit (`cut`) | many `raised` and zero `held`: the checklist is not about these files, or the model is too weak for the review; `cut` above one or two: the reply limit is too small for this model (`PASS_OUT`, `CHECK_OUT` in `rules.ts`) |
| `degraded` | the embeddings service did not answer: the findings are grouped by their words, and there will be more checks | if it repeats, check NEAR AI |
| `composed` | the answer was composed from this many parts; `findings` and `leads`: how many confirmed findings and unconfirmed items are in the list after adding up; `second`: how many findings carry the controller's word | — |
| `submitted`, `declined` | the round is closed; the costs and payouts are beside it | — |
| `load_failed`, `upload_missing` | an active agent's materials did not open | check the `/data` volume |
| `error`, `http_error` | an outside service failed; the round is retried after 1, 2, 4 and 8 minutes, and after the fifth failure it is declined | if it repeats, check NEAR AI / RPC / the market |

Each line of a task carries the task's id in the `job` field. The log has no text: no tasks, no questions, no answers.

### Tracing for tests

With `TRACE_DIR=./trace`, the runner writes the same lines to `trace/<UTC day>.jsonl`, but with the text: the task,
the questions to the experts, what went to the model (`sent`) and what came back (`got`), and the answer before and
after the filter. This is exactly what the TEE hides, so the runner accepts `TRACE_DIR` only together with `DEV_KEY`,
and a runner on `DEV_KEY` does not pass `verify`.

```bash
jq -c 'select(.job == "order-3") | {t, event, step, model, ms, micro_usd}' trace/2026-11-12.jsonl   # one task, step by step
jq -s 'map(select(.event == "llm") | .micro_usd) | add / 1e6' trace/2026-11-12.jsonl                # spent in the day, USD
jq 'select(.job == "order-3" and .step == "compose") | .sent.prompt | fromjson' trace/2026-11-12.jsonl # what the composer saw
```

## Checklist before going live

- [ ] `scripts/local.sh` is green.
- [ ] The contract is deployed; `status` shows `books OK` and the right settings.
- [ ] `docker-compose.yml` has the image by digest and the right `CONTRACT`, `RUNNER_ACCOUNT`, `NEAR_RPC`.
- [ ] `verify` with `app-compose.json` shows all ✓; the key is given; the log shows `ready`.
- [ ] The NEAR AI account has credits; `runner.$ROOT` has NEAR for gas.
- [ ] At least two sponsors are `Active`, each with a balance no lower than the ceiling.
- [ ] The swarm's agent on Agent Market is `live`, and its description mentions the reworks.
- [ ] A trial task to yourself: the answer came, the `revenue` was forwarded, `status` shows `books OK`.
