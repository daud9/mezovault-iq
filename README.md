# MezoVault IQ

A Mezo Testnet console focused on Trove management, risk analysis, and protocol data.

## Primary tools

- **Trove** — inspect collateral and debt, open a supported position, add BTC collateral, and use the Stability Pool. With a connected wallet that has no active Trove, the prefilled form is visible by default. It starts at the live minimum debt plus a 5% BTC collateral buffer; fresh eligibility, exact-call simulation, and gas checks must pass before one wallet confirmation is enabled. Borrowing more, repayment, withdrawal, and closure are not available.
- **Trove Risk Lab** — compare a live Trove ratio with the current minimum collateral ratio and explore hypothetical BTC price declines. Scenarios are not predictions.

## Overview and protocol data

Overview shows native BTC, MUSD, MEZO, and configured Pool BTC balances separately. **There is no combined portfolio total.** A USD estimate is shown only for native BTC and only while the Mezo Testnet BTC/USD oracle is fresh. MUSD, MEZO, Pool BTC, Trove collateral and debt, Stability Pool deposits, and concentrated-liquidity positions are not included in that estimate.

Safe wallet and pool snapshots update automatically while their page is visible and when you return; explicit address, transaction-hash, and receipt lookups remain user-triggered.

- **Pool Watch** reads reserve ratios for configured Testnet pools; these are not trade quotes or USD liquidity.
- **CL Positions** reads wallet-held and gauge-staked positions. Collect values are simulations, not payouts.
- **CL Planner** estimates token amounts and has a separate Testnet mint flow.
- **Chain Watch** reads public-address MUSD/MEZO balances on configured networks. RPC providers may log queried addresses; balances are unpriced and kept separate by network.
- **Bridge Status** searches the latest 100 indexed Mezo Testnet NTT operations. It does not recover, claim, refund, or prove finality.
- **Activity** combines up to 200 app-submitted hashes stored in this browser with loaded MUSD/MEZO transfer logs. It is not complete wallet history; CSV contains loaded token-log rows only.

## Secondary wallet actions

**Send** supports native BTC, MUSD, MEZO, and a configured Testnet Pool BTC ERC-20 with a review and wallet confirmation. **MUSD Swap** prepares a Testnet quote, simulation, approval, and swap review. The configured Pool BTC token address is not listed in Mezo's reviewed pool documentation; code, symbol, and decimal checks do not establish canonical identity.

**MUSD Pay Links** and the public **MUSD checkout** use a conditional Testnet x402 flow. The installed, lockfile-pinned `@x402/evm` 2.30.0 registry resolves a dollar price on `eip155:31611` to Mezo Testnet MUSD; an integration test checks the generated `PAYMENT-REQUIRED` asset. Mezo's docs list `https://facilitator.vativ.io` as the facilitator endpoint, and its public `/supported` response advertises Testnet MUSD for x402 `exact` with Permit2/EIP-2612 support; the server hard-codes that endpoint and is Testnet-only. The status endpoint reports configuration, not live health. The deployed token ABI and live signed verification/settlement have not been independently verified. Links remain reusable until their 30-day expiry: each use may authorize another payment, and the app does not track paid/consumed status. If an authorization is interrupted or the checkout result is ambiguous, the browser stores a pending marker locally and blocks another signature on that same link in that browser; it offers only explorer/status checking. This is not a server-side payment record, is not shared across devices, and can be lost if browser data is cleared. The server checks verified terms before calling settlement; a mismatched receipt after settlement is ambiguous, so check wallet activity before retrying. The legacy `/app/pay` route only prefills a standard Send transfer.

Writes require a separate wallet action. A successful receipt means execution succeeded in the displayed block; it does not establish transaction finality. Testnet assets have no real monetary value.

## Networks and configuration

The default network is Mezo Testnet (chain ID `31611`, RPC `https://rpc.test.mezo.org`). Mainnet uses chain ID `31612`. MUSD Swap and Pool BTC Send are Testnet-only.

`VITE_DEFAULT_NETWORK` accepts `testnet` or `mainnet`; `VITE_MEZO_TESTNET_RPC` can override the Testnet RPC. Keep private keys, seed phrases, and server secrets out of `VITE_` variables. Dynamic Pay Links use the server-only `PAY_LINK_SECRET`.

## Local development

Requirements: Node.js 20.19 or newer.

```bash
git clone https://github.com/daud9/mezovault-iq.git
cd mezovault-iq
npm install
npm run dev
npm test
npm run typecheck
npm run build
npm run preview
```

For the full route-by-route and wallet-control review, see [the feature audit](docs/FEATURE_AUDIT.md) and [the bridge/x402 implementation notes](docs/BRIDGE_TRACKER_AND_X402.md). The rate limiter is process-local and best-effort, not a shared replay or quota guarantee. Tests use local and mocked data; they do not certify a live wallet, transaction, deployed MUSD ABI, or hosted x402 settlement.
