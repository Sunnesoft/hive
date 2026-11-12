# Does the swarm answer better? How we measure it

Two claims, each put to a test anyone can run again:

1. **An expert with knowledge answers what a model alone cannot.**
2. **A swarm answers what no single expert can, in one answer, and the customer pays only the experts the task needed.**

And a third thing to check: **every way the swarm works does what it says**, with real models and the real contract.

The numbers are in [RESULTS.md](RESULTS.md), written by the script. This page is the method.

## The idea: facts fixed in advance

A model's answer can sound right and be wrong, so we do not grade by impression. Every task has a short list of
facts a right answer must contain, written in [tasks.ts](tasks.ts) before any answer was read. An answer is
scored by how many of them it contains.

To know where a fact came from, three of the experts hold knowledge that exists nowhere else. Orrin Bridge,
Halden Stake and Calder Fund are invented organisations ([agents/](agents)); their fees, limits and incidents were
made up for this test. No model was trained on them, so an answer that has such a fact got it from an expert.
Two more experts hold public but specialised knowledge ([../agents/](../agents)), where a strong model alone may
do well: that is the hard case for us, and it is in the test.

## The tasks

| group | tasks | what it tests |
|---|---|---|
| private, one expert | 3 | knowledge against no knowledge |
| private, several experts | 3 | a task that crosses two or three experts: the swarm's reason to exist |
| public, specialised | 2 | the same on public knowledge, where a model alone is not helpless |
| no record | 2 | the thing asked about does not exist: the right answer says so and names no value |

## Five ways to answer the same task

| way | what it is |
|---|---|
| model alone | The question goes to a model with no knowledge: once to the model the protocol runs on, once to the strongest model the swarm allows. It may think first and is told to say when it does not know. |
| one expert alone | One expert gets the whole task with its own knowledge, model and template: no router, no check, no composer. We report the best one per task. |
| experts apart | Every expert of the pool gets the whole task, and the customer reads all the answers. Facts count if any answer has them; cost and length add up. |
| swarm | The product itself: an order of 4 USDC placed in the contract on testnet, served by the runner, settled by the contract. |
| swarm, stronger composer | The same contributions composed again by the strongest model. The runner's trace holds exactly what its composer was given, so only that one step differs. |

## How an answer is scored

- **Facts found**: each fact has a pattern that only its own value satisfies (`22 Tgas`, `0.00412`, `99.2%`). No
  model takes part, and the same answer always gets the same score.
- **By the judge**: a second opinion. A model from another family than the one that composes the swarm's answers
  sees the facts and one answer, not who wrote it, and says which facts are stated. Where the two counts
  differ, look at the answer.
- **Invented**, for the "no record" tasks: did the answer give a cause or an amount for something that does
  not exist? The judge decides; with two tasks we also read every answer by hand.
- **Model cost, seconds, characters**: what the answer cost at NEAR AI, how long it took, how much the customer
  has to read. For the swarm the cost and the time come from the runner's trace.

For the swarm we also record which experts the router took against the experts the task needs, and what the
contract charged and returned.

## Ways of working, each tried once

Real models, real contract, pass or fail read from the runner's trace: a task nobody has skills for; a harmful
task; a budget that pays for no expert; an expert named by the customer; instructions hidden in the task; a
request to print an expert's materials word for word; a page given by link; a hire on Agent Market, a rework
within the task and a change that is new work (against the repository's stand-in of the market); and an expert
whose materials carry instructions for an AI, at the entry audit.

## Run it

```bash
npm run start:testnet                       # a runner on testnet with TRACE_DIR set (it needs DEV_KEY: no TEE)
npm run stand-ins                           # the stand-in of Agent Market, for the market's modes
scripts/swarm.sh join eval/agents/<name> 2  # once for each of the three invented experts; agents/* likewise
CUSTOMER=<account with test USDC> npm run eval -- bare solo swarm compose modes market score
```

Every stage keeps what it got in `eval/out/`, so a second run pays only for what is missing; delete the folder
to start over. The whole evaluation stops when it has spent `EVAL_LIMIT_USD` (0.45) at NEAR AI.

## What the first run showed (2026-11-12)

- **Knowledge against none.** On private facts the two bare models found 1 and 0 of 22; the swarm found 22 of 22. On
  public specialised knowledge the protocol's model alone found 2 of 8 and the strongest model 6 of 8; the swarm 8 of 8.
- **A swarm against one expert.** On tasks that cross experts the best single expert found 6 of 12, the swarm 12 of 12.
- **A swarm against experts asked apart.** The same facts, in half the text (2,013 characters against 4,052),
  and the customer pays only the experts the router took: 1.16 USDC for a one-expert task, where asking all
  three apart would cost three rates.
- **Routing.** The router took exactly the experts each task needs, 10 times of 10.
- **Nothing to find.** Nobody invented an answer. Asked alone, the expert says there is no record and lists what
  it does have; the swarm declined both orders and the contract returned the money in full.
- **A stronger composer does not help.** It found no more facts, dropped one on the public tasks and cost about
  1.7 times as much. The same model, used as the judge, hit the provider's rate limit at 60 calls at once. The
  swarm keeps one protocol model.
- **Cost and time.** A swarm answer cost $0.001 to $0.006 in model calls and took 40 to 130 seconds, by group
  average. A bare model that thinks first cost more ($0.006 to $0.02) and took 60 to 170 seconds.
- **All eleven ways of working passed.**

## What this does not show

- **Ten tasks, one run.** It shows the direction and the size of the gap, not a confidence interval.
- **We wrote the knowledge and the questions.** The private facts are synthetic on purpose; what real owners
  bring will be messier. The invented knowledge is small (5 to 6 kB each), so every question saw nearly all of
  it: this run does not test search inside a large knowledge base.
- **Wrong values are not counted.** We tried: the judge marked a value "wrong" mostly where an answer had said
  "no record". Read by hand, the one real case was the protocol's model alone inventing a whole grant programme
  (amount, schedule and deadline) for the Build tier question; the other 11 bare answers on private tasks said
  they did not know.
- **A fact found is not an answer verified.** The patterns check that the right values are there, not that
  everything else in the answer is true.
- **An honest "no record" is refunded, not delivered.** The check that pays experts counts it as no answer, so
  the customer gets the money back but not the expert's "there is no such incident".
