# DeFi cases: oracles and the prices a protocol consumes

What audits of NEAR price-feed contracts, and of lending, margin, pool and bot contracts on the side where they read prices, report about how a price is obtained, scaled and trusted.

## Exponent or decimals of the feed not applied (seen in two reports)
- **Look for:** code that takes `price` from an oracle answering with a price and an exponent, and uses it without scaling by that exponent, or divides by the exponent as if it were a number of units; a table of token values in NEAR entered by hand with no rule for each token's decimals.
- **What goes wrong:** the ratio of two prices is right only while both feeds share one exponent; otherwise slippage checks and fee amounts are off by powers of ten, and orders execute at prices their owners excluded.
- **Usually rated:** High; a note for the hand-kept table.

## Two price sources open at once (seen once)
- **Look for:** a protocol that added a second oracle path and kept the first enabled, so that the same action can be run through either.
- **What goes wrong:** the two sources differ by small amounts at any moment; a user chooses for each borrow, withdrawal or liquidation the path whose price favours him, at the expense of the other side.
- **Usually rated:** Medium.
- **Not a finding when:** exactly one source can be active, enforced in code.

## Prices requested for the wrong set of tokens (seen once)
- **Look for:** the function that lists which tokens need a price for a given action before the oracle is called. Walk every action and compare the list with what the callback uses: collateral, debt and position token; the case where two of them are the same token.
- **What goes wrong:** a price the callback needs was never requested; the action fails in its second step every time for that combination of tokens, which can block closing or liquidating.
- **Usually rated:** High.

## Feed removed while positions still hold the asset (seen once)
- **Look for:** owner methods that delete or overwrite an asset's feed entry: is the asset checked for open supply, debt or positions? An "add" that silently replaces an existing entry. A default price the owner types in for assets without a feed.
- **What goes wrong:** users cannot adjust or close positions in that asset; a mistaken replacement reprices it; with a default price the owner's key sets who is liquidated.
- **Usually rated:** Medium; a note on centralisation for the default price.

## Pool state read as if it were a price (seen in several reports)
- **Look for:** value taken from what LP shares redeem at this moment; a DEX quote for a path used as reference price for an order; pool data fetched by a call and used some blocks later.
- **What goes wrong:** pool state can be moved by whoever benefits, for the cost of a swap; borrowing limits and execution prices follow.
- **Usually rated:** High when it sets collateral value; a note when it guards an operator-run order.

## Limit on price movement turned into the opening (seen once)
- **Look for:** a stored index price allowed to change by at most a fixed fraction per second.
- **What goes wrong:** in a fast fall the stored price lags the market. A trader opens a short at the lagging price and waits for it to converge; the pool pays the gap times his leverage.
- **Usually rated:** High, acknowledged.

## Confidence reported smaller than the uncertainty (seen once)
- **Look for:** an aggregator that returns a confidence or deviation with its price: how is it derived from the window of accepted values? Taking the smaller of the distances to the two bounds understates it.
- **What goes wrong:** consumers that widen their margins by this figure treat a doubtful price as a firm one.
- **Usually rated:** Low.

## Reporter that stays authorised after approval is withdrawn (seen once)
- **Look for:** reporters admitted by an attested code hash: does revoking a hash stop reporters already registered under it, or only new registrations? Must every component of the reporter's image be approved, or does one approved component suffice? Is the hash that was checked bound to the measurement that was verified?
- **What goes wrong:** a withdrawn or partly unapproved build keeps writing prices that lending and trading contracts act on.
- **Usually rated:** Medium.

## Repeated feed inside one signed batch (seen once)
- **Look for:** parsing of a signed message that carries several prices into a map keyed by feed id, with insert-if-absent.
- **What goes wrong:** if a feed id occurs twice, the first value is kept and the later one ignored without an error; the contract depends on the publisher never doing so.
- **Usually rated:** a recommendation.

## Validity windows without bounds (seen in two reports)
- **Look for:** owner-set durations for how old a price may be, accepted without a maximum; a view that computes pool size or a cap from prices without the validity check the mutating path applies.
- **What goes wrong:** a typing error switches the staleness check off; a cap is judged from expired prices.
- **Usually rated:** Low, or a recommendation.

## Conversion rates kept by hand or by a keeper (seen in several reports)
- **Look for:** a rate between a fee token and native gas set by an admin call; a gas-token price refreshed only when someone invokes the update; the stored rate of a yield-bearing token in a pegged pool, refreshed by a separate call and, on NEAR, always some blocks old.
- **What goes wrong:** when the rate is old the protocol undercharges and pays the difference, or users trade the pool against the true rate.
- **Usually rated:** notes; teams undertake to call the update in time.

## Waste around price calls (seen in two reports)
- **Look for:** one price request per pool token on every hop of a multi-hop swap; several price promises scheduled with no check that prepaid gas covers them and the callback.
- **What goes wrong:** the same prices are fetched repeatedly in one transaction; with too little gas the callback fails after the queries were paid for.
- **Usually rated:** recommendations.
