import { useEffect, useMemo, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { DataStatus } from "../components/ui/DataStatus";
import { SectionHeader } from "../components/ui/SectionHeader";
import { useWallet } from "../components/wallet/WalletProvider";
import { useLoan } from "../hooks/useLoan";
import { isLoanPriceFresh, isLoanReadFresh, loanReadAgeMs } from "../lib/loan";
import { formatTime, shortAddress } from "../lib/format";
import { calculateCollateralRatioBps, calculateTroveRisk, formatPercentBps, formatWad } from "../lib/troveRisk";

export function TroveRiskLab() {
  const { state, network } = useWallet();
  const { view: loanView, refresh } = useLoan();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const isTestnet = network.key === "testnet";
  const walletConnected = state.status === "connected" && state.address !== null;
  const walletOnNetwork = walletConnected && state.chainId === network.chainId;
  const ready = walletOnNetwork && isTestnet;

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);

  const loan = loanView.status === "done" && loanView.result.status === "ok" ? loanView.result : null;
  const readFresh = loan ? isLoanReadFresh(loan, nowMs) : false;
  const priceFresh = loan?.hasLoan ? isLoanPriceFresh(loan, nowMs) : false;
  const loanAgeMs = loan ? loanReadAgeMs(loan, nowMs) : null;
  const ratioBps = loan && loan.hasLoan && readFresh && priceFresh && loan.btcUsdWei !== null
    ? calculateCollateralRatioBps({
        collateralBtcWei: loan.collateralRaw,
        debtMusdWei: loan.debtRaw,
        btcUsdWei: loan.btcUsdWei,
      })
    : null;
  const risk = useMemo(() => {
    if (!loan || !loan.hasLoan || !readFresh || !priceFresh || loan.btcUsdWei === null || loan.mcrWei === null) return null;
    return calculateTroveRisk({
      collateralBtcWei: loan.collateralRaw,
      debtMusdWei: loan.debtRaw,
      btcUsdWei: loan.btcUsdWei,
      mcrWei: loan.mcrWei,
    });
  }, [loan, readFresh, priceFresh]);

  const collateralAddress = network.troveManager?.address;
  const thresholdAddress = network.borrowerOperations?.address;
  const priceFeedAddress = network.priceFeed?.address;

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Read-only · Mezo Testnet"
        title="Trove Risk Lab"
        description="Read the connected wallet's current BTC collateral and MUSD debt, then compare the collateral ratio with the live MCR and hypothetical BTC price drops. Inputs are read from one pinned block; no automated actions or transaction controls are available here."
        actions={ready ? (
          <Button variant="ghost" onClick={refresh} className="min-h-11 px-2">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh reads
          </Button>
        ) : undefined}
      />

      {!walletConnected ? (
        <StateCard detail="connected wallet required" message="Connect a wallet to read its Trove." status="not-configured" />
      ) : !walletOnNetwork ? (
        <StateCard detail="wrong wallet network" message={`The connected wallet is on chain ${state.chainId ?? "unknown"}. Switch to ${network.label} (chain ${network.chainId}); no Trove or risk values are inferred for another network.`} status="unverified" />
      ) : !isTestnet ? (
        <StateCard detail="Testnet only" message="The live MCR comparison is configured for Mezo Testnet only." status="not-configured" />
      ) : loanView.status === "idle" || loanView.status === "loading" ? (
        <Card><p className="text-sm text-mist-400" role="status">Reading the Trove, BTC/USD oracle and live MCR at one block…</p></Card>
      ) : loanView.status === "wrong-network" ? (
        <StateCard detail="wrong wallet network" message={`Switch the connected wallet to chain ${loanView.expectedChainId} before reading the Trove.`} status="unverified" />
      ) : loanView.result.status === "wrong-network" ? (
        <StateCard detail="RPC network mismatch" message={`The RPC reports chain ${loanView.result.actualChainId ?? "unknown"}, not ${loanView.result.expectedChainId}. No position or risk values are shown.`} status="unavailable" />
      ) : loanView.result.status === "not-configured" ? (
        <StateCard detail="contract configuration unavailable" message={loanView.result.reason} status="not-configured" />
      ) : loanView.result.status === "error" ? (
        <StateCard detail="position read failed" message={`${loanView.result.message} No cached, zero-value or demonstration position is substituted.`} status="unavailable" />
      ) : loan && !readFresh ? (
        <Card className="space-y-3">
          <DataStatus state="unverified" detail="Trove read is stale · risk withheld" />
          <h2 className="text-base font-semibold text-mist-100">Refresh before using this risk read</h2>
          <p className="text-sm leading-relaxed text-mist-400">The pinned-block read at block {loan.blockNumber} is {loanAgeMs === null ? "not verifiably fresh" : `${Math.floor(loanAgeMs / 1_000)} seconds old`}. The last result {loan.hasLoan ? `recorded ${loan.collateralBtc} BTC collateral and ${loan.debtMusd} MUSD debt` : "found no active Trove"}, but no current ratio or scenario is shown.</p>
        </Card>
      ) : loan && !loan.hasLoan ? (
        <Card className="space-y-3">
          <DataStatus state="live" detail={`no active Trove · block ${loan.blockNumber}`} />
          <h2 className="text-base font-semibold text-mist-100">No active Trove was read</h2>
          <p className="text-sm leading-relaxed text-mist-400">The pinned-block status and zero collateral/debt indicate there is no current position to stress-test for this wallet. This lab is read-only and does not open or change positions.</p>
          <p className="text-xs text-mist-500">Read {formatTime(loan.retrievedAt)} · block {loan.blockNumber}</p>
        </Card>
      ) : loan && !priceFresh ? (
        <Card className="space-y-3">
          <DataStatus state={loan.btcUsdWei === null ? "unavailable" : "unverified"} detail={loan.btcUsdWei === null ? "BTC/USD oracle unavailable" : "BTC/USD oracle stale"} />
          <h2 className="text-base font-semibold text-mist-100">Position detected; ratio withheld</h2>
          <p className="text-sm leading-relaxed text-mist-400">The pinned block reports {loan.collateralBtc} BTC collateral and {loan.debtMusd} MUSD debt. A fresh BTC/USD oracle update is required before calculating the collateral ratio or any stress scenario.</p>
          {loan.riskInputsError && <p className="text-xs text-mist-500">Oracle read: {loan.riskInputsError}</p>}
          <p className="text-xs text-mist-500">Trove block {loan.blockNumber} · read {formatTime(loan.retrievedAt)}{loan.priceAgeSeconds === null ? " · oracle freshness unavailable" : ` · oracle age ${loan.priceAgeSeconds}s at that block`}</p>
        </Card>
      ) : loan && loan.mcrWei === null ? (
        <Card className="space-y-4">
          <DataStatus state="unavailable" detail="live MCR comparison unavailable" />
          <h2 className="text-base font-semibold text-mist-100">Position ratio only</h2>
          <p className="text-sm leading-relaxed text-mist-400">Collateral and debt are read from block {loan.blockNumber}. The BTC/USD oracle is fresh, so the current collateral ratio is available, but the live MCR and price-drop scenarios are withheld.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Metric label="Collateral" value={`${loan.collateralBtc} BTC`} />
            <Metric label="Debt" value={`${loan.debtMusd} MUSD`} />
            <Metric label="Current collateral ratio" value={ratioBps === null ? "Unavailable" : formatPercentBps(ratioBps)} />
          </div>
          {loan.riskInputsError && <p className="text-xs text-mist-500">MCR read: {loan.riskInputsError}</p>}
        </Card>
      ) : !risk || !loan ? (
        <StateCard detail="insufficient live inputs" message="A positive collateral amount, debt, fresh BTC/USD price, and live MCR are required. No ratio or scenario is estimated." status="unavailable" />
      ) : (
        <>
          <Card highlight className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-mist-100">Current position</h2>
                <p className="mt-1 text-xs text-mist-500">Risk metrics are arithmetic comparisons, not a safety guarantee or liquidation forecast.</p>
              </div>
              <DataStatus state="live" detail={`same-block MCR comparison · block ${loan.blockNumber}`} />
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
                <p className="mt-1 text-xs text-mist-500">Current oracle price: ${formatWad(loan.btcUsdWei!, 2)} · price at MCR: ${formatWad(risk.thresholdPriceWei, 2)}</p>
              </div>
              <div className="rounded-xl border border-line bg-ink-800/50 p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-mist-500">Read freshness</p>
                <p className="mt-2 text-sm text-mist-100">All position and risk inputs: block {loan.blockNumber}</p>
                <p className="mt-1 text-sm text-mist-100">Read {formatTime(loan.retrievedAt)}</p>
                <p className="mt-1 text-xs text-mist-500">Oracle update age: {loan.priceAgeSeconds?.toLocaleString() ?? "unavailable"} seconds at the pinned block</p>
              </div>
            </div>
          </Card>
          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-mist-100">Hypothetical BTC price drops</h2>
              <p className="mt-1 text-xs leading-relaxed text-mist-500">Collateral and debt are held constant; each ratio is recomputed against the live same-block MCR. These are scenarios, not predictions.</p>
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
            <p className="text-xs leading-relaxed text-mist-500">Trove status, collateral, debt, BTC/USD price, oracle freshness metadata, and MCR were read from these configured contracts at the displayed block. No cached or assumed threshold is substituted.</p>
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

function StateCard({ status, detail, message }: { status: "unavailable" | "unverified" | "not-configured"; detail: string; message: string }) {
  return (
    <Card className="space-y-3">
      <DataStatus state={status} detail={detail} />
      <p className="text-sm leading-relaxed text-mist-400">{message}</p>
    </Card>
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
