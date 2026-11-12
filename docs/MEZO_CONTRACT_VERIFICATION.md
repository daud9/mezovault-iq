# MezoVault IQ — Mezo Contract Verification Pack

**Status:** Historical evidence is retained where labeled. The current app supports Testnet-only, wallet-confirmed `openTrove` and active-Trove `addColl` paths; other Trove transactions remain disabled.
**Network:** Mezo Testnet
**Chain ID:** 31611 (`0x7b7b`)
**Last reviewed:** 2026-11-12

## Verification policy

An official address, published deployment artifact, and proxy explorer verification are distinct evidence. For `openTrove` and `addColl`, the current Mezo `matsnet` artifact and `BorrowerOperations.sol` source establish the exact ABI and semantics; the Testnet explorer verifies the proxy contract source. The live EIP-1967 implementation slot was not independently re-resolved from this sandbox because `https://rpc.test.mezo.org` returned HTTP 403 (`error code: 1010`). Runtime use therefore still requires the app’s fresh chain/code/read/simulation checks to pass. Do not infer ABI from Liquity or another Threshold fork.

## Officially documented testnet addresses

| Contract | Testnet address | Evidence | Status |
|---|---|---|---|
| BorrowerOperations proxy | `0xCdF7028ceAB81fA0C6971208e83fa7872994beE5` | Mezo MUSD Redemptions docs and published `matsnet` deployment artifact | Artifact also lists implementation `0xc05Bf344BD5b58825784326dD3112fB6cC160dcC`; explorer verifies proxy source; current implementation slot not resolved from this sandbox |
| TroveManager proxy | `0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0` | Mezo MUSD Redemptions docs | Documented; implementation not yet verified |
| PriceFeed proxy | `0x86bCF0841622a5dAC14A313a15f96A95421b9366` | Mezo MUSD Redemptions docs and owner-supplied explorer screenshot | Proxy ABI includes `fetchPrice()`, `oracle()`; screenshot shows `fetchPrice()` returning `77298157400000000000000` |
| HintHelpers proxy | `0x4e4cBA3779d56386ED43631b4dCD6d8EacEcBCF6` | Mezo MUSD Redemptions docs | Documented; implementation not yet verified |
| SortedTroves proxy | `0x722E4D24FD6Ff8b0AC679450F3D91294607268fA` | Mezo MUSD Redemptions docs | Documented; implementation not yet verified |
| MUSD token | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` | Mezo MUSD Redemptions docs | Documented; 18 decimals per app configuration/docs |

The TroveManager, BorrowerOperations, PriceFeed, HintHelpers, and SortedTroves rows are proxy endpoints; MUSD is a token contract. Use proxy-aware explorer views and distinguish documented proxy source from a live implementation-slot check.

## Function evidence from official Mezo documentation

The table separates documentation from the current published Testnet deployment artifact. The app implements `openTrove` and the narrower `addColl` collateral-only call; other functions remain out of scope even where their ABI appears in the same artifact.

| Contract | Documented function | Signature / behavior | Next verification |
|---|---|---|---|
| TroveManager | `getEntireDebtAndColl` | `getEntireDebtAndColl(address)`; returns entire debt and collateral including pending redistribution rewards | Match ABI outputs/order and selector; call against testnet |
| TroveManager | `getCurrentICR` | `getCurrentICR(address,uint256)` | Confirm return units and price parameter semantics |
| TroveManager | `getTroveColl` | `getTroveColl(address)` is referenced by current app | Confirm present in current implementation ABI and test against proxy |
| TroveManager | `getTroveDebt` | `getTroveDebt(address)` is referenced by current app | Confirm present in current implementation ABI and test against proxy |
| BorrowerOperations | `openTrove` | `openTrove(uint256,address,address)`; payable; `_debtAmount`, upper/lower hints; BTC collateral is `msg.value` | Current published `matsnet` ABI and source; selector recomputed as `0x2f3a6d98`; implemented only for opening a new Trove |
| BorrowerOperations | `addColl` | `addColl(address,address)`; payable; upper/lower hints; BTC collateral is `msg.value` | Current published `matsnet` ABI and source; selector recomputed as `0x68647db1`; implemented only as an active-Trove BTC addition |
| BorrowerOperations | `TroveCreated` event | `TroveCreated(address indexed _borrower,uint256 arrayIndex)` | Current published artifact; success receipt requires matching event from the BorrowerOperations proxy and reviewed wallet |
| BorrowerOperations | Other user operations | `adjustTrove`, `repayMUSD`, `withdrawColl`, `withdrawMUSD`, `closeTrove` appear in the artifact | Not implemented here; operation-specific review and separate authorization remain required |
| PriceFeed | `fetchPrice()` | Official redemption guide and explorer evidence; current read layer calls through the proxy | Used for BTC/USD reads; runtime code/return checks apply; current implementation slot is not independently resolved here |



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

The openTrove ABI and address were rechecked against Mezo's [published Testnet BorrowerOperations artifact](https://github.com/mezo-org/musd/blob/main/solidity/artifacts/deployments/matsnet/BorrowerOperations.json) and [verified Solidity source](https://github.com/mezo-org/musd/blob/main/solidity/contracts/BorrowerOperations.sol). The artifact address equals the configured proxy. `viem` recomputation of `openTrove(uint256,address,address)` gives selector `0x2f3a6d98`, matching the repository selector. This verifies the interface source, not the current proxy implementation slot; the runtime simulation is still mandatory.

### Important integration implications

1. `addColl` does **not** take a collateral amount argument. The collateral amount must be sent as transaction `value`; the two ABI arguments are sorted-trove hints.
2. `repayMUSD` takes three arguments, not just an amount. The application must calculate and supply valid upper/lower hints.
3. `repayMUSD` is nonpayable. Do not attach native BTC value to repayment.
4. `adjustTrove` is payable and combines collateral withdrawal, debt change, debt-increase/decrease direction, and hints. It must not be called with guessed argument ordering.
5. Do not assume a separate ERC-20 approval is required for repayment until the verified implementation source is inspected for the actual MUSD transfer/burn path.
6. Read/write methods in the explorer are not permission to execute administrative functions. The app must only expose user-facing protocol operations appropriate to the connected borrower.

### Outstanding evidence for future operations

- [ ] Re-resolve the live EIP-1967 implementation slot and implementation bytecode/code hash when the public RPC is accessible.
- [ ] Review operation-specific validation, hints, and wallet flows before enabling adjust, repay, withdraw, close, or any other action.
- [ ] Independently verify related proxy implementations (TroveManager, PriceFeed, SortedTroves, HintHelpers, and StabilityPool) before relying on broader transaction behavior.
- [ ] No transaction was signed or sent during this implementation; tests use fake JSON-RPC and never call `eth_sendTransaction`.

## Historical loan-read issues from the initial audit (resolved)

The 2026-10-31 audit found that the then-current reader mixed up the direct `PriceOracleCaller` with the Mezo `PriceFeed` proxy and used hardcoded selectors. The read path was subsequently updated. The current `src/lib/loan.ts` reads TroveManager status/collateral/debt with the selector registry, obtains BTC/USD using `PriceFeed.fetchPrice()`, and follows `PriceFeed.oracle()` for `decimals()` and `latestRoundData()` freshness metadata. The open-Trove preflight uses the stricter same-block reader in `src/lib/openTroveRead.ts` and blocks on missing, stale, wrong-chain, or incomplete values.

The older mocked `src/lib/loan.test.ts` cases validate local decoding and control flow, not live RPC behavior. This repository therefore distinguishes fake-RPC tests from a live transaction; no live transaction is claimed for this implementation.

## Evidence checklist for future operations

The checklist below applies to unsupported Trove writes and other contracts, not to the `openTrove` and `addColl` interfaces documented here. A future action must independently resolve proxy implementation/source, validate selectors and mutability, read its required parameters at a coherent block, and test both success and fail-closed behavior before any action is added.

- [ ] Re-resolve the live EIP-1967 implementation slot and implementation bytecode/code hash when the Testnet RPC is accessible.
- [ ] Review operation-specific validation, hints, and wallet flows before enabling adjust, repay, withdraw, close, or any other action.
- [ ] Independently verify related proxy implementations (TroveManager, PriceFeed, SortedTroves, HintHelpers, and StabilityPool) before relying on broader transaction behavior.
- [ ] Keep tests on fake JSON-RPC and assert they never invoke `eth_sendTransaction`; do not send a live transaction as part of implementation/testing.

## Sources

- Mezo MUSD Redemptions / testnet contract addresses: https://testnet.mezo.org/docs/developers/musd/musd-redemptions/
- Mezo MUSD Development Guide / integration examples: https://testnet.mezo.org/docs/developers/musd/
- Official Mezo MUSD repository: https://github.com/mezo-org/musd
- Published Testnet BorrowerOperations artifact: https://github.com/mezo-org/musd/blob/main/solidity/artifacts/deployments/matsnet/BorrowerOperations.json
- Published BorrowerOperations source: https://github.com/mezo-org/musd/blob/main/solidity/contracts/BorrowerOperations.sol
- Mezo Testnet BorrowerOperations proxy explorer: https://explorer.test.mezo.org/address/0xCdF7028ceAB81fA0C6971208e83fa7872994beE5?tab=contract
- Current app configuration: `src/config/chains.ts`
- Current loan reader: `src/lib/loan.ts`
- Current mocked tests: `src/lib/loan.test.ts`

## Change log

- 2026-10-31: Initial research baseline created. No ABI or live-call verification is claimed. Identified that the current oracle configuration and the documented MUSD PriceFeed proxy are distinct addresses and require role/interface verification.
- 2026-10-31: Cross-checked documented addresses and function signatures against current official Mezo docs and `mezo-org/musd` documentation. Corrected repayment signature to `repayMUSD(uint256,address,address)`. These remain documentation-confirmed, not implementation-ABI- or live-RPC-verified. Live RPC verification could not be completed from this execution environment because outbound DNS/network access to `rpc.test.mezo.org` failed; do not treat this as evidence that the endpoint itself is down.

- 2026-10-31: Owner supplied TroveManager and PriceFeed explorer screenshots plus the PriceOracleCaller ABI. Recorded the three TroveManager read selectors, PriceFeed `fetchPrice()` / `oracle()` selectors, 18-digit price units, and the observed oracle pointer. Updated the app read path to match this evidence; live RPC verification remains pending.
- 2026-10-31: Owner supplied the explorer ABI for the exact-match-verified BorrowerOperations implementation. Recorded implementation address, compiler metadata, exact user-operation signatures, mutability, and explorer selectors. This upgraded BorrowerOperations from documentation-only to explorer/implementation-ABI evidence. At that time live RPC behavior and independent selector recomputation were pending; later 2026-11-12 sections recompute `openTrove` and `addColl` from official source signatures, while live implementation-slot verification remains pending.

## Application selector registry update (2026-10-31)

The application now centralizes the explorer-transcribed selectors in `src/lib/mezoAbi.ts` rather than duplicating read selectors inside `src/lib/loan.ts`. The registry separates TroveManager, PriceFeed, PriceOracleCaller, and BorrowerOperations selectors. It includes the owner-supplied BorrowerOperations user-operation selectors for future transaction integration.

At the time this selector registry was added, it was interface-only. The later `openTrove` and `addColl` flows use only their separately reviewed selectors; `repayMUSD`, `adjustTrove`, `withdrawColl`, and `closeTrove` remain disabled and require independent operation-specific verification before any future integration.

## Open-Trove planner and wallet-confirmed open-only flow (2026-11-12)

The Trove page exposes editable BTC collateral and requested MUSD values when the connected wallet has no active position. A read-only planner computes a preview from the current protocol snapshot. A separate action supports opening a new Trove on Mezo Testnet chain `31611`; active-Trove collateral addition is covered by the later addColl section. Borrowing more, repaying, withdrawing, closing, and liquidation are not exposed.

### Source and ABI evidence

The configured BorrowerOperations proxy is `0xCdF7028ceAB81fA0C6971208e83fa7872994beE5`. Mezo's [published `matsnet` deployment artifact](https://github.com/mezo-org/musd/blob/main/solidity/artifacts/deployments/matsnet/BorrowerOperations.json) records the same address and the payable ABI entry `openTrove(uint256,address,address)` with `_debtAmount`, `_upperHint`, and `_lowerHint`. The [published BorrowerOperations source](https://github.com/mezo-org/musd/blob/main/solidity/contracts/BorrowerOperations.sol) declares the same payable function and calls `_openTrove(msg.sender, msg.sender, _debtAmount, _upperHint, _lowerHint)`. The selector was independently recomputed from the canonical signature as `0x2f3a6d98` and matches `src/lib/mezoAbi.ts`. The explorer reports exact-match-verified EIP-1967 proxy source at the [Testnet BorrowerOperations address](https://explorer.test.mezo.org/address/0xCdF7028ceAB81fA0C6971208e83fa7872994beE5?tab=contract).

I also recomputed the preflight getter selectors from Mezo's published BorrowerOperations, TroveManager, PriceFeed, and GovernableVariables `matsnet` artifacts. The configured BorrowerOperations, TroveManager, and PriceFeed addresses match those artifacts. The call selectors used by the preflight match: `minNetDebt()` `0x969c2452`, `borrowingRate()` `0xb5b8453e`, `governableVariables()` `0x5556a7ce`, `MUSD_GAS_COMPENSATION()` `0x7af110ba`, `MCR()` `0x794e5724`, `CCR()` `0x5733d58f`, `getEntireSystemColl()` `0x887105d3`, `getEntireSystemDebt()` `0x795d26c3`, TroveManager `checkRecoveryMode(uint256)` `0x4e443d9e`, and GovernableVariables `feeExemptAccounts(address)` `0x42c16ed1`. TroveManager position getters and PriceFeed `fetchPrice()` / `oracle()` likewise match the current artifacts; no live RPC responses are claimed here.

The source shows that BTC collateral is `msg.value`; `_debtAmount` is the requested MUSD amount. The contract updates system interest and fetches the price, requires the caller's Trove not be active, charges the live borrowing fee in Normal Mode unless the account is fee-exempt, enforces minimum net debt, checks ICR against live MCR or CCR, and checks projected TCR against CCR in Normal Mode. The reserve is added to form composite debt. The call includes zero upper/lower hints; exact-call simulation at the current block must pass before the wallet opens, so a deployment/state that rejects those hints fails closed.

The proxy explorer page verifies the proxy source and shows a constructor implementation address, but that is not evidence of the *current* proxy implementation slot. A direct live `eth_chainId` and `eth_getStorageAt` check against `https://rpc.test.mezo.org` returned HTTP 403 (`error code: 1010`) from this build sandbox. The official artifact/source supports ABI selection, while the app still requires live runtime code, same-block parameter, wallet-position, gas, and simulation checks; it does not claim that the current implementation slot was independently re-resolved here.

