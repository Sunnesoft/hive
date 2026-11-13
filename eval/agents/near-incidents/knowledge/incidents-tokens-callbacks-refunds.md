# Incidents: token hooks, callbacks and refunds

What went wrong between a token transfer, the receiver's hook and the callbacks that settle it.

## Credit kept after the token contract refunded the deposit
- **What happened:** A receiver hook credited the depositor's spendable internal balance at once, then called a contract named in the deposit message and chained a callback to take back what it reported unused. The callback panicked: its deductions were rolled back, the credit from the first receipt stayed, and the token contract, seeing a failed chain, returned the whole deposit. Repeated 23 times; seven-figure loss, later returned.
- **Look for:** `ft_on_transfer` or `mt_on_transfer` that writes a credit and returns a promise chain; a credit that survives the token contract's refund after a failed receipt.
- **Why reviews missed it:** the refund happens in another contract and receipt.
- **Not this if:** the credit is unspendable until settlement, or the hook returns a plain value.

## Refund request limited by the balance, not by this deposit
- **What happened:** In that flow the notified contract answered with the amounts it wanted refunded. The settlement callback capped each by the request and by the receiver's whole internal balance, but not by what the transfer being settled had deposited. With a large balance prepared in advance, a one-unit deposit supported a refund request thirty-six orders of magnitude larger, which set up the failure in the next entry. The hook was removed after a second critical report on it.
- **Look for:** callbacks that take an "unused" or "refund" amount from a callee's return value and apply `min(requested, balance)` without the deposited amount.
- **Not this if:** the refund cannot exceed the transfer being resolved, as in the reference `ft_resolve_transfer`.

## Event sized by the caller makes the callback fail
- **What happened:** The same settlement callback emitted a burn event listing every refunded token id and amount. The attacker sent 97 entries of a token with a long id and requested enormous refunds; the event passed the 16 KB log limit and logging aborted the receipt. A size check existed, but on the deposit event, with amounts of one unit.
- **Look for:** `env::log_str` or NEP-297 events in callbacks where entry count, id lengths or digits of amounts come from a caller or callee; uncapped batch methods.
- **Why reviews missed it:** logging is not seen as a way to panic.
- **Not this if:** worst-case log size is bounded before the first state write, or the callback cannot abort on logging.

## Settlement callback takes whatever came back
- **What happened:** A lending contract validated a minimum output before sending borrowed tokens to an exchange, but its callback credited the position with whatever returned and treated the trade as failed only when nothing had been spent. It neither compared the amount with the validated minimum nor recomputed the position's health. A return four million times smaller than validated was recorded as success. Eight-figure loss.
- **Look for:** `#[private]` callbacks after `ft_transfer_call` to an exchange that write a received amount into a position; an expectation not stored with the pending operation.
- **Why reviews missed it:** the check before the call looked like the guard; the exchange was trusted to enforce it.
- **Not this if:** the callback rejects and unwinds anything below the stored minimum.

## Failure branch writes back a snapshot
- **What happened:** A sale contract reduced balances, claims and a "distributed" flag only in callbacks, so one balance could be withdrawn several times before the first callback ran. The fix moved the reduction before the transfer and, on failure, assigned back a copy of the user's record and of contract-wide totals taken before the call. Overlapping withdrawals could then lose funds, and a per-account in-progress lock followed a month later.
- **Look for:** callback arguments carrying earlier state (whole structs, totals) that the failure branch stores; fields other calls may change in between.
- **Not this if:** the failure branch adds back exactly the amount taken, or the account is locked for the round trip and no shared total is restored from a copy.

## Fee named in the message and taken from the recipient
- **What happened:** A bridge-in hook let the `msg` of `ft_transfer_call` name a recipient address and a fee, paid in the base currency from the recipient's balance to the relayer, identified by `signer_account_id`. Token mappings were open to anyone, so an attacker could send a worthless token to a victim's address with the largest fee a `u64` holds and collect it, call after call. Seven-figure bounty.
- **Look for:** amounts parsed from `msg` and debited from any account other than `sender_id`; fees credited to the signer or the predecessor.
- **Why reviews missed it:** the front end never set the fee, so the path was never exercised.
- **Not this if:** whoever pays has signed for it, and unused options are deleted.

## Fee named in the message and taken from a shared prepaid balance
- **What happened:** A bridge added the native fee stated in a transfer message to the storage cost and deducted both from the sender's prepaid deposit. One integrating contract could not attach NEAR and was to keep a large prepaid deposit for all its users; any of them could state a huge native fee and exhaust it, stopping the route. Closed before use by a role that forbids native fees for such senders.
- **Look for:** a `sender_id` that is an intermediary (a contract, a relayer, a compatibility layer) holding one balance for many end users, and message fields that spend from it.
- **Not this if:** message fields cannot spend the intermediary's funds, or limits apply per end user.
