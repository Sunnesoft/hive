# Rust numbers and casts

Flaws that come from Rust's integer and float rules: which operator, method or type makes a stored number wrong, or makes the call panic.

## Release build wraps where the tests panicked (seen in many reports)
- **Look for:** `+`, `-`, `*`, `+=`, `-=` on balances, shares and counters, with a release profile lacking the flag below. Cargo reads profiles only from the workspace root; the same line in a member crate does nothing.
```toml
[profile.release]
overflow-checks = true
```
- **What goes wrong:** tests run in the dev profile and panic on overflow; the deployed wasm wraps. `debt - repaid` with a larger `repaid` becomes a number near 2^128.
- **Usually rated:** Informational when no overflow is reachable; Medium to Major when a subtraction can pass zero.
- **Not a finding when:** the root manifest sets the flag and value arithmetic uses `checked_*`.

## Overflow panic on a path that must stay open (seen in several reports)
- **Look for:** with checks on: `+ 1` on an id or nonce, a constant subtracted from a runtime bound (`max_ttl - YEAR` in `u32`), a caller's number added to (`timeout + 200`), an amount squared; `checked_*(..).unwrap()`.
- **What goes wrong:** the overflow is now a panic. In a method everyone passes through, or fed by a stored value, it is permanent: no new orders once a counter is full, a lifetime extension that never runs.
- **Usually rated:** Minor to Medium.
- **Not a finding when:** reaching the limit costs more calls than can be paid for, or the error is handled.

## `saturating_*` where the true result was needed (from a detector catalogue)
- **Look for:** `saturating_sub`, `saturating_add`, `saturating_mul`, `saturated_into` in balance, debt, reward-debt or supply updates; a saturating subtraction followed by a test for zero.
- **What goes wrong:** the value sticks at 0 or MAX and the method carries on. A withdrawal above the balance leaves 0 and the excess is never accounted; a reward debt that should grow stays put, so the reward is claimed again.
- **Usually rated:** Critical in that catalogue; not rated in the reports read.
- **Not a finding when:** clamping is the stated rule (time left, a capped fee) and no ledger entry derives from it.

## Checked subtraction where the algorithm needs wrap-around (seen in one contest, twice, High)
- **Look for:** math ported from Solidity `unchecked` blocks: differences of ever-growing accumulators (fee growth inside a range, cumulative prices) written with `checked_sub(..).ok_or(..)?` or plain `-`. The mirror: unchecked conversions kept where the original used safe math.
```rust
let inside = global.checked_sub(below).ok_or(Error::Math)?; // original wrapped
```
- **What goes wrong:** the original is correct modulo 2^256 even when a term "underflows"; the port returns an error, so every later update of that position fails and its funds are locked.
- **Usually rated:** High.
- **Not a finding when:** `wrapping_sub` is used there on purpose.

## `as` that truncates or flips sign (seen in several reports)
- **Look for:** `as u64`, `as u32`, `as usize`, `as i64`, `as u128` on amounts, timestamps, indexes, lengths.
```rust
let credited = attached as u64;   // u128 in, low 64 bits out
let idx = position_id as usize;   // 32 bits on wasm32
```
- **What goes wrong:** `as` never fails; it keeps the low bits. A deposit of 2^64 + 5 is credited as 5; a negative delta becomes a vast positive; an index wraps to another slot.
- **Usually rated:** Informational to Low where seen; higher by effect on amounts.
- **Not a finding when:** `try_from` / `try_into` with the error handled, or widening only.

## Integer type too small for the token's decimals (seen in two reports)
- **Look for:** `u64` for prices, amounts or fees of 18- or 24-decimal tokens; products and squares of two amounts kept in `u128`.
- **What goes wrong:** `u64::MAX` is about 18.4 tokens at 18 decimals and 0.0000184 NEAR in yocto, so larger prices cannot be set. A product of two `u128` values overflows once both pass about 1.8e19; only large holders hit the panic.
- **Usually rated:** Medium; Minor when only extreme values overflow.
- **Not a finding when:** the product is taken in a 256-bit type and narrowed with a checked conversion.

