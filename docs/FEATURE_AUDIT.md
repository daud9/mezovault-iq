# MezoVault IQ feature audit

The audit found and fixed safety, data-labeling and usability gaps across the project. Commit `142bae5` is on `main` and deployed. No wallet transaction was signed or submitted. The competition rubric was not provided, so this review makes no score or judging-criteria claims.

## Changes made

- The shared JSON-RPC client now rejects malformed response envelopes and mismatched IDs, and keeps its timeout active until the response body is parsed. Regression tests cover malformed results, malformed errors and a body that stalls after headers.
- Generic ERC-20 sends now simulate the exact transfer call before review and require a return value of exactly `true`. Receipt parsing accepts only status `0x1` as success and `0x0` as revert; malformed or unexpected values remain unknown. This follows the ERC-20 rule that callers must handle a returned `false` [8].
- MUSD Swap now checks the pool’s returned output-token address against its configured Testnet token address. The UI names the output Pool BTC, not native BTC, discloses the documented 0.30% volatile-pool fee without pretending to calculate price impact, warns that official Mezo pool documentation does not publish the configured Pool BTC token address, and correctly points users to Send for Pool BTC transfers [3].
- Stability Pool deposits now always show the exact in-app review before any wallet request, including when the first and second preparations match. The exact approval and deposit remain separate wallet approvals.
- Pool Watch reads every pool at the same snapshot block, labels the metric as a reserve ratio rather than a spot price, and marks results stale after two minutes without a refresh. Mezo documents distinct stable-curve and volatile-pool mechanics, so a reserve ratio is not presented as a stable-pool executable quote [3].
- Trove Risk Lab now requires both status `4` and a matching redemption event before using its app-defined `RISK-ESCAPED` label. It also has an adjustable BTC drawdown scenario calculated with integer arithmetic; the UI identifies the result as a scenario, not a forecast. Mezo distinguishes redemption from liquidation in its TroveManager status and events [14].
- The Trove open review now says ongoing interest is not read or included in its one-time fee. Mezo’s borrowing guide says interest accrues and describes fixed rates of 1–5%; this code does not claim that range is the current rate of a particular Testnet position [4].
- x402 settlement errors now return an explicit unknown status. The checkout preserves a facilitator transaction hash when one is available and blocks another authorization while settlement is unresolved. The x402 guidance treats a timeout after payment submission as indeterminate, not proof that payment failed [6] [7].
- Activity now records readable labels for app-submitted wallet actions. It discloses its 200-entry local cap and describes successful receipts as execution in a block, not finality.
- Chain Watch no longer calls chain-ID and token-metadata checks “verified.” Its copy states which RPC-reported chain ID, bytecode, symbol and decimals checks passed. The Mainnet RPC now matches the HTTPS endpoint listed in Mezo’s developer guide [1]. The page also discloses the unresolved Mainnet MEZO identity conflict described below.
- The wallet panel exposes network-switch errors and accurately says its disconnect action clears this app’s local connection state without revoking wallet authorization. The panel uses an expandable region rather than claiming dialog behavior it does not implement.
- Secondary pages are lazy-loaded, so visitors do not download every feature route when opening the app. The landing page now names actual reads and wallet actions instead of generic slogans or unsupported “verified” claims.
- Send now accepts keyboard submission, shows recipient and amount errors beside their fields, and clears the prepared review when the draft changes. Before confirmation it compares the recipient, asset and exact base-unit amount again; fields stay locked while a submitted hash is unresolved.
- Phone navigation keeps four primary routes visible and puts the remaining eight in the More menu. A route change focuses the main region, the skip link becomes visible on focus, shared buttons and choice controls have 44px targets, and error summaries receive focus. A regression test checks muted-text contrast against every dark surface.

## Feature-by-feature findings

### Landing, Overview and wallet connection

