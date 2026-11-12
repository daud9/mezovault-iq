# Mezo Testnet Stability Pool

## What is available

The Trove page now shows the connected wallet’s compounded MUSD deposit and accrued BTC collateral gain, alongside the wallet’s Trove snapshot. It also shows total pool MUSD deposits and the Testnet block used for the read. Position values are explicitly tied to that snapshot and marked stale after two minutes until refreshed. These values come from direct Mezo Testnet contract reads; there are no sample values or yield calculations.

The only write operation is a direct MUSD deposit through `provideToSP(uint256)`. If the MUSD allowance is too small, the app prepares a separate approval for exactly the entered amount. After that approval receipt is checked, the user must prepare a fresh deposit review. The app never chains the actions or submits automatically.

## Verified contracts and interface

The [Mezo MUSD Testnet deployment artifact](https://github.com/mezo-org/musd/blob/main/solidity/artifacts/deployments/matsnet/StabilityPool.json) lists Stability Pool proxy `0x1CCA7E410eE41739792eA0A24e00349Dd247680e`, its intended implementation `0x8f0cA419bB1D54AF4Bf6A644f605cC247d6d3E19`, and the deployed ABI. The [Testnet explorer verifies the proxy](https://explorer.test.mezo.org/address/0x1CCA7E410eE41739792eA0A24e00349Dd247680e?tab=contract) as an EIP-1967 transparent proxy; its constructor data names that same implementation. The [implementation explorer page](https://explorer.test.mezo.org/address/0x8f0cA419bB1D54AF4Bf6A644f605cC247d6d3E19?tab=contract) reports exact-match verified `StabilityPool` source. The intended MUSD token is `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`.

The owner-provided implementation address omitted one `f`; the explorer constructor and Mezo deployment artifact agree on `...AF4Bf6A...`. The app uses that sourced address and checks the live EIP-1967 implementation slot against it on every snapshot and preflight.

The checked interface includes `provideToSP(uint256)` (nonpayable; selector `0x78c77a24`), `musd()`, `getCompoundedMUSDDeposit(address)`, `getDepositorCollateralGain(address)`, `getTotalMUSDDeposits()`, and `getCollateralBalance()`. The [verified Solidity source](https://github.com/mezo-org/musd/blob/main/solidity/contracts/StabilityPool.sol) shows that deposits call MUSD `transferFrom`, so an allowance is required. The deposit also sends the depositor’s accrued collateral gain. The app checks the pool’s live `musd()` address and the token’s code, symbol and 18 decimals before displaying values or preparing a transaction.

## Safety checks

Every read and preflight is pinned to one recent block on chain `31611`. It checks the RPC chain ID; nonempty proxy, implementation and MUSD code; the proxy’s EIP-1967 implementation slot; the pool’s MUSD address; token symbol/decimals; wallet balance and allowance; compounded deposit and collateral gain; and total pool MUSD deposits. A snapshot older than two minutes or an unavailable/mismatched read blocks preparation.

The first explicit action prepares and displays the exact contract, calldata, amount, snapshot values, gas estimate and 20% buffered limit after `eth_estimateGas` and an `eth_call` of the exact request at the same block. A second explicit click repeats those checks and simulations. If wallet, balance, allowance, pool state, implementation, calldata or gas has materially changed, the review refreshes and the wallet is not opened. The wallet provider rechecks account and chain before asking the user to approve. The app has no signer and no automatic submit path.

A successful approval receipt must match the exact sender, token, calldata, amount and MUSD `Approval` event. A successful deposit receipt must match the exact sender, pool, calldata and gas, plus matching `UserDepositChanged`, `CollateralGainWithdrawn`, and MUSD `Transfer` events. A hash or successful status alone is not reported as a confirmed deposit.

## Risks and excluded actions

The [Mezo glossary](https://mezo.org/docs/users/resources/glossary/) explains that the Stability Pool absorbs liquidation debt and receives liquidated collateral. Other Troves’ liquidations can therefore consume some or all of a deposit’s MUSD, reducing the compounded balance; BTC collateral gains are uncertain. The pool does not protect the user’s own Trove, and no APY or return is guaranteed. Mezo Testnet assets have no real monetary value.

No withdrawal route is included. The verified source shows that a nonzero `withdrawFromSP(uint256)` checks the lowest Trove’s current collateral ratio against MCR and can revert while an undercollateralized Trove exists. Although its ABI and source logic are available, this sandbox could not independently read current Testnet state, so no withdrawal action was added. Morbit’s third-party vault and the mainnet-only sMUSD savings vault are not used or represented as Testnet options.

## What remains unverified here

Direct JSON-RPC requests to Mezo Testnet returned HTTP 403 in the build sandbox. As a result, the active implementation slot, current pool/account state and a live simulation were not independently observed during this task. The feature is guarded to check these at runtime and remains unavailable if any check or simulation fails. All implementation tests use fake JSON-RPC; no transaction or wallet signature was requested. A proxy administrator could also upgrade the implementation after a successful simulation but before a transaction is included; the preflight cannot eliminate that timing risk.
