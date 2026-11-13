# MezoVault IQ

**Live app:** https://mezovault-iq.daud9.deno.net/
**Repository:** https://github.com/daud9/mezovault-iq

MezoVault IQ is a Mezo ecosystem web app for wallet balances, MUSD use, transaction history and evidence-based DeFi monitoring. The main demo path is **Overview → MUSD Swap** on Mezo Testnet.

> **Release status (2026-11-13):** the deployed `main` baseline is commit `aca9b29`. The MUSD Swap and closed-Trove history changes described below are local and uncommitted; they have not been pushed, deployed or submitted. The deployed link does not yet contain these changes.
>
> **Validation:** `npm test` passes **381 tests**; `npm run typecheck`, `npm run build` and `git diff --check` pass. The production build prints non-fatal third-party annotation and large-chunk warnings. No phone/browser UI test or live Brave wallet-popup test was performed for these local changes. No wallet transaction was signed or broadcast as part of this work; transaction flows were tested with mock RPC/provider tests.

## App inventory and status

“Live read” means the page checks current chain data when opened or refreshed. It does not mean a transaction was sent or that a feature was validated in every wallet/browser.

| App surface | Current status and limits |
| --- | --- |
| **Landing (`/`)** | Product entry page. |
| **Overview (`/app`)** | Shows live wallet balances where the connected network and token checks pass, plus a partial BTC-only oracle estimate when fresh. Its primary CTA is now MUSD Swap. MUSD and MEZO are not assigned USD values; DeFi positions are not a complete portfolio total. |
| **MUSD Swap (`/app/swap`)** | New, Testnet-only MUSD → pool-BTC flow. Uses a live router quote, exact minimum-received calculation, exact-call simulation and gas checks. Mock-tested; no swap was sent. Requires wallet-held MUSD and native BTC for fees. The output is a transferable BTC ERC-20, not native gas BTC; the app’s Send page does not yet send this pool token. |
| **Send (`/app/send`)** | Supports native BTC, MUSD and MEZO when the connected-network token checks pass. The user reviews and confirms in their wallet; status is verified from the receipt. MUSD/MEZO transfers need native BTC for gas. Pool-BTC output is not a Send option. |
| **MUSD Pay Links (`/app/pay-links`, public `/pay`)** | Seller/buyer x402 implementation and mocked facilitator tests are present. Hosted link creation requires a server-only `PAY_LINK_SECRET` and the dynamic server; readiness of the deployed environment must be checked before claiming hosted payments are available. Buyers authorize payment in their own wallet. |
| **Legacy Pay (`/app/pay`)** | Legacy request parameters are prefill-only for the standard Send flow. The app no longer generates these links; they are not gasless. |
| **Activity (`/app/activity`)** | Shows app-submitted transactions and bounded MUSD/MEZO `Transfer` logs with a coverage range and CSV export. Older 5,000-block pages load on demand. Native BTC and complete wallet history are not covered. |
| **Chain Watch (`/app/chain-watch`)** | Read-only public-address balances for supported MUSD/MEZO EVM routes. Verifies the selected chain, token code, symbol and decimals. Unsupported routes are shown as unsupported, not zero; addresses are sent to the selected public RPC. |
| **Bridge Status Tracker (`/app/bridge-status`)** | Read-only lookup of recent Mezo Testnet MEZO NTT status using Wormholescan’s latest 100 indexed operations. Not found is inconclusive; there is no rescue, refund or claim action. Legacy `/app/bridge-rescue` redirects here. |
| **Pool Watch (`/app/pools`)** | Reads reserves for the three documented Testnet basic pools and shows reserve-implied spot prices. Fee tier, USD liquidity, APY and recommendations are not verified or shown. |
| **CL Positions (`/app/cl-positions`)** | Read-only Mezo Testnet wallet-held and gauge-staked position NFT information, live range/tick and simulated collect estimates where available. |
| **CL Planner (`/app/cl-planner`)** | Read-only pool/range planner. A separate Testnet deposit panel prepares exact approvals and a position mint for wallet confirmation and receipt checking. No APY, return or USD valuation is claimed; no live mint was sent in this work. |
| **Trove (`/app/trove`)** | Retained on its separate route, not the main MUSD demo path. Reads the connected account’s Trove status and active-position data. Testnet open and active-Trove add-collateral actions remain separate wallet-confirmed flows; borrowing more, repaying, withdrawing, closing and liquidation are unavailable. A status-4 closed-by-redemption history card is described below. |
| **Stability Pool (on `/app/trove`)** | Reads MUSD deposits and accrued BTC gains; supports the existing exact-allowance and `provideToSP` deposit flow on Testnet. No withdrawal action is exposed. A deposit is not wallet-held MUSD and is not available to the new swap. |
| **Trove Risk Lab (`/app/trove-risk`)** | Read-only collateral/MCR comparison and hypothetical BTC-price scenarios. Ratios are withheld when required position or oracle inputs are stale or unavailable. No current risk ratio is shown for a closed Trove. |
| **Simulation Lab (`/app/simulation`)** | Assumption-based scenarios only; not a live strategy, yield estimate or forecast. |

