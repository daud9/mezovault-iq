# MezoVault IQ

**App:** [mezovault-iq.daud9.deno.net](https://mezovault-iq.daud9.deno.net/)

**Repository:** [daud9/mezovault-iq](https://github.com/daud9/mezovault-iq)

MezoVault IQ is a Mezo Testnet console for checking balances and protocol positions, preparing wallet actions, and reading transaction receipts. Public reads, simulations and wallet-confirmed writes are shown as separate steps.

> **Audit status (2026-11-15):** the public deployment remains at commit `d3e4cd7`. Local audit changes are uncommitted and have not been deployed. No wallet transaction was signed or submitted. See [the feature audit](docs/FEATURE_AUDIT.md) for fixes, source-backed risks and remaining release checks.

## A short demo

1. Open Pool Watch without connecting a wallet. Compare the configured Testnet pools at one shared block; the displayed values are reserve ratios, not trade quotes.
2. Use Chain Watch only with a public address you are comfortable querying through public RPC providers. The page does not save the address.
3. Connect a Testnet wallet and inspect Overview or Trove Risk Lab. Risk Lab’s adjustable BTC drawdown is a hypothetical scenario, not a price forecast.
4. If you want to inspect a write path, open the MUSD Swap review. The app shows the exact terms before opening the wallet; do not approve a wallet request unless you intend to submit that transaction.

The demo does not require a transaction. A wallet prompt, simulation or receipt reader is not proof that a hosted or live transaction flow has been tested end to end.

## App surfaces

**Read-only and monitoring:** Overview shows available wallet balances and a partial BTC oracle estimate. Pool Watch reads three configured Testnet basic pools at a common block. Chain Watch checks configured MUSD and MEZO routes across supported EVM networks. Bridge Status Tracker looks up recent indexed Mezo Testnet NTT activity. CL Positions monitors wallet-held and gauge-staked position NFTs. Trove Risk Lab compares a live Trove ratio with the live MCR and offers hypothetical price-shock scenarios. Activity shows app-submitted transaction hashes and bounded token-transfer logs.

**Wallet actions:** MUSD Swap prepares a Testnet MUSD-to-Pool-BTC swap with a separate exact approval when needed. Send supports native BTC, MUSD, MEZO and the configured Pool BTC ERC-20 on Testnet. MUSD Pay Links and the public `/pay` page use a Testnet x402 flow. Trove supports opening a position and adding BTC collateral. The Stability Pool supports MUSD deposits. CL Planner prepares a concentrated-liquidity position mint.

Every write requires an explicit wallet action. The app does not receive a seed phrase or private key. Successful receipt status means execution succeeded in a block; the app does not claim transaction finality.

## Known limits before release

- Mezo’s official Pool BTC token address is not published in the pool documentation reviewed. Swap and Send check the configured address, code, symbol and decimals, but these checks do not prove canonical asset identity. The app warns users and keeps the route Testnet-only [Mezo Pools documentation](https://mezo.org/docs/developers/features/mezo-pools/).
- Mezo’s contracts reference lists `0x7B7c000000000000000000000000000000000001` as MEZO, while the current Mainnet explorer labels the same address “Stub Token (goerli)” (STUB). Chain Watch now discloses this conflict and withholds a balance if the on-chain symbol does not match. Check the [contracts reference](https://mezo.org/docs/users/resources/contracts-reference/) and [Mainnet explorer](https://explorer.mezo.org/address/0x7B7c000000000000000000000000000000000001) before relying on a Mainnet MEZO balance.
- Hosted x402 Pay Link creation, facilitator health and pending-payment recovery have not been tested live. The checkout now blocks another authorization after an unknown outcome in the current page session, but it does not provide durable reconciliation if the page is closed.
- Activity is partial. It retains at most 200 app-submitted hashes in browser storage, reads MUSD/MEZO transfer logs in 5,000-block pages, and exports only loaded token-log rows. It is not a complete wallet history and does not include native BTC transfers.
- Trove does not support borrowing more, repayment, collateral withdrawal or closure. Stability Pool withdrawals and collateral-gain actions are not exposed. CL collect estimates are simulations, not guaranteed payouts.
- Most pages use one configured RPC endpoint and do not auto-refresh. Chain ID and token metadata checks do not independently authenticate a provider or establish contract canonicality.

For feature-specific limitations and improvement priorities, see [the feature audit](docs/FEATURE_AUDIT.md).

## Networks

The app’s default Mezo Testnet configuration uses chain ID `31611` and `https://rpc.test.mezo.org`. Mainnet uses chain ID `31612`; its configured HTTPS endpoint is the Boar URL currently listed by Mezo’s [developer guide](https://mezo.org/docs/developers/getting-started/). MUSD Swap and Pool BTC Send are Testnet-only. Do not treat Testnet balances or assets as having real monetary value.

## Validation and performance

The current worktree passes:

- `npm test`: 386 tests across 86 suites.
- `npm run typecheck`.
- `npm run build`.
- `git diff --check`.

Tests use local and mocked data. Chromium spot checks at 320×640, 375×812, 768×1024, 812×375 and 1440×900 found no horizontal overflow. The phone menu shows all eight secondary routes, and route changes focus the main content. These checks do not cover a live wallet popup, live x402 settlement or a real transaction. The two local-worktree screenshots show Pool Watch at Testnet block 16793573; the public site remains at the earlier deployed commit.

- [Phone, 375×812](submission-assets/pool-watch-mobile-375.png)
- [Desktop, 1440×900](submission-assets/pool-watch-desktop-1440.png)

Vite builds separate route chunks; the shared entry is 314.18 KB (98.67 KB gzip), while the lazily loaded x402 buyer chunk is 397.59 KB (120.38 KB gzip). The build also reports non-fatal `@__PURE__` annotation warnings from the installed Zod dependency. No browser timing or Lighthouse score was measured.

## Run locally

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

`VITE_DEFAULT_NETWORK` accepts `testnet` (default) or `mainnet`. `VITE_MEZO_TESTNET_RPC` can override the public Testnet RPC. Never put a private key, seed phrase or server secret in a `VITE_` variable; browser-bundled values are public. The dynamic x402 server uses a separate server-only `PAY_LINK_SECRET`.

## Project structure

```text
src/config/       network, token, pool and route settings
src/lib/          RPC, ABI, wallet safety, transaction and protocol readers
src/components/   wallet, balance and shared interface components
src/pages/        Overview, Swap, Send, Pay Links, Activity, monitors and tools
server/           dynamic app server and x402 merchant endpoints
docs/             implementation notes and the source-linked feature audit
```
