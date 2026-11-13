# Incidents: bridges, proofs and light clients

Exploitable bugs and repelled attacks where the question was what a proof really proved.

## One method's result accepted as another's
- **What happened:** A token bridge minted on the other chain against proof that a given NEAR contract had returned certain bytes. Two of its methods returned Borsh structs: amount, token, recipient in one; a length-prefixed token string, amount, recipient in the other. The verifier checked neither which method produced the value nor its length, so a withdrawal result with chosen amount and recipient parsed as a lock result. Unlimited minting for tokens with short ids; reported before use.
- **Look for:** return values that another chain or contract will parse; several methods of one account with untagged outputs of similar size.
- **Not this if:** every provable result starts with a distinct tag, and exact length and a returned-value status are demanded.

## Burn receipt forged through a contract that runs user code
- **What happened:** A custodian on the other chain paid out on proof of a successful outcome of the engine account whose bytes decoded as amount, recipient and custodian address. The engine also returned, unchanged, the output of code its users deploy, even through its read-only method invoked in a transaction. A program echoing its input produced a valid "burn" with nothing burned. Eight-figure sum at risk; seven-figure bounty.
- **Look for:** an account whose return values are evidence elsewhere and which also relays caller-chosen bytes (views, proxies, multicalls).
- **Why reviews missed it:** block, Merkle path and executor checks were correct.
- **Not this if:** evidence comes from a separate account that runs no user input, or the proof is of state.

## Proof index narrowed to 32 bits
- **What happened:** The minting side recorded each used proof by a hash covering its `log_index: u64` and read the event with `logs[log_index as usize]`. Contracts run as wasm32, where `usize` has 32 bits, so adding multiples of 2^32 to the index gave a fresh record for the same event. One deposit could be minted repeatedly. Six-figure bounty.
- **Look for:** `as usize` or `as u32` on a field that also enters a replay key, a hash or a signed payload.
- **Why reviews missed it:** on a 64-bit test host the cast loses nothing; the lint against `as` was off for that crate; reviews and several audits passed it.
- **Not this if:** the conversion is checked (`try_from`), or the key uses the narrowed value.

## Proof marked as used before it is verified
- **What happened:** The deposit method of a bridged-token factory recorded the proof as seen and only then asked the prover contract to verify it. Anyone could submit somebody's proof in an altered, invalid form: verification failed in a later receipt, the record stayed, and the genuine deposit could never be minted. Every invalid proof also stayed in storage. Fixed early in the connector's life.
- **Look for:** an insert into a set of hashes or nonces before the verifying cross-contract call; a key derived from fields the submitter can alter without invalidating the event.
- **Not this if:** the record is written after successful verification and keyed by the event's canonical identity, with concurrent submissions handled.

## Header accepted on a bond and replaceable while pending
- **What happened:** A light client on the counterparty chain accepted block headers optimistically from any bonded relayer; a challenge during a waiting period was the defence. An attacker's fabricated block first failed to get ahead of the honest relayer's, then, with a timestamp hours in the future, displaced the pending block. A watcher challenged it soon after. Months later a second attempt with a larger bond was undone in 31 seconds. No funds lost.
- **Look for:** optimistic acceptance in NEAR contracts: data taken first and disputed later; rules by which a new submission displaces a pending one; unchecked future timestamps or heights.
- **Not this if:** submissions are fully verified, or independent funded watchers exist and the window outlasts congestion.

## Challenge reward goes to whoever lands first
- **What happened:** A successful challenge there paid a reward from the forfeited bond to its sender, so a bot copied the watcher's transaction and collected; the watcher's own failed. Known for six months and kept, since bots land a challenge fastest. The bond was a few units of the base currency against nine figures guarded, so probing the watchers was cheap. Afterwards: most of the bond stays in the contract, a fixed reward, a higher bond.
- **Look for:** slash, liquidation or bounty methods open to anyone that pay the stake to the caller; fixed stakes small against what they protect.
- **Not this if:** being outrun still leaves the protocol safe, and an attempt costs in proportion to value at risk.

## Inclusion proof whose depth the caller chooses
- **What happened:** A light client contract for a UTXO chain accepted that a transaction id hashes up to a block's Merkle root along a caller-supplied path of any length. That admits the known forgery in which a 64-byte transaction and an inner tree node cannot be told apart. A second method now also demands a proof for the block's first transaction with a path of equal length, pinning the depth; the old one is deprecated.
- **Look for:** Merkle verification over a `Vec` of hashes whose length is not tied to the tree's real depth; leaves and inner nodes hashed alike; callers of a deprecated verifier.
- **Not this if:** depth is fixed by an independent fact, or leaves and nodes are domain-separated.

## Evidence and the interpreter on one account
- **What happened:** After the forged burn receipt the team's own diagnosis went beyond the bug: withdrawal evidence was produced by the very account that executes arbitrary user programs, so any future way of shaping its output would reopen the hole. The short-term patch refused outputs that could be parsed as a withdrawal unless the withdrawal method produced them; the stated long-term fix was to prove token state, or to emit evidence from separate token accounts.
- **Look for:** one account combining custody or mint authority with a general executor (interpreter, plugin host, arbitrary `function_call` proxy); filters that pattern-match outputs.
- **Not this if:** the privileged logic lives on an account that accepts no user-chosen code or calls.