The landing page now follows the selected network configuration and describes the actual product: balance and position reads, protocol monitors, and wallet-reviewed actions. Overview reports a partial BTC oracle value rather than a complete portfolio valuation. Wallet connection does not itself submit a transaction. The user still approves each wallet request. The connected wallet panel now shows failed network switches and explains local disconnect behavior; it does not claim to revoke wallet permissions [1] [11].

The remaining shared-data limitation is that most balance pages do not age successful reads into a stale state. A result can remain on screen until the user refreshes or changes wallet context. The RPC chain ID check and a matching token symbol do not authenticate an RPC provider or prove a token is canonical [9] [11].

### MUSD Swap

The route checks the Testnet network, configured pool and factory relationships, MUSD balance and allowance, a pinned quote, exact-call simulation, gas affordability, slippage floor and receipt events. An insufficient allowance produces a separate exact approval; the app then refreshes its quote and waits for a separate swap confirmation. The new token-address guard closes a real identity gap in which a same-symbol BTC token at another address could have passed earlier checks.

The configured Pool BTC contract address is still not listed in the official Mezo contract or pool references reviewed. The app verifies code, symbol and decimals and checks that the configured pool returns that token, but those checks do not establish canonical asset identity. Keep the visible warning and Testnet-only scope until Mezo publishes or otherwise confirms the exact mapping. The review also does not separate the documented 0.30% volatile-pool fee from price impact. Receipts establish successful execution in a block; the app has no Mezo-specific finality rule [3].

### Send and legacy Pay

Native BTC, MUSD and MEZO use their respective transfer paths. Pool BTC uses one configured Testnet ERC-20 address. The exact ERC-20 call is simulated before the wallet review, its boolean return must be true, gas is estimated, and insufficient native BTC for fees blocks the review. The interface distinguishes Pool BTC from native BTC and links to the explorer. It now states that Mezo’s official pool documentation does not list the Pool BTC token address. The status screen calls receipt success block inclusion, not finality [8] [10].

The Send form submits from the keyboard and shows recipient and amount errors beside the related inputs. Changing the recipient, token or amount clears the old review. A final comparison requires the same recipient, asset and exact base-unit amount before confirmation.

The `/app/pay` route remains a prefill path into ordinary Send, not an x402 checkout. Activity does not discover native-BTC transfers through ERC-20 `Transfer` logs. A successful receipt does not mean a later canonical-block or finality check has been performed [8] [10].

### MUSD Pay Links and x402 checkout

The seller and buyer flows use Mezo’s x402 Testnet setup: the seller creates a fixed MUSD request and the buyer signs a typed payment authorization; the facilitator settles it. That differs from a normal token transfer, which sends an on-chain transaction from the buyer’s wallet and requires native BTC for gas [6]. The checkout now retains a settlement hash when returned and prevents a repeat authorization after an unknown or pending outcome.

There is no durable reconciliation screen if the browser is closed or the server loses its response. Link tokens are reusable for 30 days; the current server has no revocation or single-use state. Rate limits and replay checks are in process memory, so their behavior across restarts or multiple instances is unverified. The code checks that the server secret is long enough, but the deployed secret’s randomness and the deployed facilitator’s health were not checked. Do not describe hosted Pay Links as production-ready until the live secret, hosting configuration, facilitator settlement and pending-payment recovery have been tested [6] [7].

### Activity

The page combines app-submitted hashes kept in browser storage with bounded MUSD and MEZO token-log reads. It loads 5,000 blocks at a time and lets users request older pages. It still does not cover all wallet activity or native BTC transfers. The newest 200 app-submitted entries are retained; older ones can be pruned. CSV export contains loaded token-log rows, not the local app-submitted ledger. The UI now says so and distinguishes successful inclusion from finality. A combined export with chain, wallet, token contract, block range and provenance would be a useful next improvement [8] [10].

### Chain Watch

Chain Watch is read-only. A user-submitted address is sent to the configured public RPC providers, which may log it. It keeps balances separate by network and does not add prices or a combined portfolio total. The updated labels describe the actual checks instead of implying that an RPC-reported chain ID and token metadata prove canonical identity [8] [9] [11].

