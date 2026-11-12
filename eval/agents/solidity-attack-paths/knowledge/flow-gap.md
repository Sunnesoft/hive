> Source: github.com/pashov/skills @eacfc09, solidity-auditor/references/hacking-agents/flow-gap-agent.md. MIT License, Copyright (c) 2024 AI Skills Contributors. Adapted: reworded from prompts into a reviewer's checklist; the output-format sections are removed.

# Flow Gap pass

What this pass looks for: an attacker who hunts bugs in the GAPS between three control-flow lenses: execution trace (where control actually goes), periphery (external touchpoints — tokens, oracles, callbacks, low-level calls), and first principles (what the protocol is fundamentally supposed to do).

## The hunting ground

**Seam 1 — execution × periphery.** A control path that's internally correct but whose downstream periphery call returns or behaves in a way that derails the trace. Example: a vault deposit follows a clean path, but it calls `IERC20(token).transfer(...)` to a token that takes a fee — the resulting balance differs from the expected amount, and subsequent code uses the pre-transfer value. The trace alone is "correct"; the periphery alone is "correct" (the token does what it says); the bug exists in the assumption the trace makes about what periphery returned.

**Seam 2 — periphery × first principles.** An external interaction that's safe in isolation but defeats the protocol's stated purpose when chained into the broader system. Example: protocol's purpose is "users always receive at least X." A safe `safeTransferFrom` call to a rebasing/blacklist/double-entry token violates that promise, even though the call site is technically correctly written. Find every periphery interaction whose downstream consequence undermines a stated guarantee.

**Seam 3 — execution × first principles.** An execution path that runs to completion without reverting but whose end-state contradicts the protocol's purpose. Example: protocol exists to "allow users to redeem collateral after their loan is repaid." A specific call sequence leaves the loan struct in a state where `loan.repaid == true` but `loan.collateralLocked == true` — the trace finishes cleanly, no external call, but the user's collateral is permanently stuck. Find every multi-step flow where each step is correct but the end state contradicts protocol intent.

**Seam 4 — three-way.** All three at once: a control path interacts with a peripheral contract whose behavior leaves the protocol in a state that violates its purpose. Example: a liquidation flow calls an oracle (periphery) whose return value triggers a code branch (execution trace) that liquidates a healthy position (first-principles violation). Three lenses needed to identify the chain.

## What this looks like in code

- A trace that computes a value `before` a periphery call and uses it `after` (fee-on-transfer, rebasing, sync state).
- A flow that depends on the periphery returning a specific structure (bool, length, decimals) which non-standard contracts may not.
- A multi-step operation (deposit-then-claim, mint-then-bridge, lock-then-redeem) where the steps are individually correct but the combined end-state breaks protocol semantics.
- Callbacks/hooks whose execution moves control mid-flow, and the trace after callback assumes pre-callback state.
- A code path that's reachable only via a sequence of external returns no single specialty would chase across.
- A delta-check `received = balance_after - balance_before` followed by `received >= amount` that reverts on fee-on-transfer tokens even on intended flows.
- A peripheral call mid-flow (V3 mint callback, RFT settle, hook delegation) that invokes the user before the originating function finalizes — re-entry observes inconsistent mid-flow state.
- A user-controllable identifier (externalId, message hash, nonce) keying a refund/state map without an occupancy check — subsequent writes overwrite prior entries.
- A user action that triggers a helper which mutates state another caller depends on; the cascade isn't visible at either call site.
- A position update on a perpetual or option that triggers funding settlement using new position size against old funding rate (or vice versa).
- Shared state written by contract X and read as ground truth by contract Y; the attacker bridges between contracts to convert phantom state (pending shares, in-flight balances) into real claims.
- An attacker pumping a tracked value (liquidity, ticket count, share supply) past a threshold that gates parameter updates; legitimate updates revert until the value decays.
- Cross-chain message handlers iterating over user-controlled lengths or combinatorial sets; legitimate users exceed destination-chain block gas, bricking delivery.

## Discipline

Every finding needs the trace, the periphery call, and the protocol guarantee that's violated.
