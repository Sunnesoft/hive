# Rust time, strings and units

Bare integers and strings that carry a meaning the type does not show: seconds or nanoseconds, token units, case, length, separators.

## Two time units in one expression (from library documentation)
- **Look for:** block time (`env::block_timestamp()` is nanoseconds, `block_timestamp_ms()` milliseconds) mixed with seconds from arguments, config or a front end; `86_400` next to nanosecond values; `Duration::subsec_millis()` taken for the whole length.
```rust
let unlock = env::block_timestamp() + lock_days * 86_400; // ns + s
```
- **What goes wrong:** every operand is a `u64`, so the compiler is content. A 30-day lock lasts 2.6 milliseconds; an expiry given in seconds is always past.
- **Usually rated:** not seen for time in the reports read; the same slip on token units is rated Critical.
- **Not a finding when:** one unit per contract, shown in field names or a wrapper type.

## Time in a narrow or signed type (seen in two reports)
- **Look for:** `as u32` on seconds, `as u64` on an `i64` timestamp, `u32` durations multiplied (`days * 86_400 * 1000`), a constant subtracted from a runtime bound (`max_ttl - ONE_YEAR`), `now + user_timeout`, `u64::MAX` meaning "never" and then added to.
- **What goes wrong:** with overflow checks the arithmetic panics: one report found a storage-lifetime extension that could never run, so entries expired; another a worker crashed by one huge timeout. Without checks the time wraps: a lock ends at once or never.
- **Usually rated:** Minor to Medium.
- **Not a finding when:** `u64` throughout, `checked_add` on caller-supplied values, "never" as `None`.

## Edge of a window, and zero elapsed time (seen in several reports)
- **Look for:** `<` against `<=` at start, end and expiry; `a..b` against `a..=b`; `now - last_update` as a divisor; an index compared with a capacity using `<=`.
- **What goes wrong:** at the exact end both "still open" and "already closed" hold, or neither: a deposit and the finalisation in one second (Minor). Two calls in a block give an interval of 0 and a division by zero in a price average (Low). A full structure accepts the index one past its last slot (Medium).
- **Usually rated:** Low to Medium.
- **Not a finding when:** each boundary belongs to one side and is tested there.

## Amounts in different scales in one expression (seen in several reports)
- **Look for:** `type Balance = u128; type Shares = u128;` (aliases, not types); prices and rates with an implied scale (1e18, 1e24, basis points) multiplied or compared unscaled; a decimal built with another token's scale; a price read the wrong way up.
- **What goes wrong:** the compiler accepts shares for assets and 6-decimal for 18-decimal units: a vault judged solvent from collateral converted with the wrong decimals (Critical); a wrapped amount passed where the underlying was due (Critical); oracle prices used inverted (Major).
- **Usually rated:** Critical on valuations and transfers; Minor on views.
- **Not a finding when:** distinct wrapper types, or one conversion per scale.

## Case and spelling of string keys (seen in two reports)
- **Look for:** `String` keys (addresses of another chain, hex hashes, public keys, symbols) stored as received and looked up from a differently normalised source; `eq_ignore_ascii_case` in the check while the raw string is the key; `to_lowercase()` on one path only.
- **What goes wrong:** a balance written under `"0xAbC.."` is never found under `"0xabc.."`. Tokens sent to an upper-case spelling of an address were locked for good, because the owner's own calls always arrive in lower case (High).
- **Usually rated:** Informational to High.
- **Not a finding when:** one normalising constructor makes every key, or the key is a validated id type.

## Bytes made into text, lossily (from library documentation)
- **Look for:** `String::from_utf8_lossy`, `from_utf8(..).unwrap_or_default()`, `char::from(byte)` on ids, memos or keys from outside.
- **What goes wrong:** each invalid sequence becomes the same replacement character, so distinct byte strings turn into one `String`: two ids collide, or a check passes on the cleaned text while the raw bytes are what is forwarded or hashed. `unwrap_or_default` turns anything invalid into the empty id.
- **Usually rated:** not seen in the reports read; by effect.
- **Not a finding when:** invalid input is rejected with `from_utf8(..)?`.

## Length in bytes, cut inside a character (from library documentation; missing limits seen in two reports)
- **Look for:** `s.len() <= MAX` meant as characters; `&s[..n]`, `split_at(n)`, `s.truncate(n)` on user text; no limit at all on names, memos, URLs, metadata.
- **What goes wrong:** `len()` counts bytes, and cutting inside a multi-byte character panics. If the text is stored first and shortened later, in a view, an event or a migration, one user's name stops that method for everyone. Unlimited strings are stored and logged at the contract's cost.
- **Usually rated:** Informational where limits were missing; by effect for the panic.
- **Not a finding when:** byte limits checked at entry; cuts made with `char_indices` or `get(..n)`.

## Suffix, prefix and separator tests standing for structure (separator ambiguity seen in two reports)
- **Look for:** `ends_with("near")`, `starts_with(p)`, `contains(..)` deciding what an account or id is; `split(':')` or `split('_')` taking apart an id whose parts may hold the separator; `splitn` with the wrong count.
- **What goes wrong:** `ends_with("pool.near")` is true for `evilpool.near`; only `.pool.near`, with the leading dot, names a sub-account. A part containing the separator shifts the fields: `("a_b","c")` and `("a","b_c")` make one id, and a signed message can be read two ways.
- **Usually rated:** Informational to High.
- **Not a finding when:** comparison with the full expected id, or tuples and length-prefixed parts.

## JSON, logs and call arguments assembled with `format!` (seen once)
- **Look for:** hand-built JSON for events or outgoing calls; `log!` of raw user text in a line indexers parse; file names, manifests or commands built from names.
```rust
let args = format!("{{\"receiver_id\":\"{}\",\"amount\":\"{}\"}}", to, amount);
```
- **What goes wrong:** a quote or brace in the user's value ends the string early and adds fields of his choosing: a second `receiver_id`, a forged event an indexer credits. One report rated code injection through an unsanitised name Major and log injection Minor.
- **Usually rated:** Minor to Major.
- **Not a finding when:** a serialiser produces the text from typed values.
