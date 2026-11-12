// What the reviews are asked and what a right review contains. Each list was written and committed before any
// review of its contract was run or read.
//
// A review is how an expert with "work": "review" goes through a customer's files (node/src/review.ts). It is
// measured on contracts with an audit that somebody else published: the three Solidity contracts of tasks.ts that
// nothing here was prepared for, with the same findings as there, and NEAR contracts in Rust audited by BlockSec,
// Halborn, Guvenkaya, OtterSec and Trail of Bits (eval/agents/SOURCES.md). The score is the count of reference findings a reader finds stated as
// items of their own, reading without knowing whose answer it is; there are no patterns here, because for
// findings they proved unreliable.
//
// The NEAR lists hold every finding of the reports that has a severity, and those of their recommendations that
// are about what an attacker or the owner can do to users (centralization, tokens with elastic supply, unbounded
// work, missing checks on time, gas and ownership). What is about style is left out whatever it is called:
// macros, gas saved, dead and redundant code, wording of logs, notes on what the audit assumed. Each line says
// what the report says, in our words; the severities are the reports'.
//
// Two sets. The reviews were changed on what the first three NEAR contracts showed (`set: 'development'`): their
// numbers say how the changes went, and prove nothing. The others (`set: 'held out'`) were written down here
// before the reviews were frozen and are run once, on the frozen code: theirs is the result. Four of them came
// from a second search, through every firm with public NEAR reports and through the audits that projects keep in
// their own repositories; two of those reports (the SWEAT token's and cNEAR's) are from 2026, later than anything
// the models could have been trained on.
//
// A contract larger than an expert is given (48,000 characters, ten files) is represented by whole files of it
// that fit, chosen as those the report's findings are in; findings in files left out are not in the list. Every
// answer of a contract, the models' alone and the reviews', gets the same files, so the choice favours none of
// them over another, though it does make every one of them look better than it would on the whole code.
import { TASKS } from './tasks.ts';

export type ReviewTask = {
  id: string;
  platform: 'Solidity' | 'NEAR';
  set?: 'development' | 'held out';
  task: string;
  files: string[]; // the customer's files, as links: every expert and every model asked alone gets them all
  experts: string[]; // folders under eval/agents or agents
  findings: string[];
};

const SOLIDITY = ['solidity-attack-paths', 'solidity-code-maturity', 'solidity-bug-patterns'];
const NEAR = ['near-security-guide', 'near-standards', 'near-contract-review'];
const fromTasks = (id: string): ReviewTask => {
  const t = TASKS.find((x) => x.id === id)!;
  return { id, platform: 'Solidity', task: t.task, files: [t.material!], experts: SOLIDITY, findings: t.facts.map((f) => f.text) };
};

const audit = (what: string, files: string[]) =>
  `Audit this NEAR smart contract (Rust, near-sdk) before we deploy it: ${what}. Its source files:\n${files.map((f) => `- ${f}`).join('\n')}\n\nList every vulnerability you find with its severity (High, Medium or Low), the function and the file it is in, and the fix. For each High finding write a proof of concept as a Rust test for the contract's crate.`;
const at = (base: string, paths: string[]) => paths.map((p) => `${base}/${p}`);

const CONVERTOR = at('https://raw.githubusercontent.com/octopus-network/nep141-token-convertor/7c8a44b49bf62ee57656f67a0ebcea55cb8015c5/nep141-token-convertor-contract',
  ['Cargo.toml', 'src/lib.rs', 'src/account.rs', 'src/admin.rs', 'src/constants.rs', 'src/contract_interfaces.rs', 'src/conversion_pool.rs', 'src/storage_impl.rs', 'src/token_receiver.rs', 'src/types.rs']);
const VESTING = at('https://raw.githubusercontent.com/octopus-network/nep141-token-vesting/3001151eba0b41f8baa6fbe8eac2cc6b39c0c5ec/nep141-token-vesting-contract/src',
  ['lib.rs', 'beneficiary.rs', 'fungible_token.rs', 'interfaces.rs', 'owner.rs', 'utils.rs', 'vesting/mod.rs', 'vesting/traits.rs', 'vesting/cliff.rs', 'vesting/linear.rs']);

