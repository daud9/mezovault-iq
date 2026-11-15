import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatTokenUnits } from "../../lib/tokenAmount";
import { createRpcClient } from "../../lib/rpc";
import type { RpcClient } from "../../lib/rpc";
import { resolveRpcUrl } from "../../config/env";
import { TESTNET_STABILITY_POOL } from "../../config/stabilityPool";
import {
  prepareStabilityPoolAction,
  readStabilityPoolReceipt,
  readStabilityPoolSnapshot,
  StabilityPoolError,
  type PreparedStabilityPoolAction,
  type StabilityPoolSnapshot,
  type StabilityPoolReceiptResult,
} from "../../lib/stabilityPool";
import { describeSendError } from "../../lib/transfer";
import { addEntry, browserStore } from "../../lib/txLedger";
import { requestReadyStabilityPoolAction, type ReadyStabilityPoolAction } from "../../lib/stabilityPoolConfirmation";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { useWallet } from "../wallet/WalletProvider";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";

type SnapshotView = { status: "idle" | "loading" } | { status: "done" | "stale"; readKey: string; snapshot: StabilityPoolSnapshot; refreshing: boolean; refreshError: string | null } | { status: "error"; message: string };
type ReceiptView = { status: "not-checked" } | StabilityPoolReceiptResult | { status: "error"; message: string };
interface Submission { hash: string; expected: PreparedStabilityPoolAction; rpc: RpcClient; explorerUrl: string; chainId: number }

