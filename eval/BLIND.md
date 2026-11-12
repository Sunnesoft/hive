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

## The third round: the same twelve passes, merged by the composer, and joined by code

One reader per contract and version, each batch with answers read before (their counts came out the same, but
for one that differs by one). For the list joined by code the reader checked every fifth item against the code.

| answer | Boss Bridge: verdicts | stated | Thunder Loan: verdicts | stated |
|---|---|---|---|---|
| alone, at once: DeepSeek-V4.1-Flash-1017 | `SASSPSASA` | 5 | `SAASSAAAS` | 4 |
| swarm, experts named by the customer | `SASSSAASA` | 5 | `SAASSAAAS` | 4 |
| the passes, then one verdict call | `SASSPSAAA` | 4 | `SPPPPSAAA` | 2 |
| the passes, merged by the composer | `SASSAAASA` | 4 | `SPAASSAAA` | 3 |
| the passes, joined by code | `SSSSSSASA` | 7 | `SSSSSSPSA` | 7 |

The list joined by code: 113 items on the bridge, about 34 of them distinct; 111 on the loan, about 35 distinct. Of
the sampled items outside the reference set, 3 of 14 are wrong on the bridge (7 hold, 4 cannot be told from the
code shown) and 6 of 17 on the loan (9 hold, 2 cannot be told).


## The review, first trials (`bridge audit`, 9 findings)

One reader, five answers under random names, 2026-11-12. For answers that end with a "Not confirmed" list the
reader gave `L` to a reference finding stated only there. The reader's count of items, of distinct flaws among
them, of distinct items the code refutes, of lines in the "Not confirmed" list and of test functions:

| answer | verdicts, finding by finding | stated | items | distinct | wrong | not confirmed | tests | cut off |
|---|---|---|---|---|---|---|---|---|
| a review by solidity-attack-paths on Qwen3.8-27B (trial 2) | `LALSPSAAA` | 2 | 9 | 7 | 2 | 13 | 5 | no |
| a review by solidity-attack-paths on DeepSeek-V4.1-Flash-1017 (trial 3) | `SASSSSALA` | 5 | 38 | 19 | 3 | 12 | 5 | no |
| swarm, experts named by the customer | `SASSSAASA` | 5 | 11 | 11 | 0 | | 3 | no |
| alone, at once: DeepSeek-V4.1-Flash-1017 #1 | `SASSSAPAA` | 4 | 11 | 10 | 1 | | 2 | yes |
| expert solidity-attack-paths on DeepSeek-V4.1-Flash-1017 | `SASSSSASA` | 6 | 16 | 13 | 1 | | 1 | yes |

The three earlier answers are in the table above, read by other readers: 5, 4 and 6 stated. This reader gave them
the same counts, and the same verdict on every finding but one (finding 7 of DeepSeek alone: `P` here, `A` there).

## The review after the first fixes (`bridge audit`, 9 findings)

A second reader, six answers under random names, the evening of 2026-11-12: two new reviews, the review of the
first reading again and the same three earlier answers. `P` also for a reference finding that stands only in a
"The same was raised as" line.

| answer | verdicts, finding by finding | stated | items | distinct | wrong | not confirmed | tests | cut off |
|---|---|---|---|---|---|---|---|---|
| a review on DeepSeek in every step, passes told what was raised (trial 4; its fifteen minutes ended after 15 of 69 checks) | `SASSPSAAA` | 4 | 9 | 8 | 1 | 11 | 0 | no |
| a review with Qwen3.8-27B reading and DeepSeek judging (trial 5) | `SASPAPAAA` | 2 | 8 | 6 | 2 | 0 | 5 | no |
| a review by solidity-attack-paths on DeepSeek (trial 3, read again) | `SASSSSALA` | 5 | 38 | 18 | 3 | 12 | 5 | no |
| swarm, experts named by the customer | `SASSSAASA` | 5 | 11 | 11 | 0 | | 3 | no |
| alone, at once: DeepSeek-V4.1-Flash-1017 #1 | `SASSSAPAA` | 4 | 11 | 10 | 1 | | 2 | yes |
| expert solidity-attack-paths on DeepSeek-V4.1-Flash-1017 | `SASSSSASA` | 6 | 16 | 11 | 1 | | 1 | yes |

The four answers both readers read got the same verdict on every finding from both.

## A NEAR contract (`convertor audit`, 11 findings of BlockSec's report)

One reader, five answers under random names, the evening of 2026-11-12. Every answer was made on
Qwen3.6-35B-A3B: that evening it was the one model at NEAR AI that answered in time.

| answer | verdicts, finding by finding | stated | as "not confirmed" | items | distinct | wrong | tests | cut off |
|---|---|---|---|---|---|---|---|---|
| alone, at once: Qwen3.6-35B-A3B | `SSPAAAAAAAA` | 2 | | 7 | 8 | 3 | 1 | yes |
| a review by near-contract-review | `SAPAAAAPPAA` | 1 | 0 | 8 | 8 | 3 | 0 | no |
| a review by near-standards | `SASAAAALAAA` | 2 | 1 | 9 | 8 | 4 | 3 | no |
| a review by near-security-guide | `SSSAAAALPAP` | 3 | 1 | 8 | 6 | 2 | 3 | no |
| the three reviews joined | `SSSAAAALPAP` | 3 | 1 | 20 | 15 | 6 | 5 | no |

The reader's notes: the model alone states both rate flaws in one item (a strict "item of its own" makes one of
them `P`). Findings 1 to 3 are the report's two High findings and its Medium; 4 to 8 its Low ones; 9 to 11
recommendations.
