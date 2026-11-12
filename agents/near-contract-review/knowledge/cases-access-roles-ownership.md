# Cases: access, roles and ownership

What audits report about who may call a method, with which key, and how control of the contract is held and passed on.

## Public method with no caller check (seen in many reports)
- **Look for:** every `pub fn` with `&mut self` inside a `#[near_bindgen]` / `#[near]` impl block. Typical offenders: helpers meant to be called only from `ft_on_transfer` or from another contract of the system (credit a balance, record a score, update a holder, add a reward, burn for an account) left `pub`; a config setter with no owner assertion; a resolver such as `nft_resolve_transfer` without `#[private]`; `mint` with a comment promising a check that is not there.
- **What goes wrong:** anyone credits himself, burns or moves another user's assets, or rewrites a protocol parameter.
- **Usually rated:** Critical. It is the most frequent Critical in these reports.
- **Not a finding when:** the method is not `pub`, sits in an impl block without the macro, is `#[private]`, or asserts the predecessor.

## Privileged or value-moving method callable without 1 yoctoNEAR (seen in many reports)
- **Look for:** owner and guardian setters, withdraw, claim, burn, `storage_withdraw`, a registration that fixes who will own an asset, mint and burn of a bridge controller. Often some methods call `assert_one_yocto()` and their siblings do not; or the method is `#[payable]` and never looks at the deposit.
- **What goes wrong:** a function-call access key, held by a front end or stolen from a browser, is enough to call it; no wallet confirmation happens.
- **Usually rated:** Low or a recommendation; Medium to High when the method decides ownership or covers every owner function of an exchange. The inconsistency alone gets reported.
- **Not a finding when:** the method is a callback or is reached only through `ft_transfer_call`.

## Centralisation of the owner (seen in many reports)
- **Look for:** what one account can do alone: upgrade the code, set a price or rate directly past the oracle, withdraw the treasury, pause, change the oracle or the token whitelist, move users' assets; and whether that account is a plain key.
- **What goes wrong:** a stolen key or a dishonest owner takes or freezes everything.
- **Usually rated:** a note or recommendation (use a multisig or DAO); Low to Medium when the owner can overwrite a price or reach user funds.

## Ownership handed over in one step (seen in many reports)
- **Look for:** `set_owner(new_owner)` that writes at once. Variants: the new owner is a `String` never validated as an account id; the new owner must already have an account record inside the contract and this is not checked; there is no method to change the owner at all; the method exists but is not exported.
- **What goes wrong:** a typo loses control for good; an unregistered owner makes later fee accounting panic and freezes the contract.
- **Usually rated:** Low or Informational.
- **Not a finding when:** the new owner must accept in a second call.

## Method acts on an item the caller does not own (seen in several reports)
- **Look for:** methods taking an `account_id` or an item id and never comparing its owner with `env::predecessor_account_id()`: `storage_withdraw(account_id)`, merge of two positions, deletion of a listing, a per-user flag.
- **What goes wrong:** an outsider withdraws another account's storage deposit and unregisters it, merges someone's bond into a longer lock, or deletes a sale that holds bids.
- **Usually rated:** Critical to Medium.

## signer_account_id where predecessor is meant, and the reverse (seen in several reports)
- **Look for:** `env::signer_account_id()` in owner checks, as the account credited in `ft_on_transfer`, or passed to callbacks as "the user". The reverse: `predecessor_account_id()` taken as the user in a method reached through `ft_transfer_call`, where the predecessor is the token.
- **What goes wrong:** a user lured into signing a call to a malicious contract passes the check on the victim contract; an owner that is a multisig or DAO can never pass a signer check; positions get assigned to the wrong account.
- **Usually rated:** Medium; High on owner checks; Low for attribution.

## Roles that may coincide (seen in several reports)
- **Look for:** init and setters that accept the same account for two roles (owner and operator, owner and price maintainer, treasury and developer fee account); one whitelist serving different privileges; the owner key also used for routine fee collection.
- **What goes wrong:** the separation promised by the design does not hold; one role collects what belongs to another.
- **Usually rated:** Low to Medium, or a recommendation.

## A role with no way to act (seen in several reports)
- **Look for:** fees that accumulate with no withdrawal method; a reward assigned to a beneficiary with no claim method; a value fixed at init with no setter; a whitelist with add and no remove; no recovery path for funds stuck after a failed step.
- **What goes wrong:** value locked in the contract, or a full redeploy to change one setting.
- **Usually rated:** Low to Medium.

## Signed messages that bind too little (seen in several reports)
- **Look for:** a signature check (ticket, voucher, bridge message). Does the signed content name the method or purpose, and include every field used later? Is verification skipped when no public key was configured for the product?
- **What goes wrong:** a ticket issued for one action is replayed on another; unsigned header fields are forged in a second step; premium deposits pass unsigned.
- **Usually rated:** Informational to Medium.

## Maintenance or test methods left in the build (seen in several reports)
- **Look for:** `drop_state`, `clear`, `reset_*`, raw state writers, methods described as test-only without `#[cfg(test)]` or a feature gate.
- **What goes wrong:** one call wipes markets or balances; extra attack surface.
- **Usually rated:** Low to High, by the guard on it.

## Check computed but not enforced (seen in two reports)
- **Look for:** `self.is_owner_or_guardian()` called as a statement, its bool dropped; an "is the sender trusted" comparison against an id that was itself parsed from the caller's `msg`.
- **What goes wrong:** the method is open to everyone although it reads as guarded.
- **Usually rated:** High.

## Approval threshold fixed when the request was created (seen once)
- **Look for:** a multisig that stores the required confirmations from the member count at creation, while members can be added or removed later.
- **What goes wrong:** an old request passes with a smaller share of signers than intended.
- **Usually rated:** Medium to High.
