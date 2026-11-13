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

## Two things tried next: the result (2026-11-12)

**A skill in passes: it did not work.** Findings stated as an item of their own, read blind
([BLIND.md](BLIND.md)):

| | Boss Bridge, of 9 | Thunder Loan, of 9 | model cost |
|---|---|---|---|
| DeepSeek alone, asked twice | 4 and 5 | 4 and 3 | under 1 cent |
| with the attack-paths materials, one call | 6 | 3 | 1 cent |
| the attack-paths skill in twelve passes and a verdict | 3 | 2 | 4 to 5 cents |
| what would have counted as working | 7 | 6 | |

- The answer in passes states fewer findings than the model alone, at about seven times the cost.
- It mentions more than it states: counting what is only named in passing, 5 and 6, against 4 and 6, and 4 and 4,
  for the model alone. The passes wrote 70,000 characters on each contract; the last call had 4,000 tokens for its
  report, was cut off both times, and by the skill's own rules turned findings into "leads". What twelve passes
  found did not fit through one report. Whether another last step would carry it through was not tried.
- On the bridge it asserted nothing false; on the loan, as much as the others.

**A router that replaces a weak pick: it works, and it showed a cost.** The bridge audit, ordered without naming
anyone: the router picked the same auditor as always, the runner found two whose parts had been used clearly
more, the protocol's model said both could be asked the same question, and the better one was asked instead
(`replaced` in the runner's log). That answer states 4 of the 9 findings; the auditor it replaced had stated 1
on this contract. The first such order was declined and refunded: the replacing expert runs on a slower model,
which did not answer within the runner's three minutes. The measure the runner goes by says how much of an
expert's parts were used, not whether its model answers in time; the "delivered/picked" record says that, and
the rule does not weigh the two together.

## The passes again, merged by the composer: the design, fixed before the run

The texts of the twelve passes were then read for the findings the model alone had missed. They are there. On the
bridge the invariant pass wrote that `from` may be the vault itself, which the bridge may pull from without limit:
the unbacked mint that none of the other fifteen answers on that contract has. On the loan the same pass wrote
that a receiver can call `deposit` in its callback instead of repaying and keep the asset tokens: the theft that
one answer of fifteen has. Neither is stated in the report at the end. So the passes found what a single call
does not, and the last step lost it: one call with 4,000 tokens for everything, under rules that turn findings
into leads.

The simplest repair is to squeeze nothing: each pass is a contribution, and the protocol's composer, which is told
to keep every distinct point, writes the answer from all twelve. The passes are the ones already made; only the
composing is new. Read blind beside answers read before. It counts as working by the same mark as before, 7 of 9
on the bridge and 6 of 9 on the loan, and only if both of those two findings are stated. What the composer keeps
that is false is counted as well: nothing in this version checks a finding.

## The passes joined by code: the design, fixed before the run

A model that rewrites a hundred findings into one text keeps what many passes said and drops what one pass said,
and the finding worth having is the one that only one pass made. So in this version nothing is rewritten. The
findings are cut out of the passes' texts at their headings, findings whose first lines are close enough to say
the same thing are joined (by embedding; the threshold is set once, by looking at which findings fall together,
before anything is read for the score), and the list is given as the passes wrote it, with how many passes had
each finding. The mark is the same: 7 of 9 on the bridge, 6 of 9 on the loan, and both of the two findings named
above stated. The list will be long and none of it checked: how many findings it lists and how many of them the
code refutes is part of the result.

## The passes, merged and joined: the result (2026-11-12)

Findings stated as an item of their own, read blind ([BLIND.md](BLIND.md)); the same twelve passes each time:

| | Boss Bridge, of 9 | Thunder Loan, of 9 |
|---|---|---|
| DeepSeek alone | 5 | 4 |
| the swarm, three auditors named | 5 | 4 |
| the passes, then one call for the verdict | 4 | 2 |
| the passes, merged by the composer | 4 | 3 |
| the passes, joined by code | 7 | 7 |
| what counts as working | 7 | 6 |

- **Joined by code, the passes carry what a single call misses**, on both contracts and with both of the two
  findings named in advance: the unbacked mint on the bridge, the deposit in place of a repayment on the loan.
- **A model that merges loses them**, whichever model and whichever rule: the verdict call and the composer both
  end below the model alone.
- **It is a list, not a report.** 113 and 111 items, about a third of them distinct. Of the items outside the
  reference set that the reader checked against the code, 3 of 14 and 6 of 17 are wrong. Nothing in this version
  checks a finding; that step is what turns the list into an answer, and it is built next, in the runner.
- Joined more loosely, the list lost the bridge's unbacked mint inside the finding next to it. The join is kept
  conservative, and a group shows the first line of every finding in it.

## The review as the runner now does it: first trials

After the passes joined by code, the runner got a way of working of its own for experts with checklists
(`"work": "review"`, [node/src/review.ts](../node/src/review.ts)): a pass a file of knowledge, findings read by code,
each group checked on its own with a quote that code looks up in the customer's file, proofs for the gravest. Its
first trials were single experts on the bridge contract, run with `scripts/try.ts --material`, on a day when NEAR
AI's embedding model did not answer, so findings were grouped by their words alone. One reader read them blind
with three earlier answers ([BLIND.md](BLIND.md)):

| answer | reference findings stated, of 9 | more, as "not confirmed" | items, distinct | wrong | cost, USD |
|---|---|---|---|---|---|
| DeepSeek alone, one call | 4 | | 11, 10 | 1 | about 0.01 |
| the swarm of the second run, three auditors, one call each | 5 | | 11, 11 | 0 | about 0.04 |
| the attack-paths auditor on DeepSeek, one call | 6 | | 16, 13 | 1 | about 0.01 |
| a review by the attack-paths auditor on Qwen3.8 | 2 | 2 | 9, 7 | 2 | 0.024 |
| a review by the attack-paths auditor on DeepSeek | 5 | 1 | 38, 19 | 3 | 0.10 |

**The review did not beat one call.** On DeepSeek it stated five of nine, as single calls do, for ten times the
money and ten minutes, and its report said the same thing over and over: 38 items for 19 flaws. What it has that
the others lack is a quoted line under every finding and five proofs.

The calls say why. Each of the 13 passes began with the flaws anyone sees first and 8 of them ran into the output
limit of 1,500 tokens before they reached what their own file is for; the limit had been set from Qwen3.8, which
writes a third as much (replies of 440 tokens at the median against DeepSeek's 1,400). The finding the passes
had surfaced the day before, the vault passed as `from`, was raised by no pass this time. Qwen3.8 as the checker
refuted a true finding five times with the same wrong reason; it reached the customer only as "not confirmed".

Changed after these trials: a pass is told what earlier passes raised and reports only what they missed; a pass
may write 2,400 tokens; findings that say the same in other words are joined by one narrow question to the model
(58 confirmed wordings of the DeepSeek trial became 15 findings, on both models, for a tenth of a cent); what a
check does not confirm is listed apart instead of dropped.

Two more trials on the same contract, read blind by a second reader, did not do better:

| answer | reference findings stated, of 9 | what went wrong |
|---|---|---|
| a review on DeepSeek in every step | 4 | no pass was cut any more, but DeepSeek at NEAR AI had slowed to a quarter of its speed: the passes took 13 of the review's 15 minutes, and 15 of 69 groups were checked. The findings were not yet sorted before the checks |
| a review with Qwen3.8 reading and DeepSeek judging | 2 | told that its reply was "for what earlier passes missed", Qwen3.8 raised one finding a pass, 13 in all |

Both readers gave the three earlier answers 5, 4 and 6, finding by finding the same: the reading is steady, and on
this contract the review is not better than one call. The contract is from a public course and the models know
its flaws; where a review can add something is a contract they do not know, with knowledge they do not have
([the NEAR contracts](review-tasks.ts)).

## A NEAR contract: the review against the same model alone

The first contract the models are unlikely to know: a pool that converts NEP-141 tokens, audited by BlockSec in
2022 ([review-tasks.ts](review-tasks.ts) has its 11 findings, written down before the run). Three reviewers of
NEAR contracts ([agents/SOURCES.md](agents/SOURCES.md)) reviewed its ten source files with `npm run eval:review`,
all on Qwen3.6-35B-A3B, and the same model was asked the task alone, at once. Read blind ([BLIND.md](BLIND.md)):

| answer | findings of the report stated, of 11 | more, as "not confirmed" | items, distinct | wrong | proofs | cost, USD |
|---|---|---|---|---|---|---|
| the model alone, one call | 2 | | 7, 8 | 3 | 1 | 0.006 |
| a review with our own NEAR checklist | 1 | 0 | 8, 8 | 3 | 0 | 0.045 |
| a review with the NEAR standards | 2 | 1 | 9, 8 | 4 | 3 | 0.124 |
| a review with NEAR's security guide | 3 | 1 | 8, 6 | 2 | 3 | 0.176 |
| the three joined | 3 | 1 | 20, 15 | 6 | 5 | 0.344 |

**The review found the report's two High findings and its Medium; the model alone found the two High, in one
item, and its answer broke off.** The third, a rollback that fails in the callback of a failed transfer, is what
the security guide's pages on callbacks and the storage standard are about. Nobody found the report's Low
findings or its recommendations: of those the passes raised (a pool id that overflows, zero rates, pools that
cost nothing to make), the checks of this model refuted them, with wrong reasons where we looked.

Two things the run showed about the mechanics. The model's answer to "which of these say the same" joined
nineteen different findings into one group, and the check dismissed the group in a line, the zero rates with
it: a check is now shown five wordings at a time. And of 15 distinct items 6 are wrong. A controller on
kimi-k2.6 (one call, 0.018 USD) doubted 14 of the 20 joined findings, each with a line of the contract: 11 of the
12 items that are wrong, three that are true of the code but no flaw, and one that is right, the Medium. It
left the two High findings alone. In the answer a doubted finding stays, under its own heading.

Later the same evening the two stronger models were asked the task alone as well (DeepSeek's reply came once
replies were read as a stream: it had been writing 19 tokens a second into a timeout of 180), and a second reader
read them blind with the answers above:

| answer | findings of the report stated, of 11 | more, as "not confirmed" | wrong, of distinct items | cost, USD |
|---|---|---|---|---|
| DeepSeek alone, one call | 1 | | 4 of 7 | 0.008 |
| kimi-k2.6 alone, one call | 2 | | 6 of 12 | 0.019 |
| Qwen3.6-35B alone, one call | 2 | | 3 of 7 | 0.006 |
| three NEAR reviewers on Qwen3.6-35B, joined | 3 | 1 | 10 of 18 | 0.344 |

**On this NEAR contract the joined reviews state more of the audit than any model does alone, the stronger ones
included, and are the only answer with the report's High and Medium findings all three.** On the Solidity
contract from a public course the review never beat one call; here the models do not know the contract, and what
finds the third finding is knowledge they were given. The price is precision: more than half of the joined
findings are wrong by this reader's count (the first reader counted 6 of 15), where a single call is wrong in
about half as well. The controller's doubts fall on 9 of those 10.

**Against the three models' answers put together by hand it is a draw.** A customer can ask several models and
join what they say; that, not one model, is what a swarm has to beat. DeepSeek stated finding 1, kimi 1 and 8,
Qwen3.6 1 and 2: together 1, 2 and 8, three of eleven, for 0.03 USD. The joined reviews stated 1, 2 and 3 and
have 8 among the unconfirmed: three of eleven as well, other ones, for 0.34. The reviews are alone in having the
Medium finding, the models' answers together in stating the zero rates outright.

One contract and one run of each, and two runs of one model differed by a finding or two on the earlier
contracts: 3 against 2 is inside that noise. A sign, measured twice by readers who agree, not a result. What a
swarm gives that no joining of public models can is measured elsewhere in this file: knowledge the models do not
have (22 of 22 facts against 0 or 1).

## The second NEAR contract: the reviews lose, and why

A vesting contract of the same project, audited by BlockSec the same year, reviewed this time as a customer would
have it: an order placed in the contract on testnet (order-38), three NEAR reviewers named, the controller on. It
went through in five minutes: 4.00 of 5.00 USDC charged, 1.00 to each expert, 1.00 back to the customer, 0.39 USD
of models. Read blind against the report's 11 findings ([BLIND.md](BLIND.md)):

| answer | findings of the report stated, of 11 | wrong, of distinct items |
|---|---|---|
| DeepSeek alone, one call | 7 | 0 of 10 |
| kimi-k2.6 alone, one call | 4 | 3 of 9 |
| Qwen3.6-35B alone, one call | 3 | 1 of 5 |
| the three models' answers together | 7 | |
| three NEAR reviewers on Qwen3.6-35B, joined, with the controller | 2 | 7 of 11 |

**Over the two NEAR contracts, 22 findings: the reviews 5, the model they ran on 5, kimi 6, DeepSeek 8, the three
models together 10.** The first contract's "3 against 2" was noise. A review on a cheap model is level with that
model alone and at half of what three models find between them.

The journal of the order says where the findings went. None of the 27 passes raised the report's two High
findings (a claim records one amount and transfers another; a vesting is removed with tokens unclaimed), nor its
recommendations (the owner's powers, ownership handed over in one step, times that are not checked). A pass was
told to report "only what this part of your knowledge leads to", the checklists are about NEAR's mechanics and
not about a vesting schedule, and so what the model would have noticed by itself never reached a check: **the
review narrowed the model to its checklist.** And all three reviewers ran on one model, the weakest of the three
that were asked alone.

Changed after this, on what the two contracts showed (they are the development set from here on, and are no
longer evidence for anything): an expert first reads the files with no checklist and the passes are told what it
found; the three reviewers judge with three different models; a check is shown the files its findings name.
The composer, which on this order had written a list and four tests of its own from the titles, now writes one
paragraph.

## The second contract again: what a check is for, and what a controller costs

The vesting contract was reviewed again after those changes, outside the chain, and the three models were asked
alone with twice the room (8,000 tokens). It is a contract the changes were made on: the numbers say how the
changes went and prove nothing. Read blind, the last three rows by two readers who agree on every letter
([BLIND.md](BLIND.md)):

| answer | findings of the report stated, of 11 | items | wrong | cost, USD |
|---|---|---|---|---|
| Qwen3.6-35B alone | 2 | 10 | 2 | 0.005 |
| kimi-k2.6 alone | 4 | 10 | 3 | 0.019 |
| DeepSeek alone | 6 | 18 | 3 to 5 | 0.012 |
| the three models' answers together | 6 | | | 0.037 |
| the three reviews, similar findings folded into one | 5 | 18 | 8 | 0.48 |
| the same reviews, similar findings side by side | 7 | 26 | 11 | 0.48 |
| what the same reviewers raised, with no check | 6 | 106 | 30 or more | 0.12 of the same run |

**Folding lost two findings that were there.** The reviews were not run again between the fifth row and the
sixth: only joined again. The owner removing a vesting with tokens unclaimed had been raised by all three
reviewers and confirmed for each; folded into one finding with a wrong neighbour, it stood under the neighbour's
title. So after the checks nothing is folded any more: findings a model names the same stand side by side, each
in its own words.

**A runner that only joins is right; an expert that does not check its own findings is not.** We asked whether
the checks are needed at all, since they cost half of a review (0.25 of this run's 0.51 USD) and can find nothing new.
With no check the three reviewers' 214 records are 106 items, 37 of them rated Critical or High, of which four or
five are real. The checks left 26 items and lost none of the report's findings that had been raised; they stated
one more, raised with its direction the wrong way round and written right on the check's form, which asks how it
happens and how to fix it. What the reviews miss (the storage fee that is not refunded, the owner's powers as
such, tokens with elastic supply, the unlimited number of checkpoints) no reading and no pass had raised: the
weak place is the search, not the check.

**The controller is out of the default.** Left under the findings, its 16 doubts fall on 9 of the 11 wrong
findings, on one that is no flaw, and on 6 that are right: both High findings of the report among them. A second
model that is no stronger than the first does tell wrong from right more often than not, and puts a doubt under
the two findings that matter most. It stays an option of the operator and is not used in what follows.

What is still wrong after all of it: 11 of the 26 items, and the first two of the answer are Critical findings
the code refutes.

## The third contract: a clean one, and fifteen grave findings that are not there

The last contract of the development set is a small staking token in which BlockSec found three Low findings and
made three recommendations. Read blind by two readers who agree on every letter:

| answer | findings of the report stated, of 6 | items | wrong | rated Critical or High, and real among them |
|---|---|---|---|---|
| Qwen3.6-35B alone | 0 | 8 | 2 | 5, 1 |
| kimi-k2.6 alone | 3 | 14 | 3 | 2, 1 |
| DeepSeek alone | 2 | 12 | 4 | 2, 1 |
| the three models' answers together | 4 | | | |
| the three reviews joined | 3 | 38 | 15 or 16 | 15, 0 |

**On a contract with little wrong in it the reviews made alarms.** Fifteen findings rated Critical or High, none
real, and one finding fewer than the three models state between them. The checks had confirmed claims that
something is not done where the code does it (a callback that "does not restore" an amount it restores), quoting
the lines around the place and never the place; and one check kept a finding Critical whose own text says the
tokens come back.

Three things were changed, each asked for by the person this is built for:

- **A check looks for what would stop a finding before it confirms it** ([check.md](../policies/check.md)): a
  claim that something is missing is about the place where it would be done, and that place is read.
- **What makes a finding is the expert's to say, not the protocol's.** The methods of all six audit experts now
  say it: a finding needs someone who gains, someone who loses, or a service that stops; with nobody who gains,
  what it costs to do against what is lost decides how grave it is; a point with none of the three is not a
  finding. The NEAR experts' methods also say what on NEAR undoes itself (a panic, within its receipt) and what
  does not (anything saved before a cross-contract call that fails). The check is given its expert's method, so
  the rule works where findings are judged, and no code enforces it.
- **All three NEAR experts read and judge with DeepSeek**, the passes stay on the cheap model. kimi-k2.6, which
  had been the judge of one expert and about 60% of a run's cost, confirmed again six of the nine wrong findings it
  was shown, five of them as Critical or High.

Tried on the 40 findings of the two contracts that the readers had called wrong or right, each checked again once:

| | the check as it was | the check as it is, DeepSeek judging |
|---|---|---|
| wrong findings confirmed, of 29 | 29 | 9 |
| of them as Critical or High | 22 | 0 |
| right findings kept, of 11 | 11 | 10 |

The right finding that is refused had been worded with its steps in an impossible order. This is a trial of one
step on findings already made, not a run of a review: a whole run on the development contracts was not paid for
again.

**The knowledge added nothing here.** The journal of both runs says where each finding of the audits came from:
every one the reviews stated had been raised by an expert's own reading, before any knowledge was read; the
passes over the knowledge raised more records (three times as many on one contract) and not one of the audits'
findings beyond those;
what the reviews missed neither had raised. The knowledge is NEAR's documentation and standards, which the models
know. So the third reviewer was given what they do not: a case-book of what audits of other NEAR contracts have
reported, restated in our words from public reports, none of them a report on a contract measured here
([SOURCES.md](agents/SOURCES.md)).

## One strong reviewer is not a swarm: who found what

The first held-out contract, the SWEAT token (Guvenkaya's report of June 2026, later than anything the models were
trained on), reviewed by the three NEAR reviewers of that day. Two readers; they agree on which findings are
stated ([BLIND.md](BLIND.md)):

| answer | findings of the audit stated, of 9 | real, of all it claims | wrong | false Critical or High | cost, USD |
|---|---|---|---|---|---|
| Qwen3.6-35B alone | 2 | 2 of 6 | 2-3 | 2 | 0.007 |
| kimi-k2.6 alone | 2 | 2 of 15 | 5-6 | 5 | 0.028 |
| DeepSeek alone | 3 | 3 of 18 | 2 | 3 | 0.011 |
| the three models' answers together | 5 | 7 of 39 | 10 | 10 | 0.046 |
| the three reviews joined | 4 | 5 of 26 | 4-5 | 1 | 0.39 |

The reviews state more than any one model and raise one false alarm where the models together raise ten; they
state one finding fewer than the models together and cost eight times as much. And of the four findings, the
reviewer with our case-book confirmed three, the one built from NEAR's security guide one more, the one built from
the standards none of its own: it was one strong auditor and two that cost two thirds of the run. So a decision
was made on this contract, and it no longer counts as held out: the guide and the standards went into the one
NEAR reviewer's knowledge, and the question became where other reviewers of that strength come from.

**From experience that stands nowhere in one place.** Tried on the development contract with six findings (two
readers; they differ on one finding worded two ways, alike for every answer):

| team | findings of the audit stated, of 6 | wrong | false Critical or High | cost, USD |
|---|---|---|---|---|
| the three models' answers together | 3-4 | 10 | 7 | 0.04 |
| the NEAR reviewer alone, all of NEAR's knowledge in it | 2 | 3 | 0 | 0.16 |
| three Solidity auditors and the NEAR reviewer | 3-4 | 8-9 | 1 | 0.51 |

Auditors of another chain found on NEAR code what the NEAR reviewer did not: a token that takes a fee, shares
minted back at a changed price, the gas an upgrade leaves for its migration; two of the three brought a finding
nobody else had. A fifth finding the team had confirmed twice did not reach the answer: close in words to another
finding in the same function, it had been folded under it. Joined again with the rule below, it stands.

**Two findings are one only if they are identical, not alike.** What decides is what code can verify: the lines of
the customer's materials each rests on, and then whether they say the same or name the same fix. The same anchor
and the same claim, the same finding; anything else stands side by side, the neighbour in brief.

Three more reviewers were then written from what models do not carry: the root causes of real incidents on NEAR
and Aurora, the money logic of DeFi protocols by their kind, and Rust read as Rust ([SOURCES.md](agents/SOURCES.md)).

**Two things tried and not kept.** Asking an expert again about its own finding ("take it to the end"): of three
findings stated by half it finished none, and of two wrong ones it withdrew both, because the question came with
all the files where the check had seen one. Showing every check all the files: on forty labelled findings no
gain on one contract and none clear on the other, at a higher cost; a check of a grave finding reads everything,
the others the files their finding names.

## A held-out contract: the team states more than the three models together, with no false alarm

cNEAR, a token contract audited by Trail of Bits in August 2026: later than anything the models were trained on,
and a contract nothing here had been tried on. The team was fixed before the run: the NEAR reviewer, the three
reviewers written from experience (DeFi protocols by kind, incidents, Rust) and the two Solidity auditors that
had each brought a finding of their own on the development contract. Two readers, who agree on every letter:

| answer | findings of the audit stated, of 7 | real, of all it claims | wrong | false Critical or High | cost, USD |
|---|---|---|---|---|---|
| Qwen3.6-35B alone | 1 | 1 of 10 | 3-4 | 2 | 0.005 |
| kimi-k2.6 alone | 2 | 2 of 11 | 2 | 2 | 0.023 |
| DeepSeek alone | 3 | 3 of 11 | 1-2 | 1 | 0.010 |
| the three models' answers together | 4 | 6 of 32 | 7 | 5 | 0.038 |
| the team of six | 5 | 5 of 27 | 2-5 | 0 | 0.88 by our meter, 0.56 by NEAR AI's bill |

**On a contract it had never seen the team stated five of the audit's seven findings, the three models together
four, and it raised no false grave finding where they raised five.** The audit's High finding in this file, that
handing ownership over leaves the old owner a super-admin who can take it back, was confirmed by all six
reviewers; no model alone stated it (two touched it in passing). A sixth finding the team raised and did not
confirm. The seventh nobody states: it rests on a contract that is not in the file.

What stays as it was: one contract and one run; of everything any answer claims, about a fifth is a real flaw
(most of the rest is true and no flaw), the team's answer included; and a real finding costs the team twenty to
fifty times what it costs a model asked alone. Six reviewers were more than this contract needed: the NEAR
reviewer and one Solidity auditor between them confirmed all five, for half the price.

## A second held-out contract, and the two together

Mintbase's store, an NFT contract audited by OtterSec in 2023, by the same team of six, fixed before both runs.
Two readers, who again agree on every letter:

| answer | findings of the audit stated, of 7 | real, of all it claims | wrong | false Critical or High | cost, USD |
|---|---|---|---|---|---|
| Qwen3.6-35B alone | 2 | 2 of 7 | 1 | 1 | 0.007 |
| kimi-k2.6 alone | 1 | 3 of 14 | 3 | 2 | 0.019 |
| DeepSeek alone | 3 | 5-6 of 17 | 3-4 | 0 | 0.012 |
| the three models' answers together | 4 | 10-11 of 38 | 7-8 | 3 | 0.038 |
| the team of six | 4 | 7 of 38-39 | 7-8 | 1 | 0.97 by our meter, 0.63 by NEAR AI's bill |

Here it is a draw: the team and the three models together state the same four findings, the audit's three Critical
ones among them; the three both miss, nobody states.

**The two held-out contracts together, 14 findings:**

| answer | findings stated | real, of all it claims | wrong | false Critical or High | cost, USD |
|---|---|---|---|---|---|
| DeepSeek alone | 6 (43%) | 30% | 5 | 1 | 0.02 |
| the three models' answers together | 8 (57%) | 24% | 14-15 | 8 | 0.08 |
| the team of six | 9 (64%) | 18% | 11 | 1 | 1.85 by our meter, 1.19 by NEAR AI's bill |

What these two contracts show, and no more than two contracts can: a team of reviewers with different knowledge
states at least what three models state between them and once more, and where the models raise eight grave
findings that are not there, the team raises one. What they do not show: a team that reads a contract cleanly.
Most of what any answer claims is true and no flaw, the team's a little more so than the models'; and the team
costs fifteen to twenty-five times as much. The claim that stands is the narrow one: the same findings and one
more, with an eighth of the false alarms.

## How a review is measured

From here on the reviews are measured as systems of this kind are measured elsewhere, so that the numbers can be
set beside published ones.

| measure | what it is | where it comes from |
|---|---|---|
| recall | the findings of a published audit that the answer states, of all of them; also for the Critical and High ones alone | EVMbench's detect mode (OpenAI and Paradigm, 2026) scores the share of an audit's High findings an agent's report states |
| precision | the real findings of an answer, of everything it claims; counted twice: with only the audit's findings as real ("strict") and with what a reader finds real against the code | ScaBench (Nethermind's scoring algorithm) classes every finding of a tool as a match, a partial match or a false positive against complete lists of findings |
| F1 | recall and precision in one number | the usual pair for detectors; said beside its parts, never instead of them |
| false alarms | findings rated Critical or High that are not real, per contract; wrong findings per 1,000 lines | CTFBench's overreporting index: false positives per line on code with nothing wrong |
| cost of a real finding | what the answer cost, by its real findings | the comparison at equal budget that work on multi-agent systems asks for: a swarm costs ten times a single call |

**How a finding is matched** is EVMbench's test, applied by a reader instead of a judge model: would fixing what the
answer describes also fix what the audit describes? Lenient on words, strict on the kind of flaw, its cause and its
place. A reader classes every item of an answer ([READER.md](READER.md)): it states a finding of the audit; it is a
real flaw the audit does not list; it is true and no flaw; it is wrong; it repeats an earlier item. Repeats count
once. Two readers read every contract without knowing whose answer is whose, and [score.ts](score.ts) counts.

**What the published benchmarks leave open, and what we do about it.** A real finding that the audit does not have
counts as false in a strict count: hence the second precision, by the code. A model may have read the audit: two of
the held-out reports are from 2026, later than anything the models were trained on, and are reported first. A
published benchmark runs each task three times; a contract here is run once, for what a run costs.

**Two halves of the audits.** The case-books of two experts are written from audit reports (47 on NEAR contracts,
58 on Solidity ones); the reviews are scored against other audit reports. No report on a scored contract is a source
of a case-book: [a test](../node/test/split.test.ts) fails if one becomes it. The NEAR case-book does rest on
reports about other contracts of some projects that also have a contract scored here (Ref Finance, Octopus
Network, Sweat, Aurora); the contracts whose project the case-book never saw (Mintbase, cNEAR, Potlock, NearX) are
reported apart.

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
