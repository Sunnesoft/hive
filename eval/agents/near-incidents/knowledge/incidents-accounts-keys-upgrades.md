# Incidents: accounts, access keys, initialisation and upgrades

Bugs in how a contract manages keys on its own account, who may trigger administrative steps, and what can still be done once something goes wrong.

## Key registry written before the key action succeeds
- **What happened:** A key-manager role could add and remove function-call keys for relayers on the contract's own account. `add` wrote the public key into the contract's list and scheduled the `AddKey` action in the same receipt. Naming a key already present on the account, such as its full-access key, made the action fail later while the list entry stayed; `remove` then deleted that key. A limited role could strip the account of its full-access key. Fixed by batching the list write after the action.
- **Look for:** `Promise::new(env::current_account_id()).add_access_key(..)` or `.delete_key(..)` with bookkeeping written beforehand; `delete_key` on a caller-supplied key.
- **Not this if:** bookkeeping and key action share one batch, and only keys the contract itself added can be deleted.

## Allowance of zero means unlimited
- **What happened:** In the promise API for adding a function-call access key, an allowance of 0 reached the runtime unchanged, and the runtime reads it as no limit. A contract that computed the allowance and arrived at zero, or passed a default, handed out a key able to spend the account's balance on gas by repeated calls. The SDK later replaced the number with an explicit choice between unlimited and a non-zero limit.
- **Look for:** `add_access_key`, `add_access_key_with_nonce` or `promise_batch_action_add_key_with_function_call` with an allowance from arithmetic, from arguments or equal to `0`; `Allowance::Unlimited` on SDK 5; permitted method lists that include expensive methods.
- **Not this if:** the allowance is a checked non-zero value and the permitted methods are cheap and harmless.

## Code deployed over an account that already has state
- **What happened:** A wallet enabled two-factor protection by deploying a multisig contract onto the user's own account. Where the account already held state written by another contract, the multisig's `#[init]` refused to run because state existed. The wallet did not check that result and completed the switch; the account ended with no usable key and a contract that could not work, lost for good.
- **Look for:** flows that deploy to an account with a history (upgrades, factories reusing names, "convert this account"); `#[init]` without `ignore_state` on such targets; key removal that does not depend on initialisation having succeeded.
- **Not this if:** deploy, init and key changes are one batch on the account, so that a failed init reverts all of it.

## Administrative entry point with no caller check, twice
- **What happened:** The method deploying a staged upgrade of an engine contract could at first be called by anyone; an owner check came later as a security improvement. Three years on, a group of administrative transactions for the engine's permissioned mode was again found callable by any account and was restricted to the owner while the contract is running.
- **Look for:** contracts exporting raw `extern "C"` functions or using a hand-written dispatcher, where no macro adds a check to a new entry point; admin functions that skip the shared guard.
- **Why reviews missed it:** staging was guarded, so deploying looked harmless.
- **Not this if:** every state-changing admin path calls the same guard, and a test calls each as a stranger.

## Staged upgrade marker not cleared after deployment
- **What happened:** The same upgrade flow stored the staged code and a staging index used for the delay check. Deploying did not clear the index, so the deploy step could be run again later without a new staging and waiting period; the regression test added with the fix checks exactly that a repeated deploy fails. The delay, the one protection users had against a hostile upgrade, guarded only the first use of staged code.
- **Look for:** two-step operations (stage and apply, propose and execute, request and claim) whose second step does not delete or flip what the first wrote.
- **Not this if:** the second step consumes the staged record before acting and fails when none exists.

## Initialiser the owner can run again
- **What happened:** The engine's `new` checked whether state existed and, if it did, only required the caller to be the owner. The owner key could therefore re-run initialisation on a live contract and overwrite chain id, owner and upgrade delay in one call, going around the delayed-upgrade procedure. Changed to fail whenever state exists.
- **Look for:** hand-written initialisers; `#[init(ignore_state)]`; migration methods without a version check; setters that replace a whole config struct at once.
- **Not this if:** initialisation is impossible once state exists, and each parameter has its own bounded setter.

## Factory lets one child act on another
- **What happened:** A factory of governance contracts had an `update` method that sent new code to a named child. It was meant for a child updating itself, but did not compare the caller with the target, so any organisation created by the factory could trigger an update of another organisation's contract. Restricted to the factory owner or the target itself.
- **Look for:** factory or registry methods that take the `account_id` of a child and act on it (update, migrate, set metadata, pause) where the only check is that the caller is some known child.
- **Not this if:** `env::predecessor_account_id()` must equal the target or hold a privileged role.

## Proposal recorded as approved while its action failed
- **What happened:** A governance contract marked a proposal approved and counted the last vote in the receipt that scheduled the proposal's action: a transfer, a remote call or a remote upgrade. If that promise failed, the proposal stayed approved and unexecuted with no way to retry. The reporter added that the code behind a target account can be swapped between the first vote and the last.
- **Look for:** a status set to its final value before the promise it describes has resolved; no callback on execution; function-call proposals that store only an account id and a method name.
- **Not this if:** a callback finalises or reopens the proposal according to the result, and upgrade proposals pin a code hash.

## No way to stop a drain in progress
- **What happened:** A treasury contract had been made fully immutable, with no keys and no pause. When its duplicate-list bug was used, the team could only tell users to leave, and the attacker repeated the call until nothing was left. In two other incidents a pause capped the loss, within the hour in one and twenty-nine minutes after detection in the other, although there detection itself had taken almost two days.
- **Look for:** no pause on the paths that move value out; a pause that needs a slow multisig or a full upgrade; no invariant that an outsider or a keeper can check on-chain.
- **Not this if:** a guardian can pause withdrawals at once and only a slower role can unpause.
