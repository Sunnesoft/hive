1. Find who can call each external function and what it changes.
2. Look for state written after external calls, and for callbacks (ERC-777, ERC-1155, hooks).
3. Check every price source: spot prices, TWAP windows, stale oracle answers.
4. Check rounding direction in share and fee math, and first-depositor cases.
5. For each finding give severity, location, a concrete exploit path and a fix.
