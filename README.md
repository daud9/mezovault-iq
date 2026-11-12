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
| MUSD / MEZO Chain Watch: manually entered public address with per-network code, symbol, and decimal checks | Implemented, read-only |
| Send BTC or MUSD: review screen, wallet confirmation, receipt-verified status | Implemented |
| Send MEZO (same flow, only when the on-chain token check passes) | Implemented, tested on Mezo Testnet |
| Legacy `/app/pay` request links | Still accepted as prefill-only standard transfers; link creation removed. MUSD payment requires BTC for gas; not gasless |
| Gasless MUSD Pay Links | Implemented in code: signed recipient/amount links, buyer-side wallet authorization, and facilitator-settled Mezo Testnet MUSD; hosted activation requires `PAY_LINK_SECRET` |
| Bridge Status Tracker at `/app/bridge-status` (legacy `/app/bridge-rescue` redirects) | Read-only Mezo Testnet MEZO NTT status from Wormholescan's latest 100 operations; no supported recovery, claim, refund, or signing action |
| Support card (review or enter amount manually for BTC, MUSD; MEZO when verified) | Implemented |
| Activity page: app-sent transactions plus bounded MUSD/MEZO Transfer logs, coverage map, CSV export, and older 5,000-block pages on demand | Implemented, partial history |
| BTC-only wallet estimate from the fresh Mezo BTC/USD protocol oracle; MUSD and MEZO are not assigned a USD price | Partial, read-only |
| Shared wallet/network-aware Trove read (collateral, debt, fresh BTC/USD ratio, and Testnet MCR pinned to one block) | Read-only; consumed on Overview, Trove, and Risk Lab, with explicit no-loan, stale, unavailable, and wrong-network states |
| Trove Risk Lab: same-block live MCR comparison and hypothetical 10%, 20%, and 30% BTC price drops | Read-only; ratios and scenarios withheld when the position, oracle, or MCR is stale or incomplete |
| Trove actions | Testnet-only `openTrove` and active-Trove `addColl` wallet-confirmed paths; other Trove writes remain unavailable |
| Liquidity-pool position read for the three official testnet basic pools | Read-only |
| CL Position Monitor at `/app/cl-positions` | Mezo Testnet only; reads wallet-held and gauge-staked NFTs, live tick/range, simulated collect estimates, and gauge schedule data where available; read-only |
| CL Range Planner at `/app/cl-planner` | Mezo Testnet only; its planner stays read-only; a separate deposit panel builds a live-reviewed mint with separate exact approvals and wallet-confirmed receipt status; no APY/returns/USD values |
| Pool Watch: official Testnet pool reserves and reserve-implied spot price | Read-only; fee tier and USD liquidity are not verified; no APY or recommendations |
| Protocol Evidence board: documented, deployed, source-verified, and operationally-tested stages | Read-only; unknown and partial evidence is labelled explicitly |
| Simulation Lab | Assumption-based preview only; not a live strategy or yield claim |
| MUSD/MEZO dollar totals, vault-yield claims, and unsupported Trove transactions | Not presented as working features until sources/contracts are verified |

### CL Range Planner

- The planner reads factory-listed Slipstream pools from the official Mezo Testnet CL deployment at chain 31611, at one checked block. It does not use a hardcoded/demo pool list and does not need a connected wallet.
- A pool is selectable only when its contract is present, its live `liquidity()` is nonzero, and both token decimals are readable on-chain. Zero-current-liquidity pools and pools with missing/unsupported decimals are excluded. Pool-wide active liquidity includes staked liquidity and is not a promise of liquidity available to a user-selected range.
- Enter the lower and upper price as token1 per token0 and the total budget in token1. The bounds round outward to that pool's tick spacing. The estimated composition uses live `sqrtPriceX96`, token decimals and standard CL formulas; the range status uses the live tick, lower-inclusive and upper-exclusive.
- Reads refresh every 60 seconds and on demand. A failed read or snapshot older than two minutes withholds calculations. Planner amounts are approximate, exclude fees/slippage/gas/exact raw-unit rounding, and are not a quote. The planner card itself remains read-only; a separate panel performs the deposit review.
- Implementation and test details: [CL Testnet Planner notes](docs/CL_TESTNET_PLANNER.md).

