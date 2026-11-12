Findings from staking contracts, reward distributors, liquid staking tokens and delayed-withdrawal queues.

## Rewards not settled before a balance changes — seen in many reports
- **Look for:** a reward of the form balance times (index minus user index) where stake, unstake, transfer, liquidation or a liquidity change alters the balance without first updating that user's checkpoint; accrual run for `msg.sender` when another account's balance moves; a new staker whose index starts at zero.
- **What goes wrong:** a new or enlarged balance earns for time already past and takes others' rewards, or a reduced one forfeits its own.
- **Usually rated:** High.
- **Not a finding if:** every balance-changing path checkpoints both parties first.

## Cooldown or withdrawal delay sidestepped — seen in many reports
- **Look for:** one timestamp per user overwritten by each request; a request that locks nothing, so it can be filed ahead from spare accounts or repeated to keep a claim window open; a delay variable never initialised; a lock on a position that stays transferable; a withdrawal path that skips deregistration; a lock the beneficiary can renew for ever.
- **What goes wrong:** users exit at once while keeping what the delay was meant to earn or secure; in the reverse case funds can never be reclaimed.
- **Usually rated:** Medium; High when it frees locked collateral.

## Staking just before a distribution — seen in several reports
- **Look for:** rewards allotted in steps by current balance (a per-epoch snapshot at call time, a penalty paid to current depositors, points per action); a per-period allowance computed from a lock shorter than the period; reward maths counting funds not actually staked.
- **What goes wrong:** stake, collect, leave within a block; long-term stakers are diluted. Needs a flash loan or brief capital.
- **Usually rated:** Medium or High.
- **Not a finding if:** rewards are time-weighted or a minimum duration applies.

## Withdrawal queue fixes the wrong thing at request time — seen in several reports
- **Look for:** payout computed at request and paid after the delay with no re-pricing; amounts of a rebasing asset stored as numbers; a claim that pushes ETH to a recipient contract that cannot take it; strict in-order processing where one entry can revert; requests filed for another address that count against its cap.
- **What goes wrong:** a free option on the rate during the delay, a shortfall after a negative rebase, funds locked, or the whole queue stuck.
- **Usually rated:** High or Medium.

## Anyone can trigger a payout for someone else — seen in several reports
- **Look for:** `claim(account)`, `release()`, prize or yield claims open to all, or an external protocol's permissionless claim on a holder that measures rewards by balance before and after; an amount of `0` meaning "everything".
- **What goes wrong:** rewards arrive outside the accounting window and are stranded; a third party forces a conversion at a bad rate or moment; a beneficiary's vesting schedule is disturbed.
- **Usually rated:** Medium or High.

## Claim twice — seen in several reports
- **Look for:** a claimed flag checked in the public wrapper but not on the internal path reached another way; a reward commit whose block range need not follow the previous one; a score credited on mint and again on transfer; an admin payout that can run twice for one player.
- **What goes wrong:** the same reward is paid repeatedly until the pool is empty.
- **Usually rated:** High.

## Rewards emitted while nothing is staked — seen in several reports
- **Look for:** a reward-per-token that does not advance at zero supply while the last-update time does; a period started before the first stake; a first staker credited with everything accumulated so far.
- **What goes wrong:** the emission of the empty span is locked for good, or taken whole by the first staker.
- **Usually rated:** Medium.

## Period housekeeping skipped — seen in several reports
- **Look for:** a per-cycle function (queue rewards, update period, rebase) that loses or mis-sizes the period's amount when not called on time; gauges or pools added or removed mid-cycle; a rate applied per call instead of per elapsed time.
- **What goes wrong:** a week's emission is lost, some pools get nothing, or a rebase applies the wrong yearly rate.
- **Usually rated:** Medium or High.

## Payout capped at the balance yet marked as paid — seen in several reports
- **Look for:** `amount = min(owed, balance)` followed by clearing the debt; a campaign stopped early with no way to recover the remainder; an unstake branch that drops pending rewards.
- **What goes wrong:** a user claiming while the distributor is underfunded loses the difference for good.
- **Usually rated:** High or Medium.
- **Not a finding if:** the unpaid part stays owed.

## Bounty for a public upkeep call — seen in several reports
- **Look for:** a caller reward for updating rates or claiming for others; bots batching claims; a multi-step upkeep wrapped step by step in try/catch.
- **What goes wrong:** front-runners copy the call and take the bounty while honest bots lose gas; a caller supplies just enough gas for an inner step to fail quietly and still be paid.
- **Usually rated:** Medium.

## Loss or slashing not reflected in the rate — seen in several reports
- **Look for:** a staking rate that can only rise; a rebase adding a fixed yearly rate; a balance report once per period; a yield estimate seeded at deployment.
- **What goes wrong:** informed holders exit at the old rate and the remaining holders carry the loss; quoted yields stay wrong for months.
- **Usually rated:** Medium or High.

## Referral and points schemes — seen in several reports
- **Look for:** a referrer chosen freely on each deposit; scores moved on transfer without settling first; referral codes that can be transferred or registered many times; points minted for actions that cost nothing to repeat.
- **What goes wrong:** a referrer captures or overwrites others' scores, claims more than was funded, or farms points with wash actions.
- **Usually rated:** High or Medium.

## Reward token that is also the staked or borrowed token — seen in several reports
- **Look for:** a fee or reward cut taken from the contract's whole balance of a token that is also principal; a rescue function that does not exclude the staked asset; a protocol-fee balance reused as working liquidity.
- **What goes wrong:** principal is taxed as if it were reward, or an operator role can withdraw users' stake.
- **Usually rated:** Medium.

## Reporter committee rules — seen in several reports
- **Look for:** balance or reward reports accepted from a trusted set with no minimum member count; a member being removed who can still submit in the same block; a vote tally reset on execution so the action can run again; a rejected report that cannot be submitted anew.
- **What goes wrong:** one reporter fixes the exchange rate early on, a removed one gets a last vote in, or an approved action repeats.
- **Usually rated:** Medium.

## Randomness from chain data — seen once
- **Look for:** a block hash or a slot start chosen by the caller used to pick who acts or wins.
- **What goes wrong:** the party who gains times or shapes the input until it is selected.
- **Usually rated:** Medium.
- **Not a finding if:** a verifiable randomness source or a commit-reveal scheme supplies the value.
