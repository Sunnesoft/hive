# Sources of the NEAR incident case-book

The entries in `knowledge/incidents-*.md` are restatements, in our own words, of the public incident reports, disclosures and fixes listed below; no sentence or code of any source is reproduced, and nothing about Stader NearX / near-liquid-token, the Octopus nep141-token-convertor, nep141-token-vesting and appchain registry, Ref Finance's xREF token (ref-token) and ref-ve, Aurora staking-farm, the SWEAT token contract, Mintbase store / mb-contracts, cNEAR (sig-net) or Potlock was used, nor any material by Trail of Bits.

Each line: what it was, year, public address.

## Exploits and losses

- Ref Finance exchange: a hotfix stopped debiting LP shares on liquidity removal, project's post-mortem, 2021 — https://rhea-finance.medium.com/a-post-mortem-on-the-ref-finance-exploit-what-happened-9f6140bafde6 (read through web.archive.org)
- Skyward Finance: treasury drained through duplicate token ids in a redemption call, 2022 — https://halborn.com/explained-the-skyward-finance-hack-november-2022/ and https://rekt.news/skyward-rekt/
- Rhea Finance (Burrowland margin trading): slippage minimum summed over the hops of a swap route, 2026 — https://alpha.rekt.news/rhea-finance-rekt and https://quillaudits.com/blog/hack-analysis/rhea-finance-hack
- NEAR Intents: internal credit kept after a refunded deposit, 2026 — https://blocksec.com/blog/near-intents-refund-exploit-security , https://thecoding.substack.com/p/near-intents-ghost-fund-postmortem and https://www.kucoin.com/news/flash/near-intents-releases-post-mortem-report-on-3-8m-vulnerability
- Omni Bridge: transfers made before a token was bound were missing from the locked-token counter, which happened in production, 2026 — https://github.com/Near-One/omni-bridge/pull/662
- NEAR Wallet: access to an account lost after enabling 2FA over existing contract state, 2022 — https://github.com/near/near-wallet/issues/2387

## Attacks that were repelled

- Rainbow Bridge: fabricated light client block challenged by a watchdog, May 2022 — https://threadreaderapp.com/thread/1520810591803293696.html
- Rainbow Bridge: second fabricated block, challenged in 31 seconds, August 2022 — https://lifi.substack.com/p/rainbow-bridge-resits-another-attack

## Bug bounties and their disclosures

- Aurora Engine: inflation through delegatecall to the exit precompiles, 2022 — https://aurora.dev/blog/aurora-mitigates-its-inflation-vulnerability , https://immunefi.com/blog/bug-fix-reviews/aurora-inflation-spend-bugfix-review-6m-payout/ and https://pwning.mirror.xyz/CB4XUkbJVwPo7CaRwRmCApaP2DMjPQccW-NOcCwQlAs
- Aurora Engine: fee in `ft_on_transfer` charged to the recipient, 2022 — https://aurora.dev/blog/aurora-mitigates-two-vulnerabilities and https://immunefi.com/blog/bug-fix-reviews/aurora-improper-input-sanitization-bugfix-review/
- Aurora Engine: withdrawal from the custodian with a forged burn result, 2022 — https://aurora.dev/blog/aurora-mitigates-two-vulnerabilities and https://immunefi.com/blog/bug-fix-reviews/aurora-withdrawal-logic-error-bugfix-review/
- Rainbow Bridge deposit: proof reuse through a truncated `log_index`, reported 2022, written up 2023 — https://lapitsky.com/how-to-get-paid-800k-for-a-clippy-warning/ (read through web.archive.org)
- Aurora bug bounty list (modexp overflow, call stack overflow, XCC arithmetic), 2022–2024 — https://forum.aurora.dev/t/bug-bounty-program-reports-and-rewards/1257

## Vulnerabilities disclosed in public issues, fixes and changelogs

- Rainbow token connector: "infinite minting" by reading one method's result as another's, 2020 — https://github.com/Near-One/rainbow-token-connector/issues/9
- Rainbow token connector: proof recorded before verification, 2020 — https://github.com/Near-One/rainbow-token-connector/issues/5
- Rainbow token connector: execution status of a proven outcome not checked, 2021 — https://github.com/Near-One/rainbow-token-connector/issues/81
- Aurora Engine: relayer key removal could delete a full-access key, 2024 — https://github.com/aurora-is-near/aurora-engine/pull/972
- Aurora Engine: JSON injection in the arguments built by the `exit_to_near` precompile, 2025 — https://github.com/aurora-is-near/aurora-engine/pull/1024
- Aurora Engine: silo transactions callable by anyone, 2025 — https://github.com/aurora-is-near/aurora-engine/pull/1030
- Aurora Engine: `deploy_upgrade` callable by anyone, 2022 — https://github.com/aurora-is-near/aurora-engine/pull/410
- Aurora Engine: upgrade index not cleared after deployment, 2023 — https://github.com/aurora-is-near/aurora-engine/pull/741
- Aurora Engine: owner could call `new` again, 2023 — https://github.com/aurora-is-near/aurora-engine/pull/733
- Aurora Engine: XCC callback ran after a failed promise, 2023 — https://github.com/aurora-is-near/aurora-engine/pull/693
- Aurora Engine: `ft_transfer` could come after `near_withdraw`, 2023 — https://github.com/aurora-is-near/aurora-engine/pull/864
- Aurora Engine: fee charged without consuming the nonce, replayable, 2026 — https://github.com/aurora-is-near/aurora-engine/pull/1222
- Aurora Engine: transactions without a chain id accepted, 2022 — https://github.com/aurora-is-near/aurora-engine/pull/432
- Aurora Engine changelog, entries under "Fixes", 2021–2026 — https://github.com/aurora-is-near/aurora-engine/blob/master/CHANGES.md
- Omni Bridge: native fee in the message could drain a shared prepaid balance, 2025 — https://github.com/Near-One/omni-bridge/pull/280
- Omni Bridge: large native NEAR withdrawals stuck because the transfer is debited when scheduled, 2025 — https://github.com/Near-One/omni-bridge/issues/251
- BTC light client contract: 64-byte transaction Merkle proof forgery mitigated, 2026 — https://github.com/Near-One/btc-light-client-contract/pull/139
- Aurora launchpad contracts: reentrancy in claim and withdraw, then concurrent withdrawals, 2025 — https://github.com/aurora-is-near/aurora-launchpad-contracts/pull/49 and https://github.com/aurora-is-near/aurora-launchpad-contracts/pull/56
- Sputnik DAO factory: any DAO could update any DAO, 2022 — https://github.com/near-daos/sputnik-dao-contract/pull/136
- Sputnik DAO: proposal approved although its action failed, 2021 — https://github.com/near-daos/sputnik-dao-contract/issues/14
- near-sdk-rs: zero allowance treated as unlimited for function-call keys, 2022 — https://github.com/near/near-sdk-rs/issues/871 and https://github.com/near/near-sdk-rs/blob/master/CHANGELOG.md
- near-sdk-rs: nested promise chains executed out of order, 2021 — https://github.com/near/near-sdk-rs/issues/263 and https://github.com/near/near-sdk-rs/pull/410
