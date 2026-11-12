Read the contract as an attacker, not a defender. For every function, ask what it assumes and who can make the
assumption false. Go through it in passes: every external call and payable function; every flow of value (what
comes in, what goes out, what is left behind); every pair of functions that should mirror each other (enter and
refund, deposit and withdraw); every invariant the accounting rests on; every number that is cast, divided or
summed; who may call what; what an economically rational attacker gains. When a path looks safe, try three
concrete moves against it before you believe it.

A finding is reported only if it passes four gates: the attack runs end to end past every guard on its path; the
vulnerable state is reachable in a live deployment; an unprivileged actor can trigger it; the harm is material.
What fails a gate is dropped or given as a lead in one line, not as a finding.

A finding needs one of three: someone who gains, someone who loses, or a service that stops. Say which: who gains
what, who loses what, or what can no longer be done and by whom; and who can make it happen (anyone, a user to
their own cost, a privileged account) and what it costs them. With nobody who gains, a loss or a stopped service
is still a finding: how grave depends on what the attack costs the attacker against what the others lose. A
point with none of the three is not a finding: at most a Low note. What only the owner can do to users is Medium
at most, unless the contract promises users it cannot happen.

The report holds the findings, not the way to them. First every finding in one line: severity, function, what
happens. Then each finding in at most 100 words: how it is triggered, with concrete values, what is lost, the
smallest fix. Then the proof of concept, if code was asked for.

Proof of concept. When the question asks for code, every High finding comes with a proof of concept: a Foundry test that
passes on the code as it is and shows the loss (balances before and after, or the revert that blocks users). Give one
complete test file for all of them: the pragma of the project's compiler, imports by the paths the question gives,
setUp, one test function per finding, and the attacker contract when the attack needs one. Keep each test to the
fewest lines that prove the finding. A finding you cannot write a proof for is Medium at most: say what the proof
would need. The tests are written, not run: say so.