### Fresh review and wallet safeguards

1. The planner uses exact integer math and current same-block protocol values: minimum net debt, borrowing rate, gas reserve, MCR, CCR, system collateral/debt, fee-exempt status, oracle price/freshness, and Normal/Recovery Mode. It rejects invalid precision, zero/negative values, uint256 overflow, stale or incomplete inputs, and failing collateral/system-ratio checks.
2. The first button prepares a fresh review. `readOpenTroveSnapshot` verifies the Testnet chain and code and pins its calls to one block. Trove status, collateral, and debt are read for the connected wallet at that same block; active, non-empty, and unknown states block the action. At the same block, `eth_estimateGas` and an exact `eth_call` simulation use the requested debt calldata, native BTC `value`, and 20% gas buffer. The screen shows BTC collateral, requested MUSD, fee, net/composite debt, live BTC/USD, ICR, system mode, contract, calldata, and gas.
3. A second explicit button reruns all fresh reads, eligibility checks, estimate, and simulation. The wallet is requested only if the new transaction and all displayed material terms match the prepared review and the review is no more than 20 seconds old. If inputs, account, live terms, or gas change, the preview refreshes and the wallet is not opened. The existing wallet provider independently rechecks selected account and chain immediately before calling the injected provider. There is no local signer or render/effect-driven submission; the user's own wallet approval is required to submit.
4. Receipt checking is a separate explicit read. It verifies receipt hash, sender, contract, transaction calldata, native BTC value, gas limit, block, and status against the reviewed transaction. A successful receipt must also contain the BorrowerOperations `TroveCreated(address,uint256)` event from the expected proxy with the reviewed wallet as indexed borrower. Pending or mismatched data is never presented as success.

