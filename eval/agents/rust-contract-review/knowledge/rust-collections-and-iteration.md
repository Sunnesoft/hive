# Rust collections, iteration and copies

Where the value a method worked on is not the value in storage: copies, duplicates, ordering, shared prefixes and the size of what is loaded.

## Copy changed, original untouched (from two detector catalogues)
- **Look for:** a value from `get(..)`, `.cloned()`, `.clone()` or a `Copy` struct, mutated, with no `insert` / `set` on some path; a helper taking `mut x: T` by value; an inner `let` shadowing the outer binding; a `return` or `?` between change and write-back.
```rust
let mut acc = self.accounts.get(&id).unwrap();
acc.locked -= amount;          // a local copy
if acc.locked == 0 { return; } // leaves before insert
self.accounts.insert(&id, &acc);
```
- **What goes wrong:** the method succeeds but nothing is stored: a lock never released.
- **Usually rated:** Medium in one catalogue; by effect.
- **Not a finding when:** the collection hands out `&mut`, or every exit writes back.

## One record loaded twice (seen in two reports and a detector catalogue)
- **Look for:** two locals read from one key: `from` and `to` when the caller may name himself, a pool serving as both "to" and "quote", a helper re-reading storage while its caller holds an edited copy; each saved.
- **What goes wrong:** the copies do not see each other and the last save wins. A self-transfer debits copy A, credits copy B and stores B: shares doubled from nothing. An update through one handle is lost.
- **Usually rated:** High for self-transfer; Medium otherwise.
- **Not a finding when:** equal keys are rejected at entry, or the record is loaded once and passed by `&mut`.

## Duplicates in a list argument (seen in several reports)
- **Look for:** `Vec` arguments of ids or members treated as a set: records loaded first and processed after; `map.insert` per item beside a running total; `dedup()` with no sort before it.
```rust
let ps: Vec<_> = ids.iter().map(|id| self.load(id)).collect();
for p in ps { paid += self.claim(p); } // same id twice: two old snapshots
```
- **What goes wrong:** each duplicate is paid from the state before the first payment (excess rewards, Critical); the map keeps one member while the total counts two (Major); `dedup` removes neighbours only.
- **Usually rated:** Minor to Critical.
- **Not a finding when:** uniqueness is checked (strictly increasing order).

## `insert` overwrote, `remove` removed nothing (seen in several reports)
- **Look for:** `map.insert(k, v);` and `map.remove(&k);` as bare statements; storage `save` under a key not tested for existence.
- **What goes wrong:** `insert` returns the previous value and `remove` what it took out; ignoring them hides the case that matters. A second allocation for one receiver replaced the first and locked its tokens (Critical); duplicate names in an init list keep only the last; deregistering an unknown item "succeeds".
- **Usually rated:** Informational to Critical.
- **Not a finding when:** the return value is matched, or existence is asserted first.

## Removing while walking by index (from the lint list and library documentation)
- **Look for:** `for i in 0..v.len() { if .. { v.remove(i); } }`; `swap_remove(i)` in a forward loop; a `Vec` position kept elsewhere as an id while elements are removed.
- **What goes wrong:** the range bound is evaluated once: after a removal the loop skips the next element and finally indexes past the end, a panic. `swap_remove` moves the last element into the hole; a stored index that pointed at it now names another user's entry.
- **Usually rated:** not rated in the reports read; by effect.
- **Not a finding when:** `retain`, reverse iteration, or stable ids.

## Order of a hash map used as a result (from library documentation and a crate advisory; seen in one contest)
- **Look for:** iteration over `HashMap` / `HashSet` whose order reaches an output: "the first match", payout order, a tie-break, bytes that are hashed or signed; Borsh of a hash map.
- **What goes wrong:** the order is arbitrary and moves with insertions and library version. An advisory records a hash-map crate whose Borsh bytes depended on insertion order: equal content, different hash. Where order decides who is paid, a participant picks a key that comes first.
- **Usually rated:** Medium to High in consensus code; Low elsewhere.
- **Not a finding when:** `BTreeMap`, or an explicit sort.

## Sortedness taken for granted (from library documentation)
- **Look for:** `binary_search` on a list nobody sorts after `push`; `dedup` for uniqueness; `sort_by(|a, b| a.partial_cmp(b).unwrap())`; ids compared as strings.
- **What goes wrong:** on unsorted input `binary_search` gives an unspecified answer: "absent" for an entry that is there, so a deny-list or allow-list test is wrong. The comparator panics on NaN; `"10" < "9"` as strings.
- **Usually rated:** by effect.
- **Not a finding when:** insertion keeps the order.

## Two collections under one storage prefix (from SDK documentation)
- **Look for:** one prefix literal or enum variant given to two persistent collections; a nested collection created with a constant prefix inside every parent entry; a prefix built from user text with no separator.
```rust
Account { tokens: UnorderedSet::new(b"t") } // every account: "t"
```
- **What goes wrong:** both collections read and write the same keys: one user's set shows another's entries, a removal for one deletes for all.
- **Usually rated:** not in the reports read here; the documentation warns that data is overwritten.
- **Not a finding when:** each prefix has its own variant plus the parent's key.

## Cached collection writes measured too early (from SDK documentation)
- **Look for:** `near_sdk::store` collections, which write on `flush` or on drop, with `env::storage_usage()` read before and after a change to compute what the caller owes.
- **What goes wrong:** cached writes are not counted until flushed. The measured growth is zero, the user is charged nothing and the contract funds his storage.
- **Usually rated:** not seen in the reports read; by effect.
- **Not a finding when:** `flush()` precedes the second measurement.

## Whole collection materialised (seen in several reports)
- **Look for:** `.collect::<Vec<_>>()`, `.to_vec()`, `.iter().count()`, a full persistent map sorted, `Vec::with_capacity(n)`, `vec![0; n]` with `n` from input.
- **What goes wrong:** gas and memory grow with data outsiders add; an allocation sized by a caller's number reached 12 GB in one report. In a contract the method runs out of gas for everyone.
- **Usually rated:** High when the size is attacker-set; Informational for owner-only lists.
- **Not a finding when:** paging with a hard cap, lengths checked before allocation.

## `zip`, `sum` and lazy adaptors (from library documentation)
- **Look for:** `a.iter().zip(b)` over two argument lists; `.sum()`, `.product()` on amounts; `.map(..)` with side effects and no consumer; `step_by(n)` with `n` from input.
- **What goes wrong:** `zip` stops at the shorter list silently: accounts beyond the last amount are skipped. `sum` overflows by the build's rule, panic or wrap. An unconsumed `map` does nothing; `step_by(0)` panics.
- **Usually rated:** by effect.
- **Not a finding when:** lengths are asserted equal and sums use `checked_add`.
