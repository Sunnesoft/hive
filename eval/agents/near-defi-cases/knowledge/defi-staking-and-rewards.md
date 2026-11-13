# DeFi cases: liquid staking, yield wrappers and reward farms

What audits of NEAR liquid-staking tokens, yield-bearing wrappers built over another protocol, and reward farms report about share price, rewards and validators.

## Shares minted for NEAR that was handed back (seen once)
- **Look for:** `deposit` / `deposit_and_stake` on a user's first call: a storage fee is taken out of the attached deposit, or the storage registration refunds what exceeds its minimum, and the shares are then computed from the full `env::attached_deposit()`.
- **What goes wrong:** the user holds staking shares for NEAR he got back or that went to storage; every such deposit dilutes the other holders. The cost to the user is nothing.
- **Usually rated:** High.
- **Not a finding when:** shares are computed from the amount that stays to be staked.

## Share price moves while the reward is being split (seen once)
- **Look for:** the epoch reward update: the total staked amount is raised, and the protocol's fee is paid by minting shares to several beneficiaries in a loop, each mint using the price recomputed after the previous mint.
- **What goes wrong:** each mint raises the supply, so the price falls step by step; the same NEAR value buys a different number of shares for each beneficiary, and their cuts do not match the configured ratios.
- **Usually rated:** High.
- **Not a finding when:** all fee shares are computed from one price fixed before any mint.

## Validator left busy by an epoch with nothing to pay (seen once)
- **Look for:** a per-validator "executing" mark set before the staking pool is asked for its balance and cleared at the end of the callback. Follow the callback when the reward is zero (does minting zero shares panic?) and when the query failed. Can a validator be removed while the mark is set?
- **What goes wrong:** the mark is never cleared and the validator takes no further stake, unstake or reward update; removal during a pending stake makes the callback fail to find the validator, and the stake is not settled.
- **Usually rated:** High; Low for the removal.

## Exit by the recorded amount (seen once)
- **Look for:** a manager method that empties a validator by unstaking the locally recorded staked amount and not everything held at the pool.
- **What goes wrong:** rewards earned since the last sync are not in the record; they stay staked at a validator the protocol believes empty.
- **Usually rated:** Low.
- **Not a finding when:** the method unstakes all, or syncs the balance first in the same flow.

## Wrapper minted on a partner's word, partner not listening (seen once)
- **Look for:** a yield token that forwards deposits into a lending market and mints its own shares when the market calls back to confirm the supply. What does the market do if that confirming call fails: does it return the tokens, or report them all as used whatever happened?
- **What goes wrong:** the deposit is converted and kept by the market while the user receives neither wrapper tokens nor a refund; recovery needs the administrators.
- **Usually rated:** Medium.
- **Not a finding when:** a failed mint is recorded on chain and a claim path exists for it.

## Rewards converted and left at the DEX (seen once)
- **Look for:** a keeper method that sells reward tokens on a DEX and expects the proceeds back through `ft_on_transfer`, where they are supplied again. If the DEX cannot deliver, it keeps the proceeds as the wrapper's internal balance. Is there a method that collects that balance? Does the flow assume the DEX pays with a transfer-and-call?
- **What goes wrong:** rewards sit at the DEX outside the wrapper's books; the reported share value falls behind the real one for good.
- **Usually rated:** Medium; a note for the assumption about the DEX.

## New reward token does not reach those already staked (seen once)
- **Look for:** an owner method that adds a reward token to an existing farm. Is each staker's index for that token started at the moment of adding, or only when the staker next claims or changes stake?
- **What goes wrong:** stakers who do not touch their position earn nothing from the new reward until they interact; what they miss stays with the farm or goes to active users.
- **Usually rated:** Medium; acknowledged and not changed.

## Balance put back without re-entering the farm (seen once)
- **Look for:** the failure branch of a withdrawal from a market whose deposits also earn farm rewards. It re-credits the balance; does it also run the same farm update a normal deposit runs?
- **What goes wrong:** the returned funds are in the account and outside the farm; the user earns less than his balance warrants until his next action.
- **Usually rated:** Medium.

## Farm contract replaced while it still holds stake (seen once)
- **Look for:** in a pool whose LP positions are staked in a separate farming contract: a setter for the farming contract's address with no check that the old one holds nothing; a per-account limit on the number of asset entries that applies to the farming contract's account like to any user.
- **What goes wrong:** LP tokens staked through the old farm cannot come back; once the farm account reaches the limit, no user can stake.
- **Usually rated:** Medium.

## LP share transfer to oneself (seen once)
- **Look for:** an internal transfer of LP or multi-token shares that loads the sender's and the receiver's records, debits one, credits the other and saves both, with no check that the two accounts differ.
- **What goes wrong:** when both are the same account the credited copy is saved last and the balance grows from nothing. Reported where only a trusted farming contract could reach it.
- **Usually rated:** Low in that setting; higher if users reach it.

## Old and new record of one stake (seen once)
- **Look for:** a farm that moved stake records to a new versioned map: getters that read the old map first and fall back to the new one, while setters write only to the new one.
- **What goes wrong:** once written, the new record is never read; every later update starts again from the old state, and the stake and reward figures of migrated users are wrong.
- **Usually rated:** High.

## Recurring notes (seen in several reports)
- **Look for:** the share price rising only when a manager calls the reward update, so that a deposit just before the call and an unstake just after takes part of the epoch's reward; a boost token whose id or decimals the owner can change while users have it staked; deposits of zero that create an account record at the contract's cost; a registration fee paid by the sender of a transfer that nobody can reclaim.
- **What goes wrong:** rewards shift from long-term holders to well-timed ones; users unstake another token; storage paid from the contract's balance.
- **Usually rated:** notes and Low; Medium for unpaid storage and the boost token.
