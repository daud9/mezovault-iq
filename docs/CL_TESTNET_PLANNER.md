# Mezo Testnet CL Range Planner

The app route `/app/cl-planner` is a read-only Slipstream concentrated-liquidity planner for Mezo Testnet (chain ID `31611`). It complements the wallet-specific [CL Position Monitor](/app/cl-positions); it does not require a connected wallet.

## What it reads

The planner uses the existing deployments in [`src/config/clPositions.ts`](../src/config/clPositions.ts), sourced from the [official Mezo Pools documentation](https://mezo.org/docs/developers/features/mezo-pools/) and [official Mezo contract reference](https://mezo.org/docs/users/resources/contracts-reference/). It verifies the RPC chain and Factory bytecode, enumerates pool addresses from the Factory, then pins pool and token reads to the same block. No sample pool list is used.

The read interfaces are cross-checked against the [Slipstream Factory interface](https://github.com/velodrome-finance/slipstream/blob/main/contracts/core/interfaces/ICLFactory.sol), [minimal pool interface](https://github.com/velodrome-finance/slipstream/blob/main/contracts/gauge/interfaces/ICLPool.sol), and [pool state interface](https://github.com/velodrome-finance/slipstream/blob/main/contracts/core/interfaces/pool/ICLPoolState.sol). The relevant selectors are `allPoolsLength()` `0xefde4e64`, `allPools(uint256)` `0x41d1de97`, `token0()` `0x0dfe1681`, `token1()` `0xd21220a7`, `tickSpacing()` `0xd0c93a7c`, `slot0()` `0x3850c7bd`, and `liquidity()` `0x1a686502`; ERC-20 `symbol()` and `decimals()` use `0x95d89b41` and `0x313ce567`. Pool and token metadata are not inferred from the Basic Pool reader.

A pool is selectable only if it is Factory-enumerated, has contract code, returns valid live state, has nonzero `liquidity()` at the current tick, and both token contracts return supported decimals (0–36). In the Slipstream pool-state interface, `liquidity()` is the pool's currently in-range aggregate liquidity, including staked liquidity; it is not total liquidity across every tick and does not establish liquidity available to a hypothetical user range. Pools with zero current liquidity or unreadable decimals are excluded and counted.

## How the preview works

The pool's canonical on-chain `token0` and `token1` order is used. Displayed prices are human-unit token1 per token0, derived from live `sqrtPriceX96` and both on-chain decimal counts. Users enter lower and upper prices in that same orientation and a total budget denominated in token1; the budget is not a USD value.

Input prices are converted to raw ticks with the token-decimal adjustment and rounded outward to the selected pool's tick spacing: the lower bound rounds down and the upper bound rounds up. Aligned limits are constrained to the supported CL tick range. The planner then applies the standard concentrated-liquidity token-amount equations at the live square-root price and scales the result to the entered token1-valued budget. Below the range the preview is token0-only; above it, token1-only; within it, both tokens may be required.

“Current price is within the selected range” uses the live pool tick with an inclusive lower bound and exclusive upper bound. It describes price position only; it does not assert that the hypothetical range has liquidity, nor predict future price movement.

## Freshness and limitations

Reads refresh on page load, every 60 seconds, when the page becomes visible, and on demand. The page shows the checked block and read age. A failed refresh or snapshot older than two minutes pauses calculations; it never replaces missing data with a demonstration value.

The token amounts are approximate floating-point planning estimates, not a quote or executable raw-unit amount. They exclude fee tier/fees, slippage, gas, token transfer behavior, exact integer rounding, and later pool changes. No APY, return, USD valuation, fees earned, or yield is calculated or shown. The page has no transaction, signing, approval, mint, deposit, stake, or collection control.

## Tests

`src/lib/clPlanner.test.ts` covers price-to-tick alignment (including negative ticks), token decimal adjustment, in-range and one-sided token composition, invalid ranges and tick limits, same-block Factory enumeration, zero-liquidity exclusion, and wrong-chain rejection. The tests use a fake JSON-RPC client and never send a transaction.

## Live endpoint check (2026-11-12)

The configured Testnet RPC returned chain `31611` and a successful reader snapshot at block `16,735,137`. The official Factory enumerated 29 pools; 19 passed the nonzero-current-liquidity and readable-decimals filters, and 10 were excluded. The reader completed its pool/token metadata calls for the checked set. This is a point-in-time read-path check, not a guarantee that the same pools remain active later; no wallet address or write method was used.
