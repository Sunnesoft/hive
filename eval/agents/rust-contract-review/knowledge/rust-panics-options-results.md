# Rust panics, Option and Result

Where a Rust contract stops, or carries on with a value that stands for "nothing" or "failed": panics, unwrapped and defaulted values, discarded results, and branch logic the compiler cannot check.

## Panic fed by stored state (seen in many reports)
- **Look for:** `unwrap()`, `expect()`, `panic!`, `assert!` inside loops over stored items, in list views, hooks and migration; on values an earlier call stored (a string parsed again, a lookup by a stored id).
- **What goes wrong:** a panic in the caller's own transaction only reverts it; reports list bare `unwrap`s as Informational. When the value that panics is already in state, every caller meets it: one asset registered with a bad address made three queries fail for good.
- **Usually rated:** Informational; Low to High when one stored value stops a shared path.
- **Not a finding when:** the bad value cannot be stored, or the loop skips failures.

## Index or slice taken from input (seen in several reports)
- **Look for:** `v[i]`, `&buf[a..b]`, `split_at(n)`, `v.remove(i)`, `v[v.len() - 1]`, `first().unwrap()`, `chunks(n)` with `i`, `len`, `n` from arguments or decoded data; fixed-size readers with no length check.
```rust
let top = self.bids[self.bids.len() - 1]; // empty list: len() - 1
let body = &data[off..off + len];         // len from the message
```
- **What goes wrong:** out of range is a panic, and `off + len` can overflow first. A shared handler that panicked on a crafted length was rated High; in a single call it is only a revert.
- **Usually rated:** Informational to High.
- **Not a finding when:** `get(..)`, `last()`, `checked_add` and an explicit length test.

## Missing value turned into zero (seen in several reports)
- **Look for:** `unwrap_or_default()`, `unwrap_or(0)`, `unwrap_or_else(|_| zero)` on a config read, a conversion or a lookup.
```rust
let lock = self.settings.get(&Key::Lock).unwrap_or(0); // unset: no lock
let amt = u128::try_from(delta).unwrap_or_default();
```
- **What goes wrong:** "not set", "not found" and "did not fit" all read as an ordinary number. A missing lock period means no lock; a failed conversion books 0 and the method reports success; an unknown asset gets its input back as its price.
- **Usually rated:** Informational where seen; higher where the default lifts a restriction.
- **Not a finding when:** zero is the defined meaning of absence, as for the balance of an unknown account.

## Result thrown away (seen in two reports; a rule in a published guideline)
- **Look for:** `let _ = fallible();`, `.ok();`, `if let Ok(v) = .. { .. }` with no `else`, `map_err(|_| ..)`, a `Result`- or `bool`-returning helper called as a statement.
- **What goes wrong:** the compiler warns about an unused `Result`, not about `let _ =` or an unused `bool`. A crediting helper whose result is bound to `_` leaves the caller believing the credit happened; removing an entry that is not there reports success.
- **Usually rated:** Informational to Minor; higher when the dropped value was a transfer's outcome.
- **Not a finding when:** failure is truly irrelevant and a comment says why.

## Nested Result: outer checked, inner lost (seen once)
- **Look for:** `Result<Result<T, E1>, E2>`, `Option<Result<..>>`, a call wrapper that returns the callee's value inside its own `Result`; `match r { Ok(_) => done, Err(e) => .. }`; `is_ok()` on the outer layer.
- **What goes wrong:** `Ok(Err(e))` matches `Ok(_)`. The call "succeeded" in that it returned; that it returned a failure is dropped, and a proposal is marked executed although the inner operation refused. The same shape appears wherever a `false`, `0` or `None` inside a successful reply goes unread.
- **Usually rated:** Informational where seen; higher if value moves on the false success.
- **Not a finding when:** both layers are matched.

## Catch-all arm in a match (seen in two reports)
- **Look for:** `_ =>` or a binding arm that returns a default, `Ok(())`, zero or "allowed" in a `match` over asset kinds, order types, message kinds or roles; `if let A = x { .. }` with no `else`.
- **What goes wrong:** when a variant is added later the compiler stays silent and the new kind takes the default: no exposure counted, no fee, no check. Reviewers ask for every variant to be written out, so that an addition fails to compile.
- **Usually rated:** Informational where seen; higher when the default is the permissive branch.
- **Not a finding when:** the default arm rejects.

## Stub or "impossible" branch that is reached (from a published guideline; seen once)
- **Look for:** `unreachable!()`, `unimplemented!()`, `todo!()`, `panic!("never")`, `Err(NotImplemented)` in arms and methods the author held impossible or unfinished; `expect("checked above")` far from the check.
- **What goes wrong:** the belief was true when written. After a new variant, a new caller or a changed precondition the arm is reached and the method panics. One report found three entry points overridden to return a not-implemented error although a working implementation existed (Major).
- **Usually rated:** Informational; Major once.
- **Not a finding when:** the type system excludes the case.

## Same-typed arguments in the wrong order (seen in two reports)
- **Look for:** calls to functions with two or more parameters of one type: `(from, to)`, `(token, recipient)`, `(amount_in, amount_out)`, `(numerator, denominator)`, `a.checked_sub(b)`. Compare each call with the signature.
```rust
fn pay(token: AccountId, to: AccountId, amount: u128) { /* .. */ }
pay(recipient, token, amount); // compiles
```
- **What goes wrong:** nothing in the types objects. A fee collection that passed recipient and token swapped could never succeed and locked the protocol's fees; a swapped subtraction fails only for some inputs.
- **Usually rated:** Informational to High.
- **Not a finding when:** distinct wrapper types or named-field structs carry the values.

## Condition that does not say what the comment says (seen in several reports)
- **Look for:** `&&` where either role should pass, `>` / `>=` reversed against a documented threshold, a setter that writes a neighbouring field, a getter returning the wrong field, `min` and `max` swapped in a clamp.
- **What goes wrong:** "admin or owner" coded as "admin and owner" shut every admin out; a setter for one role overwrote another role's address; a rejection threshold applied without counting votes still to come ended proposals early.
- **Usually rated:** Major or High on an access check or a privileged address; otherwise Low.
- **Not a finding when:** a test drives each side of the condition separately.