One address conflict remains: Mezo’s contracts reference lists `0x7B7c000000000000000000000000000000000001` as MEZO, but the current Mezo Mainnet explorer labels that address “Stub Token (goerli)” (STUB). The Testnet explorer labels the same address MEZO. The live symbol check should withhold a Mainnet balance when it receives STUB, and the page now warns users about the disagreement. Do not label the Mainnet token route as confirmed until Mezo resolves the discrepancy [2] [18] [19].

If an unexpected network promise rejects, the page-level `Promise.all` can discard other networks’ successful results. Per-network settled results would let the page keep the cards that did load and show only the failed network as unavailable.

### Bridge Status Tracker

The tracker queries Wormholescan for up to 100 recent indexed operations, then matches the submitted hash locally. A missing result is inconclusive. A destination transaction hash means it was indexed; it does not prove successful execution or finality. The page now uses that narrower wording. It offers no rescue, refund or claim transaction. The 100-operation search limit remains, and the current response path does not establish that further pagination is supported [12] [13].

### Pool Watch

This read-only page covers the three documented Testnet basic pools and now reads them at a shared block. Its age indicator changes to stale after two minutes without a refresh. The cards show reserve ratios, not executable quotes or a stable-curve marginal price. The MUSD/mUSDT address is in Mezo’s documentation, but its explorer page was sparse in the audit; the reader withholds data if code or required calls fail. It should remain visibly unavailable when checks cannot be completed [3].

A block-stamped reserve history with pool type, returned token addresses and source links would make this a stronger observatory without promising APY, USD liquidity or trade outcomes.

### CL Positions

The monitor is read-only and reports wallet-held and gauge-staked NFTs, tick ranges and a simulated collect result. The simulated collect is not a payout guarantee, especially for gauge-held positions: its assumed caller does not establish that the live gauge can execute the same action. Gauge enumeration also depends on hard-coded selectors not documented in the Mezo pages reviewed. Keep the simulation caveat and verify those selectors and deployed gauge behavior before using the result as an amount a user can collect [3].

### CL Planner and deposit

The planner uses on-chain decimals and aligned tick ranges; its deposit flow prepares bounded amounts, exact approvals and a mint simulation before the user opens the wallet. The receipt message now says successful execution in a block, not finality. Remaining risks are time-of-check/time-of-use and stale-head detection: the prepared action can remain usable for up to 30 seconds, while freshness mainly uses the client’s retrieval time. A recent HTTP response does not prove the RPC returned a recent chain head. The configured manager/factory implementation relationships should be checked against official deployment artifacts before release [3] [10].

A useful next feature is a user-controlled range-sensitivity view that shows how token composition and in/out-of-range state change at selected prices. Label it as a calculation from pool state, not a forecast or fee estimate [3].

### Trove and Stability Pool

Trove supports Testnet position reads, opening a Trove and adding BTC collateral. It does not offer borrowing more, repayment, collateral withdrawal or closure. The opening review now distinguishes requested proceeds, the one-time fee and composite debt for collateral checks, and warns that ongoing interest is not read or included. The deployed Testnet interest rate and proxy implementation still need verification before adding a numeric cost estimate [4] [15].

The Stability Pool reads deposits and collateral gains and supports deposits. Its review is now always visible before a wallet request. Deposit balances can be reduced by liquidations, and BTC gains depend on liquidation activity; they are not a promised return. Withdrawal and collateral-gain actions are not implemented [5].

### Trove Risk Lab

The page compares a live Trove ratio with the live MCR and now lets the user choose a hypothetical BTC price drawdown. It does not forecast prices. Closed status `4` remains visible when redemption logs are unavailable, but `RISK-ESCAPED` appears only when a matching closure event is found. The search covers the latest 10,000 blocks, so older history can remain unclassified. The page does not reconstruct a closed Trove’s final pre-redemption ratio [14].

## Build and validation

