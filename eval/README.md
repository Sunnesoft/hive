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
| one field, three schools | 1 | an audit of a contract with known vulnerabilities by three auditors whose knowledge comes from three different firms' open skills: what does a second and a third expert of the same field add? |
| four fields | 1 | one decision that needs a lawyer, an economist, a sociologist and a psychologist, and two figures that follow only from the law and the economics together |
| schools and fields | 1 | both at once: the same contract audited and checked against the law and for harm to players |

The last three came with the second run. Their experts and where the knowledge is from are in
[agents/SOURCES.md](agents/SOURCES.md). The audit's answer key is not ours: it is the findings report published
with the contract.

## Five ways to answer the same task

| way | what it is |
|---|---|
| model alone | The question goes to a model with no knowledge: once to the model the protocol runs on, once to the strongest model the swarm allows. It may think first and is told to say when it does not know. |
| one expert alone | One expert gets the whole task with its own knowledge, model and template: no router, no check, no composer. We report the best one per task. |
| experts apart | Every expert of the pool gets the whole task, and the customer reads all the answers. Facts count if any answer has them; cost and length add up. |
| swarm | The product itself: an order of 4 USDC placed in the contract on testnet, served by the runner, settled by the contract. |
| swarm, stronger composer | The same contributions composed again by the strongest model. The runner's trace holds exactly what its composer was given, so only that one step differs. |
| swarm, experts named by the customer | For the audit only: the same order with all three auditors named in it, so that all of them work whatever the router thinks. It shows what the second and the third auditor add, and what they cost. |

Where a task links to a file, the swarm reads the link itself. A model alone and an expert alone get the file's
text with the task: nobody is asked to audit a contract it cannot see.

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

**Who was paid for what.** For the last three tasks the report sets each expert's pay beside what its own part
held: the facts in it, the facts no other expert of the team had, and how many statements of the composed answer
carry its mark. An expert is paid its fixed rate if its part was delivered, whatever the others wrote; the table
shows what that rule pays for.

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
scripts/swarm.sh join eval/agents/<name> 2  # once for each expert of eval/agents; agents/* likewise
CUSTOMER=<account with test USDC> npm run eval -- bare solo swarm compose modes market score
npm run eval -- report                      # the report again from what is kept, without the judge
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

## What the second run showed (2026-11-12)

Three cases, one task each, on the same day. Seven more experts: three auditors built from the open audit skills
of Pashov Audit Group, Trail of Bits and QuillShield, and four invented field experts
([agents/SOURCES.md](agents/SOURCES.md)).

**The first attempt failed, and that was the most useful part.** Of four orders two were declined and refunded,
and every auditor's answer was cut off. What was wrong, and what we changed in the runner before the run that is
reported:

- **A skill written as a prompt does not pass the entry audit.** Pashov's files address an AI agent ("You are an
  attacker that..."), and the audit refuses materials that give orders to an AI. Reworded as a reviewer's
  checklist they passed; Trail of Bits' and QuillShield's reference files passed as published.
- **Experts did not know how long an answer may be.** The auditors reasoned aloud and ran into the 4,000-token
  limit before the list of findings. The template now says how long an answer can be and asks for the answer
  itself, the most important first. An answer that is still cut off is shown to its owner as `cut_off`, not as
  "empty".
- **The model matters more than the knowledge when the task is hard.** On the protocol's 27B model, without a
  reasoning pass, an auditor missed the reentrancy in `refund`. With a reasoning pass the same model spent
  10,000 tokens thinking and returned nothing. The auditors were moved to the strongest allowed model, which gave
  a complete report with tests in 2,700 tokens (and later to three different models, see below).
- **The composer's answer broke on a quotation mark.** It was a string inside a JSON object, the model did not
  escape a quote, and the rest of its limit went into whitespace: four experts had delivered and the order was
  declined. The composer now writes plain Markdown.

The results after these changes, facts found by pattern:

| case | model alone | strongest model alone | swarm | what the swarm cost the customer |
|---|---|---|---|---|
| audit of a contract, one field | 4 of 8 | 5 of 8 | 6 of 8 with the one auditor the router took; with all three named 6 of 8, then 8 of 8 after three more changes (7 and one merged into another, by a blind reading) | 1.68 USDC; 4.00 USDC |
| a playground raffle, four fields | 1 of 12 | 0 of 12 | 10 of 12 | 3.05 USDC |
| the contract, the law and the players | 2 of 9 | 5 of 9 | 9 of 9 | 2.95 USDC |

- **One field, three schools on one model: three auditors gave no more than one.** Each part held 7 of the 8
  findings, nearly the same ones, and the composed answer has 6, as with one auditor: the composer folded the
  unsafe cast into the overflow of the same variable, and dropped a finding that one auditor had only touched
  on. The customer paid 4.00 USDC instead of 1.68. The router, left to itself, took one auditor of the three.