The calculator, execution preflight, and receipt checks are covered by fake-RPC unit tests. The tests assert same-block reads, variable planner calldata/value, invalid/unsafe input rejection, stale state and RPC chain failures, active Trove rejection, simulation/gas failures, review mismatch, exact receipt matching including gas and `TroveCreated`, and that preparation never invokes `eth_sendTransaction`. No transaction was sent during this implementation; the historical fixed 0.05 BTC / 3,000 MUSD test described earlier in the repository is not a current fixed action or default.

## Existing-Trove add-collateral flow (2026-11-12)

The active-position Trove view now offers a separate BTC-only `addColl` action. The official [matsnet BorrowerOperations artifact](https://github.com/mezo-org/musd/blob/main/solidity/artifacts/deployments/matsnet/BorrowerOperations.json) records the configured Testnet BorrowerOperations address `0xCdF7028ceAB81fA0C6971208e83fa7872994beE5` and the payable ABI entry `addColl(address,address)`. The canonical selector is `0x68647db1`; `src/lib/mezoAbi.test.ts` recomputes it from the canonical signature using `viem`. The [published `IBorrowerOperations` interface](https://github.com/mezo-org/musd/blob/main/solidity/contracts/interfaces/IBorrowerOperations.sol) and [BorrowerOperations source](https://github.com/mezo-org/musd/blob/main/solidity/contracts/BorrowerOperations.sol) confirm the two arguments are upper/lower sorted-Trove hints, not an amount. `addColl` forwards the caller as borrower, and the entered BTC amount is attached as native `msg.value`.

The source routes `addColl` through `_adjustTrove` with zero withdrawal and zero debt change. `_getCollChange` treats nonzero `msg.value` as collateral increase; a zero-value request fails the nonzero-adjustment check. The operation requires an active Trove and public caller/borrower match. Normal Mode enforces the updated ICR and system TCR checks; Mezo source allows a pure collateral increase in Recovery Mode. The app therefore reads status, collateral, and debt for the connected account at one pinned block, requires active status `1` and nonzero collateral/debt, verifies BorrowerOperations code at that block, and then runs `eth_estimateGas` plus `eth_call` with the exact `addColl` calldata/value. It repeats the full read and simulation on the separate final-click path and opens the wallet only if the reviewed amount, existing position, and gas remain the same.

The call uses zero/zero hints. Mezo's [SortedTroves source](https://github.com/mezo-org/musd/blob/main/solidity/contracts/SortedTroves.sol) confirms `reInsert` falls through to `_findInsertPosition`; when no valid hints are supplied it searches down from the list head. That fallback can scale with list length, so the live gas estimate and exact simulation are mandatory and fail closed. The successful receipt must match the exact sender, proxy, calldata, BTC value and gas limit, and contain a `TroveUpdated` log indexed to the same borrower with `BorrowerOperation.adjustTrove` operation value `2`.

The [BorrowerOperations source](https://github.com/mezo-org/musd/blob/main/solidity/contracts/BorrowerOperations.sol) emits `TroveUpdated` inside `_adjustTrove`; the [IBorrowerOperations interface](https://github.com/mezo-org/musd/blob/main/solidity/contracts/interfaces/IBorrowerOperations.sol) defines the matching event signature. The successful receipt is therefore required to contain that event from the BorrowerOperations proxy (not merely any same-signature event), indexed to the reviewed wallet, with `BorrowerOperation.adjustTrove` value `2`.

The Testnet RPC returned HTTP 403 (`error code: 1010`) from this sandbox. The published artifact and Solidity source verify the call shape and semantics, but this environment could not independently re-resolve the live EIP-1967 implementation slot or the connected wallet's current Trove. No wallet session was opened and no transaction was signed, sent, or simulated against a live wallet here. The app requires the fresh runtime checks above before any wallet request; automated tests use fake JSON-RPC and assert no `eth_sendTransaction` call.


## Read-only Mezo Testnet CL position monitor (2026-11-12)

The app now has a wallet-specific, read-only Slipstream concentrated-liquidity NFT monitor, separate from the existing fungible Basic Pool watcher. Deployment addresses come from the [official Mezo contract reference](https://mezo.org/docs/users/resources/contracts-reference/) and [Mezo Pools documentation](https://mezo.org/docs/developers/features/mezo-pools/). The read interfaces were cross-checked against the [Slipstream position-manager interface](https://github.com/velodrome-finance/slipstream/blob/main/contracts/periphery/interfaces/INonfungiblePositionManager.sol), [factory interface](https://github.com/velodrome-finance/slipstream/blob/main/contracts/core/interfaces/ICLFactory.sol), [pool state interface](https://github.com/velodrome-finance/slipstream/blob/main/contracts/core/interfaces/pool/ICLPoolState.sol), and [gauge interface](https://github.com/velodrome-finance/slipstream/blob/main/contracts/gauge/interfaces/ICLGauge.sol).

At Mezo Testnet chain ID `31611`, `eth_getCode` was read at block `16,734,912` for the directly used deployment contracts and their documented implementations. The byte lengths and Keccak-256 hashes were:

| Contract | Address | Bytes | Keccak-256 |
| --- | --- | ---: | --- |
| CLFactory | `0x7B61BC8Aa460476d142F1CD107A47297002f69ff` | 4,936 | `0xa54c3f53d53acdb33139eb6919294eb1da7dcce03fb5aba9448052d0e7606a34` |
| CL pool implementation | `0xfB28eA9eC9f01775bD42E92BafeE9584808419CD` | 24,215 | `0x44720b687418a376fe820f926d81a41a9af94f2f33339a496a4e8b338ae4f810` |
| NonfungiblePositionManager | `0x9B753e11bFEd0D88F6e1D2777E3c7dac42F96062` | 23,510 | `0x071af6bf4d327858890389ca0f62bad9731e3f497eae1d6a50cac442a1d44030` |
| CLGaugeFactory | `0x5b0dbAfdcE363d6662F36163D91862B0a3808373` | 3,554 | `0x9c1ed29096b7b40e4f57d4514e7040bca1d044d60ccab38493f3e5f474c987cb` |
| CL gauge implementation | `0x1aE1a27b709A5eb4BbcF7B7AA2c28620c593a3EE` | 12,419 | `0x37bab03fd2ca7214f75282611d622d0bf0e36999b88e50732d20770700809d84` |

A live selector check at block `16,734,856` found an important deployment-specific difference: `getPool(address,address,int24)` (`0x28af8d0b`) returned the deployed pool `0x76c4311ca6846deaefab0b20221f84c653a41e03` for an on-chain position with tick spacing `100`; the `uint24` overload (`0x1698ee82`) reverted. The reader therefore uses the signed `int24` overload rather than relying on the upstream source’s additional `uint24` overload. The factory reported 29 pools, and the position manager reported 158 NFTs in the live checks.

The complete TypeScript reader was then exercised against live RPC at block `16,734,888`, starting from an NFT owner discovered through ERC-721 enumeration. It read all 29 factory pools and found 18 positions for that transient owner, including one gauge-staked NFT; all 18 `collect((uint256,address,uint128,uint128))` calls (`0xfc6f7865`) returned successfully as `eth_call` simulations. The temporary owner address was not stored in application configuration or this log. In the app, reads are pinned to one block and use only the currently connected wallet address.

The monitor reads factory enumeration, wallet NFT enumeration and `positions(uint256)`, pool `getPool(address,address,int24)`, `slot0()` and `gauge()`, and gauge staked-token/reward views where those calls succeed. A simulated `collect` result is explicitly labelled as an estimate; if it cannot be simulated, only stored owed amounts are shown with that limitation. Gauge schedule or earned fields are displayed only when their direct reads are available. The feature contains no transaction submission path and does not approve, deposit, decrease liquidity, collect, stake, unstake, or claim. Focused CL-reader tests cover pinned-block calls, gauge-staked and wallet-held NFTs, range boundaries, explicit simulation labeling, and wrong-chain failure; the full test suite and production build pass.

## Read-only CL range planner (2026-11-12)

The app route `/app/cl-planner` uses the same official Testnet CL Factory deployment already recorded above; it does not add or guess contract addresses. The reader verifies chain `31611` and Factory bytecode, enumerates pools from `allPoolsLength()` / `allPools(uint256)`, and pins pool/token calls to the checked block. It reads canonical token addresses, per-pool `tickSpacing()`, `slot0()` (`sqrtPriceX96` and current tick), pool `liquidity()`, and ERC-20 symbol/decimals. Method interfaces are referenced in [Slipstream ICLFactory](https://github.com/velodrome-finance/slipstream/blob/main/contracts/core/interfaces/ICLFactory.sol), [ICLPool](https://github.com/velodrome-finance/slipstream/blob/main/contracts/gauge/interfaces/ICLPool.sol), and [ICLPoolState](https://github.com/velodrome-finance/slipstream/blob/main/contracts/core/interfaces/pool/ICLPoolState.sol); the feature's full formula and source notes are in `docs/CL_TESTNET_PLANNER.md`.

Only factory-listed pools with contract code, nonzero current `liquidity()`, and readable supported token decimals are selectable. The user enters token1-per-token0 price bounds and a token1-valued budget. Price bounds are rounded outward to the pool spacing; token amounts are approximate human-unit results from live `sqrtPriceX96` and the standard CL amount formulas. “In range” is based on current tick with the conventional inclusive lower and exclusive upper bounds. The UI makes clear that pool-wide current liquidity does not guarantee liquidity in the user's hypothetical range, and it withholds calculations after a failed refresh or a snapshot older than two minutes.

The planner card remains read-only and does not connect a wallet, build a transaction, sign, approve, mint, deposit, stake or collect. A separate Testnet-only wallet deposit panel was added later and is documented in `docs/CL_TESTNET_DEPOSIT.md`; the CL NFT monitor remains read-only. Focused fake-RPC planner tests cover pool enumeration at one block, zero-liquidity exclusion, decimal-aware price, negative tick alignment, one-sided/in-range token composition, tick limits and wrong-chain rejection; those tests do not claim live results or transactions. Separately, the configured Testnet RPC was read at block `16,735,137`: chain ID `31611`, 29 factory pools, 19 selectable pools, and 10 excluded pools. See `docs/CL_TESTNET_PLANNER.md` for the point-in-time smoke-check record.


## Explicit Testnet CL position mint flow (2026-11-12)

The `/app/cl-planner` route now keeps its planning card read-only and includes a separate wallet-confirmed CL position mint panel. The official [Mezo Pools page](https://mezo.org/docs/developers/features/mezo-pools/) lists Testnet Factory `0x7B61BC8Aa460476d142F1CD107A47297002f69ff` and Nonfungible Position Manager `0x9B753e11bFEd0D88F6e1D2777E3c7dac42F96062`. The [Testnet explorer manager page](https://explorer.test.mezo.org/address/0x9B753e11bFEd0D88F6e1D2777E3c7dac42F96062?tab=contract) reports exact-match verified `NonfungiblePositionManager` source compiled with Solidity `0.7.6+commit.7338295f`, optimization 100 runs, and constructor Factory argument matching the official address. The earlier live code hash at block `16,734,912` is recorded above.

The `MintParams` field order and return tuple were checked against [Slipstream INonfungiblePositionManager](https://github.com/velodrome-finance/slipstream/blob/main/contracts/periphery/interfaces/INonfungiblePositionManager.sol): `(address,address,int24,int24,int24,uint256,uint256,uint256,uint256,address,uint256,uint160)` and `(tokenId,liquidity,amount0,amount1)`. Canonical selector is `0xb5007d1f`. The [implementation](https://github.com/velodrome-finance/slipstream/blob/main/contracts/periphery/NonfungiblePositionManager.sol) calls `createPool` only when `sqrtPriceX96 != 0`; the app sets it to zero and checks the existing pool mapping so it cannot request pool creation. [`LiquidityManagement`](https://github.com/velodrome-finance/slipstream/blob/main/contracts/periphery/base/LiquidityManagement.sol) sets callback payer to `msg.sender`; [`PeripheryPayments.pay`](https://github.com/velodrome-finance/slipstream/blob/main/contracts/periphery/base/PeripheryPayments.sol) pulls tokens with `safeTransferFrom`. The app therefore requests separate exact approvals to the manager only when allowances are short. The current pool fee is read from Factory `getSwapFee(address)` in pips and is shown as context, not passed to mint.

Before a wallet prompt, one-block reads check chain `31611`, manager/factory/pool/token code, manager `factory()`, canonical pool token order and spacing, the signed `getPool(address,address,int24)` lookup, initialized `slot0`, active liquidity, token decimals, live pool fee, balances and allowances. Desired amounts are floored to raw units and capped to the exact token1-valued budget at the checked spot; minimums reflect the selected slippage tolerance. Approval and mint requests each require a separate explicit click and are simulated with `eth_estimateGas` plus `eth_call` before opening the connected wallet. The existing WalletProvider rechecks sender and chain immediately before `eth_sendTransaction`. The UI shows successful status only after a receipt reports `0x1`; it does not claim a simulation is an execution.

Focused tests in `src/lib/clDeposit.test.ts` use a fake RPC and assert exact tuple encoding, signed ticks, raw units, minimums, dynamic-fee and factory reads, balances/allowances, simulation bounds, stale review, wrong chain, and that no `eth_sendTransaction` occurs. No transaction was sent in implementation or tests. The build sandbox’s direct POST to the configured Testnet RPC was denied during this change, so no new live block/hash smoke check was available; the app requires fresh runtime checks and simulation and blocks wallet prompts when they fail. Full test, production build and diff-check results are recorded in the task handoff. See [`CL_TESTNET_DEPOSIT.md`](./CL_TESTNET_DEPOSIT.md) for the operational flow.
