# The blind readings

The score of the audits on contracts nothing was prepared for ([README.md](README.md), "What the materials add").
Each answer was read by a reader that did not know whose it was: a separate model session that got the answers of
one batch under random two-letter names, the reference findings and the contract. Per finding its verdict is `S`
(stated as an item of its own), `P` (mentioned in passing, or taken back) or `A` (absent); the score is the
number of `S`. The reader also counted the test functions, noted whether the answer was cut off at the length
limit, and counted the findings outside the reference set that the code refutes ("wrong").

The swarm's answer with the three auditors named was put into every batch of its contract, so three readers
read it independently: their verdicts are the three rows it has below. Every row was checked against the files
by the text the reader quoted; three readers had swapped two names each, and those rows were put right.

## T-Swap pool (`second audit`, 7 findings)

| answer | verdicts, finding by finding | stated | tests | cut off | findings listed | wrong |
|---|---|---|---|---|---|---|
| alone, at once: DeepSeek-V4.1-Flash-1017 #1 | `SSSSSSS` | 7 | 2 | yes | 12 | 2 |
| alone, at once: DeepSeek-V4.1-Flash-1017 #2 | `SSSSSSA` | 6 | 4 | yes | 12 | 0 |
| alone, at once: Qwen3.8-27B #1 | `SASASAA` | 3 | 1 | no | 5 | 0 |
| alone, at once: Qwen3.8-27B #2 | `ASPASAA` | 2 | 1 | yes | 7 | 3 |
| alone, at once: kimi-k2.6 #1 | `SSSSSSA` | 6 | 6 | yes | 9 | 0 |
| expert solidity-attack-paths on DeepSeek-V4.1-Flash-1017 | `PSASSSA` | 4 | 2 | yes | 11 | 1 |
| expert solidity-attack-paths on Qwen3.8-27B | `AASASAA` | 2 | 0 | yes | 6 | 0 |
| expert solidity-attack-paths on kimi-k2.6 | `PSSAPSA` | 3 | 4 | no | 12 | 2 |
| expert solidity-bug-patterns on DeepSeek-V4.1-Flash-1017 | `SSSSSSA` | 6 | 0 | yes | 14 | 3 |
| expert solidity-bug-patterns on Qwen3.8-27B | `AAPASAA` | 1 | 2 | yes | 8 | 2 |
| expert solidity-bug-patterns on kimi-k2.6 | `SSSPSSA` | 5 | 3 | no | 13 | 2 |
| expert solidity-code-maturity on DeepSeek-V4.1-Flash-1017 | `SSSSSSA` | 6 | 4 | yes | 16 | 1 |
| expert solidity-code-maturity on Qwen3.8-27B | `AAAASAA` | 1 | 2 | no | 6 | 4 |
| expert solidity-code-maturity on kimi-k2.6 | `ASSASSA` | 4 | 4 | no | 14 | 4 |
| swarm | `AAASSAA` | 2 | 2 | no | 6 | 2 |
| swarm, experts named by the customer | `SSSSSSA` | 6 | 4 | no | 15 | 4 |
| swarm, experts named by the customer | `SSSSSSA` | 6 | 4 | no | 15 | 4 |
| swarm, experts named by the customer | `SSSSSSA` | 6 | 4 | no | 15 | 3 |

## Boss Bridge (`bridge audit`, 9 findings)

| answer | verdicts, finding by finding | stated | tests | cut off | findings listed | wrong |
|---|---|---|---|---|---|---|
| alone, at once: DeepSeek-V4.1-Flash-1017 #1 | `SASSSAAAA` | 4 | 2 | yes | 11 | 1 |
| alone, at once: DeepSeek-V4.1-Flash-1017 #2 | `SASSPSASA` | 5 | 2 | no | 13 | 1 |
| alone, at once: Qwen3.8-27B #1 | `AASSAPASA` | 3 | 2 | no | 11 | 2 |
| alone, at once: Qwen3.8-27B #2 | `PASSAPAAA` | 2 | 0 | yes | 9 | 3 |
| alone, at once: kimi-k2.6 #1 | `SASSAAAAA` | 3 | 4 | no | 12 | 2 |
| expert solidity-attack-paths on DeepSeek-V4.1-Flash-1017 | `SASSSSASA` | 6 | 1 | yes | 19 | 1 |
| expert solidity-attack-paths on Qwen3.8-27B | `PAASAPAAA` | 1 | 1 | yes | 8 | 0 |
| expert solidity-attack-paths on kimi-k2.6 | `SASSSAAAA` | 4 | 3 | no | 10 | 1 |
| expert solidity-bug-patterns on DeepSeek-V4.1-Flash-1017 | `SASPSAASA` | 4 | 2 | yes | 17 | 1 |
| expert solidity-bug-patterns on Qwen3.8-27B | `SASPSPAPA` | 3 | 2 | no | 8 | 0 |
| expert solidity-bug-patterns on kimi-k2.6 | `SASSAAAAA` | 3 | 6 | no | 9 | 3 |
| expert solidity-code-maturity on DeepSeek-V4.1-Flash-1017 | `SASSAAASA` | 4 | 3 | yes | 10 | 1 |
| expert solidity-code-maturity on Qwen3.8-27B | `PASSAAAPA` | 2 | 2 | no | 6 | 1 |
| expert solidity-code-maturity on kimi-k2.6 | `SASSPAAPA` | 3 | 4 | no | 7 | 2 |
| swarm, experts named by the customer | `SASSSAASA` | 5 | 3 | no | 11 | 0 |
| swarm, experts named by the customer | `SASSSAASA` | 5 | 3 | no | 11 | 0 |
| swarm, experts named by the customer | `SASSSAASA` | 5 | 3 | no | 11 | 0 |

