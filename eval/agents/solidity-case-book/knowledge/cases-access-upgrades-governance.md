Findings about who may call what: access checks, privileged roles, initialisers, upgradeable storage, deployment addresses, pausing and on-chain governance.

## State-changing function anyone can call — seen in many reports
- **Look for:** an external setter (threshold, registry address, rate feed), fee mint, token or pool registration or vesting release with no modifier; a helper left `public`; a modifier declared and never applied; an address argument accepted because it has code or was simply passed in, with no registry lookup.
- **What goes wrong:** an outsider sets a price, mints to themselves, registers a fake pool or token and drains rewards or collateral. Free.
- **Usually rated:** High or Critical.

## Setter and constructor arguments unchecked — seen in many reports
- **Look for:** no zero-address check on roles, treasury or oracle; no range on fees, ratios, durations; related settings never compared (minimum below maximum, penalty below threshold, shares summing past 100%); parallel arrays of unequal length; duplicate list entries.
- **What goes wrong:** one mistaken admin transaction bricks a feature or locks funds; some combinations make proposals or auctions impossible.
- **Usually rated:** Low; Medium when a value past its bound lets funds be taken or stuck.

## Privileged role with no bounds or delay — seen in many reports
- **Look for:** an owner who can set a fee to 100%, replace the oracle or core addresses, pause withdrawals, upgrade without a timelock, or move tokens users approved; a hot key that can redirect rewards.
- **What goes wrong:** a compromised or dishonest admin takes user funds or front-runs users with a setting.
- **Usually rated:** Medium when it exceeds the stated trust; otherwise Low or informational.
- **Not a finding if:** caps sit in code and changes pass a timelock.

## Sensitive change without an event, or with wrong event data — seen in many reports
- **Look for:** setters, role changes, pausing and fund movements that emit nothing; events carrying the old value, the wrong unit or the wrong account; emission before the state is final.
- **What goes wrong:** off-chain monitoring and interfaces miss or misread the change.
- **Usually rated:** Low or informational.

## Initialiser open, repeatable or incomplete — seen in many reports
- **Look for:** `initialize` with no initialiser guard or access check; an implementation contract that never disables its initialisers; proxy deployment and initialisation in separate transactions; parent initialisers not called; an `owner` argument ignored; an ownership library that needs explicit set-up.
- **What goes wrong:** an attacker initialises first and owns the proxy or the bare implementation; or no owner is ever set and admin functions are dead.
- **Usually rated:** High when ownership can be seized; otherwise Low or Medium.

## Pause misses a path or traps users — seen in many reports
- **Look for:** `whenNotPaused` on some of deposit, withdraw, claim and their queued twins; a pausable base with no exposed `pause()`; an emergency routine that omits one module; a pause that also blocks exits and yield claims; `max*` views ignoring the pause.
- **What goes wrong:** the emergency stop does not stop, or it locks users in for as long as the admin likes.
- **Usually rated:** Medium; Low for incomplete coverage.

## Predictable deployment address — seen in many reports
- **Look for:** `CREATE` or `CREATE2` with a salt not bound to `msg.sender` and the configuration; a factory deploy that can be front-run; existence tested by `codehash == 0` (a funded empty account has a non-zero hash); a zero result of `create2` unchecked; users funding an address before it is final.
- **What goes wrong:** an attacker deploys another configuration at the expected address, blocks the deployment, or two registries collide on one address.
- **Usually rated:** Medium; once High.

## Function acts on an account the caller does not control — seen in many reports
- **Look for:** a `user`, `owner` or `tokenId` parameter with no check linking it to `msg.sender`: committing collateral to someone's loan, attaching entries to someone's position, forcing a delegation, filing a request in another's name; an allowlist modifier that tests the sender and not the account acted on.
- **What goes wrong:** a stranger overwrites the victim's record, fills their list or quota, redirects their voting or reward power, or enters positions for accounts that are not allowlisted.
- **Usually rated:** High or Medium.

## Ownership handed over in one step — seen in several reports
- **Look for:** a transfer of ownership or of a role with no acceptance step; `renounceOwnership` live on a contract that needs an owner; a sole role with no rotation function, or one that can remove itself; an outgoing owner able to re-point a pending transfer; a veto role that can be set to zero.
- **What goes wrong:** a typo or a leaked key ends administration for good.
- **Usually rated:** Low or informational; Medium where a safeguard role is lost.

## Setting changed under open positions — seen in several reports
- **Look for:** market fee, interest rate, auction or reward parameters that apply at once to bids, loans, auctions or games in progress; user calls that carry no expected-value argument.
- **What goes wrong:** the operator, or anyone front-running with that role, changes the fee just before acceptance and keeps the difference; bidders are bound by terms they did not see.
- **Usually rated:** Medium.

## Proposal identity and execution — seen in several reports
- **Look for:** an identifier hashed from content without proposer or nonce; a uniqueness rule on names; a small cap on open proposals; one reverting action that blocks finalisation for good; an executor that cannot forward ETH; a sponsor locked until quorum with no expiry.
- **What goes wrong:** anyone blocks a proposal by submitting it first or by filling the slots; approved proposals cannot execute.
- **Usually rated:** Medium.

## Restriction dodged by moving the token, or surviving a transfer — seen in several reports
- **Look for:** an allowlist, sanction or lock keyed to an address while the receipt token is transferable; operator approvals or per-token settings that persist after a position NFT or account changes hands; transfers allowed during an auction.
- **What goes wrong:** blocked users leave through a fresh address; a former owner still controls, or empties, what was sold.
- **Usually rated:** High or Medium.

## Upgradeable storage layout — seen in several reports
- **Look for:** base contracts without reserved slots; storage contracts inherited in differing orders; a variable inserted mid-layout; non-upgradeable library variants behind a proxy; selectors of proxy and logic that may clash.
- **What goes wrong:** an upgrade shifts slots and corrupts balances or roles.
- **Usually rated:** Low; High where a planned upgrade would corrupt state.

## Quorum and thresholds from live supply — seen in several reports
- **Look for:** quorum or proposal threshold computed from `totalSupply()` when called instead of a snapshot; supply a voter can shrink by burning or unstaking, or that is tiny at launch so quorum rounds to zero; no requirement that votes in favour exceed votes against.
- **What goes wrong:** proposals pass with few or no votes, and the treasury is exposed in the early days.
- **Usually rated:** Medium.

## Voting power counted twice — seen in several reports
- **Look for:** hand-written checkpoints; votes moved between owners, not delegates, on transfer; a zero delegate read as "self" in one place only; several checkpoints in one block; delegation to the zero address; weight read at vote time so tokens vote again after moving.
- **What goes wrong:** doubled or unlimited votes; tokens frozen by an underflow.
- **Usually rated:** High.
- **Not a finding if:** a standard votes extension is used unmodified with a snapshot at proposal time.
