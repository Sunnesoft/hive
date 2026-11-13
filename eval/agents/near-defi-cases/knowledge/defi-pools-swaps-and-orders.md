# DeFi cases: pools, swaps, order and DCA bots

What audits of NEAR AMM pools, concentrated-liquidity pools with limit orders, routers, and grid or DCA bots trading through a DEX report about swaps, fees and orders.

## Token of an order taken to be "the other one" (seen once)
- **Look for:** code that places a limit order or adds liquidity with `if token == pool.token_x { .. } else { .. }`, the else branch treating whatever arrived as the second token of the pair.
- **What goes wrong:** an order funded with a worthless token is booked as an order in the pool's real token; when a swap fills it or it is cancelled, real tokens are paid out. The pool is drained for the price of gas.
- **Usually rated:** High.
- **Not a finding when:** the token must equal one of the two pool tokens before any branch.

## The same item twice in one batch (seen once)
- **Look for:** batch methods (remove or update several liquidity positions) that validate each id against stored state and collect the results before writing. Is a repeated id rejected?
- **What goes wrong:** every copy passes validation against the untouched record; the position is removed once and paid out as many times as it was listed.
- **Usually rated:** High.

## Routes that are empty or visit a pool twice (seen in several reports)
- **Look for:** in multi-hop swaps: is an empty list of pools rejected; may input and output token be equal; may one pool appear twice; in quote mode, is the pool state after each hop written back for the next hop; is only the last hop's output collected.
- **What goes wrong:** with an empty route every per-pool check is skipped and a refund path credits an amount nobody deposited; quotes for routes with a repeated pool are wrong; outputs of earlier hops stay at the DEX with no owner.
- **Usually rated:** Medium to High.

## Price limit checked with numbers from the route (seen in two reports)
- **Look for:** a bot or position that lets an executor or user supply the swap path and checks the trade against the owner's price limit with input and output amounts summed over the hops.
- **What goes wrong:** a path that returns to the output token several times adds the same output again and again; the computed price reaches any target and the order executes at a rate its owner had excluded.
- **Usually rated:** High.
- **Not a finding when:** the path comes from a whitelist, or the check uses the amount received at the end.

## Swap arithmetic at range and order boundaries (seen in two reports)
- **Look for:** in concentrated-liquidity code: the price point reached inside a range computed from the wrong end of it; in exact-output swaps, the amount sent to the user taken from a running variable and not from what the pool released; an order's earned amount rounded up in one place and down in another; liquidity at a boundary point consumed before the order placed there, against the stated priority.
- **What goes wrong:** traders receive less than due, or more than the pool gave up; the last maker cannot withdraw in full.
- **Usually rated:** High for wrong amounts; Low to Medium for priority and rounding.

## Fees booked but not moved, or moved but not booked (seen in two reports)
- **Look for:** every fee counter: protocol fee totals that no method withdraws; a referral fee credited to the referrer and taken off the fee counter but not off the pool's recorded reserves.
- **What goes wrong:** protocol revenue is locked in the contract; recorded reserves exceed what the pool owns by the sum of referral fees paid.
- **Usually rated:** High for locked fees; Low for the reserve drift.

## The protocol's cut (seen in two reports)
- **Look for:** the formula that mints LP shares to the protocol for its part of fee growth: compare the value of the minted shares with the configured percentage. A setter that lets exchange fee plus referral fee reach the whole fee. A referral account that may be the trader himself.
- **What goes wrong:** the protocol collects less than configured, or after a correction more, since new shares earn too; liquidity providers can be left with nothing; traders pay the referral to themselves.
- **Usually rated:** Medium for the formula; Low or a recommendation otherwise.

## A limit kept on one door only (seen in several reports)
- **Look for:** a cap on pool size, a per-pool whitelist, a pause or a slippage bound; then every path into the pool: plain add-liquidity, swap-and-add in one transfer, batch calls, order placement. Also a whitelist compared with a sender name that the calling token contract supplies.
- **What goes wrong:** the cap is exceeded through the combined path; a self-made token contract names a whitelisted account as sender and trades in a restricted pool; a paused pool still takes liquidity and orders; one add-liquidity variant has no minimum and is front-run.
- **Usually rated:** High for the cap; Medium for the whitelist; Low or a recommendation otherwise.

## Bot order closed or re-run in the middle of a step (seen in two reports)
- **Look for:** a bot that works in stages at a DEX (deposit, swap, withdraw) and stores a status between them. Does `close` demand the normal status? In "swapped, withdrawal pending", can execute be called again before the first withdrawal returns? Does a retry after a failed swap pass a balance check the first attempt already used up?
- **What goes wrong:** funds of a closed order stay at the DEX; the withdrawal is sent several times and more leaves the DEX than the order is owed; a failed order can never be retried.
- **Usually rated:** High; Medium for the blocked retry.

## The DEX answered "ok" and nothing moved (seen in two reports)
- **Look for:** partner contracts that absorb their own failures: a DEX withdrawal whose transfer failed re-credits the internal balance and still returns success with zero; a swap whose payout failed parks the output in the caller's balance at the DEX. Does the bot read the returned amount, and has it a method to collect parked balances?
- **What goes wrong:** tokens are booked as received that are still at the DEX; proceeds stay there with no way back.
- **Usually rated:** High; Medium for the missing recovery.

## Orders dead on arrival (seen in two reports)
- **Look for:** at creation of grid or recurring orders: an expiry not compared with the present; entry and trigger prices that can never be met on pairs without an oracle; maker and taker prices compared without scaling the two tokens' decimals; no minimum size for what remains of a partly filled order; profit reported in the wrong token of the pair.
- **What goes wrong:** the order expires at once or never starts while its funds stay locked; valid orders fail to match; dust orders pile up.
- **Usually rated:** Low; High when funds are locked or matching breaks.

## Money kept or returned wrongly on failure (seen in several reports)
- **Look for:** fees and deposits when an order cannot be created or executed: an execution fee kept although the DEX step failed; a failed creation that sends back the user's whole deposited balance and not this call's amount; a launch that mints the pool allocation into a DEX and loses it when the DEX refuses the deposit.
- **What goes wrong:** users pay for work not done or must deposit everything again; the allocation is stranded.
- **Usually rated:** Low to Medium.

## Owner's sweep of "surplus" (seen in several reports)
- **Look for:** an owner method that withdraws tokens "not owned by users", computed as contract balance minus recorded balances, or with no bound at all; an owner method that pulls the contract's funds out of the DEX, where amount zero means everything.
- **What goes wrong:** between a transfer and its callback balance and books disagree, and the difference includes users' funds; a mistaken or stolen owner key takes deposits.
- **Usually rated:** Medium; a recommendation when a DAO holds the key.

## Recurring recommendations (seen in several reports)
- **Look for:** functions with a simulation flag that still emit events; a frozen token or a repeated pool found only when the route reaches it; the minimum output compared before fees are deducted; a trigger that fires only when a keeper calls.
- **What goes wrong:** indexers count trades that never happened; gas is spent on hops that are then undone; users receive less than the minimum they set; fast moves pass the trigger unnoticed.
- **Usually rated:** recommendations and notes.
