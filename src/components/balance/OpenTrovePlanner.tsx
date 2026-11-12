import { useEffect, useState, type ReactNode } from "react";
import {
  calculateOpenTrovePlan,
  formatBasisPoints,
  formatUnits18,
  WAD,
  type OpenTroveLiveSnapshot,
} from "../../lib/openTrovePlanner";

const MAX_SNAPSHOT_AGE_MS = 60_000;

export interface OpenTrovePlannerProps {
  /** A coherent, recent snapshot from the app's verified read layer. */
  live: OpenTroveLiveSnapshot | null;
  loading?: boolean;
  unavailableReason?: string;
  collateralBtc: string;
  requestedMusd: string;
  onCollateralBtcChange(value: string): void;
  onRequestedMusdChange(value: string): void;
  nowMs?: number;
}

function amount(value: bigint | undefined): string {
  return value === undefined ? "Unavailable" : `${formatUnits18(value)} MUSD`;
}

function CheckLine({ label, pass }: { label: string; pass: boolean | null | undefined }) {
  const text = pass === null || pass === undefined ? "Not applicable" : pass ? "Pass" : "Does not pass";
  const tone = pass === true ? "text-emerald-300" : pass === false ? "text-rose-300" : "text-mist-400";
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-mist-300">{label}</span>
      <span className={tone}>{text}</span>
    </div>
  );
}

