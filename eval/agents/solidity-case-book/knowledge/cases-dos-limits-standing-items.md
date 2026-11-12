Findings about things that stop working (reverts, stuck funds, limits that fail or are exhausted) and the standing low-severity items that reviews list on almost every codebase.

## Unused, undocumented, misleading — seen in many reports
- **Look for:** unused variables, imports, modifiers, errors; unexplained numeric literals; comments or documentation describing behaviour the code does not have; missing function comments; TODOs; failing or absent tests.
- **What goes wrong:** nothing directly, but a comment that disagrees with the code often marks a real fault nearby.
- **Usually rated:** Informational.

## Compiler and dependency hygiene — seen in many reports
- **Look for:** a floating pragma or mixed versions; a compiler release with a known bug in a feature the code uses; an opcode the target chain lacks (`PUSH0`); an old library release with a known faulty function; maths written for wrapping arithmetic compiled under checked 0.8.
- **What goes wrong:** usually nothing today; at worst a deployment that fails on one chain or a wrong result from the faulty function.
- **Usually rated:** Low or informational; Medium when the known bug is reachable.

## Assets with no way out — seen in many reports
- **Look for:** a contract that can receive coin or tokens (payable functions, swap leftovers, fees, rewards, refunds) and has no path sending them on; a fee deducted and never forwarded; surplus `msg.value` kept; balances tied to a feature that can be switched off.
- **What goes wrong:** value accumulates where nobody can withdraw it.
- **Usually rated:** High or Medium; Low for dust.

## Core path that can never succeed — seen in many reports
- **Look for:** an integration call missing its approval; a wrong signature or interface for the target; a memory array written before being allocated; `nonReentrant` on both a function and the `receive` it triggers; two contracts each needing the other's address at construction; a fixed address absent on the target chain; permissions never granted to a newly created component.
- **What goes wrong:** the feature is dead from the first day; if it is the exit path, funds are locked.
- **Usually rated:** High when funds are locked, Medium otherwise.

## Cap enforced on one path but not its twin — seen in many reports
- **Look for:** a supply, borrow, collateral, per-user or daily limit checked in `deposit` but not `mint`, in `borrow` but not `withdraw`, on mint but not on transfer, locally but not on the cross-chain route; headroom restored on repay but not on liquidation; a per-user maximum that a receive hook lets the user pass.
- **What goes wrong:** the limit that was meant to bound risk does not bind.
- **Usually rated:** Medium.

## Unbounded loop over a list users can grow — seen in many reports
- **Look for:** loops over all markets, positions, collateral entries, queue items, reward tokens, operators; a list anyone can append to, even with dust entries on someone else's record; an initialiser that walks every token id.
- **What goes wrong:** the call exceeds the block gas limit and withdrawal, liquidation or shutdown becomes impossible. Costs the gas of the spam.
- **Usually rated:** Medium; High when outsiders can bloat another user's list; Low when only an admin adds.
- **Not a finding if:** the list is capped or processed in pages.

## View functions that disagree with execution — seen in many reports
- **Look for:** quote, preview, health or "can liquidate" views that skip pending interest, fees or a branch the real call takes; balance getters returning scaled values under standard names; a quote routine used inside a state-changing path.
- **What goes wrong:** interfaces and integrating contracts act on wrong numbers; users believe a position is safe when it is not.
- **Usually rated:** Low or Medium.

## Boundary off by one — seen in many reports
- **Look for:** `<` against `<=` at the first or last block of a window; a threshold where equality lets anyone cancel; an identifier `0` meaning "none" while identifiers start at 0; a per-user maximum that can be exceeded by one; an enum whose default value means "in progress".
- **What goes wrong:** an action is possible, or refused, in exactly the edge case.
- **Usually rated:** Medium or Low.

## Intermediate overflow — seen in many reports
- **Look for:** `a * b` before a division with 18-decimal factors; tick, full-precision or cumulative-counter maths that relies on wrap-around but lacks `unchecked`; a price multiplied by `10 ** decimals`.
- **What goes wrong:** reverts at realistic magnitudes; positions are locked or a price source is unusable.
- **Usually rated:** Medium; once High.

## Removal leaves stale state — seen in several reports
- **Look for:** `delete` on a struct holding a mapping or set; an item taken out of a list while its companion mapping stays, or the reverse; a pending slot not cleared after rejection; counters kept across delisting and relisting.
- **What goes wrong:** the item cannot be added again, or returns with its old credit; old entries stay authorised.
- **Usually rated:** Medium.

## Dust used to break an exact condition — seen in several reports
- **Look for:** a path that needs the amount to equal what is outstanding, a balance to equal an expected figure, or no prior position to exist; zero-size entries accepted; fees that round to zero for small chunks.
- **What goes wrong:** a one-wei action in front makes the victim's call revert, a new market is blocked from the start, or fees are avoided by splitting.
- **Usually rated:** Medium.

## Array length and index slips — seen in several reports
- **Look for:** parallel arrays with no equal-length check; an inner loop using the outer index; the wrong one of two similar arrays; modulo by the length of a list that may be empty.
- **What goes wrong:** out-of-bounds reverts that block minting or settlement, or a silently wrong element.
- **Usually rated:** Medium; High when balances are misread.

## Hand-written assembly — seen in several reports
- **Look for:** blocks tagged memory-safe that copy return data past the scratch area; a hash over memory starting at the free pointer while a call in between moves that pointer; ABI encoding by selector with unchecked argument types.
- **What goes wrong:** corrupted memory gives wrong hashes or return data, and compiler optimisations may make it worse.
- **Usually rated:** Medium or Low; once High.

## One bad element blocks a batch — seen in several reports
- **Look for:** a loop that pushes payments, mints with receiver checks, or processes queue items and reverts as a whole; a queue that must be served in order.
- **What goes wrong:** one recipient or entry that always reverts freezes everyone behind it.
- **Usually rated:** Medium; High when it is the withdrawal queue.

## Timelock or delay with a shortcut — seen in several reports
- **Look for:** a timer started by a step the proposer can take ahead of time; an owner who can edit the delay itself or override the pauser; a pause whose period can be restarted without end.
- **What goes wrong:** the waiting period that protects users is skipped, or a temporary stop becomes permanent.
- **Usually rated:** Medium; once High.

## Strict equality on a balance — seen in several reports
- **Look for:** `assert(address(this).balance == 0)`; `require(balance == expected)`; rewards measured as balance after minus before around a claim others can trigger.
- **What goes wrong:** forced coin or a one-wei donation makes the function revert, or misattributes rewards.
- **Usually rated:** High or Medium.
- **Not a finding if:** amounts come from internal accounting and a surplus is tolerated.

## Block-time assumptions — seen in several reports
- **Look for:** periods as block counts tuned for another chain; a foreign chain's timestamp compared with the local one.
- **What goes wrong:** voting periods and delays come out much shorter or longer than intended, or valid updates are rejected.
- **Usually rated:** Medium.
- **Not a finding if:** durations are counted in seconds of the local `block.timestamp`.
