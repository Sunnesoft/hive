# What's next

The big items left after the hackathon, in the order we would do them. Each says why it matters and what it takes.

## 1. Reworks and disputes for orders placed in the contract

**Why.** An order placed in the contract has one answer: the customer pays only for the parts that passed the
checks, but cannot ask for changes or contest the answer. On Agent Market both exist, by the market's rules.

**What.** A round of changes inside the order's budget (the contract keeps the order open for a grace period after
`deliver`, and a `rework` call from the customer starts a round, as many as the order bought). A dispute the
customer opens before the money settles: an arbiter the order named in advance (a DAO, a panel of experts, or the
protocol's arbiter model in the TEE) rules redo, split or refund, and the contract settles by the ruling. The
experts' pay waits for the grace period to end.

## 2. The task bound to its customer in the contract itself

**Why.** Today the runner refuses a copied hash: the hash commits to the customer's account, and the runner checks
it against `order.customer`. That holds as long as the runner is honest; the contract could hold it too.

**What.** The customer sends `c = sha256(salt, text)`; the contract stores `sha256(caller, c)`. A copy of `c` from
another account names a different order.

## 3. A stronger protocol model on NEAR AI, and fewer repeats

**Why.** On the first mainnet order (the SWEAT callback exploit, see the README) one expert found the exploited
`ft_resolve_transfer`, and the trial on Qwen3.8-27B graded it Low: the arbiter wrote that the caller gains nothing.
On NEAR AI's own models the swarm lets 11% wrong items through (about 2% on Haiku), and about a quarter of
an answer's items repeat an earlier one. The protocol's steps (sorting repeats, the arbiter) run on Qwen3.8-27B.

**What.** The arbiter and the sorting on the strongest model NEAR AI offers; repeats sorted once more after the
trial, place by place; measured again on the eight contracts.

## 4. The Agent Market listing

**Why.** The integration works in code and in e2e (direct hire, reworks, disputes, payouts to the cent), but the
public listing is not published, and bids on board tasks are off.

**What.** Publish the listing, point `MARKET_LISTING_URL` at it, turn `BIDS` on within the daily budget.

## 5. Other kinds of task, measured

**Why.** Only audits of smart contracts are measured. The same mechanism serves tokenomics reviews, legal and
compliance documents, due diligence, grant reviews and research with sources, but nothing shows how well yet.

**What.** For each kind, a set of tasks with a published reference answer, read blind as the audits were.

## 6. Mainnet

- A reproducible contract build, linked to this repository.
- A multisig owner, `delay_secs` above zero, no full-access key left on the contract's account.
- Separate NEAR AI keys for the runner and for measurements, each with its own spend limit.
- A NEAR buffer on the contract's account for storage, watched.

## Smaller items

- A spare expert on every team already joins when the budget allows; measure how often it saves a part.
- A free check before paying: which experts would take this task (by embeddings, rate-limited).
- The sponsor's daily cap in `/app` (today: `scripts/swarm.sh daily-cap`).
- The low-risk items still open after the security reviews of 14 November ([PROTOCOL.md](PROTOCOL.md#current-limits), "Current limits").
