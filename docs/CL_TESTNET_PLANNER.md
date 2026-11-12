# Mezo Testnet CL Range Planner

The app route `/app/cl-planner` contains a read-only Slipstream concentrated-liquidity planner and, below it, a separate Testnet-only wallet deposit flow. The planner does not require a connected wallet. The [CL Position Monitor](/app/cl-positions) remains read-only.

## What it reads

The planner uses existing deployments in [`src/config/clPositions.ts`](../src/config/clPositions.ts), sourced from the [official Mezo Pools documentation](https://mezo.org/docs/developers/features/mezo-pools/) and [official Mezo contract reference](https://mezo.org/docs/users/resources/contracts-reference/). It verifies the RPC chain and Factory bytecode, enumerates pool addresses from the Factory, then pins pool and token reads to the same block. No sample pool list is used.

The read interfaces are cross-checked against the [Slipstream Factory interface](https://github.com/velodrome-finance/slipstream/blob/main/contracts/core/interfaces/ICLFactory.sol), [minimal pool interface](https://github.com/velodrome-finance/slipstream/blob/main/contracts/gauge/interfaces/ICLPool.sol), and [pool state interface](https://github.com/velodrome-finance/slipstream/blob/main/contracts/core/interfaces/pool/ICLPoolState.sol). The relevant selectors are `allPoolsLength()` `0xefde4e64`, `allPools(uint256)` `0x41d1de97`, `token0()` `0x0dfe1681`, `token1()` `0xd21220a7`, `tickSpacing()` `0xd0c93a7c`, `slot0()` `0x3850c7bd`, and `liquidity()` `0x1a686502`; ERC-20 `symbol()` and `decimals()` use `0x95d89b41` and `0x313ce567`. Pool and token metadata are not inferred from the Basic Pool reader.

A pool is selectable only if it is Factory-enumerated, has contract code, returns valid live state, has nonzero `liquidity()` at the current tick, and both token contracts return supported decimals (0–36). In Slipstream's pool-state interface, `liquidity()` is the pool's currently in-range aggregate liquidity, including staked liquidity; it is not total liquidity across every tick and does not establish liquidity available to a hypothetical user range.

## How the preview works

The pool's canonical on-chain `token0` and `token1` order is used. Displayed prices are human-unit token1 per token0, derived from live `sqrtPriceX96` and both on-chain decimal counts. Users enter lower and upper prices in that same orientation and a total budget denominated in token1; the budget is not a USD value.

Input prices are converted to raw ticks with the token-decimal adjustment and rounded outward to the pool spacing: the lower bound rounds down and the upper bound rounds up. Aligned limits are constrained to the supported CL tick range. The planner then applies standard concentrated-liquidity token-amount equations at the live square-root price and scales the result to the entered token1-valued budget. Below the range the preview is token0-only; above it, token1-only; within it, both tokens may be required.

“Current price is within the selected range” uses the live pool tick with an inclusive lower bound and exclusive upper bound. It describes price position only; it does not assert that the hypothetical range has liquidity, nor predict future price movement.

Reads refresh on page load, every 60 seconds, when the page becomes visible, and on demand. The page shows the checked block and read age. A failed refresh or snapshot older than two minutes pauses calculations; the planner never replaces missing data with a demonstration value.

The token amounts in the planner preview are approximate floating-point estimates, not a quote or executable raw-unit amount. The preview excludes fees, slippage, gas, token transfer behavior, exact integer rounding and later pool changes. No APY, return, USD valuation, fees earned or yield is calculated or shown.

## Separate deposit flow

The deposit flow is not part of the read-only planner calculation. It performs a fresh Testnet review, converts the selected budget split to raw units, checks the manager/factory/pool/token state, shows the current dynamic swap fee and tick spacing, and builds one `mint` call for the exact selected pool and rounded tick range. It uses separate wallet prompts for exact token approvals and the mint. The monitor at `/app/cl-positions` remains read-only; the flow does not add collection, decrease-liquidity, gauge or reward actions.

The manager ABI, approval semantics, preflight checks, receipt behavior and known live-RPC limitation are documented in [`CL_TESTNET_DEPOSIT.md`](./CL_TESTNET_DEPOSIT.md). This flow was not exercised with a live wallet transaction during implementation. Unit tests use fake RPC and do not send transactions.

## Live endpoint check

The configured Testnet RPC previously returned chain `31611` and a successful planner snapshot at block `16,735,137`: the official Factory enumerated 29 pools; 19 passed the nonzero-current-liquidity and readable-decimals filters, and 10 were excluded. This is a point-in-time read-path check, not a guarantee that the same pools remain active later. During the deposit implementation, a new direct JSON-RPC POST from the build sandbox was denied; each runtime review therefore must succeed against current state before any wallet action is available.