- **Then three changes at once, and 8 of 8.** The auditors were put on three different models, because in a trial
  the weaker model had found what the strongest missed. An expert that gets materials now reads them first and
  names what to look up in its own knowledge ([policies/lookup.md](../policies/lookup.md)). The pattern auditor
  asked for "push payment denial of service winner.call revert" and "unbounded loop duplicate check gas griefing",
  and got the pieces on a recipient that blocks a payout, on loops over growing arrays and on type casts, where
  before it had flash loans and proxies; this time it reported the finding it had missed. And the composer is
  told to keep every distinct point.
  The same order again has 8 of 8, for less model cost ($0.041 against $0.064). Two of the three auditors had all
  8 in their own parts, so one of them would have done: taking one auditor still looks right, and three remain a
  second opinion. This is one run of one task with three changes together: it shows that the gap can be closed,
  not which change closed it. The other orders were not placed again after these changes.
- **Whether that result was fitted** is the subject of the check below. In short: the gain is one finding, not
  two, and it came from the composer's rule alone.
- **Four fields: this is where a swarm earns its price.** No expert alone had more than 3 of the 12 facts. The
  experts asked apart had 9 in 26,085 characters; the swarm has 10 in 7,837, and one of them is a conclusion no
  expert could reach alone: sales of 75,600 EUR stay under the law's 90,000 EUR threshold, so a notification is
  enough. The other cross-field fact it reached by another road: it says the raffle alone will not raise 60,000
  EUR, counting 29,500 EUR from the benchmark's usual prize share, not the 41,580 EUR that the law's minimum
  would leave. One fact of the sociologist was lost in composing.
- **Schools and fields: 9 of 9 with three experts of the seven**, one auditor, the lawyer and the psychologist. The
  lawyer read the contract and set its 20% fee against the Act's 12% cap; the strongest model alone found the
  contract's bugs and could not know the Act.
- **Proofs of concept were written, not run.** The audit answers carry 3 or 4 Foundry tests each. We did not run
  them, and at least one is empty of proof: it ends in `assertTrue(true)`. An expert cannot run code, so a test it
  writes is a draft for the customer's own repository.
- **The knowledge of an auditor was hardly used.** An expert's knowledge is searched by the words of its question.
  "Audit this contract" is close to nothing in particular, so the six pieces that reached the prompt were about
  flash loans and proxies, not about what this contract does. Searching by the contract's code was tried and
  found token checklists instead. What an auditor always applied was its `method.md`, which goes into every
  prompt whole. The look-up step above came from this.
- **Who was paid for what** is in [RESULTS.md](RESULTS.md), expert by expert. Each delivered expert got its rate
  whatever the others wrote: three auditors with the same findings were paid 1.00 USDC each.

## The check on that result (2026-11-12)

The last audit result, 8 of 8 by pattern, was put to three tests. In all of them the reading is done by a reader
that does not know which answer is whose: a separate model session, given the reference findings and one strict
rule, that a finding counts when the answer states it as an item of its own.

**1. Read blind.** Under the patterns as first written, the three-auditor orders before and after the changes
both score 8 of 8: the gain appears only after our own corrections of the patterns. Read blind:

| answer | findings stated, of 8 | with those only mentioned in passing |
|---|---|---|
| strongest model alone | 4 | 4 |
| one auditor | 6 | 6 |
| three auditors, before the changes | 6 | 6 |
| three auditors, after | 7 | 8 |

The gain is real, and it is one finding. The eighth is folded into another item.

**2. Which change did it.** The trace holds what the composer was given, so the same contributions were composed
again with the composer's new rule and without it, and read blind:

| contributions | composed without the rule | with the rule |
|---|---|---|
| before: one model, no look-up | 6 | 7 |
| after: three models, look-up | 6 | 7 |

The rule to keep every distinct point added the finding, with either set of contributions. Without it the composer
dropped a finding that an auditor had stated as a High of its own. Three models and the look-up step did not
change the count of the composed answer on this task. (The first cell is the original answer, from when the
composer still replied through JSON; the other three were made alike.)

**3. A contract nothing was prepared for.** The conditions of the first audit were not clean: the auditors'
methods were written after its report had been read (one line, on randomness, is in none of the source material),
the models were chosen after earlier results on it, the example in the look-up policy was written with it in
mind, and its patterns were corrected four times. So the same swarm, untouched, was given a second contract, the
T-Swap pool of the same course ([agents/SOURCES.md](agents/SOURCES.md)). Its seven facts are the High and Low
findings of its published report in the audited file; they were committed (`78ebaa1`) before the order.