## Floats between integers (seen in two reports)
- **Look for:** `as f64`, `f64` fields, `powf`, `exp`, `ln` in interest, price or share math; `x as u64` on a float; float `==`, `max`, `partial_cmp(..).unwrap()`.
- **What goes wrong:** `u64 as f64` is exact only to 2^53. Float-to-integer `as` rounds toward zero, saturates at the limits and turns NaN into 0, so an absurd input becomes `u64::MAX` or 0, not an error. The library documents that precision of `powf`, `exp`, `ln` varies by platform and compiler version.
- **Usually rated:** Low.
- **Not a finding when:** floats only format numbers for display.

## Signed division, remainder and comparison (seen in two reports)
- **Look for:** `/`, `%`, `checked_div` on `i64` / `i128` profit, funding or delta values; home-made signed types (magnitude plus a `negative` flag) with their own comparison.
- **What goes wrong:** integer division rounds toward zero: −1.9 becomes −1, so a debit is rounded in the debtor's favour. `%` takes the dividend's sign, breaking epoch and bucket indexes for negative inputs. One hand-written type ranked −5 above −2.
- **Usually rated:** Low to Minor.
- **Not a finding when:** `div_euclid` / `rem_euclid` or an explicit floor, with tests on negative operands.

## `abs`, negation and `/ -1` at the minimum value (from the language reference and a crate advisory)
- **Look for:** `x.abs()`, `-x`, `x / y`, `x.abs() as u128` where `x` is an `i64` / `i128` from arguments or decoded data; `neg` and `pow` of big-integer library types.
- **What goes wrong:** `MIN` has no positive counterpart. `i128::MIN.abs()` panics with checks and returns `MIN`, still negative, without; `MIN / -1` panics in every profile. One crafted argument stops the method or yields a huge unsigned amount.
- **Usually rated:** Low to Medium.
- **Not a finding when:** `unsigned_abs()`, `checked_neg()`, `checked_abs()`.

## `^` is not a power; `pow` overflows fast (from a detector catalogue and a crate advisory)
- **Look for:** `10 ^ decimals`, `2 ^ n`; `10u128.pow(d)` or `base.pow(exp)` with the exponent from input, config or another contract.
- **What goes wrong:** `^` is XOR: `10 ^ 18` is 24, so every scaled amount is off by sixteen orders of magnitude. `pow` follows the build's overflow rule: `10u128.pow(39)` panics or wraps.
- **Usually rated:** Critical for XOR; Low to Medium for an unbounded exponent.
- **Not a finding when:** `checked_pow` after bounding the exponent.

## Division by a value that can be zero (seen in many reports)
- **Look for:** `/`, `%`, `div_ceil`, `from_ratio(x, y)` with a denominator from configuration (duration, fee denominator, weight sum), from a total that starts at zero, or from a time difference inside one block.
- **What goes wrong:** integer division by zero panics in every profile. The first deposit into an empty pool or a second call in the same block fails; a setter that accepts 0 switches the panic on for everyone.
- **Usually rated:** Informational to Low; Critical once, where the first deposit failed.
- **Not a finding when:** the zero case has its own branch.

## Shift by a count from input (seen once; rule from the language reference)
- **Look for:** `1 << n`, `x >> n`, `next_power_of_two()`, an index compared with `1 << DEPTH` using `<=`.
- **What goes wrong:** shifting by the type's width or more panics with checks; without them the count is masked, so `1u64 << 64` is 1 and `next_power_of_two` returns 0. A capacity or bitmask is wrong and the slot one past the end is accepted.
- **Usually rated:** Informational to Medium.
- **Not a finding when:** `checked_shl`, or `n` bounded first.

## Rounding helper chosen wrongly (seen in several reports)
- **Look for:** which call rounds: `/` (floor), `div_ceil`, `(a + b - 1) / b` (overflows near the top), `round()`, `try_round_*`, `ceil()`, `as` from a float.
- **What goes wrong:** round-to-nearest on both deposit and withdrawal lets an input be found that rounds up twice: put in n, take out n + 1, repeat. A floored reward debt on a small share transfer is 0, so rewards already paid are claimed again.
- **Usually rated:** Medium to High.
- **Not a finding when:** each conversion names its direction, against the caller.
