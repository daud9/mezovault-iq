# MezoVault IQ — strict feature audit

## Summary

This audit covers every registered route, legacy/unknown path, unmounted page component, and wallet/action control. It reviews implementation, data sources, network scope, states, tests, and visible copy. It is not a live end-to-end certification: no wallet was connected, no transaction was signed or submitted, and these local changes were not pushed or deployed.

**Status key:** Working means the core read/action is implemented with explicit states and relevant tests. Partial means useful functionality exists but material coverage, freshness, integration, or verification gaps remain. Unavailable means the apparent feature cannot be completed or is not reachable.

Mezo Testnet is the default network. Tests use mocked RPC, wallets, and facilitators. They do not prove a live transaction or hosted payment flow.

## Portfolio valuation

Overview shows separate MUSD, native BTC, MEZO, and configured Pool BTC balances. It deliberately shows **no combined portfolio total**. The Pool BTC card reports a token amount only and labels token identity unverified.

A fresh call through the app's checked Mezo Testnet BTC/USD reader returned **$65,476.58615/BTC** at block **16,794,584**. The oracle update was **2026-11-15 10:43:40 UTC**; the read occurred at **10:43:49 UTC**, with a reported age of **9 seconds**. The reader enforces a one-hour age limit in `src/lib/portfolioPrice.ts`; a value older than that is withheld. This supports only a native-BTC estimate and is not redeemable or real USD value on Testnet.

Mezo's [oracle documentation](https://mezo.org/docs/developers/architecture/oracles/read-oracle/) lists Pyth feeds for MUSD/USD, MEZO/USD, and BTC/USD. The latest bounded safe-price check recorded in this review, at Testnet block **16,794,356**, found `getPriceNoOlderThan(feedId, 3600)` reverting for all three feeds. Unsafe MUSD and BTC values were last published on 2026-07-27; no MEZO value was readable. No verified Pool BTC/USD price is configured. Therefore MUSD, MEZO, Pool BTC, Trove positions, Stability Pool deposits, and CL positions remain unpriced and outside the BTC estimate.

**Valuation decision:** retain separate raw token balances and a clearly labeled, freshness-gated native-BTC estimate. Do not display a portfolio total until every included asset and position has a verified, fresh supported price.

## Route inventory

