# Cases: cross-contract calls, callbacks and failed transfers

What audits report about the gap between a promise and its callback, and about remote calls that fail.

## State changed only in the callback (seen in many reports)
- **Look for:** a method that checks a balance, a limit or an "exists" flag, schedules `ft_transfer` or another call, and subtracts, removes or marks only in the callback. Also limits compared with settled totals while amounts in flight are ignored.
- **What goes wrong:** the caller repeats the call (one batch, or twice in a block) before the first callback runs; each call passes the check. Withdraw, borrow, unlock or liquidate runs several times on one balance and pays out other users' funds.
- **Usually rated:** Critical or High.
- **Not a finding when:** the debit or pending mark is written before the promise is created and the callback only restores on failure.

## Promise sent with no callback (seen in many reports)
- **Look for:** `Promise::new(..).transfer(..)`, `ft_transfer`, `mft_transfer_call`, `storage_deposit` or a sub-account deployment returned or dropped without `.then(..)`, after a balance was already reduced or a record created.
- **What goes wrong:** the receiver is unregistered or the call runs out of gas; the transfer fails, the debit stays, the user's funds exist nowhere. Or the contract goes on as if the child contract existed.
- **Usually rated:** Medium; High when the receiver is chosen by a user. Teams sometimes accept it as designed.
- **Not a finding when:** a callback restores state or moves the amount to a claimable holding balance.

## Callback restores the wrong thing (seen in many reports)
- **Look for:** the failure branch. Does it restore every field the first step touched (balance, shares, totals, score, timestamp, storage fee)? Does it write back a number computed before the call, such as a share count, although the share price moved since? Does it `unwrap` an account that may have unregistered meanwhile?
- **What goes wrong:** books left inconsistent; stale shares give or take value; a fresh timestamp makes the user wait the delay again, a cleared one lets him skip a lock; a credit to a vanished account is lost.
- **Usually rated:** Medium, from Low to High by what stays wrong.

## Attached NEAR not returned when a later step fails (seen in several reports)
- **Look for:** a `#[payable]` method that keeps or forwards `env::attached_deposit()` and continues over a promise. In the failure branch of the callback, is there a transfer back to the payer, and was the payer passed as an argument (in a callback the predecessor is the contract)? Check branches such as fee == 0 and early returns.
- **What goes wrong:** only a panic in the first receipt refunds automatically; after that the deposit or storage fee stays in the contract.
- **Usually rated:** Low to High, by the amount.

## Value read through a call is old when used (seen in several reports, mostly as a note)
- **Look for:** a price, pool state or staked total fetched by a cross-contract view and used in the callback; a public "refresh total" method whose callback overwrites a total with the snapshot.
- **What goes wrong:** deposits made in between are overwritten or mispriced.
- **Usually rated:** a note; Medium when a public refresh can clobber a total.

## Callback does not look at the result (seen in several reports)
- **Look for:** a callback with no `PromiseResult` or `#[callback_result]` check, a success branch only, or a chain of two calls where only the last result is read.
- **What goes wrong:** state is finalised as success although the remote call failed: a pair registered without storage on the token, a deployed child whose registration failed, a caller told "created" when nothing was.
- **Usually rated:** Medium to High.

## Lock flags that can be held or bypassed (seen in several reports)
- **Look for:** a `locked` or `pending` flag set before a call and cleared in its callback. Does every mutating method test it? Does the callback of another public method (a "ping") clear it? Can anyone start the locking operation on a shared object with a dust amount, or make its transfer fail repeatedly? Can the asset itself be transferred while pending?
- **What goes wrong:** the race reopens, or a pool or a position due for liquidation is kept locked by an attacker.
- **Usually rated:** Medium to High.

## Panic inside a callback (seen in several reports)
- **Look for:** in callbacks: `unwrap`, `expect`, `require!`, a `lock()` that panics when already locked, a transfer helper that panics on zero amount or low balance, loops over user-sized data.
- **What goes wrong:** the panic undoes only the callback: no rollback, the lock stays set, the deposit is not refunded. If an outsider can provoke it, a user's funds are stuck for good.
- **Usually rated:** High.

## Deployment and initialisation in separate receipts (seen in several reports)
- **Look for:** a factory doing `create_account().deploy_contract(code)` and calling `new` in a chained `.then(..)` instead of a `function_call` in the same batch; an `#[init]` method that is public and takes the owner from arguments, run by the deploy script as a second transaction.
- **What goes wrong:** between the receipts anyone calls `new` and becomes owner or minter of the fresh contract.
- **Usually rated:** Critical for a factory of wrapped assets; Low to Medium for a project's own deployment.

## Outgoing call built wrongly (seen in several reports)
- **Look for:** `.then(Self::ext(x))` where x is not `env::current_account_id()`; a deposit that differs from what the callee asserts; a Gas constant named for another call; `ft_transfer` given a `msg` field.
- **What goes wrong:** the call always fails and the feature, often an asset withdrawal, is dead.
- **Usually rated:** High when it blocks withdrawals, otherwise Medium or Informational.

## Marked as processed before the action completes (seen in two reports)
- **Look for:** a replay guard (hash or nonce inserted) or a "minted" flag written in the first receipt while the transfer happens later, in a flow anyone may relay with gas and deposit of his choice.
- **What goes wrong:** an attacker relays the victim's message so that the action fails; the message is consumed and the funds are stranded. The mirror case: deposits that can never succeed are retried forever.
- **Usually rated:** Critical when relaying is open; Low to Medium otherwise.

## Callback judges the wrong promise (seen in two reports)
- **Look for:** a refund transfer inserted between the real call and the callback, so the callback sees the refund's result; a callback after `ft_transfer_call` that treats "promise succeeded" as "tokens accepted" without reading the returned used amount.
- **What goes wrong:** failure is recorded as success, or the reverse.
- **Usually rated:** Low to Medium.
