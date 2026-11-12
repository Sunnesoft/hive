# Cases: configuration, pausing, inputs, messages and events

What audits report about the values privileged accounts may set, about pausing, about unvalidated arguments, and about what the contract tells users and indexers.

## Setter without bounds (seen in many reports)
- **Look for:** owner or governance setters that store the argument as given: a fee or percentage that may exceed 100%, a slash rate above its denominator, an unlock period or era count with no ceiling, a minimum count of 0, weights whose sum is never checked, a minimum above its maximum, a price or amount of zero, token decimals. Often one setter has the check and its neighbours do not, or `create` validates and `update` does not.
- **What goes wrong:** a mistake or a hostile owner sets a value that blocks withdrawals indefinitely, takes all of a transfer as fee, mints more reward than exists, or makes later arithmetic panic.
- **Usually rated:** Low to Medium, or a recommendation.
- **Not a finding when:** each setter asserts a range and the relation to its sibling values.

## Wrong or misleading messages, names and comments (seen in many reports)
- **Look for:** an error text that belongs to another condition; typos in messages; a function named opposite to what it returns; a doc comment naming a parameter that does not exist or stating "round up" over code that floors; documentation that promises behaviour the code lacks (a default state, who pays a fee, when a burn is allowed).
- **What goes wrong:** users and integrators act on wrong information.
- **Usually rated:** Informational to Low; Medium when the documented behaviour concerns users' funds.

## Account ids and strings taken unchecked (seen in many reports)
- **Look for:** `String` arguments stored or used as account ids; `AccountId::new_unchecked`; a payload field deserialized as `String` and never validated; ids compared case-sensitively when the other system is not; a caller-supplied token id used to derive a sub-account name; an id of an object in another contract accepted without confirming it exists; an expected account suffix that is assumed, not asserted.
- **What goes wrong:** the owner or a receiver is set to an account that cannot exist; a later cross-contract call panics and two contracts disagree; the same asset is registered twice.
- **Usually rated:** Low to Medium; once Critical where the id became a sub-account.

## Pausing that is partial, absent or unused (seen in many reports)
- **Look for:** a paused check present in most public methods and missing in some (registration, a bonding method, a token receiver); a pause flag that no method reads; no pause at all in a contract holding funds; setters and repairs that themselves require the running state; pause and resume that do not check the current state and emit events on every repeat.
- **What goes wrong:** an incident cannot be contained, or cannot be fixed while contained.
- **Usually rated:** Low.

## Missing, wrong or early events (seen in many reports)
- **Look for:** privileged setters and mint or burn paths that emit nothing; a field of an event filled from the wrong variable; plain `log!` text in one place and structured events elsewhere; an event written before a transfer whose outcome is not yet known, or when a deployment promise may still fail.
- **What goes wrong:** indexers and front ends show supply, balances or state that are not true.
- **Usually rated:** Informational to Low.

## Two versions of one operation that differ (seen in several reports)
- **Look for:** a single and a batch variant, `create` and `update`, two transfer helpers, a path for each of two assets. Compare them line by line: one carries a check, a save, an accrual, a gas amount or an event the other lacks.
- **What goes wrong:** the weaker variant is the way around the check; state saved on one path and not on the other.
- **Usually rated:** a recommendation to Medium.

## Reliance on a timely external call (seen in several reports, as a note)
- **Look for:** a distribution that is right only if triggered every epoch; rewards the admin must fund before a farm starts; a rate refreshed by a `ping`; bots that must fire when a price is touched; an oracle someone must keep updated.
- **What goes wrong:** a skipped epoch misallocates rewards, late funding over-pays early users, a stale rate misprices withdrawals.
- **Usually rated:** a note; Low when users can profit from the delay.

## Add, remove or register without an existence check (seen in several reports)
- **Look for:** a register method that inserts again for an existing key and so resets its counter or state; an add that allows duplicates; a remove that succeeds silently for an unknown entry; a metadata change that lets two entries point to one contract.
- **What goes wrong:** a sequence number anyone can reset, an asset re-initialised, an owner misled about what was removed.
- **Usually rated:** a recommendation to Medium.

## Setting or parameter that is stored and never applied (seen in several reports)
- **Look for:** a configured minimum capacity nobody asserts; a fee rate set and not used in any formula; a documented argument ignored by the check it belongs to; a validation function whose two branches test the same field so the other is never tested; a metadata validator that exists and is not called.
- **What goes wrong:** the control that users and the owner rely on does not exist.
- **Usually rated:** Low to Medium.

## Time arguments not compared with the present (seen in several reports)
- **Look for:** an expiry accepted without comparing it to `env::block_timestamp()`; an optional time-to-live; a start time changed by an update method with no check; an expiry computed from execution time, not submission.
- **What goes wrong:** objects that expire at once or never; orders executed long after the user expected.
- **Usually rated:** Low; once High for orders.

## State transitions out of order (seen in several reports)
- **Look for:** an init-once step that assumes nothing happened before it; a timestamp written to the wrong field on open or close; an update method that resets accumulated values; a flag-setting method whose combined conditions give the wrong state; a close or destroy with no guard on its current state.
- **What goes wrong:** rewards or records lost on an edit; distribution that never starts; a market shown as running when it is not.
- **Usually rated:** Low to High.

## Unsafe defaults (seen in several reports)
- **Look for:** timelocks that start at zero; a minimum amount defaulting to 0 with no setter; a new asset registered as active where the specification says closed.
- **What goes wrong:** the protection is off until someone remembers to turn it on.
- **Usually rated:** Low to Medium.

## Hand-written parsing of structured input (seen in two reports)
- **Look for:** JSON or a binary payload taken apart with string splitting or fixed offsets; an offset valid for the whole message applied to a slice of it.
- **What goes wrong:** a crafted argument injects additional actions; governance fields are read from the wrong bytes.
- **Usually rated:** Medium to High.

## Privileged method that edits the books without assets moving (seen in two reports)
- **Look for:** a method for managers that raises a reward total or a recorded balance directly; admin shortcuts beside the normal deposit path.
- **What goes wrong:** rewards are promised that the contract does not hold.
- **Usually rated:** Medium to High.
