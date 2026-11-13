import {
  calculateMinimumOpenTroveAmounts,
  type OpenTroveLiveSnapshot,
} from "../../lib/openTrovePlanner";

export interface OpenTrovePlannerProps {
  /** A coherent, recent snapshot from the app's verified read layer. */
  live: OpenTroveLiveSnapshot | null;
  loading?: boolean;
  unavailableReason?: string;
  collateralBtc: string;
  requestedMusd: string;
  onCollateralBtcChange(value: string): void;
  onRequestedMusdChange(value: string): void;
  disabled?: boolean;
}

/** Compact, editable, live-derived prefill; it has no wallet writer behavior. */
export function OpenTrovePlanner({
  live,
  loading = false,
  unavailableReason,
  collateralBtc,
  requestedMusd,
  onCollateralBtcChange,
  onRequestedMusdChange,
  disabled = false,
}: OpenTrovePlannerProps) {
  const minimum = calculateMinimumOpenTroveAmounts(live);
  const prefillReady = collateralBtc.length > 0 && requestedMusd.length > 0;

  return (
    <section className="space-y-3 rounded-xl border border-line bg-ink-900 p-3 text-mist-100" aria-labelledby="open-trove-planner-title">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-mist-500">Mezo Testnet only</p>
        <h2 id="open-trove-planner-title" className="mt-1 text-base font-semibold">Open a new Trove</h2>
        <p className="mt-1 text-sm text-mist-400">Both fields start at the current protocol minimum. Change either amount if you want.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-mist-300">BTC collateral</span>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            value={collateralBtc}
            onChange={(event) => onCollateralBtcChange(event.currentTarget.value)}
            placeholder={minimum.status === "ready" ? minimum.collateralBtc : "Calculating…"}
            aria-label="BTC collateral amount"
            className="min-h-11 w-full rounded-lg border border-line bg-ink-800 px-3 text-mist-100 outline-none focus:border-gold-300 disabled:opacity-60"
            disabled={disabled || !prefillReady}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-mist-300">MUSD to borrow</span>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            value={requestedMusd}
            onChange={(event) => onRequestedMusdChange(event.currentTarget.value)}
            placeholder={minimum.status === "ready" ? minimum.requestedMusd : "Calculating…"}
            aria-label="Requested MUSD debt amount"
            className="min-h-11 w-full rounded-lg border border-line bg-ink-800 px-3 text-mist-100 outline-none focus:border-gold-300 disabled:opacity-60"
            disabled={disabled || !prefillReady}
          />
        </label>
      </div>

      {loading && !prefillReady ? (
        <p className="text-sm text-mist-400" role="status">Getting live Testnet minimums…</p>
      ) : !live && !prefillReady ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200" role="status">
          {unavailableReason ?? "Live Testnet terms are unavailable. No fallback amounts are used."}
        </p>
      ) : minimum.status === "unavailable" && !prefillReady ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200" role="status">{minimum.reason}</p>
      ) : (
        <p className="text-xs leading-relaxed text-amber-200">Protocol minimums · Testnet only. Minimum BTC collateral leaves a thin safety buffer.</p>
      )}

      <details>
        <summary className="min-h-11 cursor-pointer py-2 text-xs font-medium text-gold-300">How the minimums are calculated</summary>
        <p className="pb-2 text-xs leading-relaxed text-mist-400">MUSD is calculated from the live minimum net debt and borrowing fee. BTC is calculated from the live oracle price and collateral requirements. The app repeats fresh account, network, protocol, exact-call simulation and gas checks automatically before enabling the wallet button.</p>
      </details>
    </section>
  );
}
