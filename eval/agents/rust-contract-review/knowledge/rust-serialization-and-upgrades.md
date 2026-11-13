# Rust serialization and upgrades

Bytes and text going in and out: Borsh layout, serde attributes, JSON numbers, what gets hashed, and stored state meeting new code.

## Borsh is positional: a changed struct misreads old state (from the format specification)
- **Look for:** any stored `BorshDeserialize` type that differs between deployed and new code: a field added, removed or moved, `u64` widened to `u128`; a `migrate` reading state with the new type.
- **What goes wrong:** fields are written in declaration order, without names. A length mismatch makes every call fail to deserialize; two swapped `u64` fields load silently with values exchanged. Records inside collections fail later, one by one.
- **Usually rated:** Low as an upgrade note (several reports); High once state is unreadable.
- **Not a finding when:** the old type is kept for old bytes and records carry a version tag.

## Enum variant added in the middle (from the format specification)
- **Look for:** stored or exchanged enums (statuses, storage-key enums, message kinds) where a new variant is not the last, or an old one was deleted.
```rust
enum Status { Active, Frozen /* new */, Closed } // stored Closed (1) reads as Frozen
```
- **What goes wrong:** the variant's position is stored as one byte. Later variants shift: records change meaning with no error, and a prefix enum moves whole collections to other keys. Old readers fail on the new number.
- **Usually rated:** not seen as its own finding in the reports read.
- **Not a finding when:** variants are only appended.

## Offsets and sizes counted by hand (seen in several reports)
- **Look for:** `data[4..36]`, `START` / `END` constants, `array_ref!`, `from_le_bytes(buf[..8])`, `mem::size_of::<T>()` standing for a serialised length, a `LEN` constant beside a struct, a blob's type decided by its size.
- **What goes wrong:** the constant describes another layout. One authority check read the neighbouring 32 bytes, so the wrong key decided who may act (High). A length helper that forgot a one-byte version prefix made creation impossible. `size_of` counts padding and not `Vec` contents.
- **Usually rated:** Informational to High.
- **Not a finding when:** the struct is deserialised whole and sizes come from the serialiser.

## Missing JSON field becomes a default (from library documentation)
- **Look for:** `#[serde(default)]`, or `Option<T>` followed by `unwrap_or(..)`, on fields that protect the caller: `min_amount_out`, `max_slippage`, `deadline`, `receiver_id`; `#[serde(skip)]` fields rebuilt with `Default`.
- **What goes wrong:** serde ignores unknown fields unless told otherwise, so a misspelt name is no error: `"min_amout_out"` is dropped, the real field defaults to 0 and the swap accepts any price. Reports rate a trade with no enforced minimum Medium.
- **Usually rated:** by effect.
- **Not a finding when:** `#[serde(deny_unknown_fields)]` on argument structs, or the protective fields are required.

## Untagged or try-each message enums (from library documentation)
- **Look for:** `#[serde(untagged)]`; a `msg` string tried against several types in turn (`from_str::<A>(m).or_else(|_| from_str::<B>(m))`); hand-written `Deserialize`.
- **What goes wrong:** variants are tried in order and the first that fits wins. Input meant as one action also fits an earlier variant whose other fields are optional, and runs as that action: a deposit for another account, a swap with no minimum.
- **Usually rated:** not seen in the reports read.
- **Not a finding when:** variants are tagged by name.

## Integers through loose JSON values (from library documentation)
- **Look for:** `serde_json::Value` with `as_u64()`, `as_f64()`, `as_i64()`; amounts accepted as JSON numbers; `v["amount"].as_str().unwrap().parse()`.
- **What goes wrong:** `as_u64` is `None` for a negative number or one above `u64::MAX`; then `unwrap` panics or `unwrap_or(0)` books zero. `as_f64` rounds above 2^53, so the low digits of a balance change on the way in.
- **Usually rated:** not seen in the reports read; by effect.
- **Not a finding when:** typed argument structs with string-wrapped 64- and 128-bit integers.

## One number, several spellings (from library documentation)
- **Look for:** decimal strings parsed with `parse::<u128>()` or `from_str_radix` where the string itself is then stored, used as a key, logged or signed.
- **What goes wrong:** the parser accepts an optional `+` and leading zeros: `"7"`, `"+7"` and `"007"` are one number and three keys. An id passes an "already exists" test under another spelling; a replayed message differs as text and acts alike. Spaces and underscores are errors, a panic where unwrapped.
- **Usually rated:** by effect.
- **Not a finding when:** only the parsed integer is stored and compared.

## Hash or signature over an ambiguous encoding (seen in several reports)
- **Look for:** `[a, b, c].concat()`, `format!("{}{}", a, b)`, joins with `_` or `:`, `{:?}` of a struct, JSON text or a serialised hash map fed to `sha256`, `keccak256` or a signature check; an id hash that omits sender, nonce or contract.
- **What goes wrong:** different inputs give the same bytes, `("ab","c")` and `("a","bc")`, so one signature or derived address serves two meanings (High in one report). An id built from too few fields collides with a legitimate request and blocks it (Medium).
- **Usually rated:** Informational to High.
- **Not a finding when:** fixed-width or length-prefixed fields with a domain tag.

## Untrusted bytes sized by their own header (seen in several reports)
- **Look for:** `Vec<u8>`, `String`, `Vec<T>` and nested vectors in public arguments or decoded messages with no upper bound; manual readers that take a length field and allocate; zero-sized types inside Borsh input with a Borsh crate older than its fix.
- **What goes wrong:** the length prefix is the sender's. Megabytes are decoded, hashed or stored at the contract's cost and a loop runs once per declared element; an advisory records undefined behaviour when many zero-sized items were decoded.
- **Usually rated:** Informational to High.
- **Not a finding when:** every variable-length input has an asserted maximum before work begins.

## Version marker out of step with the data (seen in several reports)
- **Look for:** a stored contract or schema version the migration does not update; a migration that does not check which version it starts from, can run twice, or walks a whole collection.
- **What goes wrong:** the next migration cannot tell which layout it faces. A repeated call reset fields to post-upgrade defaults and re-enabled modules that had been paused; a migration over a list that outsiders can lengthen runs out of gas, and the upgrade cannot finish.
- **Usually rated:** Informational to Minor.
- **Not a finding when:** migrate asserts the starting version and writes the new one in the same call.

## Derived `Default` standing for "empty" (seen in two reports)
- **Look for:** `#[derive(Default)]` or `impl Default` on config, account and pool structs; `..Default::default()` in constructors; `unwrap_or_default()` on a missing record.
- **What goes wrong:** every field gets its type's zero: fee 0, paused false, owner an empty string, time 1970, an index pointing at a slot never filled. One report found a default state that broke the structure's own invariants; another a default that hid a state which should not exist.
- **Usually rated:** Informational to Low.
- **Not a finding when:** construction goes through a validating function and absence stays an `Option`.
