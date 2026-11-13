# Incidents: accounting, pools and treasuries

Real losses and near-losses where a pool, a treasury or an internal ledger gave out more than it should have.

## The same asset named twice in a list argument
- **What happened:** A treasury let holders burn the project token for a pro-rata share of each asset in a caller-supplied list. The method checked that every id was a treasury asset, not that ids were distinct, and computed each share from the same burned amount. One call naming the wrapped native token many times paid its share each time; repeated until the treasury was empty. Seven-figure loss, after over a year live.
- **Look for:** a caller-supplied `Vec` of token, pool or position ids, looped over while each iteration pays from a quantity fixed before the loop.
- **Why reviews missed it:** each iteration is correct alone.
- **Not this if:** duplicates are rejected, or each iteration reduces what the next one reads.

## Urgent patch that pays out without the debit
- **What happened:** Liquidity providers whose record had been unregistered could not remove liquidity. A hotfix made removal tolerate the missing record and, in doing so, stopped reducing the provider's share balance. Removal returned pool tokens while the shares stayed, so the same shares were redeemed again and again. Seven-figure loss right after deployment.
- **Look for:** recently changed withdraw paths; branches added for a missing account (`unwrap_or_default`, `if let Some`) around a share or balance update; a payout whose subtraction sits in a branch that may not run.
- **Why reviews missed it:** an emergency fix; simulation tests and a soak period came only afterwards.
- **Not this if:** the decrement is unconditional and precedes the payout, and a test repeats the withdrawal.

## Slippage floor summed over the hops of a route
- **What happened:** A lending contract opened leveraged positions by borrowing and swapping along a caller-supplied multi-hop route on an exchange. To compare the route with oracle prices it added up the minimum outputs of all swap steps, although each step's output was the next step's input. A route passing through the position token several times showed a huge guaranteed amount; the final hop delivered almost nothing. Eight-figure loss.
- **Look for:** a sum, a maximum or a first match over per-step `min_amount_out` parsed from `msg`; no check that steps chain token to token.
- **Why reviews missed it:** for one step the sum is right.
- **Not this if:** only the last step's output token and minimum define the expectation.

## Positions born under water drain the shared reserve
- **What happened:** In that incident each position opened with debt far above its real value and was liquidated at once. The protocol covered the shortfall of each liquidation from its common reserve and nothing limited that, so the forced liquidations emptied the reserve and enlarged the loss beyond what had been borrowed.
- **Look for:** liquidation code that takes the missing amount from a reserve, insurance or protocol-owned balance; positions that can be opened and liquidated in consecutive blocks; no health check at opening on the amounts actually received.
- **Not this if:** health is computed after the opening swap settles, from received amounts, and cover from the reserve is capped or needs a privileged decision.

## Protocol money routed through pools anyone can create
- **What happened:** The route ran through fresh pools pairing real assets with tokens the attacker had deployed. The lending contract accepted any pool id and any intermediate token as long as both ends were listed assets, so the borrowed funds stayed in the attacker's pools and left when he removed liquidity. Two days of preparation with hundreds of accounts touched nothing the contract checked.
- **Look for:** pool ids, token ids or router accounts from arguments in a flow that spends borrowed or pooled money; allow-lists covering only the first and last token of a path.
- **Not this if:** every pool and token on the path is allow-listed or the contract builds the path, and the outcome is verified on return.

## Internal ledger never compared with the tokens held
- **What happened:** A settlement contract kept users' balances in its own ledger. Once a bug had created credits with no tokens behind them, withdrawals were paid out of other users' deposits for almost two days. Monitoring compared custody on the source chains with token supply on NEAR, which still matched; nothing compared the sum of ledger balances with the contract's own holdings. Seven-figure loss, later returned.
- **Look for:** per-token ledgers in `LookupMap`s with no stored total; no view from which `sum of credits <= ft_balance_of(current_account_id)` can be established; no way to halt withdrawals when it fails.
- **Not this if:** a total per token is updated with every credit and debit and can be reconciled, with a pause on divergence.

## Counter created at zero after value had already moved
- **What happened:** A bridge tracked how much of each token was locked per destination chain and refused to release more. Transfers sent before the token was registered for that chain found no entry and skipped the increment; registration then created the entry at zero. Returning transfers and fee claims failed as insufficient until a privileged account set the figure by hand. It happened in production with a major stablecoin.
- **Look for:** `if let Some(v) = map.get_mut(&k) { *v += amount }` with no `else`; helper results such as "unchanged" that callers ignore; setup methods that insert zero.
- **Not this if:** the increment creates the entry, or transfers are refused while none exists.
