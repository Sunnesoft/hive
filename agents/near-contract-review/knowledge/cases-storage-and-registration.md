# Cases: storage, registration and the life of an account record

What audits report about who pays for stored bytes, about registration with the contract and with tokens, and about records that are created, kept or removed wrongly.

## Writes the user does not pay for (seen in many reports)
- **Look for:** any path that inserts into a collection without storage bookkeeping: a first deposit in `ft_on_transfer` creating the account entry (`or_insert`), an order, a referral code, a farm, a note per purchase, a record synced from another contract, a token balance created for a receiver never seen before. Also strings stored without a length limit. No `storage_deposit` requirement and no `env::storage_usage()` before/after charge.
- **What goes wrong:** an attacker repeats a cheap call; each one locks more of the contract's NEAR than it costs him in gas. When the free balance is gone, every call that needs new storage fails for everyone.
- **Usually rated:** Medium to High; Critical when one call stores kilobytes; Low or Informational when only a privileged account can do it.
- **Not a finding when:** registration with a minimum deposit tied to the bytes is required first, or the attached deposit is asserted against measured growth.

## Progress that depends on a transfer to a user-chosen account (seen in many reports)
- **Look for:** flows that only advance when `ft_transfer` to some account succeeds: a withdrawal queue served in order, a liquidation that pays liquidator and owner, a borrow that counts amounts "in flight", a reward claim that re-credits on failure.
- **What goes wrong:** the account is not registered on the token, or calls `storage_unregister` there on purpose. Every attempt fails: the head of the queue blocks all later requests, in-flight counters swell until nobody can borrow, the position cannot be liquidated.
- **Usually rated:** High for a shared queue; Medium otherwise; Informational when the block is temporary.
- **Not a finding when:** a failed payout is taken out of the way into a balance the user can claim later.

## Contract pays deposits on behalf of callers (seen in several reports)
- **Look for:** outgoing calls with an attached deposit, `1` yocto on `ft_transfer` or `near_withdraw`, a `storage_deposit` on a token, an oracle update fee, made from methods that are not `#[payable]` or do not require the caller to attach that amount.
- **What goes wrong:** each call spends the contract's own NEAR; repeated, it drains the balance needed for storage.
- **Usually rated:** Medium; Critical when the amount is a full storage deposit and anyone can call.

## Storage fee kept when it should come back (seen in several reports)
- **Look for:** a storage fee taken at creation and not refunded when creation fails in a callback; not refunded when the record is later deleted; a `storage_withdraw` that lowers an internal number and sends nothing; a `storage_deposit` method in a contract that never uses the deposits and has no withdrawal.
- **What goes wrong:** users lose small amounts of NEAR each time; deposits are locked.
- **Usually rated:** Low to Medium, once High.

## Someone else fills the victim's record (seen in several reports)
- **Look for:** deposits that credit an account named in `msg` or in an argument, together with a per-account cap (a maximum number of tokens or positions) or with loops over that account's entries, and a tiny minimum amount.
- **What goes wrong:** the attacker fills the victim's slots with worthless tokens, or creates so many dust entries that the victim's "withdraw all" or "claim all" runs out of gas.
- **Usually rated:** Medium to High.
- **Not a finding when:** only whitelisted tokens are accepted and the minimum makes the attack costly.

## Records that are never removed (seen in several reports)
- **Look for:** balance entries left in a map at zero; position data kept after liquidation; a deposit followed by a full withdrawal that leaves the user entry behind.
- **What goes wrong:** storage grows without limit; when the contract pays for it, a deposit and withdraw loop becomes a way to exhaust its balance.
- **Usually rated:** Low; High when the loop is free.

## Storage arithmetic errors (seen in several reports)
- **Look for:** `env::attached_deposit() as u64`; the account's current usage added twice in the "enough storage" assertion; a constant byte price instead of `env::storage_byte_cost()`; excess of a `storage_deposit` made for another account refunded to that account, not to the payer; an upgrade path that computes the cost of the new code and never requires it.
- **What goes wrong:** deposits recorded wrongly, users with enough stake rejected, sponsors losing their change.
- **Usually rated:** Low to High.

## Keys and ids that collide (seen in several reports)
- **Look for:** a storage prefix built by joining user input and an account id without a separator; a prefix taken from `env::block_timestamp()`, equal for every call of one block or batch; a composite id joined with a character that may occur inside a part and split again later; an id packed into bits where one field can exceed its mask; a derived token id lacking a distinguishing field; duplicate checks that are case-sensitive.
- **What goes wrong:** two collections write over each other; an asset cannot be withdrawn because its id parses back wrongly; two vaults share one token.
- **Usually rated:** Critical for storage prefixes; Low to Medium for ids.

## Unregistering with value left behind (seen in two reports)
- **Look for:** `storage_unregister` or account removal that checks some balances (stake, rewards) and not others (pending withdrawals, lost-and-found); removal of the outer entry of a nested collection while the inner one still has items; a return value of `true` when no account existed.
- **What goes wrong:** funds vanish with the record; later reads of the nested structure disagree with each other.
- **Usually rated:** High when funds are lost; Low for the return value.

## Native collections in contract state (seen in two reports)
- **Look for:** `HashMap`, `BTreeMap` or `Vec` fields in the main struct that grow with users. They are loaded and saved whole on every call.
- **What goes wrong:** gas per call grows until no method can run.
- **Usually rated:** Low or Informational; higher when outsiders control the growth.

## Contract's own NEAR balance taken for granted (seen in two reports)
- **Look for:** NEAR sent out, or a NEAR-denominated pool withdrawn, with no check that the balance left still covers storage; a transfer helper that panics on a short balance and is called from callbacks.
- **What goes wrong:** the account drops below its storage requirement and state-growing calls fail; the panic hits in a callback.
- **Usually rated:** Low or a recommendation.
