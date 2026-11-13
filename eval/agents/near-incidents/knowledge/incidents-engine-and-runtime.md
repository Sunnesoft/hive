# Incidents: hosted interpreters, relayed transactions and runtime assumptions

Bugs that came from running user code or relayed transactions inside a contract, and from wrong beliefs about how NEAR schedules receipts.

## Built-in handler trusts the calling context's value
- **What happened:** An EVM hosted in a NEAR contract had built-in addresses turning currency sent to them into withdrawals: the handler read the call context's value, logged an exit event, and the engine scheduled a token transfer per log. Under delegatecall the context showed the caller's value while nothing reached the handler; the attacker kept his balance and got the withdrawal, doubling each round. Nine-figure sum at risk; seven-figure bounty.
- **Look for:** handlers acting on a declared "attached value" instead of a debit they perform; logs later treated as proof of payment.
- **Why reviews missed it:** static calls were refused; delegatecall was not considered.
- **Not this if:** the handler debits the payer itself and rejects contexts where it is not the callee.

## Self-call step runs although the earlier promise failed
- **What happened:** A cross-contract-call feature had the contract call one of its ordinary public entry points as a later link of a chain, to move wrapped NEAR to a user's sub-account, and had a child contract accept instructions from its parent. Neither looked at promise results, so the link executed even when the preceding promise had failed. The fix refuses to proceed when the predecessor is the contract itself (or the parent) and any result is not a success.
- **Look for:** `.then(Self::ext(env::current_account_id()).method(..))` where `method` is a normal entry point without `#[callback_result]`; children that take "the caller is my parent" as proof that the parent's step worked.
- **Not this if:** each chained link inspects every `env::promise_result(i)` before acting.

## Next link attached to a receipt, not to the promises it creates
- **What happened:** In the same feature one link of a chain was a call to the contract itself that created further promises inside (a token transfer), and the following link (unwrapping to NEAR) was attached to it with `.then`. The first link's receipt was complete once it had scheduled its promises, so the second could run before the transfer happened. Fixed by collecting the promises created inside the link and returning them as its result.
- **Look for:** a method used as a link that calls `Promise::new(..)` or `ext(..)` and returns `()` or a plain value; `.detach()`; helpers that drop a promise.
- **Not this if:** the link returns its promise (`Promise` or `PromiseOrValue`), so the chain waits.

## Native transfer scheduled before the balance exists
- **What happened:** A bridge finalised withdrawals of native NEAR by creating, in one receipt, a call that unwraps wrapped NEAR and a `Promise::new(recipient).transfer(amount)`. The runtime takes the amount from the contract's account when the transfer is created, not when it executes. If the liquid balance was below the amount, the receipt failed, however much wrapped NEAR the contract held, and large withdrawals would have stayed stuck for good.
- **Look for:** `.transfer(x)` created in the same function as the call meant to provide `x`: `near_withdraw`, unstake, claim, a refund expected from another contract.
- **Not this if:** the transfer is created in a callback that runs after the providing call has succeeded.

## JSON for an outgoing call built by string formatting
- **What happened:** The engine assembled the arguments of an outgoing `ft_transfer_call` with `format!`, placing a user-supplied message between quotes. A message containing a quote followed by another `"amount"` key yielded JSON with the attacker's fields after the genuine ones; which value wins is up to the receiving token's parser. Hardened by serializing a struct instead.
- **Look for:** `format!` or concatenation producing JSON arguments, `msg` payloads or memos from caller strings; account ids inserted as raw text; hand-escaped quotes.
- **Not this if:** arguments are serialized with `serde_json` from typed values and ids are parsed as `AccountId`.

## Fee charged on a path that leaves the nonce unchanged
- **What happened:** Anyone could submit a user's signed transaction to the engine and receive its priority fee. Two kinds of contract-creation transaction failed inside the interpreter before the sender's nonce was incremented, yet gas was still charged and the fee went to the submitter. Whoever saw such a signed transaction could submit it repeatedly and collect each time. Fixed by rejecting those transactions before any charge.
- **Look for:** relayed signed messages (meta-transactions, intents, permits) with an exit after a charge that has not consumed the nonce; an early `return Err(..)` between "charge" and "increment" that lets the receipt succeed.
- **Not this if:** the nonce is consumed first, or failure panics so that the charge reverts with the receipt.

## Signed transactions accepted without a chain identifier
- **What happened:** Early releases of the engine executed signed transactions that carried no chain id, so one signed for another network by the same key with a matching nonce was valid here as well. Rejecting them was shipped as a security improvement.
- **Look for:** verification with `env::ecrecover` or `env::ed25519_verify` over a payload that lacks the network, the verifying contract's account id, a nonce or an expiry; optional fields of a signed envelope that default to "any".
- **Not this if:** all of these are inside the signed bytes and their absence is an error.

## Arithmetic on caller-sized values that aborts the engine
- **What happened:** A run of small bounties on one engine: an exponent length of `usize::MAX` overflowed an offset in a precompile; subtracting from a promise count underflowed when there were none; balance and gas sums in the cross-contract-call module overflowed; narrowing a 256-bit amount to `u128` panicked in the withdrawal built-ins; a gas-cost overflow could crash execution. No funds moved, but each let a caller abort a path that others rely on, or made results differ from the reference implementation.
- **Look for:** `as`, `+`, `-`, `*` on lengths, counts and amounts decoded from input; `len() - 1`; `U256::as_u128()`.
- **Not this if:** checked operations return an error the caller's flow can handle.

## Nested `then` scheduled in the wrong order
- **What happened:** With early SDK releases `p1.then(p2.then(p3))` ran `p2` before `p1`, while `p1.then(p2).then(p3)` ran in the written order. From version 4 the nested form panics instead. In code written against the old behaviour a payout or a state change could run before the step it was meant to follow.
- **Look for:** promises built in helper functions and combined later; a `.then(..)` whose argument itself contains `.then(..)`; `near-sdk` below 4.0 in `Cargo.toml`.
- **Not this if:** chains are flat and the SDK is current.
