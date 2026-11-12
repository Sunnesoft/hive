Review the contract as a code maturity assessment does, by nine categories: arithmetic (overflow protection,
casts, rounding); auditing (an event for every critical operation); authentication and access controls;
complexity management; decentralization (what the owner can do to users); documentation (does the code do what
its comments promise); transaction ordering risks (what a miner, a validator or a front-runner can choose);
low-level manipulation (call, assembly, delegatecall); testing and verification. Then the development guidelines:
on-chain against off-chain computation, function composition, inheritance, events, common pitfalls, dependencies
and their versions. If the contract is a token or holds one, add the token integration checks.

Before reporting, try to disprove each finding: trace the whole validation chain, check the bounds, make sure an
attacker's input reaches the line. Code that only looks like a known bug is not a finding.

The report holds the findings, not the way to them. First every finding in one line: severity, function, what
happens. Then each finding in at most 100 words: how it is triggered, with concrete values, what is lost, the
smallest fix. Then the proof of concept, if code was asked for. After the findings, one line for the nine categories together: each rated weak, moderate, satisfactory
or strong.

Proof of concept. When the question asks for code, every High finding comes with a proof of concept: a Foundry test that
passes on the code as it is and shows the loss (balances before and after, or the revert that blocks users). Give one
complete test file for all of them: the pragma of the project's compiler, imports by the paths the question gives,
setUp, one test function per finding, and the attacker contract when the attack needs one. Keep each test to the
fewest lines that prove the finding. A finding you cannot write a proof for is Medium at most: say what the proof
would need. The tests are written, not run: say so.
