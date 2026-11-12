# Cases: gas, loops and limits; upgrades, build and code hygiene

What audits report about work that does not fit into one call, about upgrading a deployed contract, and the standing remarks on build and code quality that fill the lower half of most reports.

## Loop over a collection users can grow (seen in many reports)
- **Look for:** iteration over holders of a token, an account's deposits or positions, all accounts, beneficiaries, tokens ever received, auctions, inactive positions; one promise created per entry. Ask who can add entries and at what price (mint at price 1, dust deposits credited to a victim).
- **What goes wrong:** past some size the method cannot finish within 300 Tgas: a payout, "withdraw all", an oracle's batch update, a liquidation scan or the contract's own start-up is bricked, sometimes for good.
- **Usually rated:** High to Critical when outsiders control the size; Low or a recommendation when only the owner does.
- **Not a finding when:** entries are capped, or processing is paged and resumable.

## Dead code, leftovers and thin tests (seen in many reports)
- **Look for:** unused functions, constants and state fields; commented-out modules; methods whose body only panics; unresolved TODOs, some describing known bugs; debug `log!` calls; redundant or repeated checks; no tests for the flows that move money; tests that silently do not run or that pass through authorisation shortcuts production lacks.
- **What goes wrong:** nothing at once; the binary and the attack surface are larger, readers are misled, and untested paths are where the real bugs sit.
- **Usually rated:** Informational; missing tests once Medium.

## Upgrade path (seen in many reports)
- **Look for:** no `migrate` method, or admin methods that write raw state; code deployment and state migration as separate transactions; an upgrade method that does not check prepaid gas for the migrate call or the storage cost of the new code; no pause while an upgrade or rollback is under way; a post-upgrade sanity view that omits the owner; migration that leaves some stored blobs in the old layout with no version tag.
- **What goes wrong:** a window, or a permanent state, in which every call fails to deserialize; a bad upgrade that the owner cannot repeat.
- **Usually rated:** Low or a recommendation.
- **Not a finding when:** deploy and migrate run in one batch and the owner is a multisig or DAO.

## Outdated or unpinned dependencies (seen in many reports)
- **Look for:** an old `near-sdk` / `near-contract-standards`; crates flagged by `cargo audit` (unmaintained allocator, old `borsh`, `chrono`); versions not pinned; a build that cannot be reproduced to match the deployed code hash.
- **What goes wrong:** published advisories reach the contract; nobody can show that the deployed wasm is the reviewed source.
- **Usually rated:** Informational; pinning and reproducible builds once rated High.

## Binary size and build profile (seen in many reports)
- **Look for:** `crate-type = ["cdylib", "rlib"]`; a release profile without `opt-level = "z"` and the other size-oriented flags; debug info not stripped.
- **What goes wrong:** a larger wasm costs more NEAR to store and deploy.
- **Usually rated:** Informational.

## Gas for the call and its callback (seen in many reports)
- **Look for:** no comparison of `env::prepaid_gas()` with the gas the promises and callbacks will need; a gas constant defined for one call and used for another; two similar calls given different gas; a weight split out of proportion to the constants; comments with measurements older than the last refactor; a token's `ft_transfer_call` that does not reserve gas for `ft_on_transfer` and `ft_resolve_transfer`.
- **What goes wrong:** the first call succeeds and the callback starves, so the rollback or the settlement never runs.
- **Usually rated:** Medium to a recommendation.

## Redundant guards and macros (seen in many reports)
- **Look for:** `assert!(!env::state_exists())` inside an `#[init]` method; a hand-written "predecessor equals current account" assertion in place of, or next to, `#[private]`; `#[near_bindgen]` on impl blocks that hold only internal functions; `assert!` where `require!` gives a smaller binary and cleaner message.
- **What goes wrong:** nothing; extra bytes and gas, and a sign that the macro's own behaviour was not known.
- **Usually rated:** Informational.

## Queues and windows one actor can occupy (seen in several reports)
- **Look for:** a first-in-first-out withdrawal queue with a low minimum per request; a per-period withdrawal cap for the whole pool; a multi-step process whose precondition anyone can keep false (rewards still pending, queue not empty).
- **What goes wrong:** spam or one large request delays everyone; an actor takes the full allowance each window; the owner can never finish closing an object.
- **Usually rated:** Low to High.

## Hard-coded values (seen in several reports)
- **Look for:** account ids of external contracts compiled into the code; a storage price or timeout as a constant; settings with no setter.
- **What goes wrong:** a redeploy for every change, or wrong charges if protocol parameters move.
- **Usually rated:** Informational to Low.

## Views without pagination (seen in two reports)
- **Look for:** a view that returns a whole collection: all staking pools, all code versions, all positions of an account.
- **What goes wrong:** the view exceeds its gas limit as the list grows and clients go blind.
- **Usually rated:** Low or a recommendation.

## Log limits (seen in two reports)
- **Look for:** one `log!` or event per loop iteration (a receipt allows 100 logs); a single event string that grows with the number of items processed (about 16 kB of log text per receipt).
- **What goes wrong:** the receipt panics once enough items exist; an attacker creates them cheaply, for example expiring orders, and the market stops.
- **Usually rated:** Critical to Medium.

## Multi-call work that loses its progress (seen in two reports)
- **Look for:** a loop that checks remaining gas and returns before writing its cursor or partial result back; a loop meant to be resumed that has no break at all.
- **What goes wrong:** each call repeats the same work and never completes; the owner cannot clean up or boot.
- **Usually rated:** Medium to High.

## Old contract still live during migration to a new one (seen once)
- **Look for:** a per-account "migrating" state that the claim, withdraw and restake methods of the old contract do not test.
- **What goes wrong:** the user claims in the old contract while the transfer is in flight and again in the new one.
- **Usually rated:** Medium.
