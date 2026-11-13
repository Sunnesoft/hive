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

A second reader read the model alone and the joined reviews again, with two stronger models asked alone and the
joined reviews with the controller's word under each finding (`P` also for a finding that stands only in a
"Second opinion" line). DeepSeek's answer is the one that came back once replies were read as a stream.

| answer | verdicts, finding by finding | stated | as "not confirmed" | items | distinct | wrong | tests | cut off |
|---|---|---|---|---|---|---|---|---|
| alone, at once: DeepSeek-V4.1-Flash-1017 | `SAPAAAAPAAA` | 1 | | 7 | 7 | 4 | 1 | yes |
| alone, at once: kimi-k2.6 | `SAPAAAASAAP` | 2 | | 13 | 12 | 6 | 2 | no |
| alone, at once: Qwen3.6-35B-A3B | `SSAAAAAAAAA` | 2 | | 7 | 7 | 3 | 1 | yes |
| the three reviews joined | `SSSAAAALPAP` | 3 | 1 | 20 | 18 | 10 | 5 | no |
| the three reviews joined, with the controller (kimi-k2.6) | `SSSAAAPLPAP` | 3 | 1 | 20 | 18 | 10 | 5 | no |

Both readers gave the model alone 2 and the joined reviews 3 and 1. This reader counts more of the joined
findings wrong, 10 of 18 against 6 of 15. Of the controller's 14 doubts, 9 are on those 10; one is on a finding
that is right (finding 3, whose mechanism the doubt itself describes); two wrong findings carry no doubt.

## A second NEAR contract (`vesting audit`, 11 findings of BlockSec's report)

One reader, four answers under random names, the night of 2026-11-12. The reviewers' answer is the list of
findings of order-38, an audit ordered through the contract on testnet from the three NEAR reviewers on
Qwen3.6-35B-A3B, with the controller on kimi-k2.6 (`D`: a reference finding stated under "Findings the
controller doubts"); what the composer's model wrote before that list was left out. The models alone had 4,000
tokens to answer with.

| answer | verdicts, finding by finding | stated | items | distinct | wrong | not confirmed | tests | cut off |
|---|---|---|---|---|---|---|---|---|
| order-38: the three reviews joined, with the controller | `AASPSAAAAAA` | 2 | 14 | 11 | 7 | 5 | 2 | no |
| alone, at once: Qwen3.6-35B-A3B | `AAPASSAASAA` | 3 | 5 | 5 | 1 | | 2 | no |
| alone, at once: kimi-k2.6 | `AASPSSAPSAA` | 4 | 9 | 9 | 3 | | 3 | yes |
| alone, at once: DeepSeek-V4.1-Flash-1017 | `SPSSSSASSAA` | 7 | 10 | 10 | 0 | | 2 | yes |

The three models together state findings 1, 3, 4, 5, 6, 8 and 9: seven. Of the controller's six doubts five are
on findings the reader calls wrong and one on a finding that is right but rated too high.

### The same contract after the changes

The contract was reviewed again outside the chain: the reviewers read the files themselves before their passes and
judge with three different models (DeepSeek, kimi-k2.6, Qwen3.6-35B; all passes on Qwen3.6-35B). The models alone
had 8,000 tokens. One reader, four answers. In the reviewers' answer of that reading, findings a model had named
the same were folded into one, and what the controller doubted stood under a heading of its own (`D`).

| answer | verdicts, finding by finding | stated | items | distinct | wrong | not confirmed | cut off |
|---|---|---|---|---|---|---|---|
| alone, with room: Qwen3.6-35B-A3B | `AASAAAAASPA` | 2 | 10 | 8 | 2 | | no |
| alone, with room: kimi-k2.6 | `AASASPAASAS` | 4 | 10 | 9 | 3 | | no |
| alone, with room: DeepSeek-V4.1-Flash-1017 | `SASPSPASSAS` | 6 | 18 | 15 | 3 | | no |
| the three reviews joined, similar findings folded, with the controller | `SPPASAASSAS` | 5 | 18 | 17 | 8 | 5 | no |

The three models together state findings 1, 3, 5, 8, 9 and 11: six. In the reviewers' answer finding 3 (the owner
removes a vesting with tokens unclaimed) had been confirmed for all three reviewers, in five wordings; folded into
one, they stood under the title of a sixth, wrong one, and the controller doubted the lot.

Then the same three reviews were joined again by the code as it is now, with similar findings side by side and a
doubt left under its finding (`D`: every item that states the reference finding carries the controller's doubt),
and put beside what the reviewers had raised with no check at all (every record of every reading and pass, joined
by code where the words are the same). Two readers read the three answers independently, in different order.

| answer | verdicts, both readers | stated | items | distinct | wrong | Critical or High: items, distinct, real |
|---|---|---|---|---|---|---|
| alone, with room: DeepSeek-V4.1-Flash-1017 (the third reading of this answer) | `SASPSPASSAS` | 6 | 18 | 16-17 | 4-5 | 2, 2, 2 |
| the three reviews joined, similar findings side by side, with the controller | `DDSADAASSAD` | 7, of which 4 doubted | 26 | 23 | 11 | 9, 8, 2 |
| everything the three reviewers raised, no check | `SSSASAASSAP` | 6 | 106 | 51-52 | 30-31 | 37, 16-17, 4-5 |

The two readers gave every answer the same eleven letters, and the answer of DeepSeek alone the letters its first
reader had given it. Of the controller's 16 doubts both count 10 as right (9 of the 11 wrong findings and one that
is no flaw) and 6 as mistaken: on both items that state finding 5, on findings 1, 2 and 11, and on a Low one
outside the list. Two wrong findings carry no doubt. Finding 11 was raised with its direction wrong ("finishes a second early"), which
is why the unchecked list has it as `P`; the check wrote it right.

