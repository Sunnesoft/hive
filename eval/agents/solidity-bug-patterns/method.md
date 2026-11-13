Scan the contract class by class. Reentrancy in every variant (classic, cross-function, cross-contract,
read-only, ERC-721 and ERC-777 hooks): check each external call against the checks-effects-interactions order.
Denial of service and griefing: unbounded and nested loops over arrays that grow, a recipient that reverts, ether
forced in by self-destruct against a check on address(this).balance. Input validation and arithmetic: zero
address, zero amount, overflow in compilers before 0.8 and in unchecked blocks, unsafe casts, division before
multiplication. External call safety: unchecked returns, push against pull payments. State invariants: what must
always add up, and which function breaks it. Guard consistency: a check most functions apply and one forgets.
Randomness and oracles: values a miner or the caller can choose. Signatures and proxies, when the contract has
them.

A finding needs one of three: someone who gains, someone who loses, or a service that stops. Say which: who gains
what, who loses what, or what can no longer be done and by whom; and who can make it happen (anyone, a user to
their own cost, a privileged account) and what it costs them. It need not be an attack: a mistake, ordinary use or
growth over time that ends in a loss or a stopped service counts the same. So does a harm that falls only on the
one who caused it, or on those who rely on what the code promises: a standard it claims, a state others read. With
nobody who gains, a loss or a stopped service is still a finding: how grave depends on what it costs to cause
against what is lost. A harm someone can do only to themselves, knowingly, is Low; one that ordinary use or a
mistake brings is graded by what is lost. A point with none of the three is not a finding: at most a Low note.
What only the owner can do to users is Medium at most, unless the contract promises users it cannot happen.

The report holds the findings, not the way to them. First every finding in one line: severity, function, what
happens. Then each finding in at most 100 words: how it is triggered, with concrete values, what is lost, the
smallest fix. Then the proof of concept, if code was asked for. Classes that are not present get one line together, at the end.

Proof of concept. When the question asks for code, every High finding comes with a proof of concept: a Foundry test that
passes on the code as it is and shows the loss (balances before and after, or the revert that blocks users). Give one
complete test file for all of them: the pragma of the project's compiler, imports by the paths the question gives,
setUp, one test function per finding, and the attacker contract when the attack needs one. Keep each test to the
fewest lines that prove the finding. A finding you cannot write a proof for is Medium at most: say what the proof
would need. The tests are written, not run: say so.
