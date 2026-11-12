Findings about what a contract assumes of the tokens it holds and of the contracts it calls: return values, decimals, hooks, callbacks and reentrancy.

## Reentrancy through a receive hook — seen in many reports
- **Look for:** `_safeMint`, `safeTransferFrom`, hook-calling tokens, a native `call{value: ...}` or a user-set hook reached before the function has written its counter, position record, cap or fee state; a guard on some entry points only; a lock that `multicall` or a sibling contract walks around.
- **What goes wrong:** the receiver re-enters to pass a per-user cap, reuse a value about to change, skip a fee or alter collateral settings; a bridge credits more than it received.
- **Usually rated:** High or Medium; Low when nothing of value can be reordered.
- **Not a finding if:** state is written first and one guard covers every function sharing it.

## Native coin handled as an afterthought — seen in many reports
- **Look for:** `transfer`/`send` with their fixed gas; a function that forwards `value` but is not `payable`; the `0xEeee…` placeholder passed to `balanceOf`; a contract that receives unwrapped coin with no `receive`, or with one behind `nonReentrant`; fees held wrapped and paid out as if native; a fallback that books stray coin as a deposit.
- **What goes wrong:** calls revert for contract wallets or native-coin pools; coin is locked.
- **Usually rated:** Medium; Low for the `transfer` habit alone.

## Transfer result ignored — seen in many reports
- **Look for:** bare `transfer`, `transferFrom` or `approve` on arbitrary ERC-20s through an interface expecting `bool`; tokens that return nothing; a low-level `call` whose success flag is dropped.
- **What goes wrong:** a failed transfer is booked as done, or the call reverts for tokens with no return data and the feature is unusable with them.
- **Usually rated:** Medium for arbitrary tokens, Low otherwise.
- **Not a finding if:** a safe-transfer wrapper is used throughout.

## Decimals assumed — seen in many reports
- **Look for:** 18 written into formulas; `10 ** (18 - decimals)`, which reverts above 18; a fee that rounds to zero for 6-decimal tokens; scaling applied on one side of a conversion; a price multiplied by `10 ** decimals` until it overflows; `decimals()` treated as always present.
- **What goes wrong:** amounts off by powers of ten, zero fees, or reverts for some tokens.
- **Usually rated:** Medium; High in pricing or across chains.

## Third-party protocol can refuse — seen in many reports
- **Look for:** a deposit into, or withdrawal from, an external vault, pool or staking contract inside the user's own exit path; reliance on an external `preview`, `max`, redemption queue, cap, pause or admin-set fee; a pool that can be killed; a deployment on another chain with a different interface.
- **What goes wrong:** someone else's state blocks users' exits or skews valuation.
- **Usually rated:** Medium.
- **Not a finding if:** the failure is isolated and idle funds can still be withdrawn.

## Fee-on-transfer tokens — seen in many reports
- **Look for:** the credited amount equal to the requested amount and not the balance difference; an escrow that must later return exactly what it recorded.
- **What goes wrong:** the books exceed the holdings; the last withdrawal or a loan repayment fails.
- **Usually rated:** Medium; Low when such tokens are excluded.
- **Not a finding if:** the balance difference is credited, or tokens are allowlisted.

## Counterparty's callback reverts on purpose — seen in several reports
- **Look for:** an action by a third party (liquidator, keeper, claimer, batch minter, order taker) that calls a user-set hook, sends an NFT with a receiver check, or pays coin to a user address.
- **What goes wrong:** the user blocks the liquidation or the batch, or burns the keeper's gas.
- **Usually rated:** Medium or High.
- **Not a finding if:** payments are pulled, and hooks run with bounded gas and ignored failure.

## Standard conformance of tokens and interfaces — seen in several reports
- **Look for:** `tokenURI` answering for ids never minted; a holder contract without the NFT receiver functions; `supportsInterface` called on tokens that lack it, or with the wrong interface id; a permit extension or multi-token standard implemented with deviations.
- **What goes wrong:** integrations and gated features fail, or a fake position is displayed as genuine.
- **Usually rated:** Low or Medium.

## try/catch that hides a failure — seen in several reports
- **Look for:** a `catch` for string errors only; a multi-step upkeep with each step swallowed; a shutdown marked complete although the withdrawal inside `try` failed; a deployment in `try` that someone can pre-empt.
- **What goes wrong:** state advances as if the step had succeeded; funds go missing, or steps are skipped at will.
- **Usually rated:** Medium.

## Gas starvation of a nested call — seen in several reports
- **Look for:** an external call with a gas cap whose failure is read as zero; failed payloads stored using `gasleft()`; a `staticcall` used as a reentrancy probe that eats the gas it is given; a caller able to leave an inner call too little gas.
- **What goes wrong:** a fee is skipped, a message channel is blocked, or the outer call runs out of gas.
- **Usually rated:** Medium.

## Low-level call to an address without code — seen in several reports
- **Look for:** `call` or `delegatecall` to a configurable address with no code-size check; a success flag dropped; the boolean result of a sibling contract ignored.
- **What goes wrong:** a payment or deposit is recorded although nothing ran.
- **Usually rated:** Low or Medium; once High where a deposit stayed locked.

## Blacklisted address blocks a push payment — seen in several reports
- **Look for:** repayment forwarded straight to the lender, liquidation change sent to the borrower, unstake that also sends a reward token, a refund batch to many recipients, in tokens with a freeze list.
- **What goes wrong:** one frozen address blocks a repayment, a liquidation or a whole batch.
- **Usually rated:** Medium; once High.
- **Not a finding if:** recipients claim for themselves.

## Approve and zero-amount quirks — seen in several reports
- **Look for:** `approve` over a non-zero allowance for tokens that demand a reset first; a zero-amount transfer when a fee rounds to nothing; `setApprovalForAll` repeated on collections that revert when nothing changes.
- **What goes wrong:** the call reverts for those tokens only, and with it the deposit, sale or fee path built on it.
- **Usually rated:** Medium or Low.

## Rebasing balances — seen in several reports
- **Look for:** stored amounts of a token whose balance changes by itself; withdrawal amounts fixed in units of a rebasing staked token.
- **What goes wrong:** surplus is stranded or captured by whoever syncs first; after a negative rebase the last users cannot be paid.
- **Usually rated:** Medium or High.

## Read-only reentrancy on an external pool — seen in several reports
- **Look for:** pricing from a pool's virtual price, rate or balances with no check that the pool is not mid-call; a check that covers native-coin pools only.
- **What goes wrong:** inside the pool's liquidity-removal callback the read is inflated, and the attacker borrows or mints against it.
- **Usually rated:** High.
