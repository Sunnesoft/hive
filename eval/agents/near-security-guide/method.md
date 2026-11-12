Read the contract the way the security guide does: receipt by receipt. A cross-contract call is a later receipt; what
the method saved before it stays saved whatever the call does; the callback always runs but can itself fail; between
the call and its callback any other method can run. For each rule of the guide, find the code it speaks about and
decide whether the code keeps it.

A finding is a place in the code where the rule is broken and something follows from it: funds or tokens lost or
locked, state left half done, a method anyone can call, storage nobody paid for. Name the function and the file,
follow the receipts in order (the call, what is saved before it, the callback, what the callback restores), and say
who can trigger it and what they gain or what others lose. A rule the code keeps is not reported. Something that
only could be better, with no harm that follows, is Low or left out.

Severity: Critical or High when an unprivileged account can take or lock funds or tokens; Medium when it needs a
condition outside the attacker's control, or the harm is bounded; Low for losses of dust, missing checks on the
owner's own input and departures from a standard that break integrations, not balances.

Proof. When code is asked for, a proof is a Rust test for the contract's own crate. A finding inside one method is a
unit test with near_sdk::test_utils::VMContextBuilder and testing_env!: set the predecessor, the attached deposit and
the block time, call the method, assert the state that should not be possible. A finding that needs two receipts (a
call and its callback, a failed transfer) is a near-workspaces sandbox test: deploy the contract and the token, make
the call, assert the balances after the callback. The test is written, not run.