## MUSD Swap: what is verified

The screen is locked to **Mezo Testnet (chain ID 31611)** and one volatile basic-pool route. Before enabling a wallet request it checks the current chain and pins the pool/token reads, quote and simulations to one block. It verifies MUSD’s on-chain symbol and 18 decimals; verifies the pool contains MUSD and the BTC token; checks both pool and router factories; reads reserves, wallet MUSD, allowance and the pool’s BTC-token balance; and asks the router for `getAmountsOut` using its route tuple `(from, to, stable, factory)` with `stable=false`.

The screen offers 0.5%, 1.0% and 2.0% slippage choices and calculates minimum received using integer arithmetic. If allowance is short, it prepares an approval for **exactly this swap amount**, not an unlimited approval. It estimates gas with a 20% buffer, checks the wallet’s native BTC against the maximum reviewed fee, and simulates the exact approval or swap request at the pinned block. The exact swap simulation must match the live quote. The output token’s `transfer` is also simulated from the pool to the connected account. The final click calls the selected wallet provider immediately; the user must still approve the request there. Approval and swap are separate wallet confirmations when approval is required. The app never signs or broadcasts automatically.

A successful wallet response is not enough to show success. The receipt reader checks the submitted request, receipt status and expected approval or MUSD/BTC transfer events. If a receipt is missing or does not match, it remains pending or unverified rather than claiming success.

**Live Testnet snapshot:** at block `16,750,468`, the MUSD/BTC pool reported token0 MUSD and token1 `0x7b7c000000000000000000000000000000000000`. That output contract had code, returned symbol `BTC` and 18 decimals, and its `transfer` call returned true in a read-only simulation from the pool. The pool and router both reported the documented factory `0x4947243CC818b627A5D06d14C4eCe7398A23Ce1A`. A one-MUSD quote at that block was `0.000012767548162495` pool-BTC; it is a point-in-time quote, not a promised rate. This token is distinct from native BTC used for gas. The app’s Send page cannot yet transfer it, and no real BTC-token transfer was submitted.