| Route or surface | Status | Evidence and function | Exact gap and decision |
|---|---|---|---|
| `/` — Landing | Working, static | `src/pages/Landing.tsx` leads with Trove and Trove Risk Lab, then protocol tools. | Kept. Wallet actions are not the hero or primary cards. |
| `/pay` — public x402 checkout | Partial | `src/pages/X402Checkout.tsx`, `src/lib/x402Buyer.ts`, and `server/app.ts` implement Testnet request validation, typed-data authorization, facilitator settlement, and result/error states. A regression test asserts that the generated `PAYMENT-REQUIRED` asset is the exact Mezo Testnet MUSD contract for pinned `@x402/evm` 2.30.0. No buyer transaction-send method is present. | Terms are checked after authorization verification but before the separate settlement call. A successful-but-mismatched settlement receipt is detected after the settlement call and may follow an on-chain payment; valid Testnet receipt hashes are returned, and the UI blocks new signatures with an explorer-only warning. A hash-keyed pending marker survives reloads in the same browser, but is not server-side reconciliation and is lost across devices or if browser data is cleared. Mezo documents the configured endpoint, but live verification/settlement and deployed token ABI were not independently tested. Kept conditionally. |
| `/app` — Overview | Partial | `src/pages/Overview.tsx` shows separate MUSD, native BTC, MEZO, and configured Pool BTC reads; BTC pricing is freshness-gated. | Complete valuation is unsupported. Trove and DeFi positions are outside the estimate. Kept with explicit exclusions and no combined total. |
| `/app/trove` — Trove and Stability Pool | Working in code/tests; live E2E unverified | `src/pages/Trove.tsx`, `LoanCard.tsx`, and `src/lib/loan.ts` read a checked Trove snapshot. Open-Trove and add-collateral flows have preflight, simulation, wallet confirmation, and receipt checks. `StabilityPoolPanel.tsx` supports wallet-MUSD deposits with separate approval and deposit steps. | Borrow-more, repayment, withdrawal, and closure are not implemented. Open-Trove final wallet context still warrants a request-time check. No live write E2E. Copy now says wallet MUSD and the Stability Pool CTA says “Review deposit” before wallet confirmation. Kept. |
| `/app/trove-risk` — Trove Risk Lab | Working, read-only | `src/pages/TroveRiskLab.tsx`, `src/lib/troveRisk.ts`, and `src/lib/loan.ts` use checked reads and local hypothetical BTC drawdowns; tests cover math, snapshot reads, and bounded closure history. | Scenarios are not forecasts. Redemption classification searches only the latest 10,000 blocks and does not reconstruct a closed Trove's final pre-redemption ratio. Kept; scenario copy is concise. |
| `/app/swap` — MUSD Swap | Partial | `src/pages/MusdSwap.tsx` and `src/lib/musdSwap.ts` build exact Testnet quotes, simulations, approval/swap reviews, wallet requests, and receipt checks. Helper tests cover preflight and receipts. | The configured Pool BTC token address is not listed in reviewed Mezo pool docs; code/symbol/decimals checks do not prove canonical identity. The 0.30% pool fee is not separated from price impact. No live quote/swap E2E. Kept as a secondary action with both limits disclosed. |
| `/app/send` — Send | Partial | `src/pages/Send.tsx`, `src/lib/transfer.ts`, and balance readers support native BTC, MUSD, MEZO, and configured Testnet Pool BTC transfers with review, wallet request, and receipt states. Helper tests cover validation, simulation, and receipts. | Pool BTC identity is unverified. Ordinary-send preflight is less tightly pinned than the Pool BTC path, and review can age. No live E2E. Kept as a secondary action; repeated instructions were removed. |
| `/app/pay` — legacy payment prefill | Partial | `src/pages/Pay.tsx` validates a request and prefills `/app/send`; it never transfers funds itself. `src/lib/paymentRequest.test.ts` covers parsing. | Query parameters do not bind a network. Kept for link compatibility; an amount-less request now links directly to Send. |
| `/app/pay-links` — MUSD Pay Links | Partial, conditional | `src/pages/MusdPayLinks.tsx`, `server/app.ts`, and `server/payLinkToken.ts` implement seller authorization, link creation, and an unavailable state. Server/x402 tests use mocked facilitators. | Links are reusable until expiry and can accept multiple separately authorized payments; they are not single-use. No durable paid/consumed state or settlement history is stored. Exact live buyer-authorization replay behavior is not established. `/api/pay-links/status` confirms secret configuration only, not endpoint health. Kept with repeated-payment semantics disclosed. |
| `/app/bridge-status` — Bridge Status | Working, narrow read | `src/pages/BridgeStatusTracker.tsx` and `src/lib/bridgeTracker.ts` query the latest 100 indexed Testnet operations and match the hash locally. A read-only endpoint check returned HTTP 200 with an empty list; unit tests cover status/error handling. | Empty results are inconclusive. No pagination, claim, rescue, refund, or finality proof. Kept as indexed status only; no recovery is implied. |
| `/app/chain-watch` — Chain Watch | Partial | `src/pages/ChainWatch.tsx` and `src/lib/chainWatch.ts` perform per-network, block-pinned reads after chain/code/symbol/decimals checks; tests cover mismatches and failures. | It is a multi-network public-address monitor, not a portfolio. The configured Mainnet MEZO address conflicts with its explorer label (“Stub Token (goerli)”); the symbol check withholds a mismatch. RPC checks do not prove canonical identity. Kept with a short public-RPC disclosure and separate network balances. |
| `/app/cl-positions` — CL Positions | Working, read-only snapshot | `src/pages/ClPositionMonitor.tsx` and `src/lib/clPositions.ts` enumerate wallet-held and gauge-staked NFTs at a block. Collect values are `eth_call` simulations. Tests cover snapshots and fallbacks. | Manual refresh only; values can age. Gauge collect simulations are not verified as executable payout amounts. Kept; generic exit guidance was removed. |
| `/app/cl-planner` — CL Planner and mint panel | Partial | `src/pages/ClPlanner.tsx`, `src/lib/clPlanner.ts`, and `ClDepositPanel.tsx` provide live pool reads, range estimates, exact approval/mint simulation, and wallet actions. | Estimates are not quotes. Mint receipt checks status/block but not the expected position event or token ID; no live mint E2E. Kept; review copy now states this gap and distinguishes simulation from receipt. |
| `/app/pools` — Pool Watch | Working, narrow read | `src/pages/PoolWatch.tsx`, `usePoolMarkets.ts`, and `src/lib/pool.ts` read configured pools at one block and mark data stale after two minutes. Tests cover shared-block reads and failures. | Reserve ratios are not trade quotes, stable-curve prices, USD liquidity, or verified fee tiers. Live reserves were not independently confirmed. Kept with precise metric labels. |
| `/app/activity` — Activity | Partial | `src/pages/Activity.tsx` combines up to 200 local app-submitted hashes with bounded MUSD/MEZO transfer logs. Older-page and CSV controls are explicit; tests cover bounds, ledger, and export. | Not complete history: native BTC and most other-app activity are absent. CSV contains loaded token-log rows, not the local hash ledger. Kept as “Activity” with scope stated once. |
| `/app/bridge-rescue` — legacy rescue path | Unavailable / misleading | No rescue action exists; unknown app paths now show a not-found state. | The rescue alias was removed. `/app/bridge-rescue` is no longer routed. |
| `/app/simulation`, `/app/protocol-evidence`, and unknown app paths | Unavailable | No Simulation Lab or Protocol Evidence route is mounted; `src/App.tsx` shows a not-found state rather than silently falling back to Overview. | Not listed as app features. |
| `SmartVaults`, `VaultIntelligence`, and related vault catalogue/helpers | Unavailable / unreachable | These components were never routed or imported by the app; they described unverified vaults/rewards. | Removed the orphan pages and unused helper/config files after recording the audit. |

