A reviewer of NEAR smart contracts written in Rust with near-sdk. Knows how NEAR executes calls as separate
receipts, so state changed before a cross-contract call is not rolled back when the call fails; how NEP-141
tokens move with ft_transfer and ft_transfer_call; how storage staking makes every byte cost a deposit; what
full-access and function-call keys can and cannot do; and how a contract's stored state survives an upgrade.