const XREF = at('https://raw.githubusercontent.com/ref-finance/ref-token/1f92f64c3ee773a42649d400c91b1decf322f953/xref-token',
  ['src/xref.rs', 'src/lib.rs', 'src/owner.rs', 'src/views.rs', 'src/storage_impl.rs', 'src/utils.rs', 'Cargo.toml']);
const NEARX = at('https://raw.githubusercontent.com/stader-labs/near-liquid-token/89ee18b875adde6dd1a150c86f6d5a332d5e4404/contracts/near-x/src',
  ['contract/public.rs', 'contract/internal.rs', 'state.rs', 'fungible_token/nearx_token.rs', 'fungible_token/nearx_internal.rs']);
const FARM = at('https://raw.githubusercontent.com/referencedev/staking-farm/a39240d34fe97b21453a012a0abfb1d1afbc8775/staking-farm/src',
  ['lib.rs', 'farm.rs', 'stake.rs', 'account.rs']);
const REGISTRY = at('https://raw.githubusercontent.com/octopus-network/octopus-appchain-registry/0be8357aafe92eb7ef85acf3c234e0711e91389b',
  ['appchain-registry/src/lib.rs', 'appchain-registry/src/registry_owner_actions.rs', 'appchain-registry/src/voter_actions.rs', 'appchain-registry/src/types.rs', 'appchain-registry/src/registry_settings_actions.rs',
    'appchain-registry/src/sudo_actions.rs', 'appchain-registry/src/storage_key.rs', 'appchain-registry/src/appchain_owner_actions.rs', 'appchain-registry/Cargo.toml', 'Cargo.toml']);
const REFVE = at('https://raw.githubusercontent.com/ref-finance/ref-ve/1fd6dfe2160590bab0f8e9ccf17c4dcce2c42f33/contracts/ref-ve/src',
  ['lib.rs', 'management.rs', 'actions_of_reward.rs', 'token_receiver.rs', 'actions_of_proposal.rs', 'proposals_action.rs', 'proposals.rs', 'owner.rs', 'storage_impl.rs']);

const SWEAT = at('https://raw.githubusercontent.com/Sweat-Foundation/sweat-token/9b84e71ae05d7faf46826a82fbaf453794f0ef14',
  ['contract/Cargo.toml', 'contract/src/lib.rs', 'contract/src/api.rs', 'contract/src/core.rs', 'contract/src/defer.rs', 'contract/src/storage.rs', 'contract/src/migration.rs', 'contract/src/meta.rs',
    'vendors/near-contract-standards/src/fungible_token/core_impl.rs', 'vendors/near-contract-standards/src/fungible_token/storage_impl.rs']);
const MBSTORE = at('https://raw.githubusercontent.com/Mintbase/mb-contracts/aedb2c4271864f126d1190711a0c9eb4d7a842b3/mb-store',
  ['Cargo.toml', 'src/lib.rs', 'src/core.rs', 'src/approvals.rs', 'src/minting.rs', 'src/enumeration.rs']);
const CNEAR = at('https://raw.githubusercontent.com/sig-net/cNEAR/c1944263327d8b4cb0b640824b33f37f78d7108d', ['Cargo.toml', 'src/lib.rs']);
const POT = at('https://raw.githubusercontent.com/PotLock/core/71f35051f81c333c85fafc42d073173191ad14ca/contracts/pot',
  ['Cargo.toml', 'src/payouts.rs', 'src/donations.rs', 'src/admin.rs', 'src/constants.rs', 'src/events.rs']);

