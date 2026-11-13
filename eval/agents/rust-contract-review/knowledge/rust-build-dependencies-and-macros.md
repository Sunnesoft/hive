# Rust build, dependencies, macros and unsafe code

What is compiled is not always what was read: debug-only checks, feature flags, silenced lints, macros, third-party crates, randomness helpers and `unsafe`.

## Check that exists only in debug builds (seen once; rule from the language reference)
- **Look for:** `debug_assert!`, `debug_assert_eq!`, `#[cfg(debug_assertions)]`, `if cfg!(debug_assertions)`, an invariant tested only in `#[cfg(test)]` code.
```rust
let (sum, carried) = a.overflowing_add(b);
debug_assert!(!carried); // gone in release
```
- **What goes wrong:** release builds drop these lines. The overflow or broken invariant that stopped the tests passes unnoticed on chain and the wrong result is used.
- **Usually rated:** Low or a recommendation.
- **Not a finding when:** earlier code proves the condition, or `assert!` / an error return is used.

## Feature flags and `cfg` that change the deployed code (seen in two reports)
- **Look for:** `#[cfg(feature = "testing")]` around helpers that set time or skip a signature check; `#[cfg(not(feature = ..))]` around the real check; `default = [..]` in `Cargo.toml`; generated entry points on unless a `no-..` feature is set.
- **What goes wrong:** features are additive and unified across a build: if any crate or the build command enables the flag, the bypass is compiled in. Reports found debug features throughout production code and a generated admin interface left on.
- **Usually rated:** Informational to Low; by effect if a bypass ships.
- **Not a finding when:** the release feature list is fixed and the wasm's exports checked.

## Lints silenced (seen in several reports)
- **Look for:** `#![allow(..)]` and `#[allow(..)]`: `unused_must_use`, `arithmetic_overflow`, `unconditional_panic`, `clippy::arithmetic_side_effects`, `clippy::cast_possible_truncation`, `unused_variables`, `clippy::all`.
- **What goes wrong:** each marks a place where the compiler or linter objected and was overruled. In one project that relied on a lint to forbid raw arithmetic, the unchecked sum another review flagged sat in the one file exempt from it. Crate-wide allows also hide ignored results in code added later.
- **Usually rated:** Informational.
- **Not a finding when:** the allow is local, commented, on code checked by hand.

## Macro-generated behaviour nobody wrote down (seen in several reports)
- **Look for:** each `pub fn` in an exported impl (the macro makes it callable); `#[derive(Deserialize)]` on a struct with internal fields (`is_admin`, `fee_override`) taken as an argument; `#[derive(PartialOrd)]` ordering by field order; selectors, seeds or signatures that must match generated ones.
- **What goes wrong:** the caller fills fields the contract meant to set; a sort ranks by the wrong field; an entry point cannot be called because its declared signature differs from the generated one, or a signing-seed helper differs from the one used at creation (High twice).
- **Usually rated:** Informational to High.
- **Not a finding when:** argument types are separate from stored types.

## Advisory in a crate linked into the contract (seen in many reports)
- **Look for:** `cargo audit` against `Cargo.lock`, then whether the crate is in the wasm and the affected function is called: integer libraries (`pow`, negation), Borsh, hash-map crates with Borsh support, signature crates, the allocator; unmaintained crates.
- **What goes wrong:** advisories read include a contract math library whose `pow` and negation wrapped silently, a deserialiser unsound for zero-sized types, a signature library accepting out-of-range values, an abandoned big-integer crate with known bugs, an unmaintained allocator.
- **Usually rated:** Informational to Low; Minor to Medium when the affected function is used.
- **Not a finding when:** the crate is only a dev- or build-dependency.

## Version that can move under the same manifest (seen in several reports)
- **Look for:** `dep = "1.2"` (any compatible 1.x), `"*"`, `git = ".."` with no `rev` or `tag`, `-beta` / `-rc` versions, no committed `Cargo.lock`, `[patch]` sections and `path =` copies of published crates.
- **What goes wrong:** the code built is not the code reviewed: a branch head moves, a patched copy differs from the registry crate, a later release changes behaviour (one report: an elliptic-curve crate about to change which signatures it accepts). An unpinned git dependency is reported as a supply-chain risk.
- **Usually rated:** Informational to Minor.
- **Not a finding when:** exact revisions, an enforced lock file, vendored code diffed against upstream.

## Signature helper assumed to check more than it does (seen in two reports and an advisory)
- **Look for:** recover or verify calls followed by replay protection keyed on the signature bytes; no check of low-S, recovery id, or key and signature lengths.
- **What goes wrong:** where the library accepts both forms of a signature, a second encoding of the same one passes the "already used" test and replays the message. Lengths taken from the caller made one verifier allocate gigabytes (High).
- **Usually rated:** Informational to High.
- **Not a finding when:** replay protection uses a nonce or the message hash.

## Pseudo-random generator seeded from public data (seen in two reports and a detector catalogue)
- **Look for:** `seed_from_u64(..)`, `from_seed(..)`, `XorShiftRng`, `StdRng`, `SmallRng` fed with block height, timestamp, a counter or an account id.
```rust
let mut rng = StdRng::seed_from_u64(env::block_height());
let winner = tickets[rng.gen_range(0..tickets.len())];
```
- **What goes wrong:** the seed is known before the call, so the pick is computed off-chain and the call made only when it suits: a validator steered all unbonding away from itself (Medium); lottery numbers predicted (Low).
- **Usually rated:** Low to Critical by what is drawn.
- **Not a finding when:** the outcome is committed before the seed exists.

## Default hasher output stored or compared (from library documentation)
- **Look for:** `DefaultHasher`, `RandomState`, `#[derive(Hash)]` with `hash()` used to make ids, storage keys, bucket numbers or a "random" value.
- **What goes wrong:** the documentation says the algorithm is unspecified and may change between releases. A key derived from it and stored cannot be found after a rebuild with another toolchain. It is not a cryptographic hash either: collisions can be constructed.
- **Usually rated:** not seen in the reports read.
- **Not a finding when:** `sha256` or `keccak256` over a canonical encoding.

## `unsafe`, raw pointers and raw exports (seen in several reports)
- **Look for:** `unsafe { }`, `transmute`, `from_raw_parts`, `get_unchecked`, `static mut`, pointer arithmetic with lengths from input, `mem::forget`; `#[no_mangle] pub extern "C" fn`, an entry point outside whatever the contract macro adds.
- **What goes wrong:** bounds and aliasing are the author's promise, not the compiler's. One write-up traced memory corruption to an SDK resize function that set a length through a raw pointer with no bound. A raw export has no caller, deposit or initialisation check unless written by hand.
- **Usually rated:** Low as a note; by effect when a length is attacker-set.
- **Not a finding when:** each block states an invariant checked just before it.
