# Where the experts' knowledge comes from

Each folder here is one expert of the evaluation ([../README.md](../README.md)). Three are built from audit
skills that security firms published in the open; the rest are invented.

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

## The contract under audit

The audit tasks point to `src/PuppyRaffle.sol` of
[Cyfrin/4-puppy-raffle-audit](https://github.com/Cyfrin/4-puppy-raffle-audit) at `df177a5`, a contract written
with known vulnerabilities for a security course. It is only linked, not copied here. The list of what a right
audit finds is the course's own report, `audit-data/2023-09-01-puppy-raffle.md` on the `audit-data` branch
(`3a71d27`): we did not write the answer key.

The second audit, the one nothing here was prepared for, points to `src/TSwapPool.sol` of
[Cyfrin/5-t-swap-audit](https://github.com/Cyfrin/5-t-swap-audit) at `7bd52c6`; its answer key is
`audit-data/2023-09-01-tswap-audit.md` on that repository's `audit-data` branch (`0290e26`).

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