## Wallet and action control inventory

| Control | Status | Evidence and gap | Decision |
|---|---|---|---|
| Connect wallet | Working | `WalletButton.tsx`, `WalletProvider.tsx`, and wallet tests support injected EIP-1193/EIP-6963 providers and surface errors. Requests account access, not a transaction. | Kept. |
| Switch network | Working | Uses `wallet_switchEthereumChain`, adds Mezo on error 4902, then rechecks chain ID. | Kept; a switch alone does not guarantee every read succeeds. |
| Disconnect in this app | Working | Clears this app's local connection state; does not revoke wallet authorization. | Kept; scope is stated accurately. |
| MUSD faucet | Partial | `FaucetPanel.tsx` links to the configured external Testnet faucet; no eligibility or delivery check occurs in-app. | Kept as an external link; no asset delivery is promised. |
| MUSD Swap: review, exact approval, swap, receipt check | Partial | `MusdSwap.tsx`/`musdSwap.ts` perform quote, balance, pool, simulation, gas, and receipt checks before/after explicit wallet requests. | Kept as secondary; canonical Pool BTC identity and fee breakdown remain unresolved. |
| Send: asset selection, review, wallet confirmation, receipt retry | Partial | `Send.tsx`/`transfer.ts` validate drafts, simulate token calls, estimate fees, request wallet approval, and retry receipts without resubmitting. | Kept as secondary; ordinary-send freshness/preflight and Pool BTC identity remain gaps. |
| Legacy Pay: continue to Send | Partial | `Pay.tsx` only validates and prefills a standard transfer. | Kept for existing links; missing-amount dead end fixed. |
| Pay Links seller: connect, sign, create, copy/share | Partial | `MusdPayLinks.tsx` signs an off-chain recipient message and calls the server; no seller transaction is sent. Status proves configuration only. | Kept conditionally; readiness wording corrected. |
| Public x402 buyer: connect, switch, sign, settle, check status | Partial | `X402Checkout.tsx` validates the Testnet MUSD request, signs typed data, and posts to the facilitator path; no buyer transaction send exists. The client saves a pending marker before posting and restores it on reload. | The pre-settlement terms guard is not evidence of a post-payment failure. A receipt mismatch can happen after settlement was requested; valid Testnet receipt hashes are returned and the UI offers status-only explorer links, not another signature. The marker is browser-local, not a server ledger; clearing browser data or switching devices loses it. Reusable-link behavior and lack of paid status are disclosed. |
| Open Trove | Working in code/tests; live E2E unverified | `OpenTroveAction.tsx`, `openTroveExecution.ts`, and `openTroveReceipt.ts` preflight, simulate, request wallet confirmation, and check matching receipt events. Review expires after 60 seconds. | Kept as a lead feature; request-time wallet-context check remains a safety improvement. |
| Add BTC collateral | Working in code/tests; live E2E unverified | `AddCollateralAction.tsx` and helper modules recheck the active Trove, BTC balance, transaction, and matching receipt event. | Kept; preparation and wallet confirmation remain separate. |
| Stability Pool: prepare, approve, deposit, receipt check | Working in code/tests; live E2E unverified | `StabilityPoolPanel.tsx` supports exact MUSD approval, separate deposit confirmation, and matching receipt checks. | Kept as an optional Trove tool; wallet-MUSD label corrected and duplicate instructions shortened. |
| CL Planner: refresh, pool/range/budget, prepare, simulate, approve, mint, receipt | Partial | Planner and `ClDepositPanel.tsx` support live reads and explicit wallet actions. | Kept; expected mint event/token ID are not checked after receipt. |
| CL Positions: refresh, explorer links, collect estimate | Working, read-only | Snapshot reader lists positions; collect estimate does not sign or send. | Kept; estimates are not payouts. |
| Trove Risk: refresh and drawdown control | Working, read-only | Refreshes a checked snapshot; slider recalculates local scenarios only. | Kept as a lead feature; scenarios are labeled hypothetical. |
| Pool Watch refresh | Working, read-only | Explicit refresh performs a new shared-block read; age timer does not fetch. | Kept; manual refresh is explicit. |
| Chain Watch lookup/refresh | Working, read-only | Validates a public address and performs per-network reads. | Kept; brief RPC privacy/scope note retained. |
| Bridge Status hash lookup | Working, read-only | Queries latest 100 indexed operations and matches locally; no hash sent to Wormholescan and no recovery transaction. | Kept as status only. |
| Activity refresh, older logs, CSV export | Partial | Loads bounded MUSD/MEZO log pages; CSV exports only loaded token-log rows. | Kept; history/export limitations are explicit. |

