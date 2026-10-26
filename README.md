# MezoVault IQ

**Live app:** https://mezovault-iq.daud9.deno.net/
**Repository:** https://github.com/daud9/mezovault-iq

MezoVault IQ is a Mezo ecosystem web app for wallet-based asset visibility, on-chain payments, transaction tracking, and evidence-based DeFi intelligence. It runs on **Mezo Testnet** (chain ID 31611).

Every balance and transaction shown in the app is read from the chain or from the transaction receipt. Where a figure cannot be verified, the app shows it as unavailable instead of estimating it.

---

## Working features

| Feature | Status |
| --- | --- |
| Wallet connection (EIP-1193 and EIP-6963 injected wallets) with network check and account-change handling | Implemented |
| Live BTC (native gas token) balance | Implemented |
| Live MUSD balance (contract checked on-chain: code, symbol, decimals) | Implemented |
| MEZO balance (shown only if the on-chain token check passes on the connected network) | Implemented, tested on Mezo Testnet |
| Send BTC or MUSD: review screen, wallet confirmation, receipt-verified status | Implemented |
| Send MEZO (same flow, only when the on-chain token check passes) | Implemented, tested on Mezo Testnet |
| Payment-request links (asset, amount, recipient and network in the link; copy and share) | Implemented, tested on Mezo Testnet |
| Payment page at `/app/pay` that validates a link and sends the payer to the review step. Nothing is sent from this page | Implemented |
| Support card (review or enter amount manually for BTC, MUSD; MEZO when verified) | Implemented |
| Activity page: transactions sent from the app (hash, status, block, explorer link) and MUSD/MEZO transfer logs from the last 5,000 blocks | Implemented |
| Loan position read for a BTC-collateralised MUSD loan (collateral, debt, ratio from the official oracle price) | Read-only |
| Liquidity-pool position read for the three official testnet basic pools | Read-only |
| Verified contract directory with explorer links | Implemented |
| IQ Strategy Engine, allocation planner and simulation calculator | Implemented, see scope below |

### Tested on Mezo Testnet

- **BTC transfer, confirmed on-chain.** Sent 0.0001 BTC from the app's review screen to a second address. Transaction `0x350755cfcb66c7c1fdd25c56b29ecc26f335cb5498c850f3f5d71e530a41dde3`, confirmed in block 16376406. The app showed the status as confirmed only after the receipt reported success.
- **Second BTC transfer.** Sent 0.001 BTC; the Activity page shows it as live from chain at block 16368801. Transaction `0xb99ffa8e4c02c1b2f4128f1078e92f83a694c9944305ca7041d97c87aada1b96`.
- **MEZO transfer, confirmed.** Sent 1 MEZO; the Activity page shows it as live from chain at block 16375491. Transaction `0xf8deebc206d05cfe4f8bf2b6ca6dc820fc4c01eff2823cb98f31686ececf2dff`. The same on-chain check that enables MEZO sending also read the wallet's MEZO balance (100 MEZO) on Mezo Testnet.
- **Payment-request link.** A link generated in Mezo Pay opened the payment page with the recipient, token (BTC) and amount (0.0001) filled in, and the payer confirmed it in the review step.
- **Activity page.** Lists app-sent transactions with hash, timestamp, status, block number and explorer link.
- **Automated unit tests.** 239 pass (`npm test`). They cover amount parsing, transfer encoding, receipt handling, payment-link validation, wallet state, RPC error handling and token balance formatting.

### Still under development (not operational)

- **Smart Vault deposits and withdrawals.** No testnet vault contract has been verified, so no vault can be used.
- **Executable swaps.** The official testnet router and pools are verified and listed in the app, but no swap quote or swap transaction is implemented.
- **Verified live yield, TVL and strategy data.** The app shows these as unavailable. No APY, TVL or strategy is listed.
- **Advanced allocation and automated investing.** The allocation planner works only from verified strategies, and none is verified yet, so it produces no live allocation.
- **Autopilot and automated rebalancing.** Not implemented. The Autopilot page is a status and roadmap page only.
- **Loan changes** (open, adjust, repay, close). Read-only. Changes must be made in the official Mezo borrow page.

---

## Technology stack

Taken from `package.json` and the source tree.

- **Language and UI:** TypeScript, React 19, react-router-dom 7, lucide-react icons
- **Build:** Vite 6 with `@vitejs/plugin-react`, Tailwind CSS 4 via `@tailwindcss/vite`
- **Blockchain access:** no wallet SDK. The app calls the injected EIP-1193 provider directly (`window.ethereum`, with EIP-6963 discovery). Chain reads use JSON-RPC over `fetch`. ABI encoding and Keccak-derived selectors are implemented in `src/lib/`.
- **Tests:** Node's built-in test runner through `tsx`
- **Hosting:** Deno Deploy, serving the static build from `dist/`
- **Local static server (optional):** `server/main.ts`, using `@std/http` from JSR. It is used only with `deno task start` and is not used by the production static deployment.

---

## Mezo Testnet configuration

Values from `src/config/chains.ts`. Sources are listed beside each value.

