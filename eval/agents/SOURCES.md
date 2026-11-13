# Where the experts' knowledge comes from

Each folder here is one expert of the evaluation ([../README.md](../README.md)). Two are built from audit
skills that security firms published in the open under the MIT licence, two hold case-books we wrote from public
audit reports (one of them with NEAR's own documentation and standards beside it); the rest are invented.

## Built from open-source audit skills

These experts are built from the published material. They are not those firms and are not endorsed by them.

| expert | source | licence | what was taken | changes |
|---|---|---|---|---|
| `solidity-attack-paths` | [pashov/skills](https://github.com/pashov/skills) at `eacfc09`, `solidity-auditor/references/` | MIT, Copyright (c) 2024 AI Skills Contributors | the twelve `hacking-agents/*-agent.md` and `judging.md` | reworded from prompts for an AI agent into a reviewer's checklist; the output-format sections removed. As published, the files did not pass our entry audit, which refuses materials that give orders to an AI |
| `solidity-bug-patterns` | [quillai-network/quillshield_skills](https://github.com/quillai-network/quillshield_skills) at `8bdd3c0`, `plugins/*/skills/*/references/` | MIT, Copyright (c) 2025 QuillShield | fourteen reference files on reentrancy, denial of service, arithmetic, external calls, invariants, guards, oracles, signatures, proxies | none: a source line was added on top of each file |

Every knowledge file starts with its own source line; both sources are under the MIT licence below.
`expertise.md` and `method.md` in each folder are ours.

A third Solidity auditor, `solidity-case-book`, holds no firm's material: 121 kinds of findings that audits and
audit contests of real protocols have reported, restated in our own words from 58 public reports (Code4rena,
Sherlock, Pashov Audit Group, OpenZeppelin, Sigma Prime, Zellic;
[the list](solidity-case-book/CASEBOOK-SOURCES.md)). No sentence, table or code of a report is in it and it names
no project. It replaces `solidity-code-maturity`, which was built from Trail of Bits' skills under CC BY-SA 4.0 and
took part in the runs that [../RESULTS.md](../RESULTS.md) and [../BLIND.md](../BLIND.md) record under that name;
its files are no longer in this repository, and the session that wrote the case-book was told not to open them.

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

## The NEAR reviewer: open material and our own

One reviewer of NEAR contracts in Rust, `near-contract-review` in [../../agents](../../agents), holds everything we
have on NEAR. At first there were three (one for NEAR's security guide, one for the standards, one for our own
checklist); read blind on a held-out contract, the reviewer with our case-book carried three of the four findings
of the audit that the three stated, the guide one, the standards none of their own, so the three were made one.

Part of its knowledge is what NEAR publishes, as published; it is not NEAR Foundation and is not endorsed by it.

| files in its `knowledge/` | source | licence | what was taken | changes |
|---|---|---|---|---|
| `guide-*.md` (14 files) | [near/docs](https://github.com/near/docs) at `7be61a4`, `smart-contracts/security/` and `smart-contracts/anatomy/best-practices.mdx` | MIT and Apache-2.0 (`LICENSE-MIT.txt`, `LICENSE-APACHE.txt` at the root; the MIT text is the one below, it names no copyright holder) | the security checklist and the thirteen pages on the risks it names; the best practices page | page markup, front matter and links inside the site taken off; the words are as written |
| `nep-*.md` (6 files) | [near/NEPs](https://github.com/near/NEPs) at `095fe98`, `neps/` | each proposal ends "Copyright and related rights waived via CC0" | NEP-141, NEP-145, NEP-148, NEP-297, NEP-171, NEP-178 | the sections that are not the standard taken off: reference implementation, drawbacks, future possibilities, history, changelog, errata, copyright |

The rest is ours: a checklist we wrote (`near-review-checklist.md`), the order an audit goes in
(`procedure-how-an-audit-goes.md`) and a case-book (`cases-*.md`): 87 kinds of findings that audits of NEAR contracts have reported, restated in our own
words from 47 public reports of 16 firms ([the list](../../agents/near-contract-review/CASEBOOK-SOURCES.md)). No
sentence or code of a report is in it, and it names no project. It was written by a session that was not shown the
findings this evaluation scores against and was told not to open any report on a contract measured here; it does
rest on reports about other contracts of some of the same projects (Ref Finance, Octopus Network, Sweat, Meta Pool),
as an auditor's experience would. BlockSec's `rustle` has a good catalogue of detectors, but it is under AGPL-3.0:
nothing here is taken from it.

The NEAR reviews are scored against audits other people published: BlockSec's reports in
[blocksecteam/audit-reports](https://github.com/blocksecteam/audit-reports) (`rust/`), Halborn's in
[HalbornSecurity/PublicReports](https://github.com/HalbornSecurity/PublicReports) ("NEAR Smart Contract Audits"),
Guvenkaya's in [Guvenkaya/public-reports](https://github.com/Guvenkaya/public-reports), Trail of Bits' in
[trailofbits/publications](https://github.com/trailofbits/publications) (`reviews/`) and OtterSec's Mintbase report
as collected in [NEARBuilders/audits](https://github.com/NEARBuilders/audits),
each tied to a commit of the contract it audited; for one contract also the project's own report of an exploit.
A second search went through every firm with public reports on NEAR contracts and through the audits that
projects keep in their own repositories (about ninety repositories): most reports were of no use here, because the
audited code is private or gone, the report has fewer than five findings, or its findings are spread over more
code than an expert is given.
Most of the contracts and the reports carry no licence, so they are only linked from the tasks
([../review-tasks.ts](../review-tasks.ts) names every commit and report), never copied here. We looked for
contracts audited by several firms or in an open contest, to have fuller lists: no contest on a NEAR contract has
a public list of findings, and of the three contracts with reports of several firms only one (Stader's NearX) has
them on nearly the same code.

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
