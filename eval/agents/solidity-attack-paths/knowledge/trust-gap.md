> Source: github.com/pashov/skills @eacfc09, solidity-auditor/references/hacking-agents/trust-gap-agent.md. MIT License, Copyright (c) 2024 AI Skills Contributors. Adapted: reworded from prompts into a reviewer's checklist; the output-format sections are removed.

# Trust Gap pass

What this pass looks for: an attacker who hunts bugs in the GAPS between three trust lenses: access control (who is allowed), economic security (who profits/pays), and asymmetry (who is treated differently from whom).

## The hunting ground

**Seam 1 — access × economics.** A function whose access guard is correct in isolation and whose economic formula is correct in isolation — but the actor permitted by the guard can systematically extract value through the formula. Example: `onlyKeeper` rebalance function calls a swap with `amountOutMin = 0`. The guard is "correct" (only keepers can call), the swap is "correct" (it's the standard pool), but a keeper can sandwich themselves. The combined exploit needs both lenses to articulate.

**Seam 2 — economics × asymmetry.** An economic formula whose result differs by caller class, branch, or input shape — and the difference is exploitable by whoever picks the favorable side. Example: deposit uses spot price, withdraw uses TWAP. Each is "reasonable" in isolation; together they let a user deposit cheap and withdraw expensive. Find every formula that has a paired counterpart and check the two formulas are economically symmetric, not just structurally symmetric.

**Seam 3 — access × asymmetry.** A privileged actor whose action creates asymmetry between users — value flows differently to one user class than another depending on whether the admin acts. Example: `setFeeRecipient` redirects accrued fees to the new recipient INSTEAD of crediting them to the old recipient first; admin can rug pending fees by reassigning. Find every admin-controlled setter whose write moment alters the destination of in-flight economic value.

**Seam 4 — three-way.** All three at once: a privileged actor uses an asymmetric economic primitive to extract value at the expense of a specific user class. Example: `onlyOwner setOracle` lets the owner swap to a manipulable oracle, and `liquidate()` uses spot oracle for collateral valuation while `borrow()` uses TWAP. Owner front-runs an oracle change to liquidate borrowers at unfavorable prices. Three lenses required to even describe the bug.

## What this looks like in code

- Modifier that allows a role, where the role's only action calls a function with sandwich-able parameters.
- Paired functions where one uses spot price and the other uses an averaged price.
- Admin setter for a parameter that affects pending/in-flight value distribution.
- Fee accrual that credits "current" recipients/holders, where the set of recipients can be changed by an unrestricted actor.
- Hooks (rewards, callbacks) where the recipient is settable but past accruals don't checkpoint.

## Discipline

Every finding needs concrete actors, concrete economic deltas, and a description of which authorization path the exploit relies on.
