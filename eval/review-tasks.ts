// What the reviews are asked and what a right review contains. Each list was written and committed before any
// review of its contract was run or read.
//
// A review is how an expert with "work": "review" goes through a customer's files (node/src/review.ts). It is
// measured on contracts with an audit that somebody else published: the three Solidity contracts of tasks.ts that
// nothing here was prepared for, with the same findings as there, and NEAR contracts in Rust audited by BlockSec
// and by Halborn (eval/agents/SOURCES.md). The score is the count of reference findings a reader finds stated as
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
// numbers say how the changes went, and prove nothing. The other four (`set: 'held out'`) were written down here
// before the reviews were frozen and are run once, on the frozen code: theirs is the result.
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
];