export function StabilityPoolPanel() {
  const wallet = useWallet();
  const { state, network } = wallet;
  const account = state.address;
  const connected = state.status === "connected" && account !== null;
  const onTestnet = network.key === "testnet" && network.chainId === TESTNET_STABILITY_POOL.chainId;
  const rpc = useMemo(() => createRpcClient({ url: resolveRpcUrl(network) }), [network]);
  const [tick, setTick] = useState(0);
  const [snapshotView, setSnapshotView] = useState<SnapshotView>({ status: "idle" });
  const [amount, setAmount] = useState("");
  const [reviewBundle, setReviewBundle] = useState<(ReadyStabilityPoolAction & { generation: number }) | null>(null);
  const [busy, setBusy] = useState(false);
  const walletRequestBusyRef = useRef(false);
  const [error, setError] = useState("");
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [receiptView, setReceiptView] = useState<ReceiptView>({ status: "not-checked" });
  const snapshotKey = `${account?.toLowerCase() ?? ""}|${state.chainId ?? ""}|${network.key}|${network.chainId}`;
  const key = `${account?.toLowerCase() ?? ""}|${state.chainId ?? ""}|${network.key}|${network.chainId}|${amount}`;
  const preflightGenerationRef = useRef(0);
  const previousKeyRef = useRef(key);
  if (previousKeyRef.current !== key) {
    previousKeyRef.current = key;
    preflightGenerationRef.current += 1;
  }
  const currentKeyRef = useRef(key);
  currentKeyRef.current = key;
  const preflightBusyRef = useRef(false);
  const review = reviewBundle?.key === key && reviewBundle.generation === preflightGenerationRef.current ? reviewBundle.review : null;
  const pending = submission !== null && receiptView.status !== "confirmed" && receiptView.status !== "reverted";
  const canPrepare = connected && onTestnet && wallet.isSupportedNetwork && !busy && !pending
    && snapshotView.status === "done" && snapshotView.readKey === snapshotKey && !snapshotView.refreshing && !snapshotView.refreshError;

  const refresh = useCallback(() => {
    preflightGenerationRef.current += 1;
    setTick((value) => value + 1);
    setReviewBundle(null);
  }, []);
  useAutoRefresh(refresh, 60_000, connected && onTestnet && wallet.isSupportedNetwork);

  useEffect(() => {
    if (!connected || !account || !onTestnet || !wallet.isSupportedNetwork) {
      setSnapshotView({ status: "idle" });
      return;
    }
    let cancelled = false;
    let expiryTimer: ReturnType<typeof setTimeout> | null = null;
    setSnapshotView((current) => (current.status === "done" || current.status === "stale") && current.readKey === snapshotKey
      ? { ...current, status: "done", refreshing: true, refreshError: null }
      : { status: "loading" });
    void readStabilityPoolSnapshot({ network, owner: account, rpc }).then((snapshot) => {
      if (cancelled) return;
      setSnapshotView({ status: "done", readKey: snapshotKey, snapshot, refreshing: false, refreshError: null });
      const remainingMs = Math.max(0, 120_000 - (Date.now() - snapshot.blockTimestamp * 1_000));
      expiryTimer = setTimeout(() => {
        if (cancelled) return;
        preflightGenerationRef.current += 1;
        setSnapshotView((current) => current.status === "done" && current.readKey === snapshotKey && current.snapshot.blockNumber === snapshot.blockNumber
          ? { ...current, status: "stale", refreshing: false }
          : current);
        setReviewBundle(null);
      }, remainingMs);
    }).catch((caught: unknown) => {
      if (cancelled) return;
      const message = caught instanceof Error ? caught.message : "The Stability Pool could not be read.";
      setSnapshotView((current) => (current.status === "done" || current.status === "stale") && current.readKey === snapshotKey
        ? { ...current, refreshing: false, refreshError: message }
        : { status: "error", message });
    });
    return () => { cancelled = true; if (expiryTimer !== null) clearTimeout(expiryTimer); };
  }, [connected, account, onTestnet, wallet.isSupportedNetwork, network, rpc, tick, snapshotKey]);

  useEffect(() => {
    setReviewBundle(null);
    setError("");
  }, [key]);

  async function prepareReview() {
    if (!canPrepare || !account || snapshotView.status !== "done" || preflightBusyRef.current) return;
    preflightBusyRef.current = true;
    const generation = preflightGenerationRef.current;
    const requestKey = key;
    setBusy(true);
    setError("");
    try {
      const fresh = await prepareStabilityPoolAction({ network, account, walletChainId: state.chainId, amount, rpc });
      await wallet.checkWalletContext({ account, chainId: TESTNET_STABILITY_POOL.chainId });
      if (generation !== preflightGenerationRef.current || currentKeyRef.current !== requestKey) return;
      setReviewBundle({ key: requestKey, review: fresh, checkedAtMs: Date.now(), generation });
      setError("");
    } catch (caught) {
      if (generation !== preflightGenerationRef.current || currentKeyRef.current !== requestKey) return;
      setReviewBundle(null);
      setError(caught instanceof StabilityPoolError ? caught.message : describeSendError(caught));
    } finally {
      preflightBusyRef.current = false;
      setBusy(false);
    }
  }

  function openWalletForReviewedAction() {
    const ready = reviewBundle?.key === key && reviewBundle.generation === preflightGenerationRef.current ? reviewBundle : null;
    if (!review || !ready || !account || !canPrepare || walletRequestBusyRef.current) return;
    walletRequestBusyRef.current = true;
    setBusy(true);
    setError("");
    const request = requestReadyStabilityPoolAction({
      ready,
      currentKey: key,
      connectedAccount: account,
      walletChainId: state.chainId,
      nowMs: Date.now(),
      send: wallet.sendReviewedTransaction,
    });
    if (request.status !== "requested") {
      walletRequestBusyRef.current = false;
      setBusy(false);
      setReviewBundle(null);
      setError(request.status === "stale" ? "Review expired. Review again." : "Wallet or network changed. Review again.");
      return;
    }
    void request.promise.then((hash) => {
      recordPoolAction(hash, review);
      setSubmission({ hash, expected: review, rpc, explorerUrl: network.explorerUrl, chainId: TESTNET_STABILITY_POOL.chainId });
      setReceiptView({ status: "not-checked" });
      setReviewBundle(null);
    }).catch((caught) => {
      setError(caught instanceof StabilityPoolError ? caught.message : describeSendError(caught));
    }).finally(() => {
      walletRequestBusyRef.current = false;
      setBusy(false);
    });
  }

  async function checkReceipt() {
    if (!submission || busy || receiptView.status === "confirmed" || receiptView.status === "reverted") return;
    setBusy(true);
    setError("");
    try {
      const result = await readStabilityPoolReceipt({ rpc: submission.rpc, hash: submission.hash, expected: submission.expected });
      setReceiptView(result);
      if (result.status === "confirmed" || result.status === "reverted") {
        setReviewBundle(null);
        setTick((value) => value + 1);
      }
    } catch (caught) {
      setReceiptView({ status: "error", message: caught instanceof Error ? caught.message : "The transaction receipt could not be verified." });
    } finally { setBusy(false); }
  }

  const currentSnapshot = snapshotView.status === "done" && snapshotView.readKey === snapshotKey && !snapshotView.refreshing && !snapshotView.refreshError ? snapshotView.snapshot : null;
  return (
    <Card className="space-y-5" aria-labelledby="stability-pool-title">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-gold-300">Stability Pool · Mezo Testnet</p>
        <h2 id="stability-pool-title" className="mt-1 text-lg font-semibold text-mist-100">Deposit MUSD</h2>
      </div>
      <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">Liquidations can reduce deposits. Deposits only; withdrawals aren't available.</p>

      {!onTestnet ? (
        <p className="rounded-lg border border-risk-medium/30 bg-risk-medium/5 p-3 text-sm text-risk-medium">Mezo Testnet only (31611).</p>
      ) : !connected ? (
        <div className="space-y-3"><p className="text-sm text-mist-400">Connect a wallet to view balances.</p><Button onClick={() => void wallet.connect()} disabled={state.status === "connecting"} className="min-h-11">{state.status === "connecting" ? "Connecting…" : "Connect wallet"}</Button></div>
      ) : !wallet.isSupportedNetwork ? (
        <div className="space-y-3"><p className="text-sm text-risk-medium">Switch to Mezo Testnet (chain 31611).</p><Button variant="secondary" onClick={() => void wallet.switchNetwork()} className="min-h-11">Switch network</Button></div>
      ) : (
        <>
          {snapshotView.status === "loading" && <p role="status" className="text-sm text-mist-400">Loading balances…</p>}
          {snapshotView.status === "stale" && <p role="status" className="rounded-lg border border-risk-medium/30 bg-risk-medium/5 p-3 text-sm text-risk-medium">Pool data is stale. Refreshing; deposits are paused.</p>}
          {snapshotView.status === "error" && <p role="alert" className="rounded-lg border border-risk-medium/30 bg-risk-medium/5 p-3 text-sm leading-relaxed text-risk-medium">Couldn't load Pool data. Retrying. {snapshotView.message}</p>}
          {snapshotView.status === "done" && snapshotView.refreshing && <p role="status" className="text-sm text-mist-400">Refreshing Pool data; deposits are paused.</p>}
          {snapshotView.status === "done" && snapshotView.refreshError && <p role="alert" className="rounded-lg border border-risk-medium/30 bg-risk-medium/5 p-3 text-sm leading-relaxed text-risk-medium">Old values are hidden; deposits are paused while refresh retries. {snapshotView.refreshError}</p>}
          {currentSnapshot && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Stat label="Wallet MUSD" value={`${formatTokenUnits(currentSnapshot.musdBalance, 18, 6)} MUSD`} />
                <Stat label="Pool deposit" value={`${formatTokenUnits(currentSnapshot.compoundedDeposit, 18, 6)} MUSD`} />
              </div>
              <details className="rounded-lg border border-line px-3">
                <summary className="min-h-11 cursor-pointer py-2 text-xs font-medium text-gold-300">Snapshot details</summary>
                <p className="pb-3 text-xs text-mist-500">Pool total: {formatTokenUnits(currentSnapshot.totalMUSDDeposits, 18, 6)} MUSD · block {currentSnapshot.blockNumber.toLocaleString()} · read {new Date(currentSnapshot.blockTimestamp * 1_000).toLocaleString()}</p>
              </details>
            </>
          )}

          <div className="space-y-3 border-t border-line pt-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3"><label htmlFor="stability-pool-amount" className="text-sm font-medium text-mist-100">MUSD to deposit</label><button type="button" onClick={() => currentSnapshot && setAmount(formatTokenInput(currentSnapshot.musdBalance, 18))} disabled={!currentSnapshot || currentSnapshot.musdBalance === 0n || busy || pending} className="min-h-10 rounded-md px-2 text-xs font-semibold text-gold-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300 disabled:opacity-50">Use full balance</button></div>
              <input id="stability-pool-amount" inputMode="decimal" autoComplete="off" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" disabled={!currentSnapshot || busy || pending} className="min-h-12 w-full rounded-xl border border-line bg-ink-800 px-3 text-mist-100 placeholder:text-mist-500 disabled:opacity-60" />
              <p className="text-xs text-mist-500">Exact amount; approval may be needed.</p>
            </div>
            {error && <p role="alert" className="rounded-lg border border-risk-medium/30 bg-risk-medium/5 p-3 text-sm leading-relaxed text-risk-medium">{error}</p>}
            <Button onClick={() => void prepareReview()} disabled={!canPrepare || Boolean(review) || !currentSnapshot || amount.trim() === ""} className="min-h-11 w-full">{busy ? "Checking Pool…" : "Review deposit"}</Button>
          </div>

          {review && (
            <div className="space-y-4 rounded-xl border border-gold-500/30 bg-ink-800/40 p-4">
              <div>
                <p className="text-sm font-semibold text-emerald-300">{review.action === "approve" ? "Approve MUSD" : "Ready to deposit"}</p>
                <p className="mt-2 text-sm leading-relaxed text-mist-200">
                  {review.action === "approve"
                    ? `Approve exactly ${formatTokenUnits(review.amountWei, 18, 18)} MUSD.`
                    : `Deposit ${formatTokenUnits(review.amountWei, 18, 18)} MUSD into the Pool.`}
                </p>
                <p className="mt-1 text-xs text-mist-500">Preflight runs before review; each review expires after 60 seconds.</p>
              </div>

              {review.action === "approve" ? (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">Two wallet confirmations: approve MUSD, then deposit.</p>
              ) : (
                <p className="text-sm text-mist-400">Approval covers this amount.</p>
              )}

              <details className="rounded-lg border border-line px-3">
                <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-gold-300">Details</summary>
                <dl className="grid gap-2 pb-3 sm:grid-cols-2">
                  <Stat label="Amount" value={`${formatTokenUnits(review.amountWei, 18, 18)} MUSD`} />
                  <Stat label="Action" value={review.action === "approve" ? "Approve exact amount" : "Deposit to Stability Pool"} />
                  <Stat label="Wallet" value={review.account} />
                  <Stat label="Network" value="Mezo Testnet · chain 31611" />
                  <Stat label="Pool contract" value={TESTNET_STABILITY_POOL.proxy} />
                  <Stat label="MUSD token" value={review.snapshot.musdAddress} />
                  <Stat label="Pool deposit before" value={`${formatTokenUnits(review.snapshot.compoundedDeposit, 18, 6)} MUSD`} />
                  <Stat label="BTC gain" value={`${formatTokenUnits(review.snapshot.collateralGain, 18, 8)} BTC`} />
                  <Stat label="Gas estimate / limit" value={`${review.gasEstimate.toLocaleString()} / ${review.gasLimit.toLocaleString()} (20% buffer)`} />
                  <Stat label="BTC sent" value="0 BTC; gas is paid in native BTC" />
                  <Stat label="Block" value={review.snapshot.blockNumber.toLocaleString()} />
                  <Stat label="Exact calldata" value={review.transaction.data} />
                </dl>
              </details>

              <Button onClick={openWalletForReviewedAction} disabled={busy || pending || !canPrepare} className="min-h-11 w-full">
                {busy ? "Opening wallet…" : review.action === "approve" ? "Approve MUSD in wallet" : "Deposit MUSD in wallet"}
              </Button>
            </div>
          )}

          {submission && (
            <div className="space-y-3 rounded-xl border border-line bg-ink-800/50 p-4">
              <div><h3 className="text-sm font-semibold text-mist-100">{submission.expected.action === "approve" ? "MUSD approval" : "Pool deposit"}</h3><p className="mt-1 text-xs text-mist-400">Wallet {submission.expected.account} · chain {submission.chainId}</p><p className="mt-1 break-all font-mono text-xs text-mist-400">{submission.hash}</p></div>
              {receiptView.status === "confirmed" && <p role="status" className="text-sm text-risk-low">Confirmed in block {receiptView.blockNumber.toLocaleString()}; finality is unchecked. {submission.expected.action === "approve" ? "Prepare a deposit review." : "Pool position is updating."}</p>}
              {receiptView.status === "reverted" && <p role="alert" className="text-sm text-risk-high">Transaction reverted in block {receiptView.blockNumber.toLocaleString()}.</p>}
              {receiptView.status === "not-checked" && <p role="status" className="text-sm text-risk-medium">Receipt not checked; transaction unconfirmed.</p>}
              {receiptView.status === "pending" && <p role="status" className="text-sm text-risk-medium">No receipt yet; transaction unconfirmed.</p>}
              {receiptView.status === "error" && <p role="alert" className="text-sm text-risk-medium">{receiptView.message}</p>}
              {receiptView.status !== "confirmed" && receiptView.status !== "reverted" && <Button variant="secondary" onClick={() => void checkReceipt()} disabled={busy} className="min-h-11">{busy ? "Checking receipt…" : "Check status"}</Button>}
              <a href={`${submission.explorerUrl.replace(/\/?$/, "/")}tx/${submission.hash}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-sm font-medium text-gold-300 hover:underline">Mezo Testnet Explorer</a>
            </div>
          )}
        </>
      )}

      <details className="border-t border-line pt-3 text-xs text-mist-500"><summary className="min-h-11 cursor-pointer py-2 font-medium text-gold-300">Sources</summary><p className="py-2"><a className="text-gold-300 hover:underline" href={TESTNET_STABILITY_POOL.proxyExplorerUrl} target="_blank" rel="noreferrer">Pool</a> · <a className="text-gold-300 hover:underline" href={TESTNET_STABILITY_POOL.implementationExplorerUrl} target="_blank" rel="noreferrer">Implementation</a> · <a className="text-gold-300 hover:underline" href={TESTNET_STABILITY_POOL.sourceUrl} target="_blank" rel="noreferrer">Mezo docs</a></p></details>
    </Card>
  );
}

function recordPoolAction(hash: string, prepared: PreparedStabilityPoolAction) {
  addEntry(browserStore(), {
    hash,
    chainId: prepared.snapshot.chainId,
    from: prepared.account,
    to: prepared.transaction.to,
    token: "MUSD",
    amount: formatTokenUnits(prepared.amountWei, 18, 18),
    action: prepared.action === "approve" ? "Approve MUSD for Stability Pool" : "Deposit MUSD in Stability Pool",
    createdAt: new Date().toISOString(),
    status: "pending",
    blockNumber: null,
  });
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-lg border border-line bg-ink-900/70 p-3"><dt className="text-xs text-mist-500">{label}</dt><dd className="mt-1 break-all text-xs leading-relaxed text-mist-200">{value}</dd></div>;
}

function formatTokenInput(raw: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const fraction = (raw % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
