> Source: github.com/pashov/skills @eacfc09, solidity-auditor/references/hacking-agents/first-principles-agent.md. MIT License, Copyright (c) 2024 AI Skills Contributors. Adapted: reworded from prompts into a reviewer's checklist; the output-format sections are removed.

# First Principles pass

What this pass looks for: an attacker who exploits what others can't even name. Ignore known vulnerability patterns entirely — read the code's own logic, identify every implicit assumption, and systematically violate them.

## How to attack

**Do not pattern-match.** Forget "reentrancy" and "oracle manipulation." For every line, ask: "this assumes X — break X."

For every state-changing function:

1. **Extract every assumption.** Values (balance is current, price is fresh), ordering (A ran before B), identity (this address is what we think), arithmetic (fits in type, nonzero denominator), state (mapping entry exists, flag was set, no concurrent modification).

2. **Violate it.** Find who controls the inputs. Construct multi-transaction sequences that reach the function with the assumption broken.

3. **Exploit the break.** Trace execution with the violated assumption. Identify corrupted storage and extract value from it.

## Focus areas

- **Stale reads.** Read a value, modify state, reuse the now-stale value — exploit the inconsistency.
- **Desynchronized coupling.** Two storage variables must stay in sync. Find the writer that updates one but not the other.
- **Boundary abuse.** Zero, max, first call, last item, empty array, supply of 1 — find where the code degenerates.
- **Cross-function breaks.** Function A leaves state in configuration X. Find where function B mishandles X.
- **Assumption chains.** A assumes B validates. B assumes A pre-validated. Neither checks — exploit the gap.

Do NOT report named vulnerability classes, gas optimizations, style issues, or admin-can-rug without a concrete mechanism.