## Thunder Loan (`loan audit`, 9 findings)

| answer | verdicts, finding by finding | stated | tests | cut off | findings listed | wrong |
|---|---|---|---|---|---|---|
| alone, at once: DeepSeek-V4.1-Flash-1017 #1 | `SAASSAAAS` | 4 | 0 | yes | 15 | 2 |
| alone, at once: DeepSeek-V4.1-Flash-1017 #2 | `PSSSAAAAA` | 3 | 0 | yes | 19 | 2 |
| alone, at once: Qwen3.8-27B #1 | `AAAAPAAAA` | 0 | 1 | yes | 1 | 0 |
| alone, at once: Qwen3.8-27B #2 | `AAAAPAAAA` | 0 | 0 | yes | 1 | 1 |
| alone, at once: kimi-k2.6 #1 | `SAAAPAAAA` | 1 | 1 | yes | 8 | 2 |
| expert solidity-attack-paths on DeepSeek-V4.1-Flash-1017 | `SASPSAAAA` | 3 | 1 | yes | 10 | 2 |
| expert solidity-attack-paths on Qwen3.8-27B | `PAAPPAAAA` | 0 | 1 | no | 6 | 2 |
| expert solidity-attack-paths on kimi-k2.6 | `SSAAAAAAS` | 3 | 2 | no | 10 | 2 |
| expert solidity-bug-patterns on DeepSeek-V4.1-Flash-1017 | `SPPSSAAAS` | 4 | 2 | yes | 17 | 2 |
| expert solidity-bug-patterns on Qwen3.8-27B | `PAAAPAAAA` | 0 | 2 | yes | 8 | 3 |
| expert solidity-bug-patterns on kimi-k2.6 | `AAASSAAAS` | 3 | 3 | no | 14 | 3 |
| expert solidity-code-maturity on DeepSeek-V4.1-Flash-1017 | `APASPAAAP` | 1 | 2 | no | 9 | 4 |
| expert solidity-code-maturity on Qwen3.8-27B | `AAAPPAAAA` | 0 | 2 | no | 5 | 2 |
| expert solidity-code-maturity on kimi-k2.6 | `PAASSAAAS` | 3 | 3 | no | 9 | 2 |
| swarm, experts named by the customer | `SAASSAAAS` | 4 | 3 | no | 16 | 6 |
| swarm, experts named by the customer | `SAPSSAAAS` | 4 | 3 | no | 16 | 5 |
| swarm, experts named by the customer | `SAASSAAAS` | 4 | 3 | no | 16 | 4 |

## The second round: a skill in passes, and an order after the router replaced its pick

One reader per contract. Each batch held answers that had been read before, to see whether this reader counts as
the earlier ones did: five of the six repeated counts are the same, one differs by one.

### Boss Bridge (9 findings)

| answer | verdicts, finding by finding | stated | tests | cut off | findings listed | wrong |
|---|---|---|---|---|---|---|
| alone, at once: DeepSeek-V4.1-Flash-1017 #2 (read before: 5) | `SASSPSASA` | 5 | 2 | no | 13 | 1 |
| expert solidity-attack-paths on DeepSeek-V4.1-Flash-1017 (read before: 6) | `SASSSSASA` | 6 | 1 | yes | 19 | 1 |
| swarm, experts named by the customer (read before: 5, three times) | `SASSSAASA` | 5 | 3 | no | 11 | 0 |
| swarm, placed without names after the router replaced its pick | `SASSAAASA` | 4 | 3 | no | 16 | 2 |
| the attack-paths skill in passes, on DeepSeek-V4.1-Flash-1017 | `SASSPPAAA` | 3 | 2 | yes | 10 | 0 |

### Thunder Loan (9 findings)

| answer | verdicts, finding by finding | stated | tests | cut off | findings listed | wrong |
|---|---|---|---|---|---|---|
| alone, at once: DeepSeek-V4.1-Flash-1017 #1 (read before: 4) | `SAASSAAAS` | 4 | 0 | yes | 15 | 4 |
| expert solidity-attack-paths on DeepSeek-V4.1-Flash-1017 (read before: 3) | `SASSSAAAA` | 4 | 1 | yes | 10 | 3 |
| swarm, experts named by the customer (read before: 4, three times) | `SAASSAAAS` | 4 | 3 | no | 16 | 6 |
| the attack-paths skill in passes, on DeepSeek-V4.1-Flash-1017 | `SPPPPSAAA` | 2 | 1 | yes | 17 | 4 |