### CL Testnet deposit flow

- The separate panel is locked to chain 31611 and the verified Testnet Slipstream Position Manager. Before a wallet prompt it shows the exact pool, dynamic fee, tick spacing and range, exact desired/minimum token amounts, recipient, deadline, contract call and calldata.
- Approvals are separate, limited to the exact desired raw-unit amount, and simulated before the wallet is opened. The mint is simulated again against fresh pool, fee, balance and allowance state. Connecting, loading or refreshing never submits a transaction.
- Status remains pending until a transaction receipt is read; success is shown only for receipt status `0x1`. No live mint or approval was sent during development. ABI, safety checks and fake-RPC tests are documented in [CL Testnet deposit notes](docs/CL_TESTNET_DEPOSIT.md).

### Open-Trove review and wallet flow

- Available only on Mezo Testnet (chain `31611`) for a wallet with no active or non-empty Trove. The user can edit BTC collateral and requested MUSD in the planner. BTC is sent as native `msg.value` and also pays network gas; requested MUSD is the `_debtAmount` argument to the published payable `openTrove(uint256,address,address)` ABI. The two sorted-trove hints are zero addresses.
- The preview uses fresh protocol reads for the current borrowing fee, reserve, BTC/USD oracle price, minimum debt, ICR, and Normal/Recovery Mode. A first explicit click prepares a review using same-block reads, the wallet's Trove status, `eth_estimateGas`, and exact `eth_call` simulation. The screen shows BTC value, requested MUSD, fee, net and composite debt, oracle price, ICR, mode, contract, calldata, and gas estimate/limit.
- A second explicit click repeats the same-block reads, eligibility checks, estimate, and exact simulation immediately before requesting the injected wallet. If the account, inputs, live terms, or gas result changed, the screen refreshes and no wallet request is made; the user must review again. A review is not rejected solely because time passed: the final checks are fresh and the exact transaction must still match. The wallet provider rechecks account and chain. The app has no signer and never auto-submits; transaction submission requires the user's own wallet approval.
- The receipt check verifies transaction hash, sender, contract, calldata, native BTC value, reviewed gas limit, receipt block, success/revert status, and a matching `TroveCreated` event for the reviewed wallet. A hash or status alone is never shown as success. Borrow-more, repay, withdraw, close, and liquidation are unavailable. The flow fails closed on stale/missing reads, unsafe amounts, existing Troves, failed checks, or simulation/gas errors.
- ABI/source evidence and test limits are recorded in [Mezo contract verification notes](docs/MEZO_CONTRACT_VERIFICATION.md). Development and tests do not send a transaction; live execution still depends on each runtime preflight passing.

### Existing-Trove add-collateral review and wallet flow

- For an active Mezo Testnet Trove, the user enters the BTC amount to add. The app re-reads Trove status, collateral, and debt at one recent block, verifies the BorrowerOperations code, then estimates and simulates the exact payable `addColl(address,address)` call at that block. The BTC amount is sent as native `msg.value`; it is not a function argument.
- The prepared review shows the wallet, existing collateral and debt, BTC amount, contract, exact calldata, and gas estimate/20% buffered limit. Both sorted-Trove hints are zero; official `SortedTroves` source documents fallback search from the list head when no hints are supplied, so the exact gas estimate and simulation are required.
- A second explicit click repeats the active-Trove read and exact simulation. If the current collateral/debt, amount, or gas result changes, the review updates and no wallet request is made. Only then does the existing wallet provider request the connected user's approval. A matching successful `TroveUpdated` event for the borrower and `adjustTrove` operation is required before the app reports confirmation.
- This flow does not borrow more, repay, withdraw, close, or liquidate. It uses fake-RPC tests only and never invokes `eth_sendTransaction` during development. The official artifact and source verify the ABI and behavior, but the build sandbox's Testnet RPC returned HTTP 403, so the current proxy implementation slot and any connected wallet's live position were not independently checked here.
- ABI/source evidence and state checks are recorded in [Mezo contract verification notes](docs/MEZO_CONTRACT_VERIFICATION.md).

