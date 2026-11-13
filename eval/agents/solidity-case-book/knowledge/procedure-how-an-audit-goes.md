# How an audit goes: Solidity contracts (EVM)

## What the system holds, and for whom
1. Assets. List what each contract holds: ETH, ERC-20 balances, NFTs, its own shares, users' allowances, fees, rewards. For each: which function brings it in, which lets it out, to whom. Finding: a way in with no way out (`receive()`, swap leftovers, a failed step); a way out not tied to whoever paid in; an allowance any caller can spend.
2. What must add up. Write the equations the state implies: `totalSupply` = sum of balances; assets held >= what all shares redeem for; total debt = sum of debts; tracked balance <= real balance. For each function writing one side, find where it writes the other. Finding: a path (liquidation, emergency exit, admin function, share transfer) that moves one side alone.
3. Trust list. Every outside contract relied on (token, oracle, pool, router, bridge) and what is taken for granted about it. Finding: an assumption a caller can void by supplying the address.

## Every external function, one by one
4. Enumerate each non-view `external` / `public` function of every contract, inherited ones included, with `receive` and `fallback`. Put 5-8 to each.
5. Who may call? A modifier or `require` on `msg.sender`: is its body right, and do sibling functions carry it too? Finding: another account's state or value changed without its approval; a function meant for a sister contract left open; `tx.origin` deciding rights.
6. What moves? `msg.value` compared with the need, counted once (loops, multicall), surplus returned. Whose balance is debited and whose credited (`from`, `owner`, `receiver`); when they differ, who consented?
7. What is assumed of each argument? Try zero, the maximum, dust, `address(0)`, the contract itself, a token or account twice, arrays of unequal length, a foreign id, a caller-supplied address used as token, pool or callback target. Finding: an accepted value that drains funds or leaves state other functions cannot handle.
8. In which states may it run? Uninitialised, paused, expired or shut down, inside another function's callback, in one transaction with a flash-loaned deposit. Finding: runs when it should not; repay, exit or liquidation refused just when needed.

## Every privileged function
9. Worst case, per function. Suppose the key is stolen: what does one call do to users' funds? Take each `onlyOwner` or role function: set a price or oracle, raise a fee, replace a token or implementation, mint, sweep, pause, blacklist, upgrade. Finding: each function that reaches or freezes user funds, with what limits it.
10. Bound and delay. Is each setter, constructor and initialiser argument bounded? Does a change wait in a timelock, or hit open positions at once? Can the delay be shortened or bypassed? Finding: no bound; no delay; fees or interest not settled before the change.
11. Keeping and passing control. Plain account, multisig or governance? Two-step transfer; `renounceOwnership` reachable; who grants and revokes each role; can the owner overrule the pauser?

## Every external call
12. Enumerate each call out: token transfers, interface calls, `call` / `delegatecall`, and hooks handed to others (`onERC721Received`, token hooks, flash-loan and swap callbacks). Put 13-15 to each.
13. Who chooses target and calldata? Finding: a caller-chosen target or payload while the contract holds funds or approvals; `delegatecall` to an address that can change.
14. State before the call. Is every balance, total and flag written before control leaves? What can a re-entering caller reach: the same function, a sibling sharing state but not the guard, another contract of the system, a view that others read as a price?
15. Result. Is the return value checked (`success`, tokens returning nothing or `false`), and does the target have code? If the call reverts, does one recipient, token or oracle block a batch, a queue, a liquidation, everyone's withdrawal? A `try/catch` hiding a failure? Is gas left for what follows?

## Every token handled
16. ERC-20. For each accepted token, and for any token if the list is open: fee on transfer, rebasing, no return value, revert on zero amount or on approve from non-zero, blacklist, pause, hooks, decimals other than 18. Which of these does the accounting assume away?
17. ERC-721 / ERC-1155. Safe-transfer and mint hooks as re-entry points; ownership and approval checked; a receiver that cannot hold the token.
18. ERC-4626 and share vaults. First deposit or donation moving the share price; `preview*`, `max*`, `convertTo*` agreeing with what `deposit`, `mint`, `withdraw`, `redeem` do, fees and limits included, rounded as the standard requires.
19. ETH. A recipient contract that refuses it; ETH forced in against a check on `address(this).balance`.

## Every price and oracle
20. Source. A pool's current reserves or balances, which one transaction can move, or a feed or time-weighted average? Finding: a price the caller can shift just before it is used.
21. Freshness and failure. Age, zero or negative answer, the feed's decimals, sequencer downtime on an L2. If the feed reverts, are liquidations and exits halted with it?
22. Slippage and deadline. On every swap, deposit and redemption priced at execution: a minimum out and a deadline set by the user, not `0` and `block.timestamp`.

## Every signature
23. What is signed? Signer, nonce, chain id, verifying contract, deadline, and every parameter later used. `ecrecover` returning zero; malleable `s`. Finding: replay on another chain or contract, or after cancellation; a nonce left unused when the call reverts; a `permit` front-run that makes the whole action revert.

## Loops, arithmetic, limits
24. Every loop over storage. Who grows the list, at what cost, to what cap; who shrinks it? At ten times the size, do withdrawal and liquidation fit in a block?
25. Every division, cast and `unchecked` block. Rounding direction and who gains: shares minted down and burned up, debt up; multiply first; zero divisor, empty pool. Narrowing and signed casts; a product overflowing before its division; a subtraction that reverts on the way out.
26. Every comparison and cap. `<` or `<=` at the edges of a window or threshold; a cap enforced on `deposit` but not `mint`, on `borrow` but not `withdraw`.

## Proxies, initialisers, upgrades, pause
27. Initialiser. Guarded, single-use, parents all initialised, implementation locked (`_disableInitializers`)? Can a stranger call it between deployment and setup?
28. Upgrade. Who authorises it, after what delay? Storage layout preserved (order, gaps, parents)? Is the result verified: new implementation has code, migration ran once, old state still reads right?
29. Pause. Which functions obey it? While paused, can users exit and repay, does interest accrue, can they be liquidated the moment it lifts?

## What every report states
30. Centralisation. What each role alone can do to users.
31. Unusual tokens. Which behaviour of item 16 breaks the system.
32. Events. Each change of balance, role or setting emitted, with the right values.
33. Compiler and dependencies. Pragma fixed; compiler bugs touching features used; opcodes missing on the target chain; library versions.

## How findings are rated
Audit firms rate impact against likelihood and read severity off a matrix: high impact with high likelihood is Critical, each step down on either axis lowers it. High impact is a material loss of funds or harm to many users; likelihood weighs the assumptions needed and cost against gain. In contests, High: assets stolen, lost or frozen directly, without far-fetched preconditions. Medium: assets not at direct risk, but a function or the availability of the protocol impaired, or value leaking under stated conditions; one contest asks for funds locked over a week or a time-critical function blocked. Low: state handling, departures from the specification, wrong view results or events with no further effect. Informational: style, gas, naming.

Roles are assumed honest and careful: what only an admin can trigger is a centralisation note, Medium at most when a reasonable action does harm unawares; firms rate higher when the owner can skip a promised restriction. Dust lost to rounding is Low; repeatable into a real sum, it is rated as that sum. A departure from an ERC is rated by what it breaks for integrators, otherwise Low. Unusual tokens count only where declared supported. Losses needing the victim's own mistake are Low at best.
