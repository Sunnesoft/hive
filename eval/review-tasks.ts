// What the reviews are asked and what a right review contains. Written and committed before any review of these
// contracts was run or read.
//
// A review is how an expert with "work": "review" goes through a customer's files (node/src/review.ts). It is
// measured on contracts with an audit that somebody else published: the three Solidity contracts of tasks.ts that
// nothing here was prepared for, with the same findings as there, and two NEAR contracts in Rust that BlockSec
// audited (eval/agents/SOURCES.md). The score is the count of reference findings a reader finds stated as items of
// their own, reading without knowing whose answer it is; there are no patterns here, because for findings they
// proved unreliable.
//
// The NEAR lists hold every finding of the reports and those of their recommendations that are about what an
// attacker or the owner can do to users (centralization, tokens with elastic supply, unbounded work, missing
// checks on time and on ownership). Recommendations about macros, gas and dead code are left out, as the Solidity
// lists leave out gas and informational notes. Each line says what the report says, in our words; the severities
// are the reports'.
import { TASKS } from './tasks.ts';

export type ReviewTask = {
  id: string;
  platform: 'Solidity' | 'NEAR';
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

export const REVIEWS: ReviewTask[] = [
  fromTasks('bridge audit'),
  fromTasks('loan audit'),
  fromTasks('second audit'),
  {
    // BlockSec, "Security Audit Report for Nep141-Token-Convertor Contracts", v1.0, 16 May 2022, on commit 7c8a44b.
    id: 'convertor audit', platform: 'NEAR', experts: NEAR, files: CONVERTOR,
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
    id: 'vesting audit', platform: 'NEAR', experts: NEAR, files: VESTING,
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
];
