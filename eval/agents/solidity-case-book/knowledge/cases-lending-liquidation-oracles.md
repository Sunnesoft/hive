Findings from lending markets, collateralised stablecoins and margin systems: where prices come from, and how positions are opened, kept healthy and liquidated.

## Feed answer used unchecked — seen in many reports
- **Look for:** `latestRoundData()` with `updatedAt` ignored; one staleness window for feeds with different heartbeats (an hour against a day); answer not required to be positive; deprecated getters; a hand-pushed price with no age limit; a dispute-window oracle read without the wait its design needs.
- **What goes wrong:** minting, borrowing or redeeming at an outdated price; whoever spots the gap trades against the protocol.
- **Usually rated:** Medium; Low for style-only cases.
- **Not a finding if:** age is bounded per feed and the answer is range-checked.

## Price taken from a pool's current state — seen in many reports
- **Look for:** `slot0`, `getReserves`, raw pool balances; an LP token valued as reserves times price over supply; a liquidity position whose token amounts come from the current tick although the prices are checked; a thin pool; "the higher of two sources".
- **What goes wrong:** with a flash loan the attacker skews the pool, borrows against inflated collateral or pushes others into liquidation, then unwinds.
- **Usually rated:** High; Medium where an independent feed bounds the deviation.
- **Not a finding if:** a fair-reserve formula or a long average on a deep pool is used.

## Liquidation arithmetic — seen in many reports
- **Look for:** bonus computed on collateral value where the rules say debt; liquidator made to burn more than the debt covered; health read with a stale index or the wrong price; profit and loss applied to the wrong total; a threshold where a barely unhealthy position jumps from partial to full seizure.
- **What goes wrong:** liquidators are over- or under-paid, borrowers lose surplus collateral, pool totals are corrupted.
- **Usually rated:** High or Medium.

## Positions too small to be worth liquidating — seen in many reports
- **Look for:** no minimum debt or collateral, or a minimum checked on open but not after partial repay, withdrawal or close; a reward purely proportional to size, or capped at the remaining collateral.
- **What goes wrong:** dust positions go underwater and nobody pays gas to close them; on a cheap chain an attacker opens thousands. Bad debt accumulates.
- **Usually rated:** Medium.
- **Not a finding if:** a floor holds on every path.

## Delisting an asset strands open positions — seen in many reports
- **Look for:** removing a collateral, strategy or trading pair, or zeroing its factor, while positions, queued withdrawals or balances remain; value functions that then revert or skip the asset; no reduce-only mode.
- **What goes wrong:** positions cannot be closed or liquidated, withdrawals in that asset fail, totals are misreported.
- **Usually rated:** Medium.
- **Not a finding if:** retirement blocks new use and keeps every exit.

## Borrower can make liquidation revert — seen in many reports
- **Look for:** liquidation that returns collateral or change to the borrower through a callback (`safeTransferFrom`, native send) or in a blacklistable token; a requirement that the repaid amount equal the debt exactly; a cooldown the borrower resets by adding dust collateral; maths that fails for the only borrower or a full close.
- **What goes wrong:** an underwater position cannot be closed and bad debt grows, for the price of a hostile receiver or a one-wei repay in front.
- **Usually rated:** High or Medium.
- **Not a finding if:** leftovers are credited for later pull and amounts are capped to the debt.

## A failing price source halts the market — seen in many reports
- **Look for:** a price read that reverts or returns zero or "invalid" when one feed is stale or two sources disagree; `||` where `&&` was meant in a validity check; an invalid flag from an external market ignored; an aggregator that silently drops feeds that revert.
- **What goes wrong:** in volatile hours borrowing, repaying and liquidating freeze together, or the result is computed from the subset an attacker left alive.
- **Usually rated:** Medium.

## Bad debt left unassigned or dodged — seen in many reports
- **Look for:** liquidation ending with debt and no collateral and no write-off; a socialised loss lenders can front-run by withdrawing; trader profit that may exceed what the counterparty pool holds; an account exempt from liquidation; anyone able to reset an insurance account.
- **What goes wrong:** the last to withdraw absorb the shortfall, or winners cannot be paid.
- **Usually rated:** Medium; Low when accepted as design.

## Interest accrual gaps — seen in several reports
- **Look for:** borrow and repay in one block at no cost because rates update afterwards; interest running during an auction, after expiry or on a queued withdrawal already owed; accrual skipped before a collateral change or in a view; the last instalment computed by another rule than the rest.
- **What goes wrong:** free loans that use up borrow limits, or borrowers and lenders charged or paid for the wrong span.
- **Usually rated:** Medium or Low.

## Derived price in the wrong unit — seen in several reports
- **Look for:** an LP or wrapped-asset price that assumes a token's position in the pool; a result left in ETH where USD is expected; the value of the whole pool returned as the price of one share; two feeds' decimals not reconciled; a rate provider or the right supply getter left out.
- **What goes wrong:** collateral misvalued by a large factor, hence insolvent loans or unfair liquidations.
- **Usually rated:** High.

## Peg assumed — seen in several reports
- **Look for:** a BTC feed for a wrapped BTC; a stablecoin counted as one dollar; a staked token priced as ETH, or by a market feed where others use the redemption rate; feeds with different deviation thresholds combined.
- **What goes wrong:** on a depeg, or inside the deviation band, deposit-and-withdraw arbitrage or loans under water from the start.
- **Usually rated:** Medium; High when mint and redeem are instant and free.

## Averaged-price reads done wrong — seen in several reports
- **Look for:** a tick from a `tickCumulatives` difference without rounding down for negative values; a window longer than the pool's observation history; a window of a few minutes.
- **What goes wrong:** a price one tick off in the attacker's favour, a read that reverts on new pools, or an average cheap to move.
- **Usually rated:** Medium; once High.

## L2 sequencer downtime ignored — seen in several reports
- **Look for:** feed reads on a rollup with no sequencer-uptime check and no grace period after restart.
- **What goes wrong:** when the sequencer returns, old prices look fresh and positions are liquidated before owners can act.
- **Usually rated:** Medium.
- **Not a finding if:** the uptime feed is read and borrowing and liquidation wait out a grace period.

## Pause that collides with liquidation and interest — seen in several reports
- **Look for:** repay or add-collateral paused while liquidation is live, or both resuming in the same block; interest charged for the paused span; a liquidation branch that skips the pause check.
- **What goes wrong:** users are liquidated with no chance to cure; the unpause block is a race liquidators win.
- **Usually rated:** Medium.

## No gap between borrow limit and liquidation threshold — seen in several reports
- **Look for:** one factor for both maximum borrow and liquidation; position creation with only basic checks.
- **What goes wrong:** a maximum borrower is liquidatable after a block of interest or a tick of price, and the bonus can be farmed.
- **Usually rated:** Medium; once High.

## Two prices in one transaction — seen in several reports
- **Look for:** a pull oracle where the caller supplies the signed update: any price inside a validity window is accepted, or two updates can be read in one call; an executor who picks the price for an announced order.
- **What goes wrong:** risk-free round trips paid by the liquidity pool.
- **Usually rated:** High or Medium.
