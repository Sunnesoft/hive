# Cases: tokens and what a contract assumes about them

What audits report about receiving and sending NEP-141 and NFT tokens, and about deviations from the standards.

## Fee-on-transfer, deflationary and rebasing tokens (seen in many reports, as a recommendation)
- **Look for:** a contract that accepts tokens chosen by users or by an owner and credits the `amount` argument, or pays out recorded amounts, with no rule on which tokens may be listed.
- **What goes wrong:** recorded balances exceed what the contract holds; the last users cannot withdraw.
- **Usually rated:** a recommendation or note, repeated in almost every exchange and farming review.
- **Not a finding when:** a whitelist is in place and its policy excludes such tokens. Reports still mention it.

## ft_on_transfer accepts any token (seen in several reports)
- **Look for:** an `ft_on_transfer` (or `mft_on_transfer`, `nft_on_transfer`) that never compares `env::predecessor_account_id()` with the token the action expects or with a whitelist; or that learns which token or which trusted sender it deals with from fields inside `msg`.
- **What goes wrong:** a bid, a fee or a repayment is made with a worthless token and booked as the real one; junk tokens fill a map that a later method walks, which bricks that method; an outsider poses as the privileged sender.
- **Usually rated:** High to Critical for payment with the wrong token; Medium for griefing.
- **Not a finding when:** the predecessor is checked against the expected token before anything is credited.

## Deviations from the standard interfaces (seen in several reports)
- **Look for:** `nft_transfer_payout` whose arguments differ from the standard (no optional `memo`, `approval_id` or `max_len_payout` not optional); `ft_transfer` called with a `msg` field; a hand-written NFT or FT core where near-contract-standards would do; `storage_unregister` answering `true` for an unknown account; mint and burn paths that skip the `FtMint` / `FtBurn` events; `log!` strings where the rest of the code emits structured events.
- **What goes wrong:** marketplaces, wallets and indexers cannot call the contract or do not see supply changes.
- **Usually rated:** Low to Medium; Informational for events.

## Decimals taken for granted (seen in several reports)
- **Look for:** amounts of two tokens compared or multiplied raw although their decimals differ; a wrapped asset whose decimals differ from the native one; `10u128.pow(decimals)` with decimals nobody bounded; values cut to fewer decimals for another chain with the remainder kept.
- **What goes wrong:** orders that never match, a price off by powers of ten, an overflow panic in valuation, dust withheld from users.
- **Usually rated:** Low to High.

## #[payable] where no deposit is needed (seen in several reports)
- **Look for:** `#[payable]` on methods that neither use nor return `env::attached_deposit()`; a setter that accepts any deposit and refunds all but one yocto through a promise.
- **What goes wrong:** a user who attaches NEAR by mistake loses it; needless promises.
- **Usually rated:** Informational or a warning.
- **Not a finding when:** the method asserts exactly one yocto.

## u64 and u128 in JSON (seen in several reports)
- **Look for:** plain `u64` / `u128` in arguments, return values or structs of public methods (a pool id, a timestamp, a balance inside a map) instead of `U64` / `U128`.
- **What goes wrong:** JavaScript clients lose precision above 2^53; a wrong value is submitted or shown.
- **Usually rated:** Informational; once Medium.

## NFT sale and redemption flows (seen in several reports)
- **Look for:** a marketplace that lists on approval alone and never takes the NFT into custody; a `buy` path that does not check whether the listing is an auction; deletion of a listing that already holds bids; an NFT that stays transferable while its redemption or burn waits for a callback; ownership mirrored in a second contract and not reverted when `nft_resolve_transfer` returns the token; royalty payout arithmetic that underflows with many recipients.
- **What goes wrong:** bids locked for good, an auction cut short at the ask price, a buyer paying for a voucher that is burnt a block later, access rights held by someone who no longer owns the token, a token that cannot be sold.
- **Usually rated:** Medium to Critical.

## Standing notes on a token contract itself (seen in several reports)
- **Look for:** in a NEP-141 implementation: the whole supply minted to one account at init with no later mint or burn; a "burn" that is a transfer to a fixed account; a transfer fee that rounds to zero on small amounts; a fee whitelist whose comment says the opposite of the code; a transfer to an account never seen before that creates its balance entry with no storage deposit; mint and burn of a controller reachable with a function-call key; core logic left to near-contract-standards and stated as an assumption.
- **What goes wrong:** holders and integrators assume properties (real burning, a fee on every transfer, paid storage) the code does not have.
- **Usually rated:** notes and recommendations; Medium for unpaid storage.

## Receiver keeps tokens it cannot use (seen in two reports)
- **Look for:** `ft_on_transfer` returning `U128(0)` in branches where the message is unknown, the contract is set up for another asset or for native NEAR only, or the feature is closed or paused.
- **What goes wrong:** the tokens stay in the contract with no record of whose they are.
- **Usually rated:** Low to Medium.
- **Not a finding when:** those branches return the full amount or panic.

## Credit derived from something the caller controls (seen in two reports)
- **Look for:** a credit computed from `ft_balance_of` before and after a swap for a token id named by the caller and not matched to the swap's output; an action amount inside `msg` larger than the `amount` actually transferred; a public method that adds its argument to the caller's balance.
- **What goes wrong:** deposits of a valuable token are minted from a cheap one; tokens held for other users are swapped away.
- **Usually rated:** Critical.

## Unequal accounting for native NEAR and tokens (seen in two reports)
- **Look for:** one counter used both for a NEP-141 asset and for native NEAR; a NEAR deposit method open while the contract is configured for a token; wrapped NEAR obtained in a callback and not counted when a refund is computed.
- **What goes wrong:** withdrawals pay the wrong asset or the wrong amount, or the vault stops working.
- **Usually rated:** High to Critical.

## Factory passes on what the child will reject (seen once)
- **Look for:** a factory that validates fewer arguments than the `new` of the contract it deploys, sends NEAR with the deployment and has no callback.
- **What goes wrong:** the child's init panics, the user's NEAR is gone and no contract exists.
- **Usually rated:** Medium.

## Rewards not settled when a transfer is reversed (seen once)
- **Look for:** a token with per-holder dividends whose `ft_resolve_transfer` moves balances back without first settling both parties.
- **What goes wrong:** dividends are computed on balances that were never held for the period.
- **Usually rated:** a recommendation.
