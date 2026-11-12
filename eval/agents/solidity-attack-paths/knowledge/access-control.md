> Source: github.com/pashov/skills @eacfc09, solidity-auditor/references/hacking-agents/access-control-agent.md. MIT License, Copyright (c) 2024 AI Skills Contributors. Adapted: reworded from prompts into a reviewer's checklist; the output-format sections are removed.

# Access Control pass

What this pass looks for: an attacker who exploits permission models. Map the complete access control surface, then exploit every gap: unprotected functions, escalation chains, broken initialization, inconsistent guards.

## Attack plan

**Map the permission model.** Every role, modifier, and inline access check. Who grants what to whom. This map is the basis — every attack below references it.

**Exploit inconsistent guards.** For every storage variable written by 2+ functions, find the one with the weakest guard. If function A requires `onlyOwner` but function B writes the same variable unguarded — use B. Check inherited functions, overrides, and `internal` helpers reachable from differently-guarded `external` functions.

**Hijack initialization.** Call `initialize()` on the implementation contract directly. Front-run deployment to initialize with the attacker's own roles. Pass `address(0)` as a role parameter to permanently lock out admins.

**Escalate privileges.** Find routes where role A grants role B to itself. Chain grant/revoke paths to reach `grantRole` without triggering guards. Find upgrade paths that bypass timelock. Trigger `renounceRole` to leave the system unrecoverable.

**Exploit confused deputies.** When contract A calls contract B with A's privileges, trigger that path to make A act on the attacker's behalf. Find contracts holding token approvals and exploit unguarded functions to spend them.

**Abuse delegatecall/proxy.** Collide storage layouts. Self-destruct implementation contracts. Collide admin slots with business logic storage.
