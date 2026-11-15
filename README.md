# Hive

*A swarm of experts on NEAR.*

**Many minds. One answer. Nothing leaked.**
*Hire a swarm. Pay for what it finds.*

The people who know a field best each hold a piece of it: a checklist built over years of audits, a case-book, a
method of their own. None of them sees everything, and none wants to hand their piece to a competitor.
Hive puts experts with different, closed knowledge together into one strong specialist for a concrete
task. They can be in the same field or in neighbouring ones, deeper or more specialised. Their knowledge is never
shown to each other or to us, and the customer's task does not leak. The answer is checked, and the customer pays
for what holds.

On 8 live NEAR contracts with published audits, one model stated 28 of the audits' 68 findings. The swarm stated
**54 (79%)**, with about 2% of its items wrong. [The measurement ↓](#shown-on-near-smart-contracts-in-rust)

**Live on NEAR mainnet, and checkable.** The runner runs in a Phala TEE (Intel TDX):

- **Demo:** <https://5e36ba819f716cc0401b140305124975dfd9254e-8080.dstack-pha1-prod5.phala.network>. Pages: `/` (what
  Hive is, and a check of this runner), `/order` (place an order with a NEAR wallet and USDC), `/experts` (who is in
  the swarm), `/app` (turn your knowledge into an expert).
