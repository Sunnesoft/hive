> Source: github.com/pashov/skills @eacfc09, solidity-auditor/references/hacking-agents/numerical-gap-agent.md. MIT License, Copyright (c) 2024 AI Skills Contributors. Adapted: reworded from prompts into a reviewer's checklist; the output-format sections are removed.

# Numerical Gap pass

What this pass looks for: an attacker who hunts bugs in the GAPS between three numerical lenses: precision (rounding/scale/truncation), invariants (mathematical properties that should hold), and boundaries (edges, zeros, max values).

## The hunting ground

**Seam 1 — precision × invariant.** An invariant that holds under exact arithmetic but breaks under integer rounding. Example: `totalShares == sum(userShares)` is true for every individual deposit, but rounding loss on each deposit accumulates so that after N deposits the invariant silently drifts. Find every invariant whose proof assumes real-number arithmetic and exploit the integer slippage.

**Seam 2 — boundary × precision.** A division or multiplication whose intermediate value is fine in the middle of the input domain but produces zero, max, or a wrong-magnitude result at the edge. Example: `fee = (amount * rate) / SCALE` is correct for normal `amount`, but at `amount = SCALE/rate - 1` truncates to zero — free service. Find every formula whose precision behavior changes at the input boundary.

**Seam 3 — boundary × invariant.** An invariant that's enforced in the body but violated when execution hits an early-return, revert-skip, or zero-input fast path. Example: contract preserves `userBalance >= debt` everywhere, but a zero-amount call to `repay()` bypasses the invariant update entirely, leaving a stale `lastUpdate` that future calls trust. Find every guard that exempts edge cases from the invariant-preserving code.

**Seam 4 — three-way.** All three at once: an edge-case input causes a precision loss that breaks an invariant. Example: `liquidationBonus = collateral * bonusBps / 10000`. At very small collateral, bonus rounds to zero (precision × boundary), so liquidators never trigger (invariant: "unhealthy positions get liquidated" breaks). Position becomes permanently un-liquidatable. Look for invariants whose enforcement is conditional on a non-zero numerical result.

## What this looks like in code

- Two formulas that should produce equal results (invariant) but rely on different rounding directions.
- A cap or floor (boundary) that's checked against a value computed with a different precision than the storage value.
- An accumulator that's incremented by a truncated quantity and later compared to an un-truncated total.
- A check `if (x > 0)` immediately followed by a division by `x` that produces zero anyway.
- A `min`/`max` operation between values of different scales.
- N-segment geometric/arithmetic averaging that satisfies per-segment constraints but violates the monolithic invariant callers assume — `Σ f(segment_i)` where the caller expects `f(Σ segment_i)`. Seam: precision × invariant.
- A tree walker scaling by node width on the visit path but skipping the scaling on the non-visit path — the invariant "subtree-value(node) = width-scaled Σ children" silently breaks at every non-visit ancestor. Seam: precision × invariant.
- `queryX` and `doX` using the same inputs but the view's math omits a penalty/fee/accrual term applied by the write — off-chain integrators trust the wrong number while on-chain comparisons see drift. Seam: precision × invariant.
- A function that approves `out + fee` but consumes `out - fee`, leaving `2·fee` residual allowance per call — cumulative drift after N calls = `N · 2 · fee`. Seam: precision × invariant.
- Per-position caps in collateral units checked against funding-rate values computed in a different scale — the cap passes while the actual delta exceeds it. Seam: boundary × precision.
- A `rateAtTarget` updated mid-epoch instead of at the boundary — later readers in the same epoch see a different compounded value than earlier readers. Seam: precision × invariant (epoch boundary).
- A "strategy" submission that defers execution — execution uses current-state values while submission assumed-state values were different; collateral check passes at submit, fails at execute. Seam: invariant × execution.

## Discipline

Every finding needs concrete numbers showing the seam — the input value, the intermediate precision loss, and the invariant or boundary it violates.
