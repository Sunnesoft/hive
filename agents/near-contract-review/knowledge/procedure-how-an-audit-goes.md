# How an audit goes: NEAR contract (Rust, near-sdk)

## What the contract holds, and for whom
1. Assets. List what is held: NEAR, storage deposits, NEP-141 balances, NFTs, internal balances, shares, fees, rewards. For each: which method brings it in, which lets it out, to whom. Finding: a way in with no way out, also after a failed step; a way out not tied to whoever paid in.
2. What must add up. Write the equations the state implies: total = sum of balances; assets >= shares x price; staked + unstaked + pending = deposited; internal balance <= balance at the token. For each method writing one side, find where it writes the other. Finding: a path (failure branch, admin method, unregister) that moves one side alone.

## Every public method, one by one
3. Enumerate each `pub fn` in a `#[near]` / `#[near_bindgen]` impl, trait impls included (`ft_on_transfer`, `storage_*`, resolvers, `#[init]`). Put 4-7 to each one that can change state.
4. Who may call, with which key? A check of `env::predecessor_account_id()`, `#[private]` or a role, its result enforced; `assert_one_yocto()` wherever assets leave or roles and settings change. Finding: value, settings or another account's record changed unchecked; `env::signer_account_id()` deciding rights; a function-call key suffices; sibling methods disagree.
5. What moves? Under `#[payable]`: is `env::attached_deposit()` read, compared with the need, the excess returned? Whose record is debited, whose credited, in which unit?
6. What is assumed of each argument? Try zero, the maximum, dust, a duplicate, a missing or foreign id, the contract's own account, one account in two roles, a huge string, an unparsable `msg`. Finding: an accepted value that leaves state other methods cannot handle.
7. In which states may it run? Before init, paused, expired, with a promise outstanding, twice in one batch. Finding: runs when it should not; an exit refused just when it is needed.

## Every privileged method
8. Worst case, per method. Suppose the key is stolen: what does one call do to users' funds? Take each owner and operator method in turn: set a price, raise a fee, swap a token or oracle account, withdraw a balance holding deposits, edit the books, stop exits, replace the code. Finding: each method that reaches or freezes user funds, with what limits it.
9. Bound and delay. Is each setter and init argument bounded (fee cap, minimum duration, parts summing to the whole)? Does a change apply only to new positions, or after a waiting time? Finding: no bound; open positions repriced at once; a setting stored but never read.
10. Keeping and passing control. Transfer in two steps to a validated account? Can ownership be lost, or never changed? Full-access keys left on the account?

## Every cross-contract call and its callback
11. Enumerate each `Promise`: `ext_*` calls, `Promise::new(..)` transfers and function calls, `ft_transfer`, `ft_transfer_call`. Put 12-16 to each.
12. Written before the call? Is the caller's balance reduced when the promise is created, so a second call in the same block finds nothing to spend? Finding: check now, effect only in the callback.
13. Callback present, guarded, reading the result? `.then(..)`, `#[private]`, `#[callback_result]` or `env::promise_result(i)` at the right index. Finding: value sent with no callback; a callback that can panic and so keeps the optimistic write.
14. Failure branch against the write-list. List every field changed before the call: balance, total, counter, lock flag, timestamp, storage fee, attached NEAR. Tick each off in every failure branch, however far from the entry method. Finding: one not put back; restored from an old snapshot, not by the delta; refund to the wrong account; a lock never released.
15. In between. Which methods can touch the same record before the callback: withdraw, unregister, a share transfer, a setter? Does success mean what the code believes (`ft_transfer_call` succeeds even when the receiver returned everything)?
16. Gas. Fixed gas, enough for callee and callback at the largest input; `env::prepaid_gas()` checked on entry. Finding: a caller can fund the call but starve the callback.

## Every token received or sent
17. Incoming. In `ft_on_transfer` / `nft_on_transfer`: predecessor checked against accepted tokens; `sender_id` credited; unknown `msg`, unsupported token, zero amount handled; the unused part returned.
18. Named against moved. Does accounting trust an amount argument where what arrives or leaves can differ (fee on transfer, rebase, a callee paying less than asked)? Decimals assumed?
19. Outgoing. Is the receiver registered at the token, and who pays for it? If the transfer fails, is the amount credited back? Can a receiver chosen by a user, failing every time, block a queue, a liquidation or others' payouts?

## Every stored collection and loop
20. Growth. For each `LookupMap`, `Vector` or other collection in state: who adds an entry, at what price and minimum size, up to what cap; who removes it? Who pays the bytes (`env::storage_usage()` before and after, against the deposit), and is that returned on removal? Finding: bytes paid by the contract at a caller's will; an entry a stranger adds to a victim's record.
21. Iteration. For each loop over state: maximum length? At ten times the size, do withdraw, claim, liquidate or a callback still fit in gas? Views paginated, logs within the limit?

## Arithmetic on amounts, shares and time
22. Every division. Which way does it round, and who gains? Mints and payouts down, debts and burns up; multiply first. Divisor zero; first depositor alone.
23. Every add, subtract, multiply, cast. `overflow-checks = true` in the release profile; `as` casts; products beyond `u128`; a subtraction whose panic blocks an exit.
24. Every comparison, time and limit. `<` or `<=` at the first and last moment of a period and exactly at a limit. Inputs: unit (`env::block_timestamp()` is nanoseconds), compared with now, start before end, bounded, cannot be reset to stretch a lock. Prices: age and zero.

## Upgrade, migration, pause
25. Who upgrades? One key or a vote, with what delay? Is the contract paused meanwhile; does the balance cover the new code's storage?
26. Is the result checked? Deploy and migrate in one batch, gas reserved for the migration; if it fails, does new code sit over old state? Does the `#[init(ignore_state)]` method convert every field, keep every prefix, refuse a second run and a stranger? Can `#[init]` be called by anyone before the deployer, or twice?
27. Pause. Does one exist? Which methods obey it (`ft_on_transfer`, callbacks, claims)? Can users leave while paused; who lifts it?

## What every report states
28. Centralisation. What the owner alone can do to users, and what stands behind the owner besides one key. Calls a bot must make on time; who is stuck when one is late.
29. Unusual tokens. Fee, rebase, pause, blacklist, odd decimals: which one breaks the contract?
30. Standards and events. NEP-141/145/148/171/178 methods as specified; each change of balance, role or setting logged as a NEP-297 event with right values.
31. Dependencies and build. `near-sdk` and crates pinned and current, known advisories; test-only or state-resetting methods in the binary; hard-coded accounts and gas; comments contradicting the code.

## How findings are rated
Audit firms rate impact against likelihood (how easily the flaw is found and triggered, at what cost) and read severity off a matrix. Critical or High: users' funds stolen or frozen for good, or the contract insolvent, by any account with few preconditions; rare conditions, a victim's cooperation or large capital lower it a step. Medium: no direct loss, but a core function broken or unavailable, funds stuck for a time, value leaking under stated assumptions. Low: assets safe, but state handled wrongly or behaviour differing from the specification. Informational: code quality, gas, tests, dependency versions.

What only a privileged account can trigger is rated lower, the role being assumed honest: usually a centralisation note or Low; Medium where severe impact meets rare likelihood; High at a few firms when the owner can take or block users' funds. Dust lost to rounding is Low unless it repeats into a real sum or breaks an exact check. A departure from a standard is rated by what it breaks: informational alone, higher when integrators rely on it. Unsupported token behaviour is a note unless such tokens are meant to be accepted.