### MUSD / MEZO Chain Watch

- Supports Mezo Mainnet, Ethereum, Base, BNB Chain, and Mezo Testnet. The first version is EVM-only.
- The official contracts reference supplies the token addresses. On every lookup, the app verifies the RPC chain ID and each supported token's contract code, symbol, and 18 decimals before showing its balance. Unsupported routes are labelled **Not supported**, not zero; failed reads are **Unavailable**.
- MUSD is shown only for Mezo, Ethereum, Base, and Mezo Testnet. BNB Chain has no verified MUSD route here. MEZO's verified EVM routes include Mezo, Ethereum, Base, and BNB Chain.
- Ethereum, Base, and BNB Chain use shared PublicNode RPC endpoints; Mezo uses the configured public mainnet/testnet endpoints. These providers receive the entered address in read-only balance calls and may log it. The page does not connect a wallet, sign, transact, place the address in the URL, or write it to browser storage.
- Official route documentation: [MUSD bridge](https://mezo.org/docs/users/borrow/musd-bridge/) and [MEZO bridge](https://mezo.org/docs/users/mezo/mezo-bridge). The app links to the guides only; it does not initiate a bridge.
- Balances remain separate by network. No total USD value, token price, or cross-network fungibility is inferred.

### Bridge Status Tracker

- The tracker is read-only and scoped to MEZO NTT transfers that start on Mezo Testnet. It checks the official Mezo Testnet Wormhole transceiver's latest 100 indexed operations from Wormholescan, then matches the entered Mezo transaction hash in the browser. The hash is not sent to Wormholescan.
- The page distinguishes source indexed, VAA available, destination transaction indexed, and not found. A missing match is inconclusive: it may be outside the latest page, not indexed yet, or not be a bridge transaction. Destination indexing is not presented as an independent finality guarantee.
- No Testnet rescue, refund, or manual claim action is documented by Mezo, so the app offers no such action and warns against retrying a transfer based only on a missing lookup.
- This is not Mezo's Mainnet native-BTC deposit tracker. Mezo says native BTC bridge-in closed October 13, 2026; pre-closure deposits are checked using [Mezo's tracking guide](https://mezo.org/docs/users/mainnet/track-your-native-bitcoin-deposit/) and [tBTCScan](https://tbtcscan.com/deposits).
- Implementation notes and source links: [Bridge tracker and x402 notes](docs/BRIDGE_TRACKER_AND_X402.md).

### Gasless MUSD Pay Links

- A seller creates a reusable 30-day link in `/app/pay-links`; the connected recipient wallet signs an off-chain ownership message, and the server binds the exact recipient, amount, and Mezo Testnet network. Supported amount: 0.001–1,000 MUSD.
- The public `/pay#link=…` checkout displays the recipient and amount before the buyer clicks Pay. The token stays in the URL fragment during page load and is sent only in the subsequent request body. The buyer's own wallet signs the EIP-712 authorization; the facilitator at `https://facilitator.vativ.io` verifies and settles MUSD and pays native BTC gas.
- The server returns paid access only after checking the x402 payment terms and a successful Testnet settlement receipt. Failed or mismatched settlement does not produce a paid confirmation. This is not a general gasless ERC-20 transfer or ERC-4337 paymaster; the checkout is currently Testnet-only.
- **Hosted pay links have a separate requirement.** `deno.json` declares a Deno Deploy dynamic runtime and `server/main.ts` entrypoint. Set a server-only `PAY_LINK_SECRET` (at least 32 random bytes) in the deployment environment before link creation is enabled; deploying the app does not supply this secret. Per-isolate throttles use a bounded 5,000-key in-memory map that may evict active windows under high key diversity; they are best-effort, not a shared global rate limiter.
- Direct MUSD transfers remain available on the Send page and require BTC for network fees. Older payment-request URLs only prefill that standard send flow.
- Sources: [Mezo x402 overview](https://mezo.org/docs/developers/getting-started/musd-payments-x402/) and [Mezo x402 quickstart](https://mezo.org/docs/developers/getting-started/musd-payments-x402/x402-quickstart/).

### Tested on Mezo Testnet

- **BTC transfer, confirmed on-chain.** Sent 0.0001 BTC from the app's review screen to a second address. Transaction `0x350755cfcb66c7c1fdd25c56b29ecc26f335cb5498c850f3f5d71e530a41dde3`, confirmed in block 16376406. The app showed the status as confirmed only after the receipt reported success.
- **Second BTC transfer.** Sent 0.001 BTC; the Activity page shows it as live from chain at block 16368801. Transaction `0xb99ffa8e4c02c1b2f4128f1078e92f83a694c9944305ca7041d97c87aada1b96`.
- **MEZO transfer, confirmed.** Sent 1 MEZO; the Activity page shows it as live from chain at block 16375491. Transaction `0xf8deebc206d05cfe4f8bf2b6ca6dc820fc4c01eff2823cb98f31686ececf2dff`. The same on-chain check that enables MEZO sending also read the wallet's MEZO balance (100 MEZO) on Mezo Testnet.
- **Historical fixed open-trove test.** The owner-approved fixed test (0.05 BTC collateral / 3,000 MUSD debt) was successfully performed on Mezo Testnet. That hard-coded action was removed. The current app has editable open-Trove planner values and a separate active-Trove BTC addition. Each action has its own fresh preflight and explicit wallet confirmation. No add-collateral transaction was sent during this implementation.
- **Legacy payment-request link.** The old request URL filled in a standard wallet transfer. The app no longer generates these links; legacy URLs are labelled as non-gasless and show the standard BTC network fee before wallet confirmation.
- **Activity page.** Lists app-sent transactions with hash, timestamp, status, block number and explorer link. It reads MUSD/MEZO Transfer events in 5,000-block pages, initially the latest page; older pages load only when requested. It does not show native BTC transfers or claim complete wallet history.
- **Automated unit tests.** 347 pass (`npm test`). Coverage includes amount parsing, transfers and receipts, wallet/account/chain guards, RPC errors, token formatting, same-block reads, BTC/USD freshness and valuation, bounded transfer-history ranges, fail-closed Trove status and oracle/MCR reads, open-Trove planner/preflight/review matching, addColl active-Trove status, exact payable calldata/value, same-block preflight, gas/simulation failure, review matching and TroveUpdated receipt verification, collateral-ratio and risk math, basic-pool snapshots, CL NFT and gauge reads, CL planner and mint/approval encoding, bridge tracker privacy/status/timeout, app navigation, and x402 seller/buyer/settlement/failure/replay/configuration/rate-limit checks. Transaction tests use fake JSON-RPC and never broadcast; x402 integration tests mock the facilitator and never submit a transaction.


### Still under development (not operational)

- **Smart Vault deposits and withdrawals.** No testnet vault contract has been verified, so no vault can be used.
- **Executable swaps.** Official pool addresses are documented and Pool Watch reads reserves; pool fee behavior and swap execution are not verified, so no swap quote or transaction is implemented.
- **Verified live yield and TVL data.** These values are not presented until their sources can be verified.
- **Other Trove transactions.** Withdrawing, borrowing more, repaying, closing, and liquidation are not implemented. Opening a new Trove and adding BTC to an existing Trove on Testnet are supported only after the fresh runtime checks described above.

### Pricing and history source limits

- BTC-only estimates use the configured on-chain Mezo `PriceFeed`; the app shows no estimate when the RPC read or one-hour freshness check fails. The [Mezo oracle guide](https://mezo.org/docs/developers/architecture/oracles/read-oracle/) also documents Pyth MUSD/USD and MEZO/USD feeds, but the tested Testnet calls reverted and Hermes returned HTTP 401, so neither token is assigned a dollar price.
- The [Mezo node oracle REST endpoint](https://mezo.org/docs/developers/architecture/oracles/read-oracle/) returned a BTC price over HTTP during integration checks, while HTTPS failed. The HTTPS app does not call that HTTP endpoint.
- Activity pages read standard MUSD and verified MEZO `Transfer` logs from JSON-RPC in 5,000-block ranges. The [Testnet explorer API docs](https://explorer.test.mezo.org/api-docs) were available, but the usual address-history API routes tested returned 404. [Goldsky lists Mezo support](https://docs.goldsky.com/chains/mezo), but a project-owned deployment is required. Until an indexed history source is available, native BTC transfers and other activity remain outside this view.

---

## Technology stack

Taken from `package.json` and the source tree.

- **Language and UI:** TypeScript, React 19, react-router-dom 7, lucide-react icons
- **Build:** Vite 6 with `@vitejs/plugin-react`, Tailwind CSS 4 via `@tailwindcss/vite`
- **Blockchain access:** no wallet SDK. The app calls the injected EIP-1193 provider directly (`window.ethereum`, with EIP-6963 discovery). Chain reads use JSON-RPC over `fetch`. ABI encoding and Keccak-derived selectors are implemented in `src/lib/`.
- **Tests:** Node's built-in test runner through `tsx`
- **Hosting:** Deno Deploy dynamic runtime; Express serves the React build and x402 merchant endpoints from `server/main.ts`
- **Local server:** `deno task start` runs the same dynamic server after `npm run build`; `npm start` runs it under Node via `tsx`

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
| BorrowerOperations (proxy) | `0xCdF7028ceAB81fA0C6971208e83fa7872994beE5` | Mezo MUSD redemptions page and explorer; `openTrove` and payable `addColl` ABI entries are cross-checked with the published Testnet deployment artifact. |
| Mezo Testnet PriceFeed proxy | `0x86bCF0841622a5dAC14A313a15f96A95421b9366` | Existing verified Testnet configuration; resolves to the BTC/USD oracle below |
| BTC/USD PriceOracleCaller | `0x7b7c000000000000000000000000000000000015` | Mezo oracle documentation; `latestRoundData()` update time is checked |
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

The repository now declares a **dynamic Deno Deploy runtime** in `deno.json`: install with `npm install`, build with `npm run build`, and run `server/main.ts`. That Express entrypoint serves the SPA from `dist/` and exposes the x402 API routes. Deno Deploy documents that a source `deploy` block takes precedence over dashboard build/runtime settings; the app directory remains a dashboard setting. Deno’s official runtime examples support Express and `app.listen`.

Before enabling pay links in any deployment, configure `PAY_LINK_SECRET` as a server-side secret in that environment. Use at least 32 random bytes; do not use a `VITE_` name or commit the value. Set it in Production and in any preview/development environment where links should be enabled. The status route reports the feature as unavailable when the secret is missing. In-memory throttles are per runtime isolate, so they are best-effort and are not a shared/global rate limiter.

Pay-link creation is available only when `PAY_LINK_SECRET` is configured in the Deno Deploy Production environment. A source build or deployment alone does not supply or change that secret.

To run the dynamic server locally after `npm run build`:

```bash
deno task start      # serves the SPA and API on http://localhost:8000
npm start             # Node/tsx equivalent
```

---

## Security and transparency

- **You authorize every transaction in your own wallet.** The app never has access to private keys or seed phrases. Opening a new Trove and adding BTC to an active Trove are the only supported Trove transaction paths; each requires fresh checks, exact-call simulation, and a separate wallet confirmation. The app never signs or auto-submits; all other Trove operations are unavailable.
- **Payment requests and x402.** Legacy request links only prefill a standard transfer, which the payer reviews and confirms in their own wallet and which requires BTC network fees. Gasless MUSD links use the merchant endpoint and facilitator: the buyer signs the authorization in their wallet, and the server never signs buyer payments or receives private keys. Only Testnet MUSD is supported; the hosted feature is not enabled until `PAY_LINK_SECRET` is configured and the dynamic server is deployed. Payment succeeds only after the facilitator receipt is validated.
- **Chain Watch is public-address only.** It queries only the address manually entered and submitted on that page. The relevant public RPC providers receive that address in balance calls and may log requests; the app does not connect a wallet or persist the address.
- **Testnet assets have no real monetary value.** BTC, MUSD and MEZO on Mezo Testnet are for testing only.
- **Hypothetical simulations are not actual yield.** The Simulation Lab calculates results from assumptions you enter. Its outputs are not forecasts, and the app does not present them as live rates.
- **Transaction status is read from the chain.** A transaction is shown as confirmed only after its receipt reports success.
- **Price coverage is partial.** The BTC card may show a BTC-only estimate from Mezo's BTC/USD oracle after validating its update time; the displayed quote ages and expires after one hour. This is not a portfolio total; MUSD and MEZO remain unpriced, and testnet assets have no real monetary value. The app reads the oracle over the configured chain RPC and shows no value if that read fails or is stale. Mezo's documented REST oracle endpoint is HTTP-only, so the HTTPS client does not call it directly. The app does not estimate APYs or TVL.
- **Public repository.** Nothing in the repository contains credentials. The only values in the code are public contract addresses and the project's public support address.

This is an experimental interface. Nothing in it is financial or investment advice.

---

## Roadmap

**1. Payment and wallet foundation (implemented)**
- Wallet connection, network checks and balance reads
- Send with review and receipt-verified status
- Legacy payment-request URLs (prefill only), gasless Testnet MUSD x402 pay links, public checkout and support card
- Activity history from the app and from token transfer logs

**2. Evidence-based DeFi intelligence (in progress)**
- Verified contract directory with explorer links
- Read-only loan and pool positions
- Clear labelling of metrics that cannot be verified

**3. Verified DeFi protocol integrations (broader work planned)**
- Other Trove operations (adjust, repay, withdraw, close) only after operation-specific contract review, safety testing, and separate authorization
- Swaps through the verified testnet router, after the function signatures are confirmed on-chain and tested
- Smart Vault deposits and withdrawals, after a testnet vault is verified
- Live yield, liquidity and TVL data from verified sources only

---

## Repository layout

```
src/
  config/     network, token, contract and pool configuration
  lib/        RPC client, ABI helpers, balance, send, ledger and log readers
  hooks/      wallet and balance hooks
  components/ UI components (wallet, balance, send, support, activity, evidence)
  pages/      routes: Overview, Send, legacy Pay, MUSD Pay Links, Bridge Status Tracker,
              Activity, Pool Watch, Chain Watch,
              CL Position Monitor, CL Range Planner, Trove Risk Lab, Protocol Evidence, Simulation Lab
  engine/     assumption-driven scenario simulation
server/       dynamic Express merchant/API server and signed pay-link token handling
```

---

## Before submission (checklist for the team)

- [x] Record a BTC transfer on Mezo Testnet. Done: block 16376406.
- [x] Record a MEZO transfer on Mezo Testnet. Done: block 16375491.
- [x] Add the full transaction hashes for the 0.001 BTC and 1 MEZO transfers.
- [ ] Click one explorer link on a phone to confirm the `/tx/` path opens the transaction.
- [ ] Confirm that the support address in `src/config/support.ts` belongs to the project team.