`npm test` passes 386 tests across 86 suites. `npm run typecheck`, `npm run build` and `git diff --check` pass. The tests use local or mocked data; they do not test a live wallet popup, facilitator settlement or a real transaction. Chromium checks at 320×640, 375×812, 768×1024, 812×375 and 1440×900 found no horizontal overflow. The 375px More menu exposes all eight secondary routes, route changes focus the main region, and the skip link becomes visible on focus. Reduced motion was enabled for the screenshots. The [phone capture](../submission-assets/pool-watch-mobile-375.png) and [desktop capture](../submission-assets/pool-watch-desktop-1440.png) show a live Pool Watch read at block 16793573 from the local build used for `142bae5`, now deployed.

Vite emits separate route chunks. The shared entry chunk is 314.18 KB (98.67 KB gzip); the x402 buyer chunk is 397.59 KB (120.38 KB gzip) and is loaded separately from the main entry. Route splitting reduces the code initially shared by every page, but the x402 path remains the largest chunk and deserves dependency/import review. The build also reports non-fatal `@__PURE__` annotation warnings from the installed Zod dependency. No browser timing or Lighthouse measurement was taken.

## Competition and release priorities

No judging rubric was supplied, so this audit does not predict how a panel will score the project. The strongest substantiated product story is a Mezo Testnet console that separates public reads, simulations, wallet approvals and receipt evidence. A short demo can show Pool Watch at a shared block, a hypothetical Trove price shock, and a MUSD Swap review that stops before any wallet request.

Before a broad public demo, resolve Pool BTC provenance and the Mainnet MEZO explorer conflict, then test the hosted x402 path through a pending and successful settlement. The highest-value product addition after those checks is a portable evidence receipt containing network, block, source addresses, reviewed terms, simulation result, transaction hash and receipt state. For x402, add durable reconciliation before offering a second authorization. Do not add numbers for yield, fee income, borrower interest or finality without verified data and rules.

## References

[1]: https://mezo.org/docs/developers/getting-started/ "Mezo Developer Getting Started Guide"
[2]: https://mezo.org/docs/users/resources/contracts-reference/ "Mezo Contracts and Token Addresses"
[3]: https://mezo.org/docs/developers/features/mezo-pools/ "Mezo Pools"
[4]: https://mezo.org/docs/users/borrow/mint-musd/ "How to Borrow and Mint MUSD"
[5]: https://mezo.org/docs/users/borrow/liquidation-mechanics.md "MUSD Liquidations and Redemptions"
[6]: https://mezo.org/docs/developers/getting-started/musd-payments-x402/ "Mezo MUSD Payments with x402"
[7]: https://docs.x402.org/core-concepts/client-server "x402 Client and Server Flow"
[8]: https://eips.ethereum.org/EIPS/eip-20 "ERC-20 Token Standard"
[9]: https://www.jsonrpc.org/specification "JSON-RPC 2.0 Specification"
[10]: https://ethereum.org/developers/docs/apis/json-rpc/ "Ethereum JSON-RPC API"
[11]: https://eips.ethereum.org/EIPS/eip-3788 "Strict Enforcement of Chain ID"
[12]: https://wormhole.com/docs/products/messaging/guides/wormholescan-api/ "Wormholescan API Guide"
[13]: https://github.com/mezo-org/ntt-bridge-mezo-testnet/blob/main/deployment.json "Mezo Testnet NTT Deployment Manifest"
[14]: https://github.com/mezo-org/musd/blob/main/solidity/contracts/TroveManager.sol "Mezo TroveManager Source"
[15]: https://raw.githubusercontent.com/mezo-org/musd/main/solidity/contracts/BorrowerOperations.sol "Mezo BorrowerOperations Source"
[18]: https://explorer.mezo.org/address/0x7B7c000000000000000000000000000000000001 "Mezo Mainnet Explorer: disputed MEZO address"
[19]: https://explorer.test.mezo.org/address/0x7B7c000000000000000000000000000000000001 "Mezo Testnet Explorer: MEZO address"