## Route checklist

- [x] `/` Landing
- [x] `/pay` public x402 checkout
- [x] `/app` Overview and balances
- [x] `/app/trove` Trove and embedded Stability Pool
- [x] `/app/trove-risk` Trove Risk Lab
- [x] `/app/swap` MUSD Swap
- [x] `/app/send` Send
- [x] `/app/pay` legacy payment prefill
- [x] `/app/pay-links` MUSD Pay Links
- [x] `/app/bridge-status` Bridge Status
- [x] `/app/chain-watch` Chain Watch
- [x] `/app/cl-positions` CL Positions
- [x] `/app/cl-planner` CL Planner and mint panel
- [x] `/app/pools` Pool Watch
- [x] `/app/activity` Activity
- [x] `/app/bridge-rescue` removed rescue alias; not found
- [x] `/app/simulation`, `/app/protocol-evidence`, and unknown app paths
- [x] Unmounted vault pages and supporting catalogue/helpers, removed after audit

## Independent x402 and API findings

| Finding | Result | Evidence and action |
|---|---|---|
| USD-string x402 asset mismatch; `payment_terms_mismatch` after charge | **Disproved; regression test added.** | `@x402/evm` 2.30.0 resolves the Testnet (`eip155:31611`) dollar price through its default registry to MUSD `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` (18 decimals, Permit2/EIP-2612 metadata). The test asserts the exact asset in the actual generated `PAYMENT-REQUIRED` header. The server validates terms before its separate `processSettlement` call. A distinct `settlement_receipt_mismatch` is possible after the settlement call and is treated as an unknown outcome. |
| MUSD buyer authorization support | **Unsupported-method concern disproved by docs and facilitator metadata; deployed ABI/live behavior unresolved.** | Mezo's x402 guide specifies Permit2 plus EIP-2612; the current facilitator `/supported` response lists the exact Testnet MUSD address for `exact` + `permit2` and EIP-2612 gas sponsorship. The pinned client uses Permit2, not `transferWithAuthorization`, and the generated header test confirms those terms. The explorer identifies the canonical address as Mezo USD but does not expose a verified ABI in the returned contract page; read-only RPC calls were blocked with HTTP 403, and no live authorization was performed. |
| Pay-link reuse and missing settled-payment state | **Confirmed; behavior clarified and tested.** | HMAC tokens are stateless and valid for up to 30 days. The same token can be submitted again; there is no durable consumed or settled record. Separate payments require buyer authorization. The feature is explicitly reusable, not single-use; exact same-authorization replay acceptance by a live facilitator is unknown. |
| In-memory rate limits | **Confirmed; documented as best-effort only.** | `FixedWindowLimiter` stores state in a process-local `Map`; Deno Deploy instances do not share memory and can restart. These limits are not global quotas or reliable one-time replay protection. |
| Facilitator endpoint / “official” wording | **Endpoint listing confirmed; ownership unverified and wording corrected.** | Mezo's official x402 docs list `https://facilitator.vativ.io` for its networks. The app hard-codes it and supports only Testnet; the status endpoint checks configuration, not endpoint health. Documentation no longer implies Mezo owns or operates Vativ. |
| Unknown API routes returning SPA HTML | **Confirmed; fixed with regression coverage.** | With static serving enabled, unknown `/api` GET/HEAD paths previously reached the SPA fallback. Unknown API paths now return JSON 404; non-API client routes still receive the SPA. |
| Unknown settlement outcome permitting a fresh signature after reload | **Confirmed gap; browser-local safeguard added.** | Before the change, the pending block was only React state and disappeared after reload. The client now records the pending state by a SHA-256 key of the link token, restores a status-only explorer screen, and does not offer a new signature for that link in the same browser. No server-side or cross-device reconciliation exists; clearing browser storage removes this local barrier. |

## Cleanup and validation

The landing page and Overview now lead with Trove, Trove Risk, and protocol tools; Send/Swap remain in secondary navigation. Copy was shortened across the retained feature pages without removing useful working views. Unavailable routes, the Bridge Rescue alias, and unmounted vault placeholders are absent from the app; unavailable features are not presented as working cards. README now matches the retained route set.

After cleanup and the added regressions, `npm test` passes **385 tests across 87 suites**; clean `npm ci`, `npm run typecheck`, `npm run build`, and `git diff --check` pass. Five tests and one suite that existed only for the deleted vault catalogue were removed; the remaining tests pass. Tests are local/mocked, not rendered UI or live E2E. No live wallet transaction or hosted x402 settlement was performed.

Remaining priorities: improve ordinary Send preflight freshness, recheck wallet context immediately before Open-Trove submission, verify the expected CL mint event/token ID, and add server-side durable x402 unknown-outcome reconciliation. The browser-local pending block is not a server ledger and does not protect the same link across devices or after browser data is cleared. The portfolio total remains unsupported until fresh prices and coverage exist for MUSD, MEZO, Pool BTC, and included DeFi positions.