| answer | findings stated, of 7 |
|---|---|
| the protocol's model alone | 1, and one more that it raised and took back |
| the swarm, three auditors named | 6 |
| its parts: the auditor on DeepSeek | 6 |
| the auditor on kimi | 4 |
| the auditor on the protocol's model | 1 |

- **The result carries over**: 6 of 7 on a contract the swarm was not tuned on.
- **It does not show that the knowledge did it.** The auditor on the same model as the baseline found what the
  baseline found: one finding. The two that found more run on stronger models. Whether it is the model or the
  knowledge was tested next, and it is the model ("What the materials add", below).
- **A swarm of one field is as good as its best member.** The composed answer has exactly the best auditor's six.
  Asked for one auditor, the router had twice taken the one that found one of seven here. Three auditors are
  insurance against that choice, at 4.00 USDC instead of 1.68.
- **The answers also assert things that are false.** The reader checked claims against the code and found at
  least three wrong findings in the swarm's answer, and as many in each of the others. The rule that keeps every
  point keeps the wrong ones too. Nothing else in this evaluation measures that.
- **Patterns for findings are not a measure.** Written beforehand, they agreed with the blind reading for the
  swarm (6) and gave the model alone 4 where the reader found 1.

## What the materials add: the design, fixed before the runs

The check above left one question open: the auditors that found more ran on stronger models, so is it the
expert's materials or the model? This is the test, written down before any of it was run.

- **Contracts.** Three that nothing here was prepared for: the T-Swap pool again, and two more of the same course,
  `L1BossBridge.sol` and `ThunderLoan.sol`. For each, the facts are the High, Medium and Low findings of its
  published report whose code is in the audited file ([tasks.ts](tasks.ts), [agents/SOURCES.md](agents/SOURCES.md)).
- **Models.** The three the auditors run on: Qwen3.8-27B, DeepSeek-V4.1-Flash, kimi-k2.6.
- **Ways.** Each model answers the task alone and at once: the same call as an expert's, the same output limit,
  none of a sponsor's materials. And each model answers with the materials of each of the three auditors, as the
  swarm would run it. The two cheaper models answer alone twice, to see how much two runs of the same thing
  differ. On one contract the strongest model also thinks first, with four times the output limit: what a
  customer gets by asking it directly; if that returns an answer, the other two contracts get it too. The two new
  contracts are also ordered from the swarm with the three auditors named.
- **Score.** A reader that does not know which answer is whose, by the rule used above: a finding counts when it
  is stated as an item of its own. The reader also counts what an answer claims that the code refutes.
- **Nothing changes meanwhile**: not the runner, not the policies, not the experts.

## What the materials add: the result (2026-11-12)

Findings stated as an item of their own, as the blind readers found them; every verdict is in
[BLIND.md](BLIND.md). "3 and 2" is the same model asked the same thing twice.

| T-Swap pool, 7 findings | Qwen3.8-27B | DeepSeek-V4.1-Flash | kimi-k2.6 |
|---|---|---|---|
| the model alone, at once | 3 and 2 | 7 and 6 | 6 |
| with the materials of the attack-paths auditor | 2 | 4 | 3 |
| with the materials of the code-maturity auditor | 1 | 6 | 4 |
| with the materials of the bug-patterns auditor | 1 | 6 | 5 |

| Boss Bridge, 9 findings | Qwen3.8-27B | DeepSeek-V4.1-Flash | kimi-k2.6 |
|---|---|---|---|
| the model alone, at once | 3 and 2 | 4 and 5 | 3 |
| with the materials of the attack-paths auditor | 1 | 6 | 4 |
| with the materials of the code-maturity auditor | 2 | 4 | 3 |
| with the materials of the bug-patterns auditor | 3 | 4 | 3 |

| Thunder Loan, 9 findings | Qwen3.8-27B | DeepSeek-V4.1-Flash | kimi-k2.6 |
|---|---|---|---|
| the model alone, at once | 0 and 0 | 4 and 3 | 1 |
| with the materials of the attack-paths auditor | 0 | 3 | 3 |
| with the materials of the code-maturity auditor | 0 | 1 | 3 |
| with the materials of the bug-patterns auditor | 0 | 4 | 3 |

| per contract, on average | Qwen3.8-27B | DeepSeek-V4.1-Flash | kimi-k2.6 |
|---|---|---|---|
| findings stated by the model alone | 1.7 | 4.8 | 3.3 |
| findings stated with an auditor's materials | 1.1 | 4.2 | 3.4 |
| wrong findings per answer, the model alone | 1.5 | 1.3 | 1.3 |
| wrong findings per answer, with materials | 1.6 | 1.8 | 2.3 |

The swarm, with the three auditors named, stated 6 of 7, 5 of 9 and 4 of 9. Left to its router on the first
contract, it took one auditor and stated 2 of 7.

