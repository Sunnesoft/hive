# Orrin Bridge: integration desk notes

## What the bridge is

Orrin Bridge moves tokens between NEAR and Ethereum. A user locks a token on one side and receives it on the other; the lock and the release are separate transactions joined by a relayer and checked by a light client on each side.
The production contract on NEAR is v3.orrin-bridge.near. Partners test against sandbox.orrin-bridge.testnet, which runs the same code with test tokens and a daily reset at 03:00 UTC.
Versions 1 and 2 are retired: they accept no new transfers and only serve refunds of transfers started before 2025-09-30.

## How long a transfer takes

From NEAR to Ethereum a transfer is released after the light client on Ethereum has accepted 3 NEAR blocks that follow the lock, plus a fixed safety delay of 17 minutes. In practice the user sees the tokens on Ethereum 19 to 24 minutes after locking.
From Ethereum to NEAR the bridge waits for 96 Ethereum block confirmations before it mints or releases on NEAR, which is about 20 minutes. There is no extra fixed delay in this direction.
The safety delay exists so that the watchers can stop a release: any of the five watcher nodes can pause a pending release during the delay, and a paused release needs two signers to resume.

## Fees

The fee is 0.08% of the amount, with a floor of 1.20 USDC (or the same value in the token moved) per transfer. There is no cap. The fee is taken on the source side, so the user receives the amount minus the fee.
Partners that moved more than 5,000,000 USDC in the previous calendar month pay 0.05% in the current month; the floor stays 1.20 USDC.
A refunded transfer keeps only the floor: the percentage part of the fee is returned with the refund.

## Limits

One transfer may carry at most 40,000 USDC (or the same value) without pre-approval. Larger transfers are rejected by the contract unless the sender account is on the pre-approved list, which the desk fills on request within two business days.
The total outflow per token is limited to 250,000 USDC in any rolling 24 hours. Transfers beyond the limit are not rejected: they queue and wait for a manual review by two signers, which normally takes under 4 hours on business days.
The memo attached to a transfer may be at most 96 bytes. A longer memo makes the contract reject the transfer before anything is locked.

## Supported tokens

Supported in both directions: USDC, USDT and wNEAR. ETH is supported from Ethereum to NEAR as a wrapped token and back.
AURORA was delisted on 2026-04-01 after its liquidity on the Ethereum side fell below the bridge's minimum; transfers of AURORA started before that date can still be refunded but not completed.
A new token is listed only after a review of its contract and a liquidity check; the desk does not list rebasing tokens or tokens that take a fee on transfer.

## What an integrating contract must do

An app that sends tokens through the bridge from its own contract calls ft_transfer_call on the token with the bridge as the receiver, and learns the outcome in its own callback, which the desk calls the settlement callback (most partners name it on_bridge_settled).
Give the settlement callback 22 Tgas. The requirement was 15 Tgas until incident OB-12 showed that a token upgrade can make the token's own resolution step heavier, leaving too little for the partner's callback.
Each pending transfer keeps a record of 412 bytes in the bridge contract until it settles, and the integrating app pays for it: attach 0.00412 NEAR per pending transfer. The deposit comes back when the transfer settles or is refunded.
The integrating contract must handle the TransferRefunded event. A refund returns the amount to the origin account within 30 minutes of the failure, minus the fee floor.
Deduct the user's balance before the call and restore it in the settlement callback if the transfer failed; a partner that credited users only on success lost track of 11 refunds in the sandbox before go-live.
Partners must run their integration against the sandbox for at least 5 business days and pass the desk's checklist of 14 cases before the production contract accepts their account.

## Keys and relayers

Relayers sign with function-call access keys that can call only the bridge contract and carry an allowance of 2 NEAR; the desk tops them up daily. Relayer keys are never full-access keys.
The bridge's own upgrade key is a multisig of 4 out of 7 signers, and an upgrade is announced to partners at least 72 hours before it runs, except for emergency fixes.

## Incident OB-12 (2026-02-11): callbacks ran out of gas

A supported token upgraded its contract, and its transfer resolution began to use more gas. Partners' settlement callbacks, given 15 Tgas at the time, ran out of gas.
37 transfers were left with funds locked and no settlement recorded, for 9 hours, until the desk replayed the callbacks by hand.
No funds were lost. Changes: the required callback gas went up to 22 Tgas, every partner checklist now includes a failed-callback case, and token upgrades on the supported list are watched by an alert.

## Incident OB-19 (2026-05-27): a relayer key in build logs

A relayer's key was printed into the logs of a build job that an outside contributor could read. The key was a function-call key, so it could only call the bridge and spend its allowance.
The key was rotated 41 minutes after the report. No funds moved and no transfer was delayed.
Changes: build jobs no longer receive relayer keys at all, relayers load keys from a hardware module, and the allowance was confirmed at 2 NEAR so that a leaked key cannot burn more than that.

## Incident OB-23 (2026-08-04): the daily limit queue

A market event pushed USDC outflow past the 250,000 limit before noon UTC, and 212 transfers queued. Reviewing each by hand took the two signers 11 hours.
Changes: queued transfers under 2,000 USDC are now released automatically after 60 minutes if no watcher objects; only larger ones wait for the signers.

## Support

A transfer that has not settled 2 hours after the expected time counts as stuck. Partners open a ticket with the tag BR-STUCK and the transfer id; the desk answers within 45 minutes around the clock.
Questions about listing, limits and pre-approval go to the desk on business days and are answered within one business day.