export const REVIEWS: ReviewTask[] = [
  fromTasks('bridge audit'),
  fromTasks('loan audit'),
  fromTasks('second audit'),
  {
    // BlockSec, "Security Audit Report for Nep141-Token-Convertor Contracts", v1.0, 16 May 2022, on commit 7c8a44b.
    id: 'convertor audit', platform: 'NEAR', set: 'development', experts: NEAR, files: CONVERTOR,
    task: audit('a pool that converts one NEP-141 token into another at a fixed rate', CONVERTOR),
    findings: [
      'High (2.2.1): calculate_output_token_amount multiplies the amount by in_token_rate and divides it by the same in_token_rate, so the output equals the input whatever the rates of the pool are',
      'High (2.2.2): calculate_reverse_output_token_amount has the multiplier and the divisor the wrong way round (out_token_rate over in_token_rate), against the price the pool is meant to give',
      'Medium (2.2.5): when the transfer out fails, ft_transfer_resolved cannot roll the state back: saving the account fails the storage check in internal_save_account, so the tokens stay locked',
      'Low (2.1.1): Cargo.toml does not enable overflow checks for the release profile, so integer arithmetic can wrap silently',
      'Low (2.1.2): storage_deposit, storage_withdraw and storage_unregister do not call assert_contract_is_not_paused, so accounts register and unregister while the contract is paused',
      'Low (2.1.3): the pool id is a u32 that internal_assign_pool_id increments with no overflow check',
      'Low (2.2.3): assert_storage_balance_bound_min compares an account\'s storage balance with the minimum computed for env::predecessor_account_id(), not for the account_id it was given',
      'Low (2.2.4): ConversionPool::new accepts an in_token_rate or out_token_rate of zero: a division by zero, or an output that is always zero',
      'Recommendation (2.3.1): centralization: the admin holds broad powers over pools and the whitelist and cannot be changed',
      'Recommendation (2.3.2): a whitelisted token with elastic supply (deflationary, fee on transfer, rebasing) breaks the pool\'s accounting: the amount recorded is not the amount received',
      'Recommendation (2.3.8): create_pool_deposit is 0 by default, so pools cost nothing to create and anyone can fill the contract\'s storage with them',
    ],
  },
  {
    // BlockSec, "Security Audit Report for Nep141-Token-Vesting Contracts", v1.0, 25 Oct 2022, on commit 3001151.
    id: 'vesting audit', platform: 'NEAR', set: 'development', experts: NEAR, files: VESTING,
    task: audit('a vesting contract that releases a NEP-141 token to beneficiaries over time', VESTING),
    findings: [
      'High (2.2.1): a claim records the requested amount as claimed but returns and transfers the whole claimable amount, so a beneficiary who asks for a little is sent everything and can claim again: the contract\'s tokens can be drained',
      'High (2.2.2): claim_callback removes a vesting as soon as its release time is over (is_release_finish), without checking that all of its tokens were claimed: what a partial claim left is lost to the beneficiary',
      'Medium or Low (2.2.4): terminate_vesting lets the owner remove a vesting while it holds claimable tokens the beneficiary has not claimed yet',
      'Low (2.1.1): the storage fee paid for a vesting is not refunded when the vesting is removed (after the last claim, on termination)',
      'Low (2.2.3): when ft_transfer fails, ft_transfer_resolved does not restore claimed_token_amount, so the tokens count as claimed and the beneficiary loses them',
      'Recommendation (2.3.2): centralization: the owner can change beneficiaries, freeze and terminate vestings',
      'Recommendation (2.3.3): a vested token with elastic supply (deflationary, fee on transfer, rebasing) breaks the accounting',
      'Recommendation (2.3.4): set_owner hands ownership over in one step: a wrong account id loses the contract',
      'Recommendation (2.3.7): creating a vesting does not check its start time and its checkpoints against the current time or each other',
      'Recommendation (2.3.8): the number of cliff checkpoints of a vesting is not limited, so computing what is claimable can run out of gas',
      'Recommendation (2.3.9): is_release_finish compares with < where <= is needed, in both the cliff and the linear vesting',
    ],
  },
  {
    // BlockSec, "Security Audit Report for XRef Token Contract", v1.0, 12 Oct 2022, on commit 1f92f64. All of the crate.
    id: 'xref audit', platform: 'NEAR', set: 'development', experts: NEAR, files: XREF,
    task: audit('a contract that takes a NEP-141 token at stake and gives shares of it, itself a NEP-141 token, with rewards added over time', XREF),
    findings: [
      'Low (2.1.1): when the transfer of an unstake fails, callback_post_unstake mints back the shares that were burned, a block later, though the ratio of shares to the staked token may have changed meanwhile: the user may get wrong shares',
      'Low (2.1.2): if that transfer fails and the sender has unregistered meanwhile, the state changed in unstake is not restored, and only a log without the amount is written: the unstaked tokens may be lost',
      'Low (2.1.3): modify_reward_per_sec lets the owner choose by a flag whether rewards at the old rate are distributed before the rate changes, so users may receive an amount they did not expect',
      'Recommendation (2.2.1): a staked token with elastic supply (deflationary, fee on transfer) is not supported: the amount recorded in ft_on_transfer is not the amount received',
      'Recommendation (2.2.2): upgrade does not check that the deployment and the migration succeeded: a failed step may leave the owner unable to call the privileged functions',
      'Recommendation (2.2.3): upgrade does not check that the gas attached is enough for migrate()',
    ],
  },
  {
    // BlockSec, "Security Audit Report for NEARx Smart Contract", v3.0, 9 Sep 2022, findings present at its Version 1
    // (commit 89ee18b) and located in the five files given; and the bug exploited on 16 Aug 2022 (Stader's incident
    // report; fixed by commit 04480ab), which no audit report has.
    id: 'nearx audit', platform: 'NEAR', set: 'held out', experts: NEAR, files: NEARX,
    task: audit('a liquid staking pool for NEAR: users deposit NEAR and get shares that are a NEP-141 token, and withdraw after unstaking', NEARX),
    findings: [
      'Exploited (incident of 16 Aug 2022): internal_nearx_transfer does not require the sender and the receiver to differ: it loads both accounts, saves the sender with the amount taken off and then the receiver with the amount added, so a transfer to oneself adds the amount to the balance and mints shares for nothing',
      'Medium (2.1.4): the balance kept for storage is a constant (MIN_BALANCE_FOR_STORAGE, 50 NEAR) that may not cover storage as the number of users grows: denial of service',
      'Medium (2.1.5): a withdrawal may leave an account with a tiny balance (1 yoctoNEAR), so the account is never removed and its storage is paid by the contract: cheap bloating of storage',
      'Low (2.1.1): set_min_deposit takes a u128 where a U128 is needed: JSON carries integers of up to 53 bits, larger values are corrupted',
      'Low (2.1.2): internal_unstake computes what the user receives with the conversion that rounds up (staked_amount_from_num_shares_rounded_up), so the user may get more NEAR than the shares are worth, at the pool\'s expense',
      'Low (2.1.3): min_deposit_amount has no lower bound, and the contract takes no storage fee: a tiny minimum lets accounts be created cheaply until storage runs out',
      'Low (2.2.1): set_reward_fee checks numerator * 100 / denominator <= 10 with integer division, so the fee can be up to nearly 11 percent',
      'Low (2.2.4): each unstake overwrites the epoch at which the account may withdraw: a small unstake after a large one resets the wait while the unstaked amounts add up, so the large amount is withdrawn early',
      'Recommendation (2.3.2): set_owner, set_operator_id and set_treasury_id do not check that the owner, the operator, the treasury and the contract itself are different accounts',
      'Recommendation (2.3.5): centralization: the owner, the operator and the treasury are single keys with wide powers',
    ],
  },
  {
    // Halborn, "Aurora - Staking Farm NEAR Smart Contract Security Audit", Feb - Mar 2022. The report names no commit:
    // a39240d is the code throughout the engagement (the crate did not change from it until April). Findings in the
    // four files given.
    id: 'staking farm audit', platform: 'NEAR', set: 'held out', experts: NEAR, files: FARM,
    task: audit('a staking pool for NEAR validators that also gives out farmed tokens to delegators and burns a part of the rewards', FARM),
    findings: [
      'High (HAL-01): unstake_burn and burn can be called by anyone, so they can be called every epoch: the stake of the pool shrinks, delegators earn less, and what was unstaked goes to the zero address',
      'High (HAL-02): access control: nearly all privileged functions belong to the one owner; there are no separate roles (a pauser, for one), and nothing keeps the owner from being added as an authorized user',
      'Medium (HAL-04): burn_fee_fraction is never validated: a fraction of 1 burns all rewards, above 1 makes every ping panic, 0 burns nothing and lets the owner take all rewards by a reward fee of 1',
      'Low (HAL-05): Ratio::multiply converts to a smaller integer type and may overflow unless the ratio is always validated',
      'Low (HAL-06): in claim the delegator_id may be the caller itself, which makes a needless cross-contract call with the claiming and the receiving account the same',
      'Low (HAL-08): deposit does not assert that a deposit is attached: it can be called with zero',
    ],
  },
  {
    // Halborn, "Octopus Network NEAR Smart Contract Security Audit", Oct - Dec 2021. The report names no commit:
    // 0be8357 is the last before the first fix and the one tree where the code of all its findings stands together.
    id: 'registry audit', platform: 'NEAR', set: 'held out', experts: NEAR, files: REGISTRY,
    task: audit('a registry where appchains are registered, voted up and down with deposits of a NEP-141 token, and the winner of a vote gets a sub-account', REGISTRY),
    findings: [
      'Critical (HAL-01): change_oct_token has no check of the caller: anyone can change the account of the OCT token',
      'Critical (HAL-02): an appchain_id is never checked against the rules of NEAR account ids: once an invalid one is at the top of the queue, conclude_voting_score panics when it creates the sub-account, and since nothing can remove it, no vote can ever be concluded again',
      'High (HAL-03): access control: nearly all privileged functions (the sudo, settings and owner actions, set_owner) belong to the one owner, with no separate roles',
      'Medium (HAL-04): change_operator_of_counting_voting_score lets the registry owner set itself as the operator that counts the votes',
      'Medium (HAL-05): the registry owner can be made the owner of an appchain (in register_appchain and in transfer_appchain_ownership)',
      'Medium (HAL-06): assert_appchain_owner checks env::signer_account_id() where predecessor_account_id() is needed: an appchain owner tricked into calling a malicious contract lets it act as the owner',
      'Medium (HAL-07): register_appchain does not require the core details of an appchain (its id, website, specification and repository links, contact, the beneficiary and the name and symbol of its token): an appchain can be registered without them',
      'Low (HAL-08): Cargo.toml does not enable overflow checks for release builds',
      'Low (HAL-09): the contract cannot be paused',
      'Low (HAL-11): zero values are not rejected: in change_minimum_register_deposit and change_counting_interval_in_seconds, and in the withdrawals of upvote and downvote deposits',
    ],
  },
  {
    // BlockSec, "Security Audit Report for Ref-ve", v1.0, 14 Jul 2022, on commit 1fd6dfe. Nine of the crate's sixteen files.
    id: 'vote escrow audit', platform: 'NEAR', set: 'held out', experts: NEAR, files: REFVE,
    task: audit('a vote-escrow contract: users lock liquidity tokens for voting power, create proposals, vote on them and claim rewards', REFVE),
    findings: [
      'Medium (2.1.1): lock_lpt and append_lpt create the user\'s account with no storage deposit, and mft_on_transfer sets no minimum amount to lock: accounts can be registered with 1 yocto of a token until storage runs out',
      'Medium (2.1.2): create_proposal sets no limit on the length of a proposal\'s description: long descriptions can exhaust storage',
      'Low (2.2.1): when the transfer of a reward fails and the sender has unregistered meanwhile, callback_post_withdraw_reward panics and the reward is lost; it should be kept aside for the user',
      'Low (2.2.2): create_proposal does not check how long the proposal runs: the voting period can be very short (a block)',
      'Recommendation (2.3.2): nothing checks that min_locking_duration_sec is smaller than max_locking_duration_sec (modify_locking_policy, the config\'s own check)',
      'Recommendation (2.3.3): create_proposal is a sensitive operation and does not require one yoctoNEAR',
      'Recommendation (2.3.4): action_proposal (voting) is a sensitive operation and does not require one yoctoNEAR',
      'Recommendation (2.3.5): upgrade does not check that the gas attached is enough for migrate',
      'Recommendation (2.3.6): centralization: the owner\'s key should be a multisig or a DAO',
      'Recommendation (2.3.7): a whitelisted token with elastic supply (deflationary) makes the amount transferred and the amount received differ',
    ],
  },
  {
    // Guvenkaya, "SWEAT NEP-141 Token Smart Contract Security Review", final 5 June 2026, on commit 9b84e71. Ten of
    // the files in its scope. Left out: GUV-7, whose flaw is in a dependency (near-plugins), and GUV-10 (events).
    id: 'sweat token audit', platform: 'NEAR', set: 'held out', experts: NEAR, files: SWEAT,
    task: audit('a NEP-141 token whose oracles mint it in batches for the steps users walked, part of it deferred to a holding contract, with a denylist, roles and a pause', SWEAT),
    findings: [
      'High (GUV-1): LookupMapAdapter keeps a balance under the hash of the account id or, for accounts with a configured postfix, under the plain account id, while the storage an account pays for (account_storage_usage) was measured on one 64-byte probe account: accounts kept under the plain id use other storage than they are charged for and can be undercharged',
      'Medium (GUV-2): new makes the contract\'s own account the super-admin of the access control, so governance at run time hangs on whoever can make the contract call itself or upgrade it',
      'Low (GUV-3): defer_batch credits every (account, steps) entry with no check of the denylist: a denylisted account still receives deferred mints',
      'Low (GUV-4): the oracle fee is computed as (value * 5).div_ceil(100): the multiplication can overflow before the division for a very large value',
      'Low (GUV-5): burn destroys tokens and does not require one yoctoNEAR',
      'Low (GUV-6): storage_unregister with force burns the caller\'s balance and is not covered by the pause of the token',
      'Low (GUV-8): defer_batch accepts an empty batch and entries with zero steps instead of rejecting a malformed batch',
      'Low (GUV-9): defer_batch sets no maximum size of a batch: an oversized one can use so much gas that the callback does not run, so the tokens are not deposited to the holding contract, the fee is not minted and what was accounted before the callback stays inconsistent',
      'Informational (GUV-11): defer_batch moves steps_since_tge forward before the holding contract\'s promise resolves and the callback of a failed batch moves it back: a failed earlier batch can roll the counter back behind a later successful one, so a range of steps is used twice',
    ],
  },
  {
    // OtterSec, "Mintbase" audit, 20 - 29 March 2023, on commit aedb2c4. The store contract only: six of its files.
    // The report's findings in the two market contracts are not in the list.
    id: 'mintbase store audit', platform: 'NEAR', set: 'held out', experts: NEAR, files: MBSTORE,
    task: audit('an NFT contract (NEP-171, NEP-178) where the owner names minters and tokens carry royalties and splits between owners', MBSTORE),
    findings: [
      'Critical (OS-MTB-ADV-00): nft_transfer_call does not give the token to the receiver before it calls nft_on_transfer: the transfer waits for nft_resolve_transfer, against NEP-171, so a receiver that acts on the token in its callback does not own it yet and can lose it',
      'Critical (OS-MTB-ADV-01): when a transfer has to be undone, nft_resolve_transfer calls the internal transfer with the receiver where the previous owner belongs, so the token is not returned to its owner',
      'Critical (OS-MTB-ADV-02): nft_revoke refunds the storage cost of an approval to the caller even when no approval was revoked: called again and again it drains the store\'s balance',
      'Medium (OS-MTB-ADV-06): the number of approvals of a token is not limited: with many of them the functions that go through the approvals use too much gas and cannot be called',
      'Medium (OS-MTB-ADV-07): withdraw_minter asserts one yoctoNEAR and is not payable, so it can never succeed: a minter cannot give its right up',
      'Medium (OS-MTB-ADV-08): nft_transfer_call clears the approvals and the split owners of a token whatever comes of the transfer, and nft_resolve_transfer does not restore them when the transfer fails',
      'Medium (OS-MTB-ADV-10): a transfer to an account that owns no token yet adds an entry to tokens_per_owner whose storage nobody is charged for: by transfers to new accounts the store\'s funds get locked in storage',
    ],
  },
  {
    // Trail of Bits, "cNEAR Security Assessment", 14 August 2026, on commit c194426. The contract is one file; the
    // findings in the deployment script, the justfile and the lock file are not in the list. TOB-CNEAR-7 and -13
    // rest partly on code outside the file (the Aurora controller, near-plugins 0.5.1).
    id: 'cnear audit', platform: 'NEAR', set: 'held out', experts: NEAR, files: CNEAR,
    task: audit('a NEP-141 token with an owner, roles, a pause, a freeze list, forced transfers and a price the owner publishes, upgraded through a controller contract', CNEAR),
    findings: [
      'High (TOB-CNEAR-7): upgrade deploys the whole of its input as the new Wasm, while the controller that calls it sends the Wasm Borsh-serialized together with an optional gas value: an upgrade through the controller deploys the envelope and leaves the contract inoperable',
      'High (TOB-CNEAR-13): owner_set takes only the Owner role from the previous owner and leaves it the super-admin and the right to grant the Owner role: a former owner can make itself owner again or strip the new one',
      'Medium (TOB-CNEAR-14): the pause and the freeze are enforced only in ft_transfer and ft_transfer_call: a frozen or paused holder can call storage_unregister with force and burn its balance, out of reach of force_ft_transfer',
      'Low (TOB-CNEAR-11): pausing, unpausing, freezing and unfreezing an account and changing the price emit no events of their own',
      'Informational (TOB-CNEAR-9): owner_get reports one owner_id, while every account that holds the Owner role is authorized as owner',
      'Informational (TOB-CNEAR-10): the storage of the growing freeze list is paid by the contract, against what the file\'s own documentation says',
      'Informational (TOB-CNEAR-12): force_ft_transfer bypasses the pause and the freeze, which is nowhere documented',
    ],
  },
  {
    // Guvenkaya, "Potlock NEAR Rust Smart Contract Security Assessment", final 30 January 2024, on commit 71f3505.
    // The pot contract only: six of its files. Left out: the findings in its other files and in the other
    // contracts, and GUV-5 (overflow checks of the workspace build), which these files cannot show.
    id: 'pot audit', platform: 'NEAR', set: 'held out', experts: NEAR, files: POT,
    task: audit('a funding round ("pot"): projects apply, donors give NEAR that is matched from a pool, a "chef" sets the payouts and admins pay them out; donors may have to pass a sybil check by another contract', POT),
    findings: [
      'Critical (GUV-1): admin_process_payouts goes through all applications and, if one of them is not approved, pays nothing at all: anyone can add an application before the payout and block it',
      'Critical (GUV-2): chef_set_payouts does not clear the nested collection payout_ids_by_project_id (only the entry at its root is removed), so setting the payouts a second time leaves the collection inconsistent',
      'High (GUV-3): sybil_callback takes the donor as env::predecessor_account_id(), which in a callback is the contract itself: when the sybil check fails, the donation is refunded to the contract and not to the user',
      'High (GUV-4): calculate_fee divides before it multiplies, so the fee is 0 for an amount below the total basis points (the fee is bypassed), and it rounds in the wrong direction',
      'Low (GUV-6): a payout is marked paid (paid_at) only in the callback of its transfer, so payouts could be run again before the callbacks land; only the flag all_paid_out set after the loop prevents it now',
      'Low (GUV-10): owner_set_admins removes the admins it is given, as owner_remove_admins does, instead of setting them',
      'Low (GUV-11): admin_dangerously_set_pot_config sets the whole configuration at once: it is error-prone and should not exist beside the separate setters',
      'Low (GUV-13): no privileged function requires an attached deposit, so a function-call access key of an owner or admin account can call them',
      'Low (GUV-14): nothing keeps the owner, an admin or the chef from also being a project that applies to the pot',
    ],
  },
];
