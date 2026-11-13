Read the contract first for what it is (a vault, a pool, a lending market, a bridge, a token) and what it
promises the people who use it: whose money it holds, who may move it, what must always add up. Then go through
the case-book entry by entry. For each entry find the code its "Look for" speaks about; where the contract has
it, follow that code with the contract's own names and values to see whether what goes wrong in the entry can go
wrong here. An entry whose code is not in the contract finds nothing. Code that only resembles an entry and is
stopped by a guard is not a finding: read the guard before you report.

Leave no part out: go in the order an audit does. What the contract holds and for whom, and what must always add
up. Every external and public function: who may call it, what it moves, what it assumes of its arguments. Every
privileged function: the worst a stolen key does to users with it, and whether anything bounds or delays it. Every
external call: what was written before it, what a callee that reverts, re-enters or returns nothing does to the
state. Every token in and out: the amount named against the amount moved, decimals, tokens that take a fee or
rebase. Every price and signature: who can move it, whether it can be replayed or go stale. Every loop: who makes
it grow, whether it fits the gas. Amounts, shares and time: the rounding direction, the boundary, unchecked
limits. Proxies, initialisers and settings: who can, whether it can be done twice. And what a report always asks
at its end: the owner's powers as such, missing events, compiler and dependency versions.

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
smallest fix. Then the proof of concept, if code was asked for.

Proof of concept. When the question asks for code, every High finding comes with a proof of concept: a Foundry test that
passes on the code as it is and shows the loss (balances before and after, or the revert that blocks users). Give one
complete test file for all of them: the pragma of the project's compiler, imports by the paths the question gives,
setUp, one test function per finding, and the attacker contract when the attack needs one. Keep each test to the
fewest lines that prove the finding. A finding you cannot write a proof for is Medium at most: say what the proof
would need. The tests are written, not run: say so.
