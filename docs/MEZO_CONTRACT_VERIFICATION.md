# MezoVault IQ — Mezo Contract Verification Pack

**Status:** Partial explorer/ABI verification — read-only loan and price selectors now confirmed from owner-supplied explorer screenshots; live RPC verification still pending  
**Network:** Mezo Testnet  
**Chain ID:** 31611 (`0x7b7b`)  
**Last reviewed:** 2026-10-31

## Verification policy

An address appearing in official documentation is a documented address, not by itself proof of the currently active proxy implementation or its ABI. Before enabling a contract call, record the proxy address, implementation address, implementation bytecode/code hash, ABI source/version, exact function signature, selector, parameter/return types, and a successful testnet RPC result. Do not infer ABI from Liquity or another Threshold fork.

## Officially documented testnet addresses

| Contract | Testnet address | Evidence | Status |
|---|---|---|---|
| BorrowerOperations proxy | `0xCdF7028ceAB81fA0C6971208e83fa7872994beE5` | Mezo MUSD Redemptions docs | Documented; implementation not yet verified |
| TroveManager proxy | `0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0` | Mezo MUSD Redemptions docs | Documented; implementation not yet verified |
| PriceFeed proxy | `0x86bCF0841622a5dAC14A313a15f96A95421b9366` | Mezo MUSD Redemptions docs and owner-supplied explorer screenshot | Proxy ABI includes `fetchPrice()`, `oracle()`; screenshot shows `fetchPrice()` returning `77298157400000000000000` |
| HintHelpers proxy | `0x4e4cBA3779d56386ED43631b4dCD6d8EacEcBCF6` | Mezo MUSD Redemptions docs | Documented; implementation not yet verified |
| SortedTroves proxy | `0x722E4D24FD6Ff8b0AC679450F3D91294607268fA` | Mezo MUSD Redemptions docs | Documented; implementation not yet verified |
| MUSD token | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` | Mezo MUSD Redemptions docs | Documented; 18 decimals per app configuration/docs |

All addresses above are documented as proxy contracts. Use proxy-aware explorer views and verify the live implementation before relying on an ABI.

## Function evidence from official Mezo documentation

These signatures are documented as integration/API descriptions. They are **not yet marked ABI-verified** until matched to the current testnet implementation ABI and selectors.

| Contract | Documented function | Signature / behavior | Next verification |
|---|---|---|---|
| TroveManager | `getEntireDebtAndColl` | `getEntireDebtAndColl(address)`; returns entire debt and collateral including pending redistribution rewards | Match ABI outputs/order and selector; call against testnet |
| TroveManager | `getCurrentICR` | `getCurrentICR(address,uint256)` | Confirm return units and price parameter semantics |
| TroveManager | `getTroveColl` | `getTroveColl(address)` is referenced by current app | Confirm present in current implementation ABI and test against proxy |
| TroveManager | `getTroveDebt` | `getTroveDebt(address)` is referenced by current app | Confirm present in current implementation ABI and test against proxy |
| BorrowerOperations | `addColl` | `addColl(address,address)`; payable; upper/lower hints; collateral supplied as transaction value | Documented signature and payable behavior; live implementation ABI and selector still pending |
| BorrowerOperations | `withdrawColl` | `withdrawColl(uint256,address,address)` per protocol documentation | Verify exact ABI and risk checks |
| BorrowerOperations | `repayMUSD` | `repayMUSD(uint256,address,address)`; repay amount plus upper/lower hints; subject to minimum remaining debt | Documented signature; live implementation ABI and selector still pending |
| PriceFeed | `fetchPrice()` | Official redemption guide instructs calling PriceFeed `fetchPrice()` through proxy | Documented function; return units, freshness/revert semantics, live implementation ABI and selector pending |



## TroveManager and PriceFeed — explorer evidence (2026-10-31)

Evidence supplied from the Mezo Testnet Explorer by the project owner:

- TroveManager proxy: `0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0`
- Proxy contract name: `TransparentUpgradeableProxy`; explorer identifies implementation contract as `TroveManager` at an implementation address beginning `0x9aAB567966983e95536F...0B07` (full address not legible in supplied screenshot).
- TroveManager implementation method list includes `getTroveColl(address)` selector `0x480cd578`, `getTroveDebt(address)` selector `0xd66a2553`, and `getTroveStatus(address)` selector `0x21e37801`.
- For wallet `0x55039a1999313f5ff80c788cc676bf58fbb40bde`, explorer reads returned `getTroveColl = 0`, `getTroveDebt = 0`, and `getTroveStatus = 0`. This is evidence for that wallet only, not a general claim about all accounts.
- PriceFeed proxy: `0x86bCF0841622a5dAC14A313a15f96A95421b9366`; its implementation contract name is `PriceFeed`, with implementation address beginning `0xec42B37C12b8D73d320f40...29c1` (full address not legible in supplied screenshot).
- PriceFeed implementation method list includes `fetchPrice()` selector `0x0fdb11cf`, `oracle()` selector `0x7dc0d1d0`, and `TARGET_DIGITS()` selector `0x1be5c92f`; `TARGET_DIGITS()` returned `18`.
- `fetchPrice()` returned `77298157400000000000000`, i.e. approximately `$77,298.1574` when interpreted at 18 decimals.
- `oracle()` returned `0x7b7c000000000000000000000000000000000015`. The owner supplied the ABI for that target, showing `decimals()` and Chainlink-compatible `latestRoundData()` methods.
- The oracle target is identified in the explorer as `PriceOracleCaller`; its implementation/role is distinct from the PriceFeed proxy.

### Read-path decision

The app now reads the BTC/USD price from `PriceFeed.fetchPrice()` (18 protocol digits). It calls `PriceFeed.oracle()` only to discover the current oracle target, then reads `decimals()` and `latestRoundData()` from that target for timestamp/freshness metadata. If metadata lookup fails but `fetchPrice()` succeeds, the price remains available while freshness is marked unavailable. The app reads Trove collateral, debt, and status from the TroveManager proxy; status `1` is treated as active, while status `0` is treated as no active Trove.

These are explorer screenshots and owner-supplied ABI evidence, not independent live-RPC tests. Implementation addresses shown truncated in screenshots are intentionally not reconstructed or guessed.

## BorrowerOperations — explorer and implementation ABI evidence (2026-10-31)

Evidence supplied from the Mezo Testnet Explorer by the project owner:

- Proxy: `0xCdF7028ceAB81fA0C6971208e83fa7872994beE5`
- Proxy type: `TransparentUpgradeableProxy` (EIP-1967)
- Proxy source: explorer reports exact-match verification
- Implementation: `0xc05Bf344BD5b58825784326dD3112fB6cC160dcC`
- Implementation source: explorer reports exact-match verification
- Implementation contract name: `BorrowerOperations`
- Solidity compiler: `0.8.24+commit.e11b9ed9`; EVM: `london`; optimizer enabled, 100 runs
- Implementation source path: `contracts/BorrowerOperations.sol`
- The implementation ABI was copied from the explorer and supplied in the conversation.

### ABI-confirmed user transaction functions

| Function | Canonical signature from supplied ABI | Mutability | Explorer selector shown | Notes |
|---|---|---|---|---|
| `addColl` | `addColl(address,address)` | payable | `0x68647db1` | Arguments are `_upperHint`, `_lowerHint`; collateral amount is supplied as native BTC transaction value. |
| `adjustTrove` | `adjustTrove(uint256,uint256,bool,address,address)` | payable | `0x45c842e6` | `_collWithdrawal`, `_debtChange`, `_isDebtIncrease`, `_upperHint`, `_lowerHint`; payable. |
| `repayMUSD` | `repayMUSD(uint256,address,address)` | nonpayable | `0xdc283bb3` | `_amount`, `_upperHint`, `_lowerHint`. |
| `openTrove` | `openTrove(uint256,address,address)` | payable | `0x2f3a6d98` | `_debtAmount`, `_upperHint`, `_lowerHint`; payable. |
| `withdrawColl` | `withdrawColl(uint256,address,address)` | nonpayable | `0x5530273c` | `_amount`, `_upperHint`, `_lowerHint`. |
| `withdrawMUSD` | `withdrawMUSD(uint256,address,address)` | nonpayable | `0xaf8b4fd0` | `_amount`, `_upperHint`, `_lowerHint`. |
| `closeTrove` | `closeTrove()` | nonpayable | `0x0e704d50` | No arguments. |

The canonical signatures and mutability above are taken from the implementation ABI pasted by the user. Selectors are transcribed from the explorer's method list screenshots. This is a strong ABI/interface verification record, but the selectors have not yet been independently recomputed here and no live `eth_call` or transaction simulation has been recorded.

### Important integration implications

1. `addColl` does **not** take a collateral amount argument. The collateral amount must be sent as transaction `value`; the two ABI arguments are sorted-trove hints.
2. `repayMUSD` takes three arguments, not just an amount. The application must calculate and supply valid upper/lower hints.
3. `repayMUSD` is nonpayable. Do not attach native BTC value to repayment.
4. `adjustTrove` is payable and combines collateral withdrawal, debt change, debt-increase/decrease direction, and hints. It must not be called with guessed argument ordering.
5. Do not assume a separate ERC-20 approval is required for repayment until the verified implementation source is inspected for the actual MUSD transfer/burn path.
6. Read/write methods in the explorer are not permission to execute administrative functions. The app must only expose user-facing protocol operations appropriate to the connected borrower.

### Still outstanding for BorrowerOperations

- [ ] Save the complete ABI as a project artifact (for example `src/abi/borrowerOperations.json`) rather than relying on chat history.
- [ ] Independently recompute selectors from canonical signatures and compare with explorer selectors.
- [ ] Inspect verified Solidity implementation for `addColl` and `repayMUSD` internal transfer, hint, and validation behavior.
- [ ] Read proxy getters (`troveManager`, `priceFeed`, `sortedTroves`, `stabilityPoolAddress`, `musd`, `MCR`, `CCR`, `minNetDebt`) through read-only calls and record returned addresses/values.
- [ ] Verify TroveManager, PriceFeed, SortedTroves, HintHelpers, and StabilityPool proxy implementations and ABIs in the same way.
- [ ] Run read-only testnet `eth_call` / `eth_estimateGas` simulations with controlled test inputs before any wallet-signed transaction.

## Known source-code issue in MezoVault IQ

`src/lib/loan.ts` currently:

1. Calls `getTroveColl(address)` and `getTroveDebt(address)` using hardcoded selectors.
2. Calls `decimals()` and `latestRoundData()` on `network.btcUsdOracle` as though that address is a Chainlink-compatible aggregator.
3. Treats a failure in the price read as a failure of the entire loan-position read.

`src/lib/loan.test.ts` uses a fake RPC handler that returns fabricated values for the same selectors. Those tests validate local decoding and control flow, but they do not prove that the live Mezo testnet contracts expose those methods.

The app's current testnet `btcUsdOracle` address is `0x2880aB155794e7179c9eE2e38200202908C17B43`; Mezo's MUSD contract-address documentation separately lists the testnet `PriceFeed` proxy as `0x86bCF0841622a5dAC14A313a15f96A95421b9366`. Do not replace one with the other until their roles and deployed interfaces are confirmed from official oracle documentation and live contract inspection.

## Required evidence before implementation

- [ ] Read `eth_chainId` and confirm 31611.
- [ ] Read `eth_getCode` for each documented proxy; reject empty code.
- [ ] Resolve each proxy implementation using its verified proxy pattern/storage slot or explorer proxy metadata.
- [ ] Read implementation code and record code hash.
- [ ] Obtain ABI from the official Mezo repository artifact or verified explorer implementation page.
- [ ] Match each required function's canonical signature and selector to that ABI.
- [ ] Execute read-only `eth_call` against the proxy using ABI-encoded arguments.
- [ ] Record raw return data, decoded values, block number, timestamp, and wallet address used.
- [ ] Test a wallet with no trove and a wallet with an active trove, if available.
- [ ] Test oracle unavailable/stale behavior independently from loan reads.
- [ ] Only after these checks, implement or enable write transactions.

## Sources

- Mezo MUSD Redemptions / testnet contract addresses: https://testnet.mezo.org/docs/developers/musd/musd-redemptions/
- Mezo MUSD Development Guide / integration examples: https://testnet.mezo.org/docs/developers/musd/
- Official Mezo MUSD repository: https://github.com/mezo-org/musd
- Current app configuration: `src/config/chains.ts`
- Current loan reader: `src/lib/loan.ts`
- Current mocked tests: `src/lib/loan.test.ts`

## Change log

- 2026-10-31: Initial research baseline created. No ABI or live-call verification is claimed. Identified that the current oracle configuration and the documented MUSD PriceFeed proxy are distinct addresses and require role/interface verification.
- 2026-10-31: Cross-checked documented addresses and function signatures against current official Mezo docs and `mezo-org/musd` documentation. Corrected repayment signature to `repayMUSD(uint256,address,address)`. These remain documentation-confirmed, not implementation-ABI- or live-RPC-verified. Live RPC verification could not be completed from this execution environment because outbound DNS/network access to `rpc.test.mezo.org` failed; do not treat this as evidence that the endpoint itself is down.

- 2026-10-31: Owner supplied TroveManager and PriceFeed explorer screenshots plus the PriceOracleCaller ABI. Recorded the three TroveManager read selectors, PriceFeed `fetchPrice()` / `oracle()` selectors, 18-digit price units, and the observed oracle pointer. Updated the app read path to match this evidence; live RPC verification remains pending.
- 2026-10-31: Owner supplied the explorer ABI for the exact-match-verified BorrowerOperations implementation. Recorded implementation address, compiler metadata, exact user-operation signatures, mutability, and explorer selectors. This upgrades BorrowerOperations from documentation-only to explorer/implementation-ABI evidence; live RPC behavior and independent selector recomputation remain pending.

## Application selector registry update (2026-10-31)

The application now centralizes the explorer-transcribed selectors in `src/lib/mezoAbi.ts` rather than duplicating read selectors inside `src/lib/loan.ts`. The registry separates TroveManager, PriceFeed, PriceOracleCaller, and BorrowerOperations selectors. It includes the owner-supplied BorrowerOperations user-operation selectors for future transaction integration.

This is an interface registry, not a transaction executor. No BorrowerOperations write path has been enabled by this change. In particular, `addColl` requires native BTC in transaction `value`, while `repayMUSD` is nonpayable and requires valid sorted-trove hints. HintHelpers and SortedTroves verification, proxy getter checks, live RPC calls, and transaction simulations remain prerequisites before enabling either action.
