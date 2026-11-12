Findings about how a deposit-taking contract keeps count of value: tracked totals, share prices, fees, casts and rounding.

## A tracked total that one path forgets — seen in many reports
- **Look for:** a stored aggregate (total funds, used funds, total debt, reserve, open interest, TVL) and the twin functions that should move it: open/close, add/remove, deposit/withdraw, liquidate, collect fees. One of them moves tokens or mints without touching the aggregate, touches it twice, or reads it with the index of another loop.
- **What goes wrong:** the share price or the solvency figure drifts. Holders are diluted, later withdrawals revert, or value counted twice is paid out twice. An ordinary call is enough.
- **Usually rated:** High.

## Narrowing cast without a range check — seen in many reports
- **Look for:** `uint128(x)`, `uint96(x)`, `uint256(int)`, `int24(...)` on amounts, reserves, prices or timestamps; a balance stored in a narrow type while the transfer uses the full value.
- **What goes wrong:** high bits vanish without a revert: fewer shares burned than assets sent, reserves that wrap, a negative feed answer turned into a huge price. A caller who controls the value can drain; otherwise the maths breaks at scale.
- **Usually rated:** Medium; High when user-controlled; Low when unreachable.
- **Not a finding if:** a checked-cast helper is used or the bound is enforced before.

## First deposit inflates the share price — seen in many reports
- **Look for:** `shares = assets * totalSupply / totalAssets` where `totalAssets` follows the token balance or can be raised by a direct transfer or by liquidation proceeds; no minimum first mint, no burned shares, no virtual offset (an offset of zero decimals is no offset).
- **What goes wrong:** the attacker mints one wei of shares, donates assets, and the next deposit rounds down to nothing; the attacker redeems both. Needs a front-run and capital that comes back.
- **Usually rated:** High; Medium where only the first depositor is exposed.
- **Not a finding if:** assets are tracked internally, or dead shares plus a zero-share revert are in place.

## Vault breaks its ERC-4626 promises — seen in many reports
- **Look for:** `maxDeposit`/`maxMint`/`maxWithdraw`/`maxRedeem` returning amounts the call would reject (paused, capped, illiquid); `preview*` that leave out fees; `mint` skipping a cap that `deposit` enforces.
- **What goes wrong:** routers and other vaults that trust the views revert or misprice; a cap is bypassed through the twin function.
- **Usually rated:** Medium in contests, Low in private reviews.

## Joining just before value arrives, leaving just before a loss — seen in many reports
- **Look for:** a share price that moves in steps (harvest, debt report, rate pushed by an oracle, liquidation penalty paid to depositors, loss socialised); deposits and withdrawals that are instant and free; a cached total that lags the real one; a caller who chooses which positions get reported.
- **What goes wrong:** with a flash loan or a front-run, a depositor joins before the step and exits after it with yield others earned, or withdraws ahead of a loss.
- **Usually rated:** High or Medium.
- **Not a finding if:** gains are released over time, or entry and exit carry a delay or fee.

## Rounding in the caller's favour — seen in many reports
- **Look for:** assets paid out rounded up, shares burned or debt recorded rounded down, one `mulDiv` for both directions, a "minimum" computed with the rounding that maximises it.
- **What goes wrong:** each call leaks a wei from the pool; loops and low-decimal tokens make it real money, and a one-wei shortfall can flip an exact collateral check and block deposits.
- **Usually rated:** Medium, often Low.
- **Not a finding if:** every conversion rounds against the caller.

## Check made before the change it should guard — seen in many reports
- **Look for:** a collateral, skew, reserve, cap or minimum check at the top of a function whose body then mints, withdraws, charges a fee or updates totals; a balance read before the claim that changes it; a minimum tested before fees are deducted.
- **What goes wrong:** the function leaves exactly the state the check was meant to prevent, or forwards a stale amount and strands the difference.
- **Usually rated:** Medium, sometimes High.

## Setting changed without settling what accrued under the old one — seen in several reports
- **Look for:** setters for reserve factor, fee rate, fee recipient, interest model or weights that do not run the accrual routine first; an unpause whose first accrual covers the paused span.
- **What goes wrong:** the new value applies back to the last accrual; lenders, treasury or the former recipient gain or lose interest that was not theirs.
- **Usually rated:** Medium; Low with a trusted admin.

## Division before multiplication — seen in several reports
- **Look for:** `a / b * c` in reward, fee, interest or quorum maths; percentages of small integer supplies; chains of truncating divisions.
- **What goes wrong:** results truncate to zero or lose a visible fraction; a running total drifts from the sum of its parts until the contract cannot pay everyone.
- **Usually rated:** Medium or Low.

## Empty-pool edge cases — seen in several reports
- **Look for:** price-per-share or reward maths dividing by total supply, total weight or remaining debt with no zero branch; what happens after the last holder leaves or a position closes in full.
- **What goes wrong:** the price function reverts for good and deposits, withdrawals or full liquidations are stuck.
- **Usually rated:** Medium; High when funds are locked.

## Wrong scale constant — seen in several reports
- **Look for:** a rate differing from the documented one by powers of ten; percentage bases mixed (100 against 10_000); 18-decimal multiply applied to a plain number such as seconds; `1 + rate` where `rate` was meant; an extra scaling by `1e18`.
- **What goes wrong:** accrual or limits off by orders of magnitude.
- **Usually rated:** High; Medium when it only loosens a limit.

## Shares and assets mixed in one formula — seen in several reports
- **Look for:** one parameter used as a token amount and as a share amount; an asset cap compared with `totalSupply()`; a transfer of the wrapper using the underlying figure; reserves stored in one unit and balances read in the other.
- **What goes wrong:** once the rate leaves 1:1, limits misfire, users move more than they own, swaps settle at the wrong amount.
- **Usually rated:** High; Medium for a limit check.

## Subtraction that underflows on the way out — seen in several reports
- **Look for:** `a - b + c` written in that order where `b` can exceed `a`; a stored balance reduced by a freshly computed figure that interest or a price move has made larger; used funds allowed to pass total funds.
- **What goes wrong:** withdraw, claim, rebalance or position close reverts for the affected users until someone else changes the state.
- **Usually rated:** Medium.

## Fee shares and high-water marks — seen in several reports
- **Look for:** fee minted as `fee * supply / totalAssets` (ignores its own dilution); a fee charged on one component while the price counts another; a high-water mark never reset after a full exit, or one users can pin by timing.
- **What goes wrong:** the protocol collects less than configured, or some holders pay the fee of others.
- **Usually rated:** Medium; High when holders lose value.