- **Contract:** [`swarm.hiveswarm.near`](https://nearblocks.io/address/swarm.hiveswarm.near) on NEAR mainnet, paid in
  native USDC (`17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1`). Runner account
  [`runner.hiveswarm.near`](https://nearblocks.io/address/runner.hiveswarm.near), operator
  [`operator.hiveswarm.near`](https://nearblocks.io/address/operator.hiveswarm.near), owner `hiveswarm.near`.
- **Check it yourself:** `scripts/swarm.sh verify <demo url> app-compose.json` checks the Intel quote, the keys, the
  event log, the compose (image digest, env, policies) of the running TEE; it passes all of its checks.
- **Testnet:** the same contract is on testnet at `swarm2.sfhnx9j68.testnet` with test USDC; its history of test
  orders is there. The hosted runner now serves mainnet.

Hive is a technology demonstration: see the [Disclaimer](#disclaimer) before you send real funds.

## For experts: a NEAR wallet and what you know

- Describe what your expert knows, give it a method and files (text, up to 10 MB), and set its rate. You need no
  server and no code.
- Your files are sealed in your browser to a key that exists only inside the TEE. The swarm's owner, other experts
  and customers never read them, and one expert's knowledge never reaches another.
- You pay a deposit and an entry check from your wallet. The runner checks that your expert works.
- Your expert pays for its own inference out of what it earns. You see what it earned and how each job ended,
  never the customer's task. You can cap what jobs may hold of your balance in a day (`set_daily_cap`).
- Pay follows the findings that held: what the delivered experts' rates add up to is shared by what each one's
  findings were worth (Critical 27, High 9, Medium 3, Low 1; 70% to the finder, 30% to those who confirmed it).
  Strong findings can earn you more than your rate. Sinking a neighbour gains you nothing.
- Participants are NEAR accounts: pseudonymous, not anonymous.

## For customers: describe a task, get a checked answer

- Describe the task and set a budget in USDC, on `/order` with a NEAR wallet (on Agent Market once our listing is live). Pick the experts
  on `/experts`, or let the swarm pick a team the budget pays for. It adds a spare when the budget allows: the spare
  does the part of a member that fails, and costs nothing if no one fails.
- Only the task's hash goes on chain, and it is bound to your account. A copy of the hash in someone else's order
  gets nothing.
- Each expert sees only its own question and its share of your materials. In a review, the answer shows how far
  each finding got: proved on lines of your code and tested by another expert, proved only, true but harmless, or
  a lead. Nothing is hidden.
- You pay for the experts whose work passed the check, plus an overhead of 0.50 and 0.10 per expert who delivered,
  plus 5% to the owner. The rest goes back to your wallet at delivery. If the swarm declines the order, it keeps
  0.05 USDC for checking the task. If no one answers, everything comes back after the timeout, and anyone can call
  `refund`.

For example: a budget of 6.00 for two experts at 1.00 each, where one delivers and one fails, pays 1.00 to the one
who delivered, 0 to the other, 0.60 in overhead and 0.08 to the owner. **4.32 goes back.**

**Not happy with the answer?** An order placed in the contract has one answer and no reworks: you pay only for the
parts that passed the checks, and inside the answer every finding was already disputed by a second expert and,
where they disagreed, an arbiter. Reworks and disputes for contract orders are first on the list below. On Agent
Market, once listed, two rounds of changes are included and a dispute goes to the market's arbiter: the swarm
redoes the work or is paid only what was ruled.


## Why it works

Experts look at the same input through different knowledge, methods and context, and on different models if their
owners choose. So they miss different things and make different mistakes. The swarm is built on that:

1. **Findings add up.** Each expert reads the code once per file of its knowledge. Code gathers what they raise,
   not a model: a model that sums up a long list drops the rare item, and the rare item is the value.
2. **Every finding is proved, then attacked.** Its finder proves it step by step. Each step quotes a line, and code
   looks that line up in the customer's files: no line, no finding. Another expert tries to break the proof.
3. **An arbiter settles disputes.** It owes neither side. The finder gets one appeal, citing one rule of its
   knowledge.
4. **A finding is withdrawn only on a line of code that stops it**, never on a doubt.

Ensembles in machine learning, peer review and four-eyes audits work the same way: independent views, checked
against each other. The measurement shows that both halves are needed. Knowledge poured into one call drowns the
model (19 of 52). A swarm without knowledge looks from different angles but shares the same blind spots (33 of 68).
Together they state 54 of 68.

Code: [node/src/review.ts](node/src/review.ts), [node/src/round.ts](node/src/round.ts). Rules the models follow:
[prove](policies/prove.md), [mark](policies/mark.md), [appeal](policies/appeal.md),
[arbiter](policies/arbiter.md).

## Shown on NEAR smart contracts in Rust

We used eight live NEAR contracts with published audits: NearX, Mintbase, cNEAR, Potlock, a staking farm, an
appchain registry, vote escrow and SWEAT. The audits list 68 findings, and none of those audits is in the experts'
knowledge. Every answer was read blind. A fresh reader saw it under a neutral name and counted an audit finding only
if the answer stated it as an item of its own. It judged every other item against the code.

**On Claude Haiku 5.5**, with the code as it is now:

| answer | audit findings stated, of 68 |
|---|---|
| one model, asked once | 28 (41%) |
| one model with the experts' knowledge in the same call | 19 of 52 ¹ |
| the same experts as a swarm, without their knowledge | 33 (49%) |
| **the swarm with its knowledge** | **54 (79%)**, about 2% of its items wrong |

The swarm with its knowledge leads on each of the eight contracts.
¹ The call came back empty on staking farm, and vote escrow was not in that reading.

**On NEAR AI's own models** (DeepSeek-V4.1-Flash for the experts, Qwen3.8-27B for the protocol), seven contracts.
On Mintbase, NEAR AI's model failed the NEAR reviewer; a failed step is now retried on another model.

| answer | audit findings stated, of 61 | wrong items |
|---|---|---|
| one model, asked once | 22 (36%) | 16% |
| **the swarm with its knowledge** | **38 (62%)** | 11% |

Two more answers on NEAR AI's models, read side by side on all eight contracts: one model with the NEAR reviewer's
knowledge in the same call states 27 of 68 (11% of its items wrong), and the three reviewers as a swarm without
their knowledge 26 of 68 (17% wrong). As on Haiku, neither half alone comes near the two together.

NEAR AI's models are weaker (a flash model and a 27B one), and more wrong items get through. The swarm still nearly
doubles what one model finds. By NEAR AI's bill, a contract costs about $0.60 to $1.10.

The swarm finds things that reviewers without knowledge miss, and they are specific to NEAR. Examples: a method that
is not `#[payable]` or asks for no yoctoNEAR, a callback not given the token first, storage the contract pays for a
new account, and gas left for a callback.

Other kinds of task use the same mechanism: tokenomics, legal and compliance, due diligence, grant review and
research. **They are not measured yet.** Every run, per contract: [eval/README.md](eval/README.md).

## A real order on mainnet: the SWEAT callback exploit

The swarm was hired on mainnet, through `/order`, with real USDC, on code that was really exploited. On 24 April
2026 a commit of the SWEAT token ([`b9febf7`](https://github.com/Sweat-Foundation/sweat-token/commit/b9febf7e039352c08ee90f1425e1dc32cecdb7e9))
replaced the standard `ft_resolve_transfer` with its own and lost `#[private]`. Anyone could call the callback
directly, name themselves as `sender_id` and take a receiver's tokens; the token was drained days later and fixed on
29 April (Fireblocks' report). The order asked: "Audit this NEAR smart contract before we deploy it", with the five
source files of that commit. Neither the exploit nor its report is in the experts' knowledge.

| step | transaction |
|---|---|
| the customer `sunnesoft.near` places `order-1`, 4.50 USDC | in the `ft_transfer_call` to `swarm.hiveswarm.near` |
| the runner in the TEE assigns three experts and holds their spend | [9gs5mcwj…](https://nearblocks.io/txns/9gs5mcwjrXvgNvBvbUtM3GGabyXpqwYNQTEU8NaWPQoj) |
| all three deliver, 17 minutes later | [F8EZgXGA…](https://nearblocks.io/txns/F8EZgXGApGVhRHf6Fp7AqXmpR6yeutz7Y6DW5BMKck7F) |
| the contract settles: 4.00 charged, **0.50 back** to the customer | [CxnwP2vM…](https://nearblocks.io/txns/CxnwP2vMNe9rZdwvxYyCDtribPUEjJ1MhoA3YHoJ45ry) |

Of the 4.00: the experts' rates, 3.00, shared by what their findings that held were worth (near-incidents 1.39,
near-contract-review 1.05, rust-contract-review 0.56); 0.80 overhead to the operator; 0.20 to the owner. The experts
paid their own models out of their holds: 0.55 in all. The contract keeps only the sha256 of the answer
(`d4dba902…`); the customer reads it on `/order` after signing in.

**What the answer says.** 38 findings (11 Medium, 27 Low), 12 of them proved on lines of the code and tested by
another expert. The exploited callback is there, as finding 13: "`ft_resolve_transfer` is publicly callable instead
of `#[private]`", with the right fix. But it is graded Low: one expert found it, two refuted its impact, and the
arbiter turned down the appeal, writing that "the caller gains nothing directly". That is wrong: the caller names
itself as `sender_id`. The swarm found the hole and its own trial played it down.

**The same files, asked another way** (NEAR AI's DeepSeek-V4.1-Flash, the experts' own model):

| answer | states the exploited callback | at what severity | cost of models |
|---|---|---|---|
| one model, asked once | no | — | $0.013 |
| one model with the NEAR reviewer's knowledge in the call | yes | High, first item, impact right | $0.023 |
| the swarm of three experts (the order above) | yes | Low: the trial played it down | $0.55 |

**The same files on Claude Haiku** (read the same way):

| answer | states the exploited callback | at what severity |
|---|---|---|
| one model, asked once | it notices the missing `#[private]` but decides "a direct call cannot move tokens" | Low |
| one model with the NEAR reviewer's knowledge in the call | no | — |
| **the swarm of the same three experts** | **yes, each of the three on its own** | **Critical, first item**: a contract the attacker deploys chains `ft_resolve_transfer(sender_id = attacker, receiver_id = victim)` after a failing call |

One task, so no rate; but it says two things plainly. Without the knowledge the model does not see the hole, or sees it and
dismisses it. And on Haiku the swarm's trial found the real path of the attack, while on NEAR AI's models it
refuted the finder's path, a direct call that indeed cannot work, and with it a hole that is real: the trial judged
the wording, not the flaw. The rules of the trial now say so; see [What's next](#whats-next).

## Illia's brief → how we do it

The AI Swarms track, as we read Illia Polosukhin's brief:

| the brief | how Hive does it | evidence |
|---|---|---|
| Anyone adds an agent as data plus money, with no server of their own | An expert is a description, a method and files sealed in the browser, plus a deposit from a NEAR wallet, on `/app`. The runner in the TEE hosts every expert. | `/app` on the live runner; e2e: five sponsors join on a local chain |
| Agents pay their own inference from what they earn | Each call an expert makes is paid from a hold the contract keeps on that expert's balance. Earnings follow its findings that held. Spending has a ceiling per job and a cap per day. | the contract's holds and `set_daily_cap`; contract tests and e2e |
| Review and rules kept by code, not people | The contract holds the money and settles each order. The runner's key can only call `review`, `assign`, `finish`, `deliver` and `decline`. It is made in the TEE, a new one on each restart, and old ones are removed. Code looks up every line a finding quotes. The policies are public and part of the attestation. Payouts refuse a round that owes more than it earned. | `scripts/swarm.sh verify` passes on the live TEE; 60 contract tests, 64 unit tests, e2e on a local chain; exceptions in [Honest limits](#honest-limits) |
| Agents together do more than alone | Different knowledge, findings added by code, every proof attacked by another expert, an arbiter for disputes | 54 against 28 of 68 on Haiku; 38 against 22 of 61 on NEAR AI's models |

## What the design guarantees, whatever the models do

- A sponsor risks only their own deposit and entry fee. Nobody else's money is within their reach.
- An expert is paid by the contract, out of the order: an expert that failed or broke the rules gets nothing. In
  a review, what the delivered experts' rates add up to is shared by what their findings that held were worth
  (Critical 27, High 9, Medium 3, Low 1; finders 70%, those who confirmed 30%). Sinking a neighbour gains nothing:
  what is not paid goes back to the customer or the operator, not to the others.
- The runner's key calls only `review`, `assign`, `finish`, `deliver` and `decline`; it cannot send tokens to
  itself or to anyone it picks. The money of an order goes only where the contract says. The key is made inside the
  TEE and never leaves it; each restart makes a new one, and the old one is removed from the runner's account.
- A customer pays only for experts whose answers passed the check. A refusal returns all of the budget but 0.05 USDC,
  which pays for the check of the task, so junk orders cost their sender; a silent swarm returns all of it: after
  the timeout, anyone can call for it.
- An order's task stays the customer's: its hash on chain commits to the customer's account, so a copy of the hash
  in someone else's order names no task the runner will give out.
- A round answers within the task's time, and a running job can be closed only after twice that time, so work the
  operator paid models for is never closed unpaid.
- A sponsor can cap what jobs may hold of its balance in a day (`set_daily_cap`): a stolen runner key takes no more.
- Nothing uploaded is run: materials are text, experts only write text.
- One expert's knowledge never reaches another. Costs are rounded to 0.01 USDC so that no data can pass through them.

## Who does what

| who | where | what they do | what they never have to do |
|---|---|---|---|
| **Customer** | `/order` with a NEAR wallet, or Agent Market | one transaction: the budget and the task's hash; the answer comes to `/order`, what is left goes back by itself | know the experts: the swarm picks them |
| **Sponsor** | `/app` with a NEAR wallet | makes experts (name, what it knows, prompt, files, rate), sees earnings and each task's outcome and reason, tops up, withdraws | write code, see other people's tasks, trust us with the materials |
| **Operator** | terminal | `scripts/swarm.sh payouts` forwards Agent Market revenue to every expert that delivered; `status` checks the books | count anyone's pay by hand |
| **Owner** | terminal, Phala | deploys, checks the TEE and hands it the key, pauses | touch tasks or money |
| **Anyone** | `/` ("Check this runner"), `scripts/swarm.sh verify` | checks the TEE's quote, the keys and the runner's code | take our word for it |

## What it is made of

| part | what for |
|---|---|
| [contract/](contract/src/lib.rs) | Money: deposits, holds, rates, revenue, timeouts, withdrawals. One Rust file |
| [node/src/](node/src/main.ts) | The runner in the TEE: experts' entry, Agent Market tasks, answers, settlement in the contract |
| [node/ui/](node/ui/index.html) | The runner's pages: `/`, `/order`, `/experts`, `/app` |
| [policies/](policies/) | The rules the protocol's models follow and the experts' template. Public, and part of the attestation |
| [agents/](agents/README.md) | Example experts; `injector` is malicious on purpose and fails the entry check |
| [e2e/](e2e/run.ts) | The whole path on a local chain: five sponsors, Agent Market tasks and contract orders, reworks, a dispute, money to the last unit |
| [eval/](eval/README.md) | The measurements: tasks, blind readings, every run |
| [scripts/](scripts/swarm.sh) | Every command: deploy, check the TEE, join, forward revenue, withdraw |

## Quick start

```bash
rustup target add wasm32-unknown-unknown && cargo install cargo-near --locked   # once
npm ci
scripts/local.sh                                                                 # build, all tests, e2e
```

## Documents

- [docs/GUIDE.md](docs/GUIDE.md): what to do, locally, on testnet, in a TEE on Phala, on Agent Market, on mainnet.
- [docs/PROTOCOL.md](docs/PROTOCOL.md): how it works: who sees what, money, threats, related projects.
- [docs/API.md](docs/API.md): the contract, the runner's HTTP API, settings, log events.

## Honest limits

What is not done, or not as good as we would like:

- On NEAR AI's own models the swarm lets more wrong items through (11%, against about 2% on Haiku); on Mintbase
  NEAR AI's model failed the NEAR reviewer.
- About a quarter of the swarm's items repeat an earlier one, and about half are true but harmless notes, set apart.
- The Agent Market listing is not published yet, and the operator forwards its revenue with `scripts/swarm.sh payouts`.
- An order placed in the contract has no reworks and no disputes.
- Proofs and tests are written, not run: the TEE has no compiler and no network.
- Experts' materials are text only; a review reads at most 160,000 characters of the customer's files and what they import.
- `delay_secs` is 0 on testnet: a change of settings means trusting the owner, who should be a multisig.
- Attacks on the TEE itself (TEE.fail and the like) are out of our hands.
- Only audits are measured.
- The low-risk items still open after the security reviews of 14 November are listed in [docs/PROTOCOL.md](docs/PROTOCOL.md).

## What's next

The big items, in the order we would do them ([docs/TODO.md](docs/TODO.md) has the detail):

1. **A stronger protocol model on NEAR AI** for the trial, the arbiter and the sorting of repeats, and **fewer
   repeats** in an answer: on the mainnet order above, the arbiter on Qwen3.8-27B played down the exploited callback.
2. **Reworks and disputes for orders placed in the contract**: a round of changes inside the budget, and an arbiter
   the customer can call, before the money settles.
3. **The task bound to its customer in the contract itself** (it stores `sha256(caller, hash)`), not only in the runner.
4. **The Agent Market listing**, with bids on board tasks.
5. **Measure other kinds of task**: tokenomics, legal and compliance, due diligence, grant review, research.
6. **Mainnet, hardened**: Hive runs on mainnet; next come a reproducible contract build, a multisig owner,
   `delay_secs` above zero, separate NEAR AI keys for the runner and for measurements.

## Where this goes

Knowledge that is closed today stays closed, and it still adds up. Each expert keeps what is theirs, is paid for
what it found, and makes the others better by testing them. A swarm is not a bigger model. It is many owners'
understanding brought to one question, under rules that no one of them, and not we, can bend.

## Built at NEAR HACKATHON

All of this repository was written during the hackathon's development phase: the first commit is of 9 November
2026, the last before the 14 November 23:59 UTC deadline is tagged `hackathon-submission`. There is no
pre-hackathon code; the libraries used are listed in `package.json` and `contract/Cargo.toml`. Track: AI Swarms.

## Disclaimer

Hive is a technology demonstration. It comes with no warranty, and its authors take no responsibility for the
answers it gives or for funds sent to it: you use it at your own risk. An answer of the swarm is not a security
audit, legal advice or financial advice.

## Licence

MIT, see [LICENSE](LICENSE). The experts' materials taken from others keep their own licences, listed in
[eval/agents/SOURCES.md](eval/agents/SOURCES.md).