## A third NEAR contract (`xref audit`, 6 findings of BlockSec's report)

The last contract of the development set, reviewed once with the code as it stood after the vesting contract (no
controller). Two readers, four answers, different order; they gave every answer the same six letters.

| answer | verdicts, both readers | stated | items | distinct | wrong | Critical or High: items, distinct, real | not confirmed, real |
|---|---|---|---|---|---|---|---|
| alone, with room: Qwen3.6-35B-A3B | `AAAAAA` | 0 | 8 | 6 | 2 | 5, 4-5, 1 | |
| alone, with room: kimi-k2.6 | `SASAAS` | 3 | 14 | 10 | 3 | 2, 2, 1 | |
| alone, with room: DeepSeek-V4.1-Flash-1017 | `PSPAAS` | 2 | 12 | 12 | 4 | 2, 2, 1 | |
| the three reviews joined | `PSSAAS` | 3 | 38 | 30 | 15-16 | 15, 13, 0 | 13, 0 |

The three models together state findings 1, 2, 3 and 6: four. Finding 6 is `S` for three answers on a lenient
reading (they word the missing gas check as an underflow of the subtraction; read strictly all three are `P`).

## The first held-out NEAR contract (`sweat token audit`, 9 findings of Guvenkaya's report)

Read by the measures of [README.md](README.md), "How a review is measured": besides the letter for each finding of
the audit, the readers class every item of an answer ([READER.md](READER.md)), and [score.ts](score.ts) counts.
Two readers, four answers, different order. `L`: stated only as not confirmed.

| answer | reader A | reader B | stated | claims | real | wrong | false Critical or High |
|---|---|---|---|---|---|---|---|
| alone, with room: DeepSeek-V4.1-Flash-1017 | `PPASPSSPP` | `PPASPSSPP` | 3 | 18 | 3 | 2 | 3 |
| alone, with room: kimi-k2.6 | `AAAAAASSP` | `AAAAAASSP` | 2 | 15 | 2 | 5-6 | 5 |
| alone, with room: Qwen3.6-35B-A3B | `AAAASASAP` | `AAAASASAP` | 2 | 6 | 2 | 2-3 | 2 |
| the three NEAR reviews joined | `APSASPSSP` | `AASASASSP` | 4 | 25-26 | 5 | 4-5 | 1 |

The readers agree on every `S`; they differ on whether two findings are in passing or absent in the reviews'
answer. The three models together state findings 4, 5, 6, 7 and 8: five. In the reviews' answer finding 5 was
confirmed by the reviewer built from the security guide, findings 3, 7 and 8 by the reviewer with our case-book
(3 by the standards reviewer too).

## Teams on the third development contract (`xref audit` again)

The same contract reviewed by three Solidity auditors and by the NEAR reviewer with all of NEAR's knowledge in it;
the answers of the mixed team and of the NEAR reviewer alone, read with the three models' answers by two readers.

| answer | reader A | reader B | stated | claims | real | wrong | false Critical or High |
|---|---|---|---|---|---|---|---|
| alone, with room: DeepSeek-V4.1-Flash-1017 | `PSPAAS` | `PSPAAP` | 1-2 | 12 | 1-2 | 4 | 1 |
| alone, with room: kimi-k2.6 | `SASAAS` | `SASAAP` | 2-3 | 14 | 2-3 | 4 | 1 |
| alone, with room: Qwen3.6-35B-A3B | `AAAAAA` | `AAAAAA` | 0 | 8 | 0 | 2-3 | 5 |
| the NEAR reviewer alone | `LSAPSP` | `LSAPSP` | 2 | 16 | 3 | 3 | 0 |
| three Solidity auditors and the NEAR reviewer | `SSPSPS` | `SSPSPP` | 3-4 | 37-38 | 4-5 | 8-9 | 1 |

The one letter the readers differ on is finding 6, in three answers alike: all three word the missing gas check
as an underflow of the subtraction, which one reader takes for the finding and the other for half of it. In the
mixed team's answer finding 4 was confirmed by the auditor of attack paths alone, finding 1 by the auditor of bug
patterns alone, finding 2 by all four. Finding 5, which the NEAR reviewer alone states, is `P` in the mixed answer:
folded there under finding 6's wording.

## A held-out NEAR contract, the team of six (`cnear audit`, 7 findings of Trail of Bits' report)

Two readers, four answers, different order. They gave every answer the same seven letters.

| answer | verdicts, both readers | stated | claims | real | wrong | false Critical or High |
|---|---|---|---|---|---|---|
| alone, with room: DeepSeek-V4.1-Flash-1017 | `APSPPSS` | 3 | 11 | 3 | 1-2 | 1 |
| alone, with room: kimi-k2.6 | `APASAAS` | 2 | 11 | 2 | 2 | 2 |
| alone, with room: Qwen3.6-35B-A3B | `AAAAAAS` | 1 | 10 | 1 | 3-4 | 2 |
| the team of six | `PSSSLSS` | 5 | 27 | 5 | 2-5 | 0 |

The three models together state findings 3, 4, 6 and 7: four. The team states 2, 3, 4, 6 and 7 and has 5 among
what it did not confirm. Finding 2 was confirmed by all six reviewers, 7 by all six, 3 by four, 4 by three, 6 by
the NEAR reviewer alone. The readers differ on how many of the team's items are wrong (two or five): three of them
turn on code that is not in the file.
