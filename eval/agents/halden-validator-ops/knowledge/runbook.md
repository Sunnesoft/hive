# Halden Stake: operations runbook and partner terms

## Who we are

Halden Stake runs validators on NEAR and stakes the treasuries of partner projects through its staking pool. The pool's owner key is a multisig of 3 out of 5 signers; no single person can change the pool's settings.
The pool has been in the active validator set in every epoch since 2024-06 except one (incident HS-07).

## Commission and minimums

The reward fee (commission) is 4.5% of staking rewards. For a single delegation above 500,000 NEAR the commission is 3.9%, applied to the whole delegation from the epoch after it crosses the line.
The smallest delegation the custody desk accepts from a partner is 2,500 NEAR. Smaller amounts can be delegated directly to the pool like any retail delegation, without a partner agreement or reports.
There is no deposit fee, no withdrawal fee and no lock beyond what the protocol sets.

## Unstaking and payout

The NEAR protocol releases unstaked tokens after 4 epochs, which is 52 to 65 hours depending on block times. This part is not Halden's to change.
For partners who delegate through the custody desk, Halden sends the released funds to the partner's account within 6 hours after they unlock, on any day of the week.
A partner can ask for an emergency unstake outside business hours by calling the on-call line; the request is signed by two of the multisig signers within 90 minutes.

## Which accounts we accept

We stake partner treasuries only from accounts controlled by a lockup contract or a multisig. We do not accept a treasury held by a single full-access key: one leaked key would move the whole stake, and we would be asked why we did not object.
The partner names two people who may give instructions; an instruction from anyone else is ignored and reported to both of them.

## Uptime commitment and fee credits

We commit to 99.2% uptime measured over each calendar month, where uptime is the share of expected chunks and blocks our validator produced.
For every 0.5 percentage points below 99.2% in a month, the partner gets a credit of 10% of that month's commission. The credit is capped at the whole commission of the month.
A month with a kickout from the validator set is always credited in full, and we cover the rewards the partner missed while we were out.

## Monitoring and paging

The NEAR protocol removes a validator from the set for the next epoch when it produces under 80% of its expected blocks or chunks in an epoch. We page long before that.
The on-call engineer is paged when missed chunks exceed 3% in the current epoch, or when block production falls below 92% of expected. A page must be acknowledged within 5 minutes or it goes to the second engineer.
Disk usage pages at 80% full. Peer count pages below 12 peers. Clock drift pages above 250 milliseconds.
Every page ends with a note in the incident log, even when it was a false alarm.

## Hardware and failover

Validators run on the HN-3 profile: 16 cores, 64 GB of memory and two 2 TB NVMe drives in a mirror. Archival nodes use a different profile and are not used for validating.
Each validator has a hot standby in a second region, synced and ready but holding no validator key. We switch to the standby only after the primary has been confirmed down for 7 minutes by two independent probes; switching earlier risks two nodes signing with one key.
The switch itself takes about 4 minutes: the key is released from the hardware module of the primary's region and loaded in the standby's.

## Keys

The validator key is rotated every 180 days, and immediately after any engineer with access leaves the company.
Node keys and validator keys live in hardware modules; engineers never see them. The staking pool's owner multisig signers use hardware wallets and sit in three countries.

## Upgrades

A nearcore release that carries a protocol upgrade is applied to all validators within 36 hours of its release. Before that it runs for 12 hours on a canary node that follows mainnet without validating.
Releases without a protocol change wait for the next weekly maintenance window, Tuesdays at 14:00 UTC.

## Reports to partners

Each partner gets a monthly report on the 5th business day of the next month: uptime, rewards earned, commission taken, credits given and every incident that touched the pool.
Partners with archival RPC access pay 300 USDC per month for it. Ordinary RPC access is included and limited to 180 requests per minute per key.

## Incident HS-07 (2026-01-19): a full disk and one epoch out of the set

State snapshots were written to the data drive instead of the snapshot drive after a configuration change. The data drive reached 97% and the node stopped producing chunks for most of an epoch.
The validator fell under the protocol's threshold and was out of the validator set for one epoch. Delegators missed about 1,140 NEAR of rewards in total.
We paid the missed rewards to all delegators in full from our own funds and credited the month's commission.
Changes: the disk alert moved from 90% to 80%, snapshot paths are checked by a test before any configuration change is applied, and a second engineer reviews every such change.

## Incident HS-11 (2026-06-30): a failover that was too eager

A network fault between two of our probe locations made one probe report the primary as down. The rule at the time needed a single probe and 3 minutes.
The standby was started while the primary was still producing blocks; for 2 minutes two nodes could have signed with the same key. No double signing was recorded.
Changes: failover now needs two independent probes and 7 minutes, and the key is released by the primary region's hardware module, which refuses while the primary still answers.
