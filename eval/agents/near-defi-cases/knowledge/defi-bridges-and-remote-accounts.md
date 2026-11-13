# DeFi cases: bridges and accounts controlled from another chain

What audits of NEAR bridges (tokens, NFTs, Bitcoin), channel escrows, chain-signature accounts, relayer-paid accounts and signed-intent settlement report about the value that crosses.

## Asset to mint named by the user (seen once)
- **Look for:** the escrow's `ft_on_transfer`: where does the denomination or remote asset id of the outgoing transfer request come from? From the `msg` the user wrote, or from the token contract that called? Is the method that registers assets restricted?
- **What goes wrong:** a user locks a cheap token and names a valuable one; the other chain mints the valuable asset. With open registration any token enters the list.
- **Usually rated:** High.
- **Not a finding when:** the asset is derived from `env::predecessor_account_id()` through a registry only governance can edit.

## Bridge fee declared and not paid (seen once)
- **Look for:** freeze, withdraw or send methods that take the fee as an argument and add it to a fee ledger. Is the argument compared with `env::attached_deposit()`? Is any excess returned?
- **What goes wrong:** users bridge for free and write any number into the ledger; the later fee withdrawal, which trusts the ledger, pays out NEAR the contract needs for storage or fails. Overpaid fees are kept.
- **Usually rated:** High; a note for the kept excess.

## Fee ledger, fee receiver, fee conversion (seen in two reports)
- **Look for:** the fee withdrawal: the amount taken from the ledger minus a storage reserve, with no look at the real account balance; the transfer addressed to the contract itself. Where the protocol pays the far chain's gas and charges the user in another token: the conversion rounding down, the rate set by hand, a discount rate allowed above 100%.
- **What goes wrong:** fees cannot be collected, or the withdrawal eats the storage reserve; each transfer costs the protocol slightly more than it charged, and more when the rate is old.
- **Usually rated:** High for the first two; Low or a note for the conversion.

## Release on this side fails and nothing records it (seen in several reports)
- **Look for:** the unlock, unfreeze or mint that completes an incoming transfer, and its failure branch (receiver not registered with the token, NFT transfer refused); handlers that answer "ok" before the mint or burn call has resolved; a message marked executed before the final transfer was accepted.
- **What goes wrong:** the asset is locked or burned on one side and delivered on neither; the sending chain hears of success and refunds nothing; the message cannot be retried.
- **Usually rated:** High to Medium; some teams answer that they will repair by hand.
- **Not a finding when:** failures are stored with a claim path.

## Replaced and cancelled outgoing transactions (seen once)
- **Look for:** a Bitcoin-side withdrawal that can be re-sent with a higher fee by the user and cancelled by an operator after a delay. Can the original still be fee-bumped after a cancel was issued? Does the delay run from the original or from the latest replacement? Which transaction's reserved fee is released on confirmation? What does the signing callback of a replacement do when the original has confirmed meanwhile?
- **What goes wrong:** fees paid from protocol funds are wasted; the counter of reserved protocol fees drifts; a pending-signature marker stays on the user and blocks his later withdrawals.
- **Usually rated:** High for the counter; Medium otherwise.

## Nonce or id taken from the block (seen in two reports)
- **Look for:** an outgoing transaction prepared for chain signing whose nonce is derived from block height only; ids of positions or requests built from account and timestamp.
- **What goes wrong:** two requests in one block get the same nonce, the far chain accepts one, the other can never land and its funds stay in the contract; the second id overwrites or is refused.
- **Usually rated:** High for the nonce; Low for ids.

## Account state changed before the deposit is proven (seen once)
- **Look for:** a relayer-callable method that verifies a foreign-chain deposit through another contract and, before that verification returns, already changes the account's recorded balances, with no undo in the failure branch.
- **What goes wrong:** anyone acting as relayer submits a made-up deposit message and changes a victim's account state although the deposit never existed.
- **Usually rated:** High.
- **Not a finding when:** relayers are whitelisted or every effect waits for the verification result.

## Debt to the relayer overwritten or skipped (seen once)
- **Look for:** accounts that may act with no gas balance: a debt record created when a relayer pays; whether a second payment adds to the record or replaces it; a batch of signed transactions that relies on its first one to repay the debt; a pool of NEAR for gas that is neither checked nor reduced when used.
- **What goes wrong:** the earlier debt disappears and the relayer is not repaid; the repayment fails while the rest of the batch runs; the gas pool is spent beyond what was collected.
- **Usually rated:** High for the overwrite; Medium to Low for the others.

## Relayer advances value on the user's word (seen in several reports)
- **Look for:** messages in which the user names a contract and an amount of NEAR that the relayer attaches for him (a storage deposit before his real action); relayer fees paid in a token and amount the user chose; several messages delivered for one storage payment.
- **What goes wrong:** the NEAR goes to a contract the user controls; the relayer is paid in something worthless; the contract's own balance covers the storage.
- **Usually rated:** Medium, or a note that relayers must check off chain.

## Foreign wallet bound without its consent (seen once)
- **Look for:** creation of an account controlled by wallets of several chains: does each listed wallet prove control, or is the list just taken from the creator? Is an empty list accepted? Is the fee kept when the last setup step is skipped?
- **What goes wrong:** an attacker creates the account first, with the victim's wallet beside his own; the victim's own creation fails, he uses the existing account, and the attacker's wallet can move what he puts there. With no wallets the first deposit is locked for good.
- **Usually rated:** High; Medium for the empty list.

## Remote account recorded before it exists (seen once)
- **Look for:** a mapping from a foreign public key to a NEAR account id written before the account-creation promise resolves, with one account allowed per key and no callback that removes the entry.
- **What goes wrong:** creation fails, the mapping stays, and the holder of that key can never obtain an account through the protocol.
- **Usually rated:** Low.

## Signed intents outlive the batch they were signed for (seen in two reports)
- **Look for:** settlement that executes a list of independently signed intents all-or-nothing, each valid until its own deadline. After a failed batch, is every signature in it still usable? Can one participant make the batch fail at will?
- **What goes wrong:** single intents from a failed batch are re-submitted in another combination; a plain transfer signed as one leg of a swap executes without the other leg. A party that sends attractive quotes and then fails them blocks settlement.
- **Usually rated:** Medium.

## Recurring notes (seen in several reports)
- **Look for:** no whitelist of collections or tokens that may be bridged; user-built withdrawal transactions without limits on inputs and change outputs; a signer group key replaced without proof that the new key works; assets that passed through two chains redeemable only along the same path; a protocol fee kept when the signed transaction later fails.
- **What goes wrong:** relayers spend gas on junk; users tie up the protocol's coins; a wrong key freezes the bridge.
- **Usually rated:** notes and Low.