The router and pool addresses come from the [official Mezo Pools documentation](https://mezo.org/docs/developers/features/mezo-pools/). MUSD address/decimals are documented in the [Mezo contracts reference](https://mezo.org/docs/users/resources/contracts-reference/). Current runtime checks—not the docs alone—gate the quote and wallet request.

## Closed-Trove history: what is verified

When the connected wallet’s current Testnet Trove status is `4`, the Trove page labels it **Closed by redemption** and looks for the matching `TroveUpdated` event with redemption operation `2`. The event scan is bounded to the latest 10,000 blocks. The page shows the event’s exact block and transaction link only when the log matches; it reads claimable collateral from `CollSurplusPool.getCollateral(owner)` at the same pinned block. If either read fails, that value is marked unavailable. It does not reconstruct a pre-redemption risk ratio and does not provide a surplus-claim action. The existing active-Trove actions were not changed.

The connected wallet’s current live read at block `16,750,468` returned status `4`. The matching zero-principal/interest/collateral redemption event was in block **16,750,026**, transaction [`0x6a5edeeb8b3c7bcf05abcbfeefdc0af870e61e9546516b5e7782d5876fb736fa`](https://explorer.test.mezo.org/tx/0x6a5edeeb8b3c7bcf05abcbfeefdc0af870e61e9546516b5e7782d5876fb736fa). `getCollateral(owner)` returned **0.014859007665964744 BTC** at snapshot block `16,750,468`. These are Testnet values from that read, not a guarantee that the surplus is still claimable later. The closed status and surplus are refreshed from chain; the final pre-redemption collateral ratio is intentionally unavailable.

The status enum and event are documented in the [Mezo MUSD TroveManager source](https://github.com/mezo-org/musd/blob/main/solidity/contracts/TroveManager.sol) and [interface](https://github.com/mezo-org/musd/blob/main/solidity/contracts/interfaces/ITroveManager.sol); `getCollateral` is documented in [CollSurplusPool](https://github.com/mezo-org/musd/blob/main/solidity/contracts/CollSurplusPool.sol).

## Explicitly unavailable or partial

- No smart-vault deposit/withdrawal or verified live yield/TVL feature is exposed.
- The new swap is MUSD → the one Testnet pool-BTC token only. No Mainnet swap, other pair, native-BTC output, or swap path using Stability Pool-deposited MUSD is implemented.
- The pool-BTC token is not yet selectable on the Send page, despite its simulated ERC-20 transfer path.
- Stability Pool withdrawal and closed-Trove surplus claim are not implemented.
- Trove borrowing-more, repayment, collateral withdrawal, closure and liquidation are not implemented.
- MUSD and MEZO dollar prices are not presented; BTC valuation is a partial estimate from Mezo’s BTC/USD oracle and expires when stale.
- Activity history is bounded and does not include native BTC or every wallet transaction.
- Hosted Pay Link availability depends on `PAY_LINK_SECRET` being configured in the server environment; the local mocked facilitator tests do not verify a live hosted checkout.

## Mezo Testnet configuration

| Item | Value |
| --- | --- |
| Network / chain ID | Mezo Testnet / `31611` (`0x7b7b`) |
| RPC / explorer | `https://rpc.test.mezo.org` / `https://explorer.test.mezo.org/` |
| Native gas asset | BTC, 18 decimals |
| MUSD | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`, 18 decimals |
| Basic-pool router | `0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9` |
| Basic-pool factory | `0x4947243CC818b627A5D06d14C4eCe7398A23Ce1A` |
| MUSD/BTC basic pool | `0xd16A5Df82120ED8D626a1a15232bFcE2366d6AA9` |
| Pool BTC token | `0x7b7c000000000000000000000000000000000000`, 18 decimals; on-chain symbol `BTC` |

Mainnet configuration exists in code, but MUSD Swap is not enabled there.

## Run locally

Requirements: Node.js 20.19 or newer.

```bash
git clone https://github.com/daud9/mezovault-iq.git
cd mezovault-iq
npm install
npm run dev
npm test
npm run build
npm run preview
```

`VITE_DEFAULT_NETWORK` can be `testnet` (default) or `mainnet`; `VITE_MEZO_TESTNET_RPC` can override the public Testnet RPC. Never put a private key, seed phrase or server secret in a `VITE_` variable; browser-bundled values are public. For the dynamic server, `PAY_LINK_SECRET` is server-only and must be configured separately.

## Implementation and safety notes

- Wallet access uses injected EIP-1193 providers with EIP-6963 discovery. The app has no signer or access to seed phrases/private keys; users approve wallet requests themselves.
- Contract reads use JSON-RPC and small ABI helpers. Token identity, balances, allowances, reserves, quotes and receipts are checked against their contracts; unavailable data is not replaced with a guessed value.
- Testnet assets have no real monetary value. A live quote, receipt reader or simulation is not financial advice and does not guarantee execution or future output.
- No build or development test for this change submitted a wallet transaction. The new swap and history regression tests use mock RPC/provider data.

## Project structure

```text
src/
  config/       networks, tokens, pools and app navigation
  lib/          RPC, ABI, wallet safety, swap, Trove history and protocol readers
  components/   wallet, balance and shared UI
  pages/        Overview, MUSD Swap, Send, Pay, Pay Links, Activity,
                Chain Watch, Bridge Status, Pool Watch, CL Positions/Planner,
                Trove, Trove Risk Lab and Simulation Lab
  engine/       assumption-driven scenario calculations
server/         dynamic app server and x402 merchant endpoints
docs/           protocol and feature implementation notes
```
