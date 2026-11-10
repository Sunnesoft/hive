# Audit checklist

## Access control
Initializers callable twice; missing onlyOwner on setters; tx.origin used for auth.

## Reentrancy
Checks-effects-interactions; cross-function reentrancy through shared state; read-only reentrancy
through view functions that other protocols read during a callback.

## Oracles
Spot price from a pool is manipulable in one transaction with a flash loan. Chainlink answers need
staleness and round checks. TWAP windows shorter than 30 minutes are cheap to move on thin pools.

## Vaults
ERC-4626 share inflation: the first depositor donates to the vault to make later deposits round to
zero shares. Mitigate with virtual shares or a dead deposit.
