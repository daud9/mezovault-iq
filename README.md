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