| Item | Value | Source |
| --- | --- | --- |
| Network name | Mezo Testnet | Mezo developer guide |
| Chain ID | 31611 (`0x7b7b`) | Mezo developer guide |
| RPC endpoint | `https://rpc.test.mezo.org` | Mezo developer guide |
| Explorer | `https://explorer.test.mezo.org/` | Mezo developer guide |
| Faucet | `https://faucet.test.mezo.org/` | Mezo developer guide |
| Gas token | BTC, 18 decimals | Mezo developer guide |
| MUSD token | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`, 18 decimals | Mezo contracts reference and x402 payments guide. Decimals and symbol are re-checked on-chain. |
| MEZO token | `0x7B7c000000000000000000000000000000000001` | Mezo contracts reference. Testnet use confirmed by the 1 MEZO transfer and balance read recorded above. The app still shows MEZO only if its on-chain check passes. |
| TroveManager (loan storage) | `0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0` | Mezo MUSD redemptions page. Explorer shows it verified. |
| BorrowerOperations (proxy) | `0xCdF7028ceAB81fA0C6971208e83fa7872994beE5` | Mezo MUSD redemptions page. Explorer shows it verified. |
| BTC/USD oracle | `0x2880aB155794e7179c9eE2e38200202908C17B43` | Mezo oracle documentation |
| Basic pool router | `0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9` | Mezo Pools documentation. Explorer shows it verified. |
| Basic pools | MUSD/BTC `0xd16A5Df82120ED8D626a1a15232bFcE2366d6AA9`, MUSD/mUSDC `0x525F049A4494dA0a6c87E3C4df55f9929765Dc3e`, MUSD/mUSDT `0x27414B76CF00E24ed087adb56E26bAeEEe93494e` | Mezo Pools documentation |

Mainnet values (chain ID 31612, MUSD `0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186`) are in the config but are not used by the app's default settings.

The app verifies the network before every balance read and transaction. If the wallet is on another chain, it asks you to switch.

---

## Setup and development

Requirements: Node.js 20.19 or newer.

```bash
git clone https://github.com/daud9/mezovault-iq.git
cd mezovault-iq
npm install
npm run dev          # local development server at http://localhost:5173
npm test             # unit tests
npm run build        # type-check and production build into dist/
npm run preview      # serve dist/ locally
```

Optional environment variables (public values only, see `.env.example`):

- `VITE_DEFAULT_NETWORK`: `testnet` (default) or `mainnet`
- `VITE_MEZO_TESTNET_RPC`: overrides the testnet RPC endpoint

Never put private keys, seed phrases or server secrets in any `VITE_` variable. These values are included in the browser bundle.

Note: the production build step (`npm run build`) does not run on Android (Termux), because a native binary is missing there. Build on Linux, macOS or in the Deno Deploy build step.

---

## Deployment (Deno Deploy)

The live app is a static site served from `dist/`.

Deno Deploy app settings:

- **Install command:** `npm install`
- **Build command:** `npx vite build`
- **Static directory:** `dist`
- **Single page app:** Enabled (required so routes such as `/app/pay` load on refresh)

Deploys run from the `main` branch on each push.

To run the optional Deno server locally after `npm run build`:

```bash
deno task start      # serves dist/ on http://localhost:8000
```

---

## Security and transparency

- **You authorise every transaction in your own wallet.** The app builds the transaction, shows a review screen, and the wallet signs it. The app never has access to private keys or seed phrases.
- **Payment links move no funds.** A link only fills in the payment form. The payer must review and confirm it in their own wallet.
- **Testnet assets have no real monetary value.** BTC, MUSD and MEZO on Mezo Testnet are for testing only.
- **Hypothetical simulations are not actual yield.** The Simulation Lab calculates results from assumptions you enter. Its outputs are not forecasts, and the app does not present them as live rates.
- **Transaction status is read from the chain.** A transaction is shown as confirmed only after its receipt reports success.
- **Unverified data is marked as unavailable.** The app does not estimate APYs, TVL or prices.
- **Public repository.** Nothing in the repository contains credentials. The only values in the code are public contract addresses and the project's public support address.

This is an experimental interface. Nothing in it is financial or investment advice.

---

## Roadmap

**1. Payment and wallet foundation (implemented)**
- Wallet connection, network checks and balance reads
- Send with review and receipt-verified status
- Payment-request links, payment page and support card
- Activity history from the app and from token transfer logs

**2. Evidence-based DeFi intelligence (in progress)**
- Verified contract directory with explorer links
- Read-only loan and pool positions
- Clear labelling of metrics that cannot be verified

**3. Verified DeFi protocol integrations (planned, not started)**
- Swaps through the verified testnet router, after the function signatures are confirmed on-chain and tested
- Smart Vault deposits and withdrawals, after a testnet vault is verified
- Live yield, liquidity and TVL data from verified sources only
- Automated monitoring and rebalancing, only after audit and with explicit per-action user approval

---

## Repository layout

```
src/
  config/     network, token, contract and pool configuration
  lib/        RPC client, ABI helpers, balance, send, ledger and log readers
  hooks/      wallet and balance hooks
  components/ UI components (wallet, balance, send, support, vaults)
  pages/      routes: Overview, Mezo Pay, Pay, Activity, Smart Vaults, IQ Strategies,
              Vault Intelligence, Allocation Lab, Simulation Lab, Autopilot
  engine/     strategy scoring, matching, simulation and allocation logic
server/       optional local Deno static server
```

---

## Before submission (checklist for the team)

- [x] Record a BTC transfer on Mezo Testnet. Done: block 16376406.
- [x] Record a MEZO transfer on Mezo Testnet. Done: block 16375491.
- [x] Add the full transaction hashes for the 0.001 BTC and 1 MEZO transfers.
- [ ] Click one explorer link on a phone to confirm the `/tx/` path opens the transaction.
- [ ] Confirm that the support address in `src/config/support.ts` belongs to the project team.
