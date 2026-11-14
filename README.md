# Swarm-for-Hire

> **A swarm is a way to put together the closed knowledge of different owners, with no one trusting anyone.**

An expert's owner (a sponsor) brings what they know into the swarm: a description of the expertise, a method,
files up to 10 MB. The files are encrypted in the sponsor's browser to the key of a runner inside a TEE, so no one
reads them: not the swarm's owner, not the other sponsors. A customer places an order in the contract (a budget
in USDC and the hash of the task; only the runner gets the task's text) or hires the swarm on
[Agent Market](https://market.near.ai) as one agent. The swarm picks the experts the task needs, asks each its
own question, checks every answer, joins them into one, and pays each expert by what its part was worth. A NEAR
contract holds the money.

One agent can run a "swarm" of its own, but inside it holds only *its owner's* knowledge. Other owners' closed
knowledge, and fair pay to each of them, come only when a contract and a TEE keep the rules, not people.

**Try it:** contract `swarm2.sfhnx9j68.testnet` on NEAR testnet; the runner's pages are `/` (landing and the
check of the TEE), `/order` (place an order with a NEAR wallet), `/experts` (the catalogue) and `/app` (a
sponsor's app).

## Who does what

| who | where | what they do | what they never have to do |
|---|---|---|---|
| **Customer** | `/order` with a NEAR wallet, or Agent Market | one transaction: the budget and the task's hash; the answer comes to `/order`, what is left goes back by itself | know the experts: the swarm picks them |
| **Sponsor** | `/app` with a NEAR wallet | makes experts (name, what it knows, prompt, files, rate), sees earnings and each task's outcome and reason, tops up, withdraws | write code, see other people's tasks, trust us with the materials |
| **Operator** | terminal | `scripts/swarm.sh payouts` forwards Agent Market revenue to every expert that delivered; `status` checks the books | count anyone's pay by hand |
| **Owner** | terminal, Phala | deploys, checks the TEE and hands it the key, pauses | touch tasks or money |
| **Anyone** | `/` ("Check this runner"), `scripts/swarm.sh verify` | checks the TEE's quote, the keys and the runner's code | take our word for it |

## A task, step by step

1. **Entry.** A sponsor encrypts the materials on the runner's page, pays a deposit and the entry check with
   their own wallet, and uploads. The runner in the TEE checks the materials with models: the expert works or not.
2. **Order.** The customer places an order in the contract or on Agent Market. The protocol's model checks the
   task and picks a team within the budget. The contract holds each expert's spending ceiling.
3. **Work.** Each expert sees only its own question, its share of the customer's materials and the parts of its
   own knowledge closest to them. No network, no tools, no other experts.
4. **Check.** One separate call per expert: delivered, failed, or broke the rules.
5. **Answer.** The answer is put together; an output filter strips dangerous code, foreign links and images.
6. **Money.** Each expert pays its inference out of what the contract holds for it. For an order in the
   contract, the contract settles at delivery: 5% to the owner, the experts' pay, the operator's overhead, the
   rest back to the customer's wallet.

## Contract review: experts that check the customer's code

The customer links the files of a contract (Rust for NEAR or Solidity) and asks for a review. An expert with
checklists (`"work": "review"`) does not answer in one call. It reads the code with all of its knowledge
([node/src/review.ts](node/src/review.ts)):

1. **One pass per knowledge file**: what does this checklist find in the customer's code? Files the code imports
   are read with it, so a step of a proof can follow a call into a library; a linter for NEAR adds what code can
   tell for sure ([node/src/lint.ts](node/src/lint.ts)).
2. **Code gathers the findings, not a model.** A model that sums up a long list drops the rare finding, and the
   rare finding is the value.
3. **Each finding is checked on its own** and must quote the lines it rests on. Code looks the lines up in the
   customer's files: no line, no finding.
4. **The team tries what it found** ([policies/prove.md](policies/prove.md), [mark.md](policies/mark.md),
   [appeal.md](policies/appeal.md), [arbiter.md](policies/arbiter.md)). The expert that found a finding proves it
   step by step, each step on a line code finds in the materials. The other experts test the proof and look for
   the step that breaks. A refuted finding goes, with one appeal by its finder citing one rule of its knowledge,
   to an arbiter that owes neither side.
5. **A grave finding that stood gets a test**, written by its finder along the path that was upheld (marked:
   written, not run).
6. **Nothing is thrown away.** The answer is laid out by how far each finding got: proved and tested by the team;
   proved, not yet backed by a second expert; true and harmless (notes); not proved (leads).

Every auditor's method carries one rule: a finding has someone who gains, someone who loses, or a service that
stops; otherwise it is not a finding. The experts are in [agents](agents) and [eval/agents](eval/agents): a NEAR
reviewer (our checklist, a case-book of 87 kinds of findings from 47 public audits, NEAR's security guide, the
NEPs) and Solidity auditors built from open material under MIT. Sources and licences:
[eval/agents/SOURCES.md](eval/agents/SOURCES.md).

## Does it find more? Measured against published audits

Eight NEAR contracts that none of the knowledge was written from, each with a public audit (68 findings in all).
Each answer was read blind by a fresh reader that saw it under a neutral name and counted a finding of the audit
only if the answer stated it as an item of its own, and judged every other item of the answer against the code.
Details and every run: [eval/README.md](eval/README.md).

On Claude Haiku 5.5, through [eval/claude-shim.ts](eval/claude-shim.ts) in NEAR AI's place, all eight contracts,
the code as it is now:

| answer | findings of the audits stated, of 68 |
|---|---|
| one model, asked once | 28 (41%) |
| one model with the experts' knowledge in the same call | 19 of 52 (37%) |
| the same experts as a swarm, without their knowledge | 33 (49%) |
| **the swarm of experts with their knowledge** | **54 (79%)**, about 2% of its items wrong |

The swarm with its knowledge leads on every one of the eight contracts. Knowledge alone does not do it, and
neither does a swarm alone: the gain comes from different knowledge, put together and checked.

On NEAR AI's own models (DeepSeek-V4.1-Flash for the experts, Qwen3.8-27B for the protocol), the same team on
seven of the contracts (on Mintbase NEAR AI's DeepSeek failed the NEAR reviewer): **38 of 61 (62%)**, where the
same seven gave 45 on Haiku; 12% of the items wrong and 6 false Critical or High of 15. A contract costs $1.00 to
$1.90 by our meter, about $0.60 to $1.10 by NEAR AI's bill (it billed 59% of our meter for these runs). The swarm works on NEAR's models; the stronger the model that proves, tests
and judges, the fewer wrong items reach the customer.

At the same spend, knowledge adds what more effort does not. What reviewers without knowledge miss is NEAR's
own: a method that is not `#[payable]` or asks no yoctoNEAR, a callback not given the token first, storage the
contract pays for a new account, gas left for a callback. Of the findings the audits missed, the team states real
ones too: about one item in four is a real flaw, of the audit or not; half are true and harmless notes, set apart.

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

## Documents (in Russian)

- [docs/GUIDE.md](docs/GUIDE.md): what to do, locally, on testnet, in a TEE on Phala, on Agent Market, on mainnet.
- [docs/PROTOCOL.md](docs/PROTOCOL.md): how it works: who sees what, money, threats, related projects.
- [docs/API.md](docs/API.md): the contract, the runner's HTTP API, settings, log events.

## Licence

MIT, see [LICENSE](LICENSE). The experts' materials taken from others keep their own licences, listed in
[eval/agents/SOURCES.md](eval/agents/SOURCES.md).
