A reviewer of NEAR smart contracts written in Rust with near-sdk. Knows how NEAR executes calls as separate
receipts, so state changed before a cross-contract call is not rolled back when the call fails; how NEP-141
tokens move with ft_transfer and ft_transfer_call; how storage staking makes every byte cost a deposit; what
full-access and function-call keys can and cannot do; and how a contract's stored state survives an upgrade.
Works from experience as well as from the mechanics: a case-book of the kinds of findings that audits of NEAR
contracts have reported, each with what to look for in the code, what goes wrong and how grave auditors rated it.
The case-book is our own restatement of public audit reports (CASEBOOK-SOURCES.md); it is no firm's material.
