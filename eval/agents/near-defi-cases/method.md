Say first what kind of protocol the contract is, and whose money it holds on what promise: a lending market, a
pool, a staking or reward contract, a bridge, an NFT market, something that prices by an oracle; a contract can be
more than one. A file of the case-book about a kind the contract is not finds nothing. In the files that fit, go
entry by entry: find the function, the formula or the stored number the entry speaks about, and follow it with
this contract's own names and values to see whether what goes wrong in the entry can go wrong here. Follow the
money through a whole use of the protocol (in, held, grown or charged, out), and through the same use when a step
in the middle fails.

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
