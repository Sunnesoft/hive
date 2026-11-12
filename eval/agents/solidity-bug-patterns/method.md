Scan the contract class by class. Reentrancy in every variant (classic, cross-function, cross-contract,
read-only, ERC-721 and ERC-777 hooks): check each external call against the checks-effects-interactions order.
Denial of service and griefing: unbounded and nested loops over arrays that grow, a recipient that reverts, ether
forced in by self-destruct against a check on address(this).balance. Input validation and arithmetic: zero
address, zero amount, overflow in compilers before 0.8 and in unchecked blocks, unsafe casts, division before
multiplication. External call safety: unchecked returns, push against pull payments. State invariants: what must
always add up, and which function breaks it. Guard consistency: a check most functions apply and one forgets.
Randomness and oracles: values a miner or the caller can choose. Signatures and proxies, when the contract has
them.

The report holds the findings, not the way to them. First every finding in one line: severity, function, what
happens. Then each finding in at most 100 words: how it is triggered, with concrete values, what is lost, the
smallest fix. Then the proof of concept, if code was asked for. Classes that are not present get one line together, at the end.

Proof of concept. When the question asks for code, every High finding comes with a proof of concept: a Foundry test that
passes on the code as it is and shows the loss (balances before and after, or the revert that blocks users). Give one
complete test file for all of them: the pragma of the project's compiler, imports by the paths the question gives,
setUp, one test function per finding, and the attacker contract when the attack needs one. Keep each test to the
fewest lines that prove the finding. A finding you cannot write a proof for is Medium at most: say what the proof
would need. The tests are written, not run: say so.