/** Read-only open-trove preview. It has no transaction callback, encoder, or wallet writer. */
export function OpenTrovePlanner({
  live,
  loading = false,
  unavailableReason,
  collateralBtc,
  requestedMusd,
  onCollateralBtcChange,
  onRequestedMusdChange,
  nowMs,
}: OpenTrovePlannerProps) {
  const [clockMs, setClockMs] = useState(() => Date.now());
  useEffect(() => {
    if (nowMs !== undefined || !live) return;
    setClockMs(Date.now());
    const timer = setInterval(() => setClockMs(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, [live?.blockNumber, live?.observedAtMs, nowMs]);
  const effectiveNowMs = nowMs ?? clockMs;
  const plan = calculateOpenTrovePlan(live, collateralBtc, requestedMusd, {
    nowMs: effectiveNowMs,
    maxSnapshotAgeMs: MAX_SNAPSHOT_AGE_MS,
  });
  const snapshotAgeSeconds = live && Number.isFinite(live.observedAtMs)
    ? Math.floor((effectiveNowMs - live.observedAtMs) / 1_000)
    : null;
  const mcrPercent = live ? formatBasisPoints((live.mcrWei * 10_000n) / WAD) : "Unavailable";
  const ccrPercent = live ? formatBasisPoints((live.ccrWei * 10_000n) / WAD) : "Unavailable";
  const rows: ReactNode = plan.status === "calculated" ? (
    <>
      <div className="flex justify-between gap-3 text-sm"><span className="text-mist-300">Borrowing fee</span><span>{amount(plan.feeWei)}</span></div>
      <div className="flex justify-between gap-3 text-sm"><span className="text-mist-300">Net debt (request + fee)</span><span>{amount(plan.netDebtWei)}</span></div>
      <div className="flex justify-between gap-3 text-sm"><span className="text-mist-300">Gas reserve added after minimum debt</span><span>{amount(plan.reserveWei)}</span></div>
      <div className="flex justify-between gap-3 border-t border-line pt-2 text-sm font-semibold"><span>Composite debt (used for ICR)</span><span>{amount(plan.compositeDebtWei)}</span></div>
      <div className="flex justify-between gap-3 text-sm"><span className="text-mist-300">Collateral value at live BTC/USD</span><span>${plan.collateralValueWei === undefined ? "Unavailable" : formatUnits18(plan.collateralValueWei)}</span></div>
      <div className="flex justify-between gap-3 text-sm"><span className="text-mist-300">Open-time ICR</span><span>{formatBasisPoints(plan.icrBasisPoints)}</span></div>
      <CheckLine label={`Minimum net debt (${live ? formatUnits18(live.minNetDebtWei) : "—"} MUSD; amount + fee)`} pass={plan.minDebtPass} />
      <CheckLine
        label={live?.mode === "recovery" ? `Recovery-mode ICR ≥ CCR (${ccrPercent})` : `Normal-mode ICR ≥ MCR (${mcrPercent})`}
        pass={plan.icrPass}
      />
      {live?.mode === "normal" && <CheckLine label={`Post-open TCR ≥ live CCR (${ccrPercent})`} pass={plan.postOpenTcrPass} />}
    </>
  ) : null;

  return (
    <section className="space-y-4 rounded-xl border border-line bg-ink-900 p-4 text-mist-100" aria-labelledby="open-trove-planner-title">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-mist-500">MUSD borrowing</p>
        <h2 id="open-trove-planner-title" className="mt-1 text-lg font-semibold">Open-trove planner</h2>
        <p className="mt-1 text-sm text-mist-400">Planning preview only. Calculations use live protocol reads; no transaction is built, signed, or sent.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-mist-300">BTC collateral</span>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={collateralBtc}
            onChange={(event) => onCollateralBtcChange(event.currentTarget.value)}
            placeholder="0.00"
            aria-label="BTC collateral amount"
            className="min-h-11 w-full rounded-lg border border-line bg-ink-800 px-3 text-mist-100 outline-none focus:border-gold-300"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-mist-300">Requested MUSD (_debtAmount)</span>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={requestedMusd}
            onChange={(event) => onRequestedMusdChange(event.currentTarget.value)}
            placeholder="0.00"
            aria-label="Requested MUSD debt amount"
            className="min-h-11 w-full rounded-lg border border-line bg-ink-800 px-3 text-mist-100 outline-none focus:border-gold-300"
          />
        </label>
      </div>

      {loading ? (
        <p className="text-sm text-mist-400" role="status">Refreshing same-block Mezo Testnet reads…</p>
      ) : !live ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200" role="status">
          {unavailableReason ?? "Live protocol data is unavailable. No fallback values are used."}
        </p>
      ) : plan.status === "unavailable" || plan.status === "invalid-input" ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200" role="status">{plan.reason}</p>
      ) : (
        <div className="space-y-2 rounded-lg border border-line bg-ink-800/60 p-3" aria-live="polite">
          <div className="flex justify-between gap-3 text-sm"><span className="text-mist-300">Requested debt</span><span>{amount(plan.requestWei)}</span></div>
          {rows}
          <p className={`border-t border-line pt-2 text-sm font-semibold ${plan.allowed ? "text-emerald-300" : "text-rose-300"}`}>
            {plan.allowed ? "Planner checks pass" : "Planner checks do not pass"}
          </p>
        </div>
      )}

      <p className="text-xs leading-relaxed text-mist-500">
        {live
          ? `Mezo Testnet · block ${live.blockNumber} · snapshot ${snapshotAgeSeconds === null ? "time unavailable" : `${snapshotAgeSeconds}s old`} · BTC/USD $${formatUnits18(live.btcUsdWei, 2)} · ${live.mode === "normal" ? "Normal Mode" : "Recovery Mode"} · ${live.feeExempt ? "fee-exempt account" : "standard fee status"}`
          : "Live Mezo Testnet parameters and a fresh oracle price are required; hard-coded fallback values are not used."}
      </p>

      <button
        type="button"
        disabled
        aria-disabled="true"
        title="Live open-trove testing has not been explicitly approved."
        className="min-h-11 w-full cursor-not-allowed rounded-lg bg-mist-700 px-4 font-semibold text-mist-300 opacity-60"
      >
        Open trove — disabled
      </button>
      <p className="text-xs text-mist-500">Live opening and transaction submission remain disabled pending separate explicit approval for a live test.</p>
    </section>
  );
}
