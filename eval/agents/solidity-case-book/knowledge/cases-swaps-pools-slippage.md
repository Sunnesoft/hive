Findings from pools, routers, zaps, order books, auctions and any contract that swaps or moves liquidity for a user or for the protocol itself.

## No minimum-out on a swap or liquidity move — seen in many reports (the most frequent single item)
- **Look for:** `amountOutMin = 0`, an empty `minAmountsOut`, a price limit taken from the current price; deposit, withdraw or redeem functions whose result depends on a rate or pool state yet take no `minShares`/`minAssets`; swaps the protocol runs itself (harvest, buyback, liquidation helper) with no bound, or one computed from the same pool.
- **What goes wrong:** the transaction is sandwiched and the user or the treasury receives far less. Costs a front-run and a back-run.
- **Usually rated:** Medium; High when anyone can trigger a swap of pooled funds.
- **Not a finding if:** the caller passes the bound, or it comes from an independent oracle.

## Helper spends approvals for any caller — seen in many reports
- **Look for:** a router, zap or utility contract that users approve, with a function taking `from`, `owner` or `tokenId`, or a raw target and calldata, and no requirement that `msg.sender` is that owner; an `execute(target, data)` kept for airdrops; a swap step forwarding arbitrary calldata to an arbitrary exchange address.
- **What goes wrong:** anyone moves the approved tokens or positions to themselves through the helper. Free.
- **Usually rated:** High or Critical.
- **Not a finding if:** targets and selectors are allowlisted and the acted-on account is the sender.

## Funds resting in a router between steps — seen in several reports
- **Look for:** a router or adapter holding tokens or ETH across transactions or after a failed callback; `balanceOf(address(this))` used as "the amount"; a wrap step that leaves the wrapped coin with the contract while the next step pulls from the user again; dust left after a swap.
- **What goes wrong:** the next caller sweeps what was left, or a user pays twice.
- **Usually rated:** High for user funds, Low for dust.

## Deadline absent or set to `block.timestamp` — seen in several reports
- **Look for:** swap and liquidity calls with no deadline parameter, or passing the current timestamp, which is always satisfied.
- **What goes wrong:** a pending transaction is held and executed later at a price the user would no longer accept.
- **Usually rated:** Medium; Low alongside a tight minimum-out.

## `msg.value` counted more than once — seen in several reports
- **Look for:** `msg.value` read inside a loop, in each leg of a batch, or as both a fee and a payment; a native-coin path and a token-wrapper path that both credit the same payment; an even split across legs of unequal cost; excess not returned.
- **What goes wrong:** one payment is credited several times and native balances are drained, or later legs revert, or the surplus stays in the contract.
- **Usually rated:** Critical or High for double credit; Low for a missing refund.

## Order-fill rules with a gap — seen in several reports
- **Look for:** a restriction (allowed taker, fee, price band) checked in one fill branch only; amounts for a partial fill taken from maker-supplied getters; a fee fixed when the order is announced while the size can change before execution; an offer editable in place while a taker's transaction is pending.
- **What goes wrong:** private orders filled by strangers, takers overcharged, fees avoided, a lender committed for more than intended.
- **Usually rated:** High or Medium.

## Self-sandwich around an automated action — seen in several reports
- **Look for:** a keeper-run rebalance, compounding or re-range whose price or fee the user or the fulfiller can influence; a fee mode switchable just before execution; a rebalance anyone can trigger that pays fees each time; a user's own trade settled against an external pool inside a wide price band.
- **What goes wrong:** the actor moves the price, lets the automation trade at it and moves it back, or toggles a setting in front of the keeper to dodge the fee.
- **Usually rated:** Medium or High.

## Swap wired backwards — seen in several reports
- **Look for:** input and output tokens exchanged, a reversed path, a helper whose result is never assigned and so is always zero, a fixed token index for a pool ordered differently, a signed swap result cast without negation.
- **What goes wrong:** the function always reverts or trades the wrong way; often the feature never worked.
- **Usually rated:** High or Critical; Medium when it only reverts.

## Pool initialised or first funded at a hostile price — seen in several reports
- **Look for:** a permissionless `initialize(price)` for a pair someone is about to fund; first-liquidity shares from a formula that makes `minShares` useless; a strategy's first deposit with no deviation check.
- **What goes wrong:** the initial liquidity goes in at a skewed ratio and is arbitraged away.
- **Usually rated:** Medium or High.

## Allowance left behind — seen in several reports
- **Look for:** `approve` for more than the spender then uses; an allowance to the old address not revoked when a setter replaces it; a one-time allowance expected to survive being spent.
- **What goes wrong:** a later call spends the residue out of order, a retired contract can still pull, or calls revert once the allowance is gone.
- **Usually rated:** Medium or Low.

## No price impact on oracle-priced trades — seen in several reports
- **Look for:** a quote at the oracle price plus a spread computed from current skew only, not from the incoming size; impact not summed across split orders; a funding rate derived from one maker's skew and applied to the whole market.
- **What goes wrong:** very large orders at no cost; an attacker creates an extreme funding rate cheaply and liquidity providers pay.
- **Usually rated:** Medium or High.

## Fee tier or route fixed in code — seen in several reports
- **Look for:** one constant pool fee for every pair; route bytes accepted on a length check alone; large swaps forced through a single venue.
- **What goes wrong:** swaps revert for pairs without that tier, or go through a thin pool.
- **Usually rated:** Medium or Low.

## Royalties in NFT trading — seen once, as several findings of one report
- **Look for:** a royalty computed from a price other than the one charged; the recipient looked up per token and paid by callback before the excess is refunded; a bulk price split evenly across NFTs of unequal value.
- **What goes wrong:** a royalty receiver drains the pool or takes the buyer's refund; a sale fails when the recipient rejects ETH.
- **Usually rated:** High or Medium.

## Flash-loan terms — seen once
- **Look for:** the fee taken from `msg.sender` and not from the receiver; a fee variable borrowed from another feature with different units; a buy-then-pay flow that gives use of the assets inside one transaction for less than the flash fee.
- **What goes wrong:** the pool owner earns less than configured and integrations built to the standard break.
- **Usually rated:** Medium.

## Sealed bids that can be guessed — seen once
- **Look for:** a commit-reveal auction whose commitment is a hash of the price alone, or of the price and public data, with no secret salt.
- **What goes wrong:** rivals try the few plausible prices, learn every bid before the reveal and place theirs accordingly.
- **Usually rated:** High.
- **Not a finding if:** the commitment includes a random value kept until reveal.
