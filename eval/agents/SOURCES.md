# Where the experts' knowledge comes from

Each folder here is one expert of the evaluation ([../README.md](../README.md)). Three are built from audit
skills that security firms published in the open, two from NEAR's own documentation and standards; the rest are
invented.

## Built from open-source audit skills

These experts are built from the published material. They are not those firms and are not endorsed by them.

| expert | source | licence | what was taken | changes |
|---|---|---|---|---|
| `solidity-attack-paths` | [pashov/skills](https://github.com/pashov/skills) at `eacfc09`, `solidity-auditor/references/` | MIT, Copyright (c) 2024 AI Skills Contributors | the twelve `hacking-agents/*-agent.md` and `judging.md` | reworded from prompts for an AI agent into a reviewer's checklist; the output-format sections removed. As published, the files did not pass our entry audit, which refuses materials that give orders to an AI |
| `solidity-code-maturity` | [trailofbits/skills](https://github.com/trailofbits/skills) at `39e10bd`, `plugins/building-secure-contracts` and `plugins/fp-check` | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), Copyright Trail of Bits | `ASSESSMENT_CRITERIA.md`, `ASSESSMENT_AREAS.md`, `ASSESSMENT_CATEGORIES.md`, `WORKFLOW_STEPS.md`, `false-positive-patterns.md` | none: a source line was added on top of each file |
| `solidity-bug-patterns` | [quillai-network/quillshield_skills](https://github.com/quillai-network/quillshield_skills) at `8bdd3c0`, `plugins/*/skills/*/references/` | MIT, Copyright (c) 2025 QuillShield | fourteen reference files on reentrancy, denial of service, arithmetic, external calls, invariants, guards, oracles, signatures, proxies | none: a source line was added on top of each file |

Every knowledge file starts with its own source line. The files of `solidity-code-maturity/knowledge` stay under
CC BY-SA 4.0; the others under the MIT licence below. `expertise.md` and `method.md` in each folder are ours.

The MIT licence, as both MIT sources give it:

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
> documentation files (the "Software"), to deal in the Software without restriction, including without limitation
> the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
> to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of
> the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
> THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
> CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
> IN THE SOFTWARE.

## Built from NEAR's own open material

Two reviewers of NEAR contracts in Rust. They are built from what NEAR publishes; they are not NEAR Foundation and
are not endorsed by it. [build-near-experts.py](build-near-experts.py) makes both folders from clones of the two
repositories.

| expert | source | licence | what was taken | changes |
|---|---|---|---|---|
| `near-security-guide` | [near/docs](https://github.com/near/docs) at `7be61a4`, `smart-contracts/security/` and `smart-contracts/anatomy/best-practices.mdx` | MIT and Apache-2.0 (`LICENSE-MIT.txt`, `LICENSE-APACHE.txt` at the root; the MIT text is the one below, it names no copyright holder) | the security checklist and the thirteen pages on the risks it names; the best practices page | page markup, front matter and links inside the site taken off; the words are as written |
| `near-standards` | [near/NEPs](https://github.com/near/NEPs) at `095fe98`, `neps/` | each proposal ends "Copyright and related rights waived via CC0" | NEP-141, NEP-145, NEP-148, NEP-297, NEP-171, NEP-178 | the sections that are not the standard taken off: reference implementation, drawbacks, future possibilities, history, changelog, errata, copyright |

A third reviewer of NEAR contracts, `near-contract-review` in [../../agents](../../agents), holds a checklist we wrote
ourselves. BlockSec's `rustle` has a good catalogue of detectors, but it is under AGPL-3.0: nothing here is taken from it.

The NEAR reviews are scored against audits other people published: BlockSec's reports in
[blocksecteam/audit-reports](https://github.com/blocksecteam/audit-reports) (`rust/`), each tied to a commit of the
contract it audited. The contracts and the reports carry no licence, so they are only linked from the tasks, never
copied here.

## The contract under audit

The audit tasks point to `src/PuppyRaffle.sol` of
[Cyfrin/4-puppy-raffle-audit](https://github.com/Cyfrin/4-puppy-raffle-audit) at `df177a5`, a contract written
with known vulnerabilities for a security course. It is only linked, not copied here. The list of what a right
audit finds is the course's own report, `audit-data/2023-09-01-puppy-raffle.md` on the `audit-data` branch
(`3a71d27`): we did not write the answer key.

The second audit, the one nothing here was prepared for, points to `src/TSwapPool.sol` of
[Cyfrin/5-t-swap-audit](https://github.com/Cyfrin/5-t-swap-audit) at `7bd52c6`; its answer key is
`audit-data/2023-09-01-tswap-audit.md` on that repository's `audit-data` branch (`0290e26`). Two more of the same
kind: `src/L1BossBridge.sol` of [Cyfrin/7-boss-bridge-audit](https://github.com/Cyfrin/7-boss-bridge-audit) at
`d59479c` (report `audit-data/2023-09-01-boss-bridge-audit.md`, `7ec1e86`) and `src/protocol/ThunderLoan.sol` of
[Cyfrin/6-thunder-loan-audit](https://github.com/Cyfrin/6-thunder-loan-audit) at `2250d81` (report
`audit-data/2023-09-01-thunder-loan.md`, `20f617f`).

## Invented

Nothing in these is real: the organisations, the law, the studies and every figure were made up, so that no model
can know them and an answer that has them got them from the expert.

| expert | what it holds |
|---|---|
| `orrin-bridge-desk`, `halden-validator-ops`, `calder-grants-desk` | the desks of three invented NEAR organisations |
| `sorvia-games-law` | the Community Games Act of Sorvia, a country that does not exist |
| `fundraising-economics` | the "Fenwick benchmark" of community raffles |
| `estate-sociology` | the "Nine Estates Study" |
| `play-safeguards` | the "Marlow trials" of safeguards in small-stakes games |
