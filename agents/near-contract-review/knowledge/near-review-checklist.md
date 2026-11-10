# NEAR contract review checklist (Rust, near-sdk)

## Cross-contract calls and callbacks

A cross-contract call on NEAR is a separate receipt that runs later, often in a later block; the calling method finishes and its state changes are saved before the callee runs.
If the callee fails, state your contract changed before the call is not rolled back: a failed cross-contract call never undoes the caller's earlier writes.
The safe pattern is optimistic update with rollback: change state first (for example deduct the balance), make the call, and in a callback check the result and restore the state if the call failed.
Mark callback methods with #[private] so that only the contract itself can call them; without it anyone can call the callback directly and fake a success.
In the callback read the result with #[callback_result] result: Result<T, PromiseError> and handle the error branch; #[callback_unwrap] panics on failure, and a panicking callback leaves the optimistic state in place.
Give the callback enough gas: reserve a fixed amount for it (for example Gas::from_tgas(10)) when you build the promise; a callback that runs out of gas is a failed callback, and the rollback never happens.
Between your call and its callback other transactions can run against your contract; do not assume the state you saw before the call is still there when the callback runs.
For per-user operations in flight, keep a per-user lock or pending amount so that a second call cannot spend the same balance before the first callback settles.

## NEP-141 tokens

ft_transfer and ft_transfer_call require exactly 1 yoctoNEAR attached (assert_one_yocto); a function-call access key cannot attach a deposit, so this forces a full-access key, which wallets confirm with the user.
With ft_transfer_call the token calls ft_on_transfer(sender_id, amount, msg) on the receiver; the receiver returns the unused amount as U128, and the token's ft_resolve_transfer refunds that unused amount to the sender.
If ft_on_transfer panics, the token refunds the whole amount to the sender: a receiver that cannot handle a deposit should panic or return the full amount, never silently keep it.
In ft_on_transfer always check env::predecessor_account_id() against the token contract you accept: otherwise any account can call ft_on_transfer with an invented amount and be credited for tokens it never sent.
Credit the sender_id passed by the token, not env::signer_account_id(): the signer may be a different account than the one whose tokens moved.
An account must be registered with a token (storage_deposit on the token contract) before it can receive it; ft_transfer to an unregistered account fails, so register your contract and your users first.
USDC and most stablecoins use 6 decimals, NEAR uses 24: keep amounts as integers of the smallest unit and never parse them through floating point.

## Storage staking

Every byte a contract stores must be covered by NEAR locked on the contract account: 10^19 yoctoNEAR per byte, which is 1 NEAR per 100 kB.
If users can make your contract store data without paying for it, they can lock up its balance until it cannot store anything: the contract is bricked for everyone.
Charge for storage either with NEP-145 (storage_deposit, storage_withdraw, storage_balance_of) or by measuring env::storage_usage() before and after a write and requiring the attached deposit to cover the difference times env::storage_byte_cost().
Return the deposit when a user's data is deleted, and never let a user free storage that another user paid for.

## Collections and limits

near-sdk collections (LookupMap, IterableMap, Vector, LookupSet) keep each entry under a storage prefix; give every collection its own prefix, usually from a #[derive(BorshStorageKey)] enum, because two collections with one prefix corrupt each other.
Iterating a large collection in one call can exceed the gas a single call may use; views and methods that walk a collection need pagination (from_index and limit).
JSON numbers above 2^53 lose precision in JavaScript clients: take and return u64 and u128 values as strings with U64 and U128.

## Keys, callers and deposits

Authorise with env::predecessor_account_id(), the account that called this method; env::signer_account_id() is the account that signed the original transaction, and a contract in the middle can make your method see a signer who never meant to call it.
A function-call access key can call only the methods and the receiver it was created for, cannot attach a deposit and spends a gas allowance; give bots and backends function-call keys, keep full-access keys offline.
Require 1 yoctoNEAR on methods that move money or change ownership, so that a leaked function-call key cannot call them.
When a method panics, the NEAR attached to that call is refunded to the caller; a deposit is kept only if the method succeeds.
Turn on overflow-checks = true in the release profile of Cargo.toml, or use checked arithmetic on balances: an overflow must panic, never wrap.

## Upgrades and state

Contract state is stored as one serialized struct; if you deploy new code with a different struct, loading the old state fails and every call panics until you migrate.
Add a migration method marked #[init(ignore_state)] that reads the old struct and writes the new one, and run the deploy and the migration in one batch transaction so the contract is never left half-upgraded.
Decide who may upgrade: a full-access key on the contract account can replace the code at any time; for a trusted contract, delete those keys or move upgrades behind a multisig or a DAO, and say so to users.

## How to review

Start from the money: list every method that receives NEAR or tokens and every method that sends them, then follow each path through calls and callbacks.
For each cross-contract call ask: what did we change before the call, what happens if it fails, does the callback run with enough gas, and who else can call the callback.
For each stored item ask: who pays for its storage, and who can make it grow.
For each privileged method ask: which account may call it, how that is checked, and whether a function-call key could reach it.
