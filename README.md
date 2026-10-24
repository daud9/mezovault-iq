# MezoVault IQ, Stage 1

Foundation build: landing page, navigable app shell, and demonstration dashboards.
Stage 1 is **read-only**. It has no wallet connection, no deposits, no withdrawals and no automated transactions.

## Stack

- React 19, TypeScript, Vite 6, Tailwind CSS 4
- react-router-dom 7 for navigation
- lucide-react for icons
- Static server on Deno (`server/main.ts`) for Deno Deploy

No wallet library is included yet. Stage 2 will add one (planned: viem + wagmi) when real connection and signing are implemented.

## Project structure

```
src/
  config/      Blockchain and env configuration (kept out of UI components)
  data/        Clearly labelled demonstration data
  types/       Shared TypeScript types
  lib/         Formatting helpers
  components/
    layout/    AppShell, navigation, wallet placeholder
    ui/        Design-system primitives (Card, Badge, Button, StateViews, DemoLabel, ...)
  pages/       One file per route
server/
  main.ts      Deno static server with SPA fallback
```

## Run locally (Node)

Requires Node 20.19 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve dist/ locally
```

## Run on Deno (serve the production build)

Requires Deno 2.x.

```bash
npm install && npm run build
deno task start    # http://localhost:8000
```

## Deploy to Deno Deploy

1. Push the repository to GitHub.
2. In Deno Deploy, create an app from the repository.
3. Set the build step to `npm install && npm run build`, so `dist/` is produced.
4. Set the entrypoint to `server/main.ts`.
5. Deploy. No environment variables are required for Stage 1.

If you prefer to commit `dist/`, skip step 3 and keep `dist/` in the repository.

## Environment variables

| Name | Required | Public | Purpose |
| --- | --- | --- | --- |
| `VITE_DEFAULT_NETWORK` | No (default `testnet`) | Yes | `testnet` or `mainnet` for the header network badge |
| `VITE_MEZO_TESTNET_RPC` | No | Yes | Reserved for Stage 2 read calls |

All `VITE_*` values are embedded in the browser bundle. **Never place private keys, seed phrases, API secrets or server tokens in any variable.** The Deno server needs no secrets in Stage 1.

## Verification checklist

- `npm run build` completes with no type errors.
- `/` renders the landing page; `/app` renders the dashboard.
- Each of the seven navigation items loads, including on mobile widths.
- Refreshing a deep link such as `/app/allocation` returns the app, not a 404 (confirms SPA fallback).
- The "Connect wallet" control is disabled and makes no network request.
- All figures are labelled Demo, Illustrative or Hypothetical.

## Known limitations and items to resolve before deployment

1. Dependencies were not installed or built in the environment where this was authored. Run `npm install && npm run build` first and fix anything it reports.
2. Google Fonts (Inter) loads from a third-party CDN. If you want no external requests, self-host the font.
3. The Deno server depends on `jsr:@std/http`, which is fetched on first run and needs network access at build or start time.
4. `deno.json` sets `nodeModulesDir: none`, which is appropriate because Vite handles npm dependencies at build time. Confirm this against your Deno version.
5. No analytics, error reporting or rate limiting is configured.
6. Strategy names, APY bands and allocation weights are concepts, not endorsements, and must be replaced by sourced data before any user-facing launch. Review the disclaimer copy with counsel before public release.

## Deploying with dist/ committed (recommended)

Because this repository commits `dist/`, run `npm run build` locally before each push that changes the UI. Then deploy with no build step, using `server/main.ts` as the entrypoint.

---

## Stage 2: IQ Strategy Engine, stress testing and Smart Allocation

These features run entirely in the browser on demonstration data. Nothing here reads a live feed, sends a transaction, or moves funds.

### Modules (`src/engine/`, no UI code)

| File | Purpose |
| --- | --- |
| `types.ts` | Strategy profile and preference types |
| `catalog.ts` | Demonstration strategy profiles. Audits, addresses and history are recorded as unknown. |
| `scoring.ts` | Yield Quality Score formula (documented in the file header) |
| `matching.ts` | Constraint checks, eligibility and ranking |
| `returns.ts` | Simple and monthly-compounded projections, fees, yield-decline and withdrawal stress |
| `allocation.ts` | Constrained allocation proposal and infeasibility detection |

### Yield Quality Score

Four components, each weighted 25 points, measure evidence rather than yield:

1. **Yield-source clarity:** clear 100, partial 60, unclear 20
2. **Liquidity** (assumed exit days): ≤1 day 100, ≤7 days 70, ≤14 days 40, more 10
3. **Security evidence:** verified audit 100, partial review 50, none known 0, unknown excluded
4. **Historical performance:** supplied 0–100 score, unknown excluded

Unknown components are excluded from the average, never counted as zero. The score is withheld when less than 50% of the weight has evidence. Coverage is always displayed next to the score.

### Ranking and eligibility

Capital, risk tolerance, horizon, and liquidity are hard constraints. A conflict excludes a strategy. An unknown result (for example, no exit time) does not exclude it but ranks it below fully verified matches. The target yield is soft and only affects ordering.

### Allocation rules

- The reserve is never invested.
- No strategy receives more than the per-strategy cap.
- Strategies whose available amount falls below their minimum capital are skipped and listed with a reason.
- Amounts are rounded down to cents.
- If the caps cannot absorb all deployable capital, the status is `partial` and the unplaced amount is reported. If nothing can be placed, the status is `infeasible`.

### Tests

```bash
npm install
npm test          # runs src/engine/*.test.ts with Node's built-in test runner via tsx
```

65 tests cover scoring formula and thresholds, unknown-data handling, catalogue honesty (no invented audits or addresses), risk and horizon eligibility, ranking determinism, return formulas, fee and stress behaviour, input validation, and allocation constraints and infeasibility.

The test files are excluded from `tsconfig.json`, so `npm run build` does not compile them, and Vite does not bundle them.

### Known limitations

- The UI components were not compiled or rendered in the authoring environment. The engine was type-checked under strict settings, and the TSX files were checked for syntax only. Run `npm run build` and check each page on a phone.
- Strategy data, liquidity days and minimum capitals are design assumptions, not verified facts.
- Stress scenarios use constant yield and do not model price moves, depegs, or liquidation cascades.
- No wallet or blockchain integration is implemented in this stage.

---

## Stage 3: Mezo Testnet, wallet connection and MUSD balance

### Verified network configuration

Checked against Mezo's official documentation on the date of this build. The source of each value is also recorded in `src/config/chains.ts`.

| Item | Testnet | Mainnet | Source |
| --- | --- | --- | --- |
| Network name | Mezo Testnet | Mezo Mainnet | developer guide |
| Chain ID | 31611 (`0x7b7b`) | 31612 (`0x7b7c`) | developer guide |
| RPC (HTTPS) | `https://rpc.test.mezo.org` | `https://rpc-http.mezo.boar.network` | developer guide |
| RPC (WSS) | `wss://rpc-ws.test.mezo.org` | `wss://rpc-ws.mezo.boar.network` | developer guide, RPC providers |
| Explorer | `https://explorer.test.mezo.org` | `https://explorer.mezo.org` | developer guide |
| Faucet | `https://faucet.test.mezo.org` | none | developer guide |
| Gas token | BTC, 18 decimals | BTC, 18 decimals | developer guide |
| MUSD contract | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` | `0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186` | contracts reference, x402 payments page |
| MUSD decimals | 18 (checked on-chain at runtime) | 18 | x402 payments page |
| BorrowerOperations | `0xCdF7028ceAB81fA0C6971208e83fa7872994beE5` | `0x44b1bac67dDA612a41a58AAf779143B181dEe031` | MUSD redemptions page (proxy) |

Corrections from Stage 1: the mainnet RPC was previously `mezo.drpc.org`, which appears only in third-party listings. It has been replaced with the official endpoint.

Conflicting sources: one third-party README states that MUSD has 6 decimals. Official sources state 18. The app does not assume either value. It reads `decimals()` and `symbol()` from the contract and refuses to display a balance unless they match `18` and `MUSD`.

### Wallet connection

- Uses the injected EIP-1193 provider (`window.ethereum`). No third-party wallet library was added, so the dependency surface is unchanged.
- The app requests only `eth_requestAccounts`, `eth_chainId`, and network switching. It never requests keys, seed phrases, signatures or transactions.
- Nothing connects automatically. The user presses Connect on each visit.
- Disconnect clears the app's state. A wallet keeps its site permission until the user revokes it in the wallet's settings.
- Wrong networks are detected by comparing the wallet's chain with the configured chain. Switching uses `wallet_switchEthereumChain`, falling back to `wallet_addEthereumChain` with the official parameters when the wallet doesn't know the network.

### MUSD balance

`readMusdBalance` runs these checks in order. Each failure returns its own status and never a demonstration value:

1. `eth_chainId` must equal 31611.
2. `eth_getCode` at the token address must return code.
3. `decimals()` must equal 18.
4. `symbol()` must equal `MUSD`.
5. `balanceOf(owner)` is read and formatted with BigInt. Display values are truncated, and the exact value is shown alongside.

The result also records the block number and the retrieval time.

### Protocol availability

See `src/config/protocols.ts` and the Vault Intelligence page. No deposit, withdrawal, lending, borrowing or yield capability is marked verified. Candidates that appear only in third-party repositories are not used.

| Candidate | Evidence |
| --- | --- |
| MUSD token | Official address |
| BorrowerOperations | Official address; functions not verified in this build |
| Mezo Earn | Official docs; no testnet address located |
| Bitcoin savings / yield vaults | Mentioned in public overview; no address located |
| Morpho aMUSD vault | Named in official contracts reference; no testnet address |
| Mezo Router | Third-party only; not used |
| Collat vault | Third-party only; not used |

### Yield Quality Score

Three values are shown separately:

- **Assessment:** weighted average of known components only. Withheld below 50% evidence coverage.
- **Evidence coverage:** share of the weight that has evidence.
- **Evidence-adjusted score:** weighted sum over known components divided by the total weight, so unknown components count as zero. Ranking and allocation order use this value, so missing evidence cannot raise a strategy above one with complete evidence.

### Tests

```bash
npm test
```

The suite covers network verification, ABI encoding and decoding, token formatting (including truncation and dust display), RPC failure modes (network, timeout, HTTP, JSON-RPC errors, malformed responses, missing configuration), MUSD reads (missing contract, wrong chain, decimals or symbol mismatch, zero balance, failed requests), the wallet state machine, the switch-network fallback, configuration values, and the protocol registry rules.

### Remaining integration requirements

1. **Browser access to the RPC.** The app calls `https://rpc.test.mezo.org` directly from the browser. Whether that endpoint sends CORS headers for the app's origin has not been verified. If it doesn't, balance reads will fail with a network error. Test this on the deployed site, and if needed use a provider that allows browser access, or add a server-side proxy.
2. **End-to-end wallet test.** The connection flow has been unit-tested through its state machine and fake provider only. It has not been run against a real wallet extension on a phone or desktop.
3. **Type checking of the UI.** The sandbox has no React or Lucide type packages, so the TSX files were checked for syntax only. `npm run build` is the real check.
4. **Testnet balance.** Testnet MUSD is minted by borrowing against testnet BTC, so most wallets will show zero until they open a position.
