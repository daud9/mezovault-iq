import { useEffect, useMemo, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { DataStatus } from "../components/ui/DataStatus";
import { SectionHeader } from "../components/ui/SectionHeader";
import { useWallet } from "../components/wallet/WalletProvider";
import { useLoan } from "../hooks/useLoan";
import { useOpenTroveSnapshot } from "../hooks/useOpenTroveSnapshot";
import { formatTime, shortAddress } from "../lib/format";
import { calculateTroveRisk, formatPercentBps, formatWad } from "../lib/troveRisk";

const MAX_SNAPSHOT_AGE_MS = 60_000;
const MAX_ORACLE_AGE_SECONDS = 3_600;

export function TroveRiskLab() {
  const { state, network, isSupportedNetwork } = useWallet();
  const { view: loanView, refresh: refreshLoan } = useLoan();
  const hasActiveLoan = loanView.status === "done" && loanView.result.status === "ok" && loanView.result.hasLoan;
  const { view: snapshotView, refresh: refreshSnapshot } = useOpenTroveSnapshot(hasActiveLoan);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const isTestnet = network.key === "testnet";
  const ready = state.status === "connected" && isSupportedNetwork && isTestnet;

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);

  const loan = loanView.status === "done" && loanView.result.status === "ok" ? loanView.result : null;
  const snapshot = snapshotView.status === "done" && snapshotView.result.status === "ok" ? snapshotView.result.snapshot : null;
  const loanAgeSeconds = loan ? Math.max(0, Math.floor(nowMs / 1_000 - new Date(loan.retrievedAt).getTime() / 1_000)) : null;
  const snapshotAgeSeconds = snapshot ? Math.max(0, Math.floor((nowMs - snapshot.observedAtMs) / 1_000)) : null;
  const isFresh = loan !== null && snapshot !== null && loanAgeSeconds !== null && loanAgeSeconds <= MAX_SNAPSHOT_AGE_MS / 1_000 && snapshotAgeSeconds !== null && snapshotAgeSeconds <= MAX_SNAPSHOT_AGE_MS / 1_000 && snapshot.priceAgeSeconds <= MAX_ORACLE_AGE_SECONDS;
  const risk = useMemo(() => {
    if (!isFresh || !loan?.hasLoan || !snapshot) return null;
    return calculateTroveRisk({
      collateralBtcWei: loan.collateralRaw,
      debtMusdWei: loan.debtRaw,
      btcUsdWei: snapshot.btcUsdWei,
      mcrWei: snapshot.mcrWei,
    });
  }, [isFresh, loan, snapshot]);

  const refresh = () => {
    refreshLoan();
    refreshSnapshot();
  };
  const loanLoading = loanView.status === "loading";
  const snapshotLoading = hasActiveLoan && snapshotView.status === "loading";
  const loading = loanLoading || snapshotLoading;
  const loanProblem = loanView.status === "done" && loanView.result.status !== "ok"
    ? loanView.result.status === "error" ? loanView.result.message : loanView.result.status === "not-configured" ? loanView.result.reason : "The wallet is on a different network than the configured Mezo network."
    : null;
  const snapshotProblem = hasActiveLoan && snapshotView.status === "done" && snapshotView.result.status !== "ok"
    ? snapshotView.result.status === "error" ? snapshotView.result.message : snapshotView.result.status === "not-configured" ? snapshotView.result.reason : "The RPC reports a different network; no liquidation threshold is shown."
    : null;
  const collateralAddress = network.troveManager?.address;
  const thresholdAddress = network.borrowerOperations?.address;
  const priceFeedAddress = network.priceFeed?.address;

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Read-only · Mezo Testnet"
        title="Trove Risk Lab"
        description="Compare a connected wallet’s live BTC collateral and MUSD debt with the live Trove MCR. Explore 10%, 20%, and 30% BTC price-drop scenarios. No automated actions or transaction controls are available here."
        actions={ready ? (
          <Button variant="ghost" onClick={refresh} className="min-h-11 px-2">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh reads
          </Button>
        ) : undefined}
      />
      {!ready ? (
        <Card className="space-y-2">
          <DataStatus state="not-configured" detail="connected Mezo Testnet wallet required" />
          <p className="text-sm leading-relaxed text-mist-400">
            {state.status !== "connected" ? "Connect a wallet to read its Trove." : !isTestnet ? "The risk threshold is configured for Mezo Testnet only." : `Switch to ${network.label} in the wallet before reading this Trove.`}
          </p>
        </Card>
      ) : loading ? (
        <Card><p className="text-sm text-mist-400" role="status">Reading the Trove and verified live parameters…</p></Card>
      ) : loanProblem || snapshotProblem ? (
        <Card className="space-y-3">
          <DataStatus state="unavailable" detail="risk calculation withheld" />
          {loanProblem && <p className="text-sm text-mist-400">Trove read: {loanProblem}</p>}
          {snapshotProblem && <p className="text-sm text-mist-400">Threshold read: {snapshotProblem}</p>}
          <p className="text-xs text-mist-500">No cached or assumed threshold is substituted. Refresh after the RPC or network issue is resolved.</p>
        </Card>
      ) : loan && !loan.hasLoan ? (
        <Card className="space-y-3">
          <DataStatus state="unverified" detail={`no active Trove · block ${loan.blockNumber}`} />
          <h2 className="text-base font-semibold text-mist-100">No active Trove was read</h2>
          <p className="text-sm leading-relaxed text-mist-400">There is no current collateral/debt position to stress-test for this wallet. The separate fixed test path remains on the Trove page; this lab does not open or change positions.</p>
        </Card>
      ) : !isFresh ? (
        <Card className="space-y-3">
          <DataStatus state="unverified" detail="stale or incomplete snapshot" />
          <p className="text-sm leading-relaxed text-mist-400">The Trove and threshold reads must both be no more than 60 seconds old, and the oracle update must be no more than one hour old. Refresh to request a new snapshot; no stale scenario results are shown.</p>
        </Card>
      ) : !risk || !loan || !snapshot ? (
        <Card className="space-y-3">
          <DataStatus state="unavailable" detail="insufficient live inputs" />
          <p className="text-sm text-mist-400">A positive collateral amount, debt, BTC/USD price, and live MCR are required. No ratio or scenario is estimated.</p>
        </Card>
      ) : (
        <>
          <Card highlight className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-mist-100">Current position</h2>
                <p className="mt-1 text-xs text-mist-500">Risk metrics are arithmetic comparisons, not a safety guarantee or liquidation forecast.</p>
              </div>
              <DataStatus state="live" detail="live MCR comparison" />
              <ThresholdLabel below={risk.belowThreshold} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Collateral" value={`${loan.collateralBtc} BTC`} />
              <Metric label="Debt" value={`${loan.debtMusd} MUSD`} />
              <Metric label="Current collateral ratio" value={formatPercentBps(risk.ratioBps)} />
              <Metric label="Live MCR threshold" value={formatPercentBps(risk.thresholdBps)} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-line bg-ink-800/50 p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-mist-500">BTC price distance to MCR</p>
                <p className="mt-2 text-lg font-semibold text-mist-100">
                  {risk.priceDistanceBps >= 0n ? `${formatPercentBps(risk.priceDistanceBps)} approximate price drop to threshold` : `${formatPercentBps(-risk.priceDistanceBps)} approximate price rise needed to reach MCR`}
                </p>
                <p className="mt-1 text-xs text-mist-500">Current oracle price: ${formatWad(snapshot.btcUsdWei, 2)} · price at MCR: ${formatWad(risk.thresholdPriceWei, 2)}</p>
              </div>
              <div className="rounded-xl border border-line bg-ink-800/50 p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-mist-500">Read freshness</p>
                <p className="mt-2 text-sm text-mist-100">Trove block {loan.blockNumber} · read {formatTime(loan.retrievedAt)}</p>
                <p className="mt-1 text-sm text-mist-100">Parameters block {snapshot.blockNumber} · read {formatTime(new Date(snapshot.observedAtMs).toISOString())}</p>
                <p className="mt-1 text-xs text-mist-500">Oracle update age: {snapshot.priceAgeSeconds.toLocaleString()} seconds</p>
              </div>
            </div>
          </Card>
          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-mist-100">Hypothetical BTC price drops</h2>
              <p className="mt-1 text-xs leading-relaxed text-mist-500">Collateral and debt are held constant; each ratio is recomputed against the live MCR read. These are scenarios, not predictions.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {risk.scenarios.map((scenario) => (
                <Card key={scenario.dropPct} className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-mist-500">BTC price −{scenario.dropPct}%</p>
                  <p className="text-2xl font-semibold text-mist-100">{formatPercentBps(scenario.ratioBps)}</p>
                  <ThresholdLabel below={scenario.belowThreshold} />
                </Card>
              ))}
            </div>
          </section>
          <Card className="space-y-3">
            <h2 className="text-sm font-semibold text-mist-100">Evidence used</h2>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-mist-400">
              {collateralAddress && <EvidenceLink label="TroveManager" address={collateralAddress} explorerUrl={network.explorerUrl} />}
              {thresholdAddress && <EvidenceLink label="BorrowerOperations · MCR()" address={thresholdAddress} explorerUrl={network.explorerUrl} />}
              {priceFeedAddress && <EvidenceLink label="PriceFeed" address={priceFeedAddress} explorerUrl={network.explorerUrl} />}
            </div>
            <p className="text-xs leading-relaxed text-mist-500">The MCR and price are read from Mezo Testnet at the displayed block. Contract-code and oracle freshness checks must pass before the scenario is shown. The Trove read is a separate RPC request, so its block and read time are shown independently.</p>
          </Card>
        </>
      )}
      <Card className="space-y-2 text-sm leading-relaxed text-mist-400">
        <p className="font-medium text-mist-200">Read-only boundary</p>
        <p>This page never builds, signs, submits, or automates a transaction. It does not add collateral, withdraw, repay, borrow, close a Trove, or manage a vault.</p>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-ink-800/50 p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-mist-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-mist-100">{value}</p>
    </div>
  );
}

function ThresholdLabel({ below }: { below: boolean }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${below ? "border-risk-high/40 bg-risk-high/10 text-risk-high" : "border-risk-low/40 bg-risk-low/10 text-risk-low"}`}>
      {below ? "Below live MCR" : "At or above live MCR"}
    </span>
  );
}

function EvidenceLink({ label, address, explorerUrl }: { label: string; address: string; explorerUrl: string }) {
  return (
    <a href={`${explorerUrl.replace(/\/?$/, "/")}address/${address}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-gold-300 hover:underline">
      {label} {shortAddress(address)} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    </a>
  );
}
