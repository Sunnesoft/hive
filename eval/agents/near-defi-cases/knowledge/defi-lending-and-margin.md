# DeFi cases: lending and margin trading

What audits of NEAR lending markets, margin trading and pool-backed perpetuals report about collateral, debt, positions and liquidation.

## Position settled on a claimed swap result (seen once)
- **Look for:** a margin contract that opens or closes a position by sending tokens to a DEX and completes the books when a "swap done" message comes back through `ft_on_transfer`. Is the sender of that message compared with the registered DEX accounts?
- **What goes wrong:** anyone sends the message himself with a token transfer of his own; the contract lowers his debt and credits position tokens that no swap produced. The cost is gas.
- **Usually rated:** High.
- **Not a finding when:** only the configured DEX accounts are accepted as sender for this message.

## Position or account still usable while a swap or liquidation is in flight (seen in several reports)
- **Look for:** the mark set while a position waits for a DEX reply or an account is being liquidated or force-closed. List the money operations: decrease collateral, withdraw supply, add collateral, repay, a second liquidation of the same account. Does each refuse while the mark is set?
- **What goes wrong:** the owner removes nearly all collateral between the open request and the swap reply, and the position lands insolvent on the protocol's reserves; a borrower withdraws during his own liquidation; two liquidators both pass the check on one account.
- **Usually rated:** High; a recommendation for the double liquidation.

## Position valued from the route, not from what arrived (seen in two reports)
- **Look for:** the expected output of a user-supplied multi-hop swap computed by adding the minimum output of every hop whose output token is the final token, the sum then used for the slippage check, the position size or the health check.
- **What goes wrong:** a route that passes through the final token several times (A→B→C→B→C) counts the same value repeatedly. An under-collateralised position looks healthy while the swap delivers almost nothing; the reserves carry the bad debt.
- **Usually rated:** High.
- **Not a finding when:** only the last hop counts, repeated pools are rejected, and the position is valued from the amount received.

## Asset named twice and never compared (seen in two reports)
- **Look for:** actions that take a position (or order) and an asset id as separate arguments; limit orders at one price merged by adding their collateral amounts; collateral valued with the price of the traded asset. Is the asset checked to be the one that position holds?
- **What goes wrong:** a cheap LP token is booked as collateral of a dearer one, or the dear one is withdrawn against a cheap deposit; two orders with different collateral are merged and withdrawn in the more valuable token; valid orders are refused.
- **Usually rated:** High to Critical; Medium for the valuation slip.

## LP shares as collateral priced from the pool's reserves (seen once)
- **Look for:** the value of an LP position computed as the amounts of underlying tokens its shares would redeem now, times oracle prices.
- **What goes wrong:** what a share redeems changes with every swap. Someone unbalances the pool, borrows against the inflated value, or pushes a healthy account under the liquidation line. The cost is swap fees and capital for a moment.
- **Usually rated:** High.
- **Not a finding when:** the value comes from the pool invariant and fair prices.

## Shares counted in two places at once (seen once)
- **Look for:** LP shares that stay in the pool contract while a second record pledges them to a lending or farming contract. On un-pledging, are the shares set free before the other contract has confirmed that it dropped its record?
- **What goes wrong:** the confirmation fails, the lender still counts the collateral, and the user has already removed the liquidity. The loan has nothing behind it.
- **Usually rated:** High.

## Debt and supply rounded the wrong way (seen in two reports)
- **Look for:** the share conversions in borrow, repay, deposit and withdraw. Debt shares must round up on borrow and down on repay; supply shares the reverse. A conversion helper with a flag for the rounding direction, passed the wrong value; a shares-to-amount result that can exceed the pool balance.
- **What goes wrong:** a borrower's recorded debt is slightly below what he took, and the gap is paid by suppliers.
- **Usually rated:** Low; Medium for the unchecked result.

## Liquidation rules that miss their purpose (seen in several reports)
- **Look for:** a requirement that the account is still below the health line after liquidation; liquidation allowed when leverage is under a minimum; a liquidator reward of a flat amount; a reserve check with `>` where the reserve equals the shortfall.
- **What goes wrong:** an account can never be liquidated in full; a user with ample collateral is liquidated; opening a small position and liquidating it oneself collects the flat reward from the pool; a forced close fails at the exact boundary.
- **Usually rated:** Low to Medium; a recommendation for the first.

## Forced close sold at the caller's slippage (seen once)
- **Look for:** a force-close that swaps the position token on a DEX with a minimum output chosen by the caller within the range allowed for ordinary trades, any shortfall being covered from protocol reserves.
- **What goes wrong:** the caller picks the lowest allowed minimum and trades around the swap; the reserves pay the difference.
- **Usually rated:** Low, accepted by the team.
- **Not a finding when:** forced closes use a tighter bound than user trades.

## Health figure that leaves something out (seen in two reports)
- **Look for:** leverage computed from debt and collateral without the accrued holding fee; a short position reserved against the sum of all stable assets and not against its own collateral asset; a collateral cap compared with all supplied funds.
- **What goes wrong:** positions run at higher leverage than the limit; the reserved amount of one asset exceeds its pool balance, so winning positions cannot be paid.
- **Usually rated:** Low to Medium.

## Pool-backed perpetuals: liquidity tokens as a way out (seen once)
- **Look for:** LP tokens minted and burned at oracle prices for any listed asset; a withdrawal limit that defaults to 100%; burning that ignores amounts reserved for open positions; a cap on how fast the stored price may move.
- **What goes wrong:** minting with one asset and burning into another is an unlimited swap that empties the pool of one asset; liquidity owed to traders leaves; when the market falls faster than the cap, a short opened at the lagging price is paid by the pool.
- **Usually rated:** Critical for mint and burn; High for the price cap.

## Asset settings changed while balances exist (seen in several reports)
- **Look for:** an owner method that edits an asset's internal decimal scaling, the token used for boosting, or a price-feed entry, with no check that nothing is recorded in the old terms; two entry points that scale the same amount differently.
- **What goes wrong:** recorded fees and balances are read in new units; users unstake a different token from the one they staked; positions in an asset whose feed was removed cannot be adjusted.
- **Usually rated:** Medium; High for scaling that differs between deposit and removal.
- **Not a finding when:** these fields cannot change once balances exist.

## Recurring small items (seen in several reports)
- **Look for:** amounts kept at a higher internal precision and divided on the way out, the remainder dropped, or a fee that is positive internally and zero after scaling, so its transfer fails; position ids built from account and block timestamp; a hard-coded maximum number of assets; margin settings (maximum leverage, slippage, fee rates) without ranges; limit orders removed as invalid whose attached collateral is not returned.
- **What goes wrong:** dust withheld from users, a second position in one block refused, a new asset blocked until an upgrade, settings that stop trading, lost collateral.
- **Usually rated:** Low; Medium for lost collateral and for precision loss.
