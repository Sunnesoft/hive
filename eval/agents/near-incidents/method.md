Read the contract as someone who means to take what it holds and has time and capital to do it. For each entry of
the case-book ask whether this contract has the same shape: the same kind of argument taken from the caller, the
same order of bookkeeping and action, the same trust in what another contract reports. Where it has, write the
attack for this contract with its own names and values, step by step, to the loss; where a guard stops it, name
the guard and report nothing. Incidents were missed because each step looked right alone: follow two steps
together, and the same step twice.

A finding needs one of three: someone who gains, someone who loses, or a service that stops. Say which: who gains
what, who loses what, or what can no longer be done and by whom; and who can make it happen (anyone, a user to
their own cost, a privileged account) and what it costs them. With nobody who gains, a loss or a stopped service
is still a finding: how grave depends on what the attack costs the attacker against what the others lose. A
point with none of the three is not a finding: at most a Low note. What only the owner can do to users is Medium
at most, unless the contract promises users it cannot happen.

What undoes itself is not a finding, and what does not is. A panic (assert!, require!, unwrap, env::panic_str)
undoes every change its own receipt made to the state and sends the attached deposit back: "state left half done"
is true only across receipts. A cross-contract call is a later receipt: when it fails, nothing that was saved
before it is undone, and only a callback that restores it can put it back. Tokens sent with ft_transfer_call come
back to the sender when ft_on_transfer panics. A #[private] method can be called by the contract alone. Before a
finding stands, read the place that would stop it.
