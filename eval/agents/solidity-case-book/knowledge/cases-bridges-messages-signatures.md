Findings from bridges, cross-chain token and message systems, and contracts that act on signed messages or permits.

## Message, deposit or asset not tied to its real origin — seen in many reports
- **Look for:** a receive handler open to anyone or blind to the remote sender; a deposit naming both a local token and a wrapped token with no check that they belong together; token mappings registered without access control; a staked or bridged position whose underlying tokens or pool are never verified; a first root importable by anyone; token metadata taken from a user message.
- **What goes wrong:** a cheap asset is deposited and a dear one credited, unbacked tokens are minted, or a forged root authorises withdrawals.
- **Usually rated:** Critical or High.

## Failed execution on the destination has no way back — seen in several reports
- **Look for:** a destination handler that can revert (paused target, cap, bad payload, recipient contract) after the source side locked or burned; no stored failed message with retry or refund; a retry or redeem callable by anyone or accepting a wrong nonce; tokens left in the receiving adapter after a revert.
- **What goes wrong:** user funds are stuck, or free for the next caller.
- **Usually rated:** High or Medium.
- **Not a finding if:** failures are stored and only the original sender can retry or reclaim.

## Refund or proceeds sent to the wrong address — seen in several reports
- **Look for:** refunds to `tx.origin`, or to `msg.sender` when that is a relayer, router or multisig; the remote recipient defaulted to the local sender; a reward paid to `msg.sender` where a recipient was supplied; surplus returned to the position owner and not to the payer; repayments still routed to a replaced manager.
- **What goes wrong:** value lands with someone who did not pay for it or at an address nobody controls.
- **Usually rated:** Medium; High when unrecoverable.

## Destination gas guessed — seen in several reports
- **Look for:** a constant gas limit for remote execution; a payload whose size the user controls (string, array) under that constant; no minimum for the gas a user supplies; gas units and prices mixed in the fee maths; an ordered channel where one failing message stops all behind it.
- **What goes wrong:** messages run out of gas on arrival, one cheap message blocks the channel, the executor is under- or over-paid.
- **Usually rated:** High or Medium.

## Signed message can be replayed — seen in several reports
- **Look for:** a digest without nonce, chain id, verifying contract or expiry; a chain id written as a constant; a nonce shared by all signers, or taken from the block number; a nonce consumed only on success, so a reverted transaction leaks a usable signature; a validity proof with no chain identifier.
- **What goes wrong:** the same authorisation is used again, on this chain or another, by anyone who saw it.
- **Usually rated:** High; Medium where replay only repeats the signer's own intent.
- **Not a finding if:** a typed-data domain with the live chain id, a per-signer nonce and a deadline are all present.

## Signer, caller and token not bound together — seen in several reports
- **Look for:** a permit-based deposit that accepts whatever token the signed permit names; a permit for `owner` followed by a pull from `msg.sender`; a typed-data hash that departs from the standard's layout; `ecrecover` output not compared with zero.
- **What goes wrong:** a worthless token is credited as the real one; signatures work for nobody, or an invalid one authenticates the zero address.
- **Usually rated:** High for the token and zero-address cases; Medium or Low for non-conformance.

## Permit inside the action can be front-run — seen in several reports
- **Look for:** `permit(...)` followed by the action in one function with no fallback when the permit was already used.
- **What goes wrong:** an observer submits the permit alone and the user's transaction reverts on the spent nonce. Costs gas only and can be repeated.
- **Usually rated:** Medium or Low.
- **Not a finding if:** the permit call sits in `try` and the allowance is checked afterwards.

## Messaging fee mishandled — seen in several reports
- **Look for:** `msg.value` divided evenly among destinations with different costs; the fee not forwarded to the messaging endpoint; no quote function; the fee subtracted in the wrong order, so the call always reverts.
- **What goes wrong:** cross-chain calls fail, or the user over- or under-pays.
- **Usually rated:** Medium or High.

## Token decimals differ between chains — seen in several reports
- **Look for:** amounts passed across unchanged for tokens with other decimals on the other side; normalisation in one direction only; tokens above 18 decimals unsupported.
- **What goes wrong:** amounts credited off by powers of ten; the gap is the attacker's profit or the user's loss.
- **Usually rated:** High or Medium.

## Same address assumed on every chain — seen in several reports
- **Look for:** a contract wallet or multisig as sender with the recipient defaulted to the same address remotely; a trusted address derived from a deployer key that keeps its power after ownership moves.
- **What goes wrong:** bridged funds arrive at an address someone else can deploy to; the old deployer can impersonate a trusted contract on a new chain.
- **Usually rated:** High or Medium; Low when documented.

## Supply or rate out of step between chains — seen in several reports
- **Look for:** minting on one chain against a rate pushed from another at intervals; the pushed rate not stored; a timestamp from one chain compared with the local clock; a burned token that can be minted again; a wrapped supply no longer one-to-one after fees.
- **What goes wrong:** arbitrage against the stale rate, updates rejected, or more wrapped tokens than backing.
- **Usually rated:** High or Medium.

## Packed payload read at the wrong offset — seen in several reports
- **Look for:** `bytes` sliced by constant offsets that differ per message type; a nonce or address read one field off; static arguments placed after dynamic ones.
- **What goes wrong:** the wrong deposit is marked executed or failed, or tokens go to a garbage address.
- **Usually rated:** High or Medium.

## Flow limits turned into a weapon, or leaking — seen in several reports
- **Look for:** per-period in and out caps that a large holder can exhaust by bouncing tokens back and forth; caps booked from a balance difference that a hook-calling token can distort; small repeated balancing steps that restore headroom.
- **What goes wrong:** the bridge is unusable for others for the rest of the period, or the limit meant to bound a hack does not bind.
- **Usually rated:** Medium; once High.

## Address strings and non-EVM peers — seen once
- **Look for:** remote addresses compared as strings after a home-made lower-casing; allowlists that can only hold 20-byte addresses.
- **What goes wrong:** a valid sender is rejected, or some chains can never be authorised.
- **Usually rated:** Medium or Low.
- **Not a finding if:** addresses are stored and compared as bytes in one canonical form.
