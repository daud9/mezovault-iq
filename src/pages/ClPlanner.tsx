import { useEffect, useMemo, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ClDepositPanel } from "../components/cl/ClDepositPanel";
import { DataStatus } from "../components/ui/DataStatus";
import { ErrorState, LoadingState } from "../components/ui/StateViews";
import { SectionHeader } from "../components/ui/SectionHeader";
import { useWallet } from "../components/wallet/WalletProvider";
import { OFFICIAL_SOURCES } from "../config/chains";
import { TESTNET_CL_CONTRACTS } from "../config/clPositions";
import { useClPlanner } from "../hooks/useClPlanner";
import { calculateClTokenSplit, clHumanPrice, type ClPlannerPool } from "../lib/clPlanner";
import { shortAddress } from "../lib/format";

const MAX_SNAPSHOT_AGE_MS = 120_000;

export function ClPlanner() {
  const { network } = useWallet();
  const { view, refresh } = useClPlanner();
  const [selectedAddress, setSelectedAddress] = useState("");
  const [lowerPrice, setLowerPrice] = useState("");
  const [upperPrice, setUpperPrice] = useState("");
  const [budget, setBudget] = useState("");
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, []);

  const snapshot = view.status === "done" ? view.snapshot : null;
  const pool = snapshot?.pools.find((item) => item.address.toLowerCase() === selectedAddress.toLowerCase())
    ?? snapshot?.pools[0]
    ?? null;
  const selectionMatchesPool = !selectedAddress || pool?.address.toLowerCase() === selectedAddress.toLowerCase();

  useEffect(() => {
    if (!snapshot || snapshot.pools.length === 0) return;
    const selectedExists = snapshot.pools.some((item) => item.address.toLowerCase() === selectedAddress.toLowerCase());
    if (!selectedAddress || !selectedExists) {
      setSelectedAddress(snapshot.pools[0].address);
      if (selectedAddress && !selectedExists) {
        setLowerPrice("");
        setUpperPrice("");
        setBudget("");
      }
    }
  }, [snapshot, selectedAddress]);

  const snapshotAge = snapshot ? Math.max(0, clock - Date.parse(snapshot.fetchedAt)) : Number.POSITIVE_INFINITY;
  const fresh = snapshot !== null && selectionMatchesPool && snapshotAge <= MAX_SNAPSHOT_AGE_MS && view.status === "done" && !view.refreshing && !view.refreshError;
  const calculation = useMemo(() => {
    if (!pool || !fresh || !lowerPrice.trim() || !upperPrice.trim() || !budget.trim()) return { result: null, error: null };
    const lower = Number(lowerPrice);
    const upper = Number(upperPrice);
    const total = Number(budget);
    try {
      return { result: calculateClTokenSplit(pool, { lowerPrice: lower, upperPrice: upper, budgetToken1: total }), error: null };
    } catch (error) {
      return { result: null, error: error instanceof Error ? error.message : "The split could not be calculated." };
    }
  }, [pool, fresh, lowerPrice, upperPrice, budget]);

  const testnet = network.key === "testnet" && network.chainId === TESTNET_CL_CONTRACTS.chainId;

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Mezo Testnet · live pool state · read-only"
        title="CL Range Planner"
        description="Choose a factory-listed active Slipstream pool, enter a price range and a token1-valued budget, and preview the token composition at the current on-chain price."
        actions={testnet ? (
          <Button variant="ghost" onClick={refresh} className="min-h-11 px-2" disabled={view.status === "done" && view.refreshing}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
          </Button>
        ) : undefined}
      />

      {!testnet ? (
        <Card className="space-y-3">
          <DataStatus state="not-configured" detail="Mezo Testnet only" />
          <p className="text-sm leading-relaxed text-mist-400">This planner reads only the official Mezo Testnet CL Factory. This app build is configured for {network.label}; changing the wallet network alone cannot change the app’s configured network, and no other chain is queried.</p>
        </Card>
      ) : view.status === "loading" ? (
        <LoadingState label="Reading factory-listed pools and live CL state from Mezo Testnet" />
      ) : view.status === "error" ? (
        <ErrorState title="Live pool read unavailable" description={view.message} onRetry={refresh} />
      ) : snapshot && snapshot.pools.length === 0 ? (
        <Card className="space-y-3">
          <DataStatus state="unavailable" detail="No usable active pools" />
          <h2 className="text-base font-semibold text-mist-100">No active pool with readable token decimals was found</h2>
          <p className="text-sm leading-relaxed text-mist-400">The factory listed {snapshot.factoryPoolCount} pool(s) at block {snapshot.blockNumber.toLocaleString()}, but none had both nonzero current liquidity and readable on-chain token decimals. No sample pools or assumed decimal values are substituted.</p>
          <Button variant="secondary" onClick={refresh}><RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh live reads</Button>
        </Card>
      ) : snapshot && pool ? (
        <>
          <Card className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-mist-100">Live pool and range inputs</h2>
                <p className="mt-1 text-sm leading-relaxed text-mist-400">The pool list comes from the official factory. Only pools with nonzero live liquidity and readable token decimals are selectable.</p>
              </div>
              <DataStatus
                state={fresh ? "live" : "unavailable"}
                detail={fresh ? `Block ${snapshot.blockNumber.toLocaleString()}` : view.status === "done" && view.refreshError ? "Latest refresh failed" : "Snapshot stale or refreshing"}
              />
            </div>

            {view.refreshError && <p role="alert" className="rounded-xl border border-risk-high/30 bg-risk-high/5 p-3 text-sm text-risk-high">The latest refresh failed: {view.refreshError}. The previous snapshot is retained for reference, but calculations are paused until a fresh read succeeds.</p>}
            {!fresh && !view.refreshError && <p role="status" className="rounded-xl border border-risk-medium/30 bg-risk-medium/5 p-3 text-sm text-risk-medium">A fresh pool snapshot is required before the token split can be shown. Refreshing takes about a minute automatically; you can also refresh now.</p>}

            <div className="grid gap-4 lg:grid-cols-2">
              <Field id="cl-planner-pool" label="Active factory pool" hint={`${snapshot.pools.length} selectable · ${snapshot.factoryPoolCount} factory-listed · ${snapshot.excludedPoolCount} excluded (zero liquidity or unreadable decimals)`}>
                <select
                  id="cl-planner-pool"
                  value={pool.address}
                  onChange={(event) => {
                    setSelectedAddress(event.target.value);
                    setLowerPrice("");
                    setUpperPrice("");
                    setBudget("");
                  }}
                  className="min-h-12 w-full rounded-xl border border-line bg-ink-800 px-3 text-sm text-mist-100"
                >
                  {snapshot.pools.map((item) => (
                    <option key={item.address} value={item.address}>{item.token0.symbol}/{item.token1.symbol} · spacing {item.tickSpacing} · {shortAddress(item.address)}</option>
                  ))}
                </select>
              </Field>
              <div className="rounded-xl border border-line bg-ink-800/50 p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-mist-500">Live pool state</p>
                <p className="mt-2 text-sm font-semibold text-mist-100">1 {pool.token0.symbol} ≈ {formatPrice(clHumanPrice(pool))} {pool.token1.symbol}</p>
                <p className="mt-1 break-all text-xs text-mist-500">Tick {pool.currentTick.toLocaleString()} · tick spacing {pool.tickSpacing} · active liquidity {pool.activeLiquidity}</p>
                <p className="mt-1 break-all text-xs text-mist-500">Pool {pool.address} · block {snapshot.blockNumber.toLocaleString()} · read {formatAge(snapshotAge)} ago</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <PriceField id="cl-planner-lower" label="Lower price" value={lowerPrice} setValue={setLowerPrice} token0={pool.token0.symbol} token1={pool.token1.symbol} />
              <PriceField id="cl-planner-upper" label="Upper price" value={upperPrice} setValue={setUpperPrice} token0={pool.token0.symbol} token1={pool.token1.symbol} />
              <Field id="cl-planner-budget" label={`Total budget (${pool.token1.symbol})`} hint="Budget is valued in token1 at the current pool price; it is not a USD amount.">
                <input id="cl-planner-budget" type="number" inputMode="decimal" min="0" step="any" value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="Enter amount" className="min-h-12 w-full rounded-xl border border-line bg-ink-800 px-3 text-sm text-mist-100 placeholder:text-mist-500" />
              </Field>
            </div>

            {calculation.error && <p role="alert" className="rounded-xl border border-risk-high/30 bg-risk-high/5 p-3 text-sm text-risk-high">{calculation.error}</p>}

            {calculation.result ? (
              <div className="space-y-4 rounded-2xl border border-gold-500/30 bg-ink-800/50 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-mist-500">Estimated required token split</p>
                    <h3 className="mt-1 text-lg font-semibold text-mist-100">{calculation.result.inRange ? "Current price is within the selected range" : "Current price is outside the selected range"}</h3>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${calculation.result.inRange ? "border-risk-low/40 bg-risk-low/10 text-risk-low" : "border-risk-medium/40 bg-risk-medium/10 text-risk-medium"}`}>
                    {calculation.result.inRange ? "Current tick in range" : pool.currentTick < calculation.result.lowerTick ? "Price below range" : "Price at/above upper bound"}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <TokenAmount token={pool.token0} amount={calculation.result.token0Amount} />
                  <TokenAmount token={pool.token1} amount={calculation.result.token1Amount} />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <MiniStat label="Aligned lower bound" value={`${formatPrice(calculation.result.alignedLowerPrice)} ${pool.token1.symbol}`} detail={`Tick ${calculation.result.lowerTick.toLocaleString()}`} />
                  <MiniStat label="Aligned upper bound" value={`${formatPrice(calculation.result.alignedUpperPrice)} ${pool.token1.symbol}`} detail={`Tick ${calculation.result.upperTick.toLocaleString()}`} />
                  <MiniStat label="Current price" value={`${formatPrice(calculation.result.currentPrice)} ${pool.token1.symbol}`} detail={`1 ${pool.token0.symbol}`} />
                </div>
                <p className="text-xs leading-relaxed text-mist-500">Approximate composition only. User-entered prices are rounded outward to the pool’s tick spacing. This preview uses the live spot price and standard CL amount equations; it excludes fees, slippage, gas, token transfer behavior, exact integer rounding and future price movement. Amounts are not a quote or transaction instruction.</p>
              </div>
            ) : (
              <p className="rounded-xl border border-line bg-ink-800/40 p-4 text-sm leading-relaxed text-mist-400">Enter a positive lower price, upper price and total budget to calculate a split. Prices are denominated as token1 per token0; no values are filled in or inferred.</p>
            )}
          </Card>

          <ClDepositPanel
            pool={pool}
            lowerPrice={lowerPrice}
            upperPrice={upperPrice}
            budgetToken1={budget}
            plannerBlockNumber={snapshot.blockNumber}
            enabled={fresh && calculation.result !== null}
            network={network}
          />

          <Card className="space-y-3 text-sm leading-relaxed text-mist-400">
            <h2 className="font-medium text-mist-200">Read-only planner safety and data notes</h2>
            <p>The planner card reads public pool state from the official Mezo Testnet CL Factory at chain 31611 and uses token symbols/decimals returned on-chain. Snapshot block and age are shown above; if the read is unavailable or older than two minutes, planner calculations are withheld. A pool is selectable only when its factory listing, contract code, live liquidity and both token decimals are readable. Range status means the current tick is inside the hypothetical bounds; pool-wide active liquidity is not a promise of liquidity available to this exact range.</p>
            <p>The planner card itself remains read-only and does not calculate APY, returns, fees earned or USD valuation. The separate deposit panel above requires its own current review and explicit wallet actions; it is Testnet-only and does not add collection, stake or reward controls.</p>
            <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
              <a href={OFFICIAL_SOURCES.mezoPools} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 font-medium text-gold-300 hover:underline">Mezo Pools docs <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a>
              <a href={OFFICIAL_SOURCES.contractsReference} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 font-medium text-gold-300 hover:underline">Official contract reference <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a>
              <a href="https://github.com/velodrome-finance/slipstream/blob/main/contracts/gauge/interfaces/ICLPool.sol" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 font-medium text-gold-300 hover:underline">Slipstream pool interface <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a>
              <a href="https://github.com/velodrome-finance/slipstream/blob/main/contracts/core/interfaces/pool/ICLPoolState.sol" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 font-medium text-gold-300 hover:underline">Slipstream pool-state interface <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-mist-100">{label}</label>
      {children}
      {hint && <p className="text-xs leading-relaxed text-mist-500">{hint}</p>}
    </div>
  );
}

function PriceField({ id, label, value, setValue, token0, token1 }: { id: string; label: string; value: string; setValue: (value: string) => void; token0: string; token1: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-mist-100">{label}</label>
      <div className="flex min-h-12 items-center gap-2 rounded-xl border border-line bg-ink-800 px-3">
        <input id={id} type="number" inputMode="decimal" min="0" step="any" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Enter price" className="w-full min-w-0 bg-transparent text-sm text-mist-100 outline-none placeholder:text-mist-500" />
        <span className="shrink-0 text-xs text-mist-500">{token1}/{token0}</span>
      </div>
      <p className="text-xs leading-relaxed text-mist-500">Human price, before tick-spacing alignment.</p>
    </div>
  );
}

function TokenAmount({ token, amount }: { token: ClPlannerPool["token0"]; amount: number }) {
  return (
    <div className="rounded-xl border border-line bg-ink-900 p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-mist-500">{token.symbol}</p>
      <p className="mt-2 break-all text-xl font-semibold text-mist-100">≈ {formatAmount(amount)} {token.symbol}</p>
      <p className="mt-1 break-all text-xs text-mist-500">{token.address} · {token.decimals} on-chain decimals</p>
    </div>
  );
}

function MiniStat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-xl border border-line bg-ink-900 p-3"><p className="text-xs text-mist-500">{label}</p><p className="mt-1 break-all text-sm font-semibold text-mist-100">{value}</p><p className="mt-1 text-xs text-mist-500">{detail}</p></div>;
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "unavailable";
  return new Intl.NumberFormat("en-US", { maximumSignificantDigits: 8 }).format(value);
}

function formatAmount(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "unavailable";
  if (value > 0 && value < 1e-8) return "<0.00000001";
  return new Intl.NumberFormat("en-US", { maximumSignificantDigits: 8 }).format(value);
}

function formatAge(milliseconds: number): string {
  if (!Number.isFinite(milliseconds)) return "unavailable";
  if (milliseconds < 1_000) return "<1 sec";
  const seconds = Math.floor(milliseconds / 1_000);
  return seconds < 60 ? `${seconds} sec` : `${Math.floor(seconds / 60)} min ${seconds % 60} sec`;
}