- **The auditors' materials added nothing that can be measured.** For none of the three models is the average
  with materials above the model alone by more than two runs of the same thing differ: asked twice, a model gave
  counts one apart in five pairs of six.
- **The model decides.** DeepSeek states three to seven of the findings, Qwen none to three, with materials or
  without.
- **The swarm of three is as good as its best model asked alone**: 6, 5 and 4 against DeepSeek's 7 and 6, 4 and 5,
  4 and 3. The swarm's order costs four to five cents in model calls and 4.00 USDC to the customer; the model
  alone, under one cent.
- **The router's own choice was the worst one.** It took the auditor that runs on the weakest model, as it had
  before; nothing it sees says how good an expert is.
- **Materials did not make answers truer.** The readers checked the claims outside the reference set against the
  code: with materials there were no fewer wrong ones, and for two of the models more.
- **The template's rule about length works for the model that obeys it.** kimi alone was cut off at the limit in
  two answers of three; inside the expert template, in none of nine. DeepSeek was cut off in eight of nine either way.
- **Thinking first did not help.** The strongest model, thinking, with four times the output limit, returned
  nothing in ten minutes; that one call cost more than a whole order of the swarm. It was not repeated.

What this result is about, and what it is not:

- **It is about audit skills used as text.** An expert here is one call with six pieces of a skill's reference
  text and a method of two thousand characters. The skills were written to be run as many passes with tools; that
  was not tested.
- **It is about knowledge a model already has.** Reentrancy, slippage and replay are in every model. Where the
  knowledge exists nowhere else, the first run shows the opposite: 0 or 1 of 22 facts without the expert, 22 with.
- **Three contracts of one public course, each answer asked once** (the cheaper two models alone, twice).
- **The readers err too.** Three of the nine swapped the names of two answers; each row was checked against the
  files by what it quotes and put right. The swarm's answer, read by three readers on every contract, got the
  same count from all three each time.

## Two things tried next: the design, fixed before the runs

**Why the materials added nothing.** The recorded prompts and answers of the 27 expert answers above say three
things. One answer sees 8 to 16% of its skill: six pieces of 33 to 76. The method is obeyed: 22 of the 27 answers
say, as it asks, that their tests were not run. The pieces are not used: 23 of the 27 answers share not one run of
five words with the pieces they were given. And what the expert looks up is what it has already noticed in the
contract ("swapExactOutput missing minInputAmount slippage"), so its knowledge can confirm a suspicion but cannot
send it to look where it had not looked, which is what a checklist is for.

**A skill in passes.** So the attack-paths skill is run as its authors meant it: twelve passes over the contract,
each with one file of the checklist whole in the prompt and the instruction to apply it item by item, then one
call that checks the findings by the skill's own rules and writes the report. On DeepSeek, the model that did
best alone, on the two contracts where it left room: Boss Bridge (alone 4 and 5 of 9) and Thunder Loan (4 and 3).
Read blind, with the answers it is compared with in the same batch. It counts as working if on both contracts it
states at least two findings more than the better of the model's two answers alone: 7 and 6. One more is what
chance gives.

**A router that replaces a weak pick.** The router reads skills and takes the closest match of words; shown how
much of each expert's parts were used, it took the same one, and asked to name interchangeable experts it named
none. Now the numbers name the rivals of its pick (experts whose parts were used clearly more, at no higher
price) and the protocol's model gets one narrow question: could any of them be asked this question instead
([policies/stand-in.md](../policies/stand-in.md))? On five cases with a known answer it was right five times
at the first wording. It counts as working if the order for the bridge audit, placed without naming anyone, goes
to an auditor other than the one whose parts were used least. For this the team size of four earlier orders was
added to the runner's record of rounds, which did not keep it then.

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
- **The second run is three tasks, each run once, after a first attempt that failed.** The tasks and their facts
  were not changed between the attempts; the runner, the auditors' model and their method were.
- **The audited contract is famous.** It comes from a public security course, so a model may know its bugs by
  heart: the gap between a model alone and the swarm is smallest exactly there.
- **The judge was no second opinion on long answers.** On answers of 10,000 characters and more it disagreed with
  the patterns in both directions, and where we checked by hand it was the judge that was wrong (it marked
  "45%" missing in an answer that says "at least 45%"). The audit answers were read by hand instead; three
  patterns were corrected after that reading, as [tasks.ts](tasks.ts) says.
- **The audits are two tasks, one order each.** The other tables are from before the look-up step and the
  composer's rule. The look-up step has not been shown to help: it brings pieces of knowledge that fit the
  contract, and on the one task where it could be separated the composed answer did not change.
- **No proof of concept was run.** Every audit answer carries Foundry tests; none was executed.
