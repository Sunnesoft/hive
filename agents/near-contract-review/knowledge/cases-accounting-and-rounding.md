# Cases: accounting, shares, rewards and rounding

What audits report about balances and totals, interest and reward accrual, prices, and the integer arithmetic underneath.

## Accrual not run before a balance changes (seen in many reports)
- **Look for:** an "accrue interest" or "update reward index" step that is not called at the top of every method changing a balance: deposit, withdraw, borrow, repay, liquidate, open position, and the refund branch of a token transfer. Variants: one `last_accrue_time` shared by all assets; accrual functions that exist but are called from no flow; shares minted before the pending distribution is applied; a multiplier changed by the owner that takes effect only when each user next claims.
- **What goes wrong:** new stake earns for a period it was not there; debt is understated so a position escapes liquidation; fees for a whole period are charged at today's rate; the user picks the moment that pays most.
- **Usually rated:** Medium to High; Low when it is only unfair between stakers.
- **Not a finding when:** every entry point settles the account and the global index first.

## Prices without a freshness or sanity check (seen in many reports)
- **Look for:** a price accepted when merely non-zero, with no timestamp stored or compared; a staleness window set to an absurd constant; one of several prices used in a formula left unchecked; a rate fetched from another contract and trusted without a bound; a feed that is no longer maintained; an owner method that writes the price directly; an exchange rate that is right only if someone calls a "ping" method.
- **What goes wrong:** minting, borrowing or liquidation at an old price; or every price-dependent method stops when the updater stops.
- **Usually rated:** Medium to High for a missing check; Informational for dependence on an updater.

## Division before multiplication (seen in many reports)
- **Look for:** `a / b * c` on integers in reward-per-session, fee, cut, leverage or time-based formulas.
- **What goes wrong:** the quotient is truncated first; small amounts get zero and totals drift.
- **Usually rated:** Low or a recommendation; Medium when it sets payouts.

## Overflow, underflow and narrowing casts (seen in many reports)
- **Look for:** no `overflow-checks = true` in the release profile; `as u64` / `as u128` on larger values; subtraction inside payout loops; `pow` with an exponent set by a user or owner; sums of small types such as `u16`; conversion of a fraction to fixed decimals by multiplying first.
- **What goes wrong:** without checks a value wraps silently; with checks the path panics, which blocks a sale, a liquidation check or a view.
- **Usually rated:** Informational to High.

## Rounding direction (seen in several reports)
- **Look for:** shares converted to assets on the way out rounded in the user's favour; a fee rounded down, reaching zero on small transfers; a comment that says "round up" over code that floors; two successive round-ups whose result exceeds the amount requested; an assertion that expects exact equality after rounding.
- **What goes wrong:** value leaks from the pool at each operation, fees are avoided by splitting, a penalty takes more than ordered, or the assertion fails and blocks the operation.
- **Usually rated:** Low to Medium; High when it breaks slashing or liquidation.
- **Not a finding when:** every conversion rounds against the caller.

## Totals that drift from their parts (seen in several reports)
- **Look for:** a total supply not updated on one mint or burn path; a counter decremented without checking the previous state while zero-amount operations are allowed; a struct read from a collection, modified and never written back; two fields that stand for the same quantity; shares increased on deposit and never reduced on the matching withdrawal; a locked or in-flight amount still counted as available; a function that returns an amount owed to the user whose result the caller drops.
- **What goes wrong:** later calculations use wrong totals; funds are lost or cannot be claimed.
- **Usually rated:** Low to High.

## Limit checked against the wrong quantity (seen in several reports)
- **Look for:** a withdrawal compared with the pool total and not with the caller's own balance; `close` or `withdraw` on an item with no "already done" check, or a request id that stays usable after use; `max` where `min` was meant; `<=` that admits one more than the bound; a minimum that rejects the exact boundary value.
- **What goes wrong:** a user takes out more than he put in, or repeats a withdrawal; small off-by-one errors against the design.
- **Usually rated:** Critical to High for the first two; Low for boundary slips.

## Lock times and cooldowns that can be reset or dodged (seen in several reports)
- **Look for:** an unlock time kept per pool or per account and reset by every new unstake; merging of two locked positions; a rollback that stamps the current time; a fee that depends on the start time of a position that can be kept alive with dust; rewards computed per epoch with no minimum stay.
- **What goes wrong:** withdrawals are postponed without end, by the user's own later actions or by someone else's; the fee or the lock is avoided; stake shows up just for the distribution.
- **Usually rated:** Medium; a note for the last.

## Dust and zero amounts (seen in several reports)
- **Look for:** partial withdrawals leaving less than the minimum deposit; orders or positions with no minimum size; zero accepted for a stake, a slippage, a price or an amount; a minimum so small that spam is free.
- **What goes wrong:** unusable remnants, events and counters for empty operations, cheap spam of queues and lists.
- **Usually rated:** a recommendation or Low; Medium when it enables a blocking attack.

## Flaws of lending and liquidation design (seen in several reports)
- **Look for:** borrowed funds that can be lent back in; liquidation where nobody repays the debt; no slippage bound for the liquidator; self-liquidation; collateral added while a liquidation is in flight; over-repayment credited twice; a maximum borrow limit that some path does not enforce.
- **What goes wrong:** leverage on the protocol's own liquidity, bad debt, lost collateral.
- **Usually rated:** High to Informational.

## Constants and units (seen in several reports)
- **Look for:** blocks or seconds per year computed from 360 days; a log that prints yoctoNEAR and calls it NEAR; a rate stored in a type too narrow for its documented range (a `u16` that cannot hold 100%).
- **What goes wrong:** rates slightly off for everyone; misleading logs.
- **Usually rated:** Informational to Low.

## Floating point in contract arithmetic (seen once)
- **Look for:** `f32` / `f64` in fee, royalty or reward calculations.
- **What goes wrong:** rounding that differs from integer expectations.
- **Usually rated:** Medium.
