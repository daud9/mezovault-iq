import { useEffect, useMemo, useState } from "react";
import { formatTokenUnits } from "../../lib/tokenAmount";
import { createRpcClient } from "../../lib/rpc";
import type { RpcClient } from "../../lib/rpc";
import { resolveRpcUrl } from "../../config/env";
import { TESTNET_STABILITY_POOL } from "../../config/stabilityPool";
import {
  prepareStabilityPoolAction,
  readStabilityPoolReceipt,
  readStabilityPoolSnapshot,
  sameStabilityPoolReview,
  StabilityPoolError,
  type PreparedStabilityPoolAction,
  type StabilityPoolSnapshot,
  type StabilityPoolReceiptResult,
} from "../../lib/stabilityPool";
import { describeSendError } from "../../lib/transfer";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { useWallet } from "../wallet/WalletProvider";

type SnapshotView = { status: "idle" | "loading" } | { status: "done" | "stale"; snapshot: StabilityPoolSnapshot } | { status: "error"; message: string };
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
  const [reviewBundle, setReviewBundle] = useState<{ key: string; review: PreparedStabilityPoolAction } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [receiptView, setReceiptView] = useState<ReceiptView>({ status: "not-checked" });
  const key = `${account?.toLowerCase() ?? ""}|${state.chainId ?? ""}|${network.key}|${network.chainId}|${amount}`;
  const review = reviewBundle?.key === key ? reviewBundle.review : null;
  const pending = submission !== null && receiptView.status !== "confirmed" && receiptView.status !== "reverted";
  const canPrepare = connected && onTestnet && wallet.isSupportedNetwork && !busy && !pending;

  useEffect(() => {
    if (!connected || !account || !onTestnet || !wallet.isSupportedNetwork) {
      setSnapshotView({ status: "idle" });
      return;
    }
    let cancelled = false;
    let expiryTimer: ReturnType<typeof setTimeout> | null = null;
    setSnapshotView({ status: "loading" });
    void readStabilityPoolSnapshot({ network, owner: account, rpc }).then((snapshot) => {
      if (cancelled) return;
      setSnapshotView({ status: "done", snapshot });
      const remainingMs = Math.max(0, 120_000 - (Date.now() - snapshot.blockTimestamp * 1_000));
      expiryTimer = setTimeout(() => {
        if (cancelled) return;
        setSnapshotView((current) => current.status === "done" && current.snapshot.blockNumber === snapshot.blockNumber
          ? { status: "stale", snapshot }
          : current);
        setReviewBundle(null);
      }, remainingMs);
    }).catch((caught: unknown) => {
      if (!cancelled) setSnapshotView({ status: "error", message: caught instanceof Error ? caught.message : "The Stability Pool could not be read." });
    });
    return () => { cancelled = true; if (expiryTimer !== null) clearTimeout(expiryTimer); };
  }, [connected, account, onTestnet, wallet.isSupportedNetwork, network, rpc, tick]);

  useEffect(() => {
    setReviewBundle(null);
    setError("");
  }, [key]);

  async function prepareReview() {
    if (!canPrepare || !account || snapshotView.status !== "done") return;
    setBusy(true);
    setError("");
    try {
      const prepared = await prepareStabilityPoolAction({ network, account, walletChainId: state.chainId, amount, rpc });
      const fresh = await prepareStabilityPoolAction({ network, account, walletChainId: state.chainId, amount, rpc });
      if (!sameStabilityPoolReview(prepared, fresh)) {
        setReviewBundle({ key, review: fresh });
        setError("Pool or wallet details changed. Review the updated amount before continuing; nothing was sent.");
        return;
      }
      const hash = await wallet.sendTransaction({ ...fresh.transaction }, { account, chainId: TESTNET_STABILITY_POOL.chainId });
      setSubmission({ hash, expected: fresh, rpc, explorerUrl: network.explorerUrl, chainId: TESTNET_STABILITY_POOL.chainId });
      setReceiptView({ status: "not-checked" });
    } catch (caught) {
      setReviewBundle(null);
      setError(caught instanceof StabilityPoolError ? caught.message : describeSendError(caught));
    } finally { setBusy(false); }
  }

  async function recheckAndOpenWallet() {
    if (!review || !account || !canPrepare) return;
    setBusy(true);
    setError("");
    try {
      const fresh = await prepareStabilityPoolAction({ network, account, walletChainId: state.chainId, amount, rpc });
      if (!sameStabilityPoolReview(review, fresh)) {
        setReviewBundle({ key, review: fresh });
        setError("Your MUSD balance or Pool data changed. Review the updated amount and continue again if it still looks right.");
        return;
      }
      const hash = await wallet.sendTransaction({ ...fresh.transaction }, { account, chainId: TESTNET_STABILITY_POOL.chainId });
      setSubmission({ hash, expected: fresh, rpc, explorerUrl: network.explorerUrl, chainId: TESTNET_STABILITY_POOL.chainId });
      setReceiptView({ status: "not-checked" });
      setReviewBundle(null);
    } catch (caught) {
      setError(caught instanceof StabilityPoolError ? caught.message : describeSendError(caught));
    } finally { setBusy(false); }
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

  const snapshot = snapshotView.status === "done" || snapshotView.status === "stale" ? snapshotView.snapshot : null;
  return (
    <Card className="space-y-5" aria-labelledby="stability-pool-title">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-gold-300">Optional · Mezo Testnet</p>
        <h2 id="stability-pool-title" className="mt-1 text-lg font-semibold text-mist-100">Deposit MUSD you borrowed</h2>
        <p className="mt-1 text-sm leading-relaxed text-mist-400">Put MUSD from your wallet into the Stability Pool. This is separate from managing your Trove.</p>
      </div>

      {!onTestnet ? (
        <p className="rounded-lg border border-risk-medium/30 bg-risk-medium/5 p-3 text-sm text-risk-medium">This route is locked to Mezo Testnet (chain 31611). No other network or vault is used.</p>
      ) : !connected ? (
        <div className="space-y-3"><p className="text-sm text-mist-400">Connect a wallet to read its MUSD balance and Stability Pool position. Connecting alone does not request a transaction.</p><Button onClick={() => void wallet.connect()} disabled={state.status === "connecting"} className="min-h-11">{state.status === "connecting" ? "Connecting…" : "Connect wallet"}</Button></div>
      ) : !wallet.isSupportedNetwork ? (
        <div className="space-y-3"><p className="text-sm text-risk-medium">The connected wallet is not on Mezo Testnet (chain 31611). Reads and actions are unavailable.</p><Button variant="secondary" onClick={() => void wallet.switchNetwork()} className="min-h-11">Switch to Mezo Testnet</Button></div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => { setTick((value) => value + 1); setReviewBundle(null); }} className="min-h-11 px-2">Refresh</Button>
          </div>
          {snapshotView.status === "loading" && <p role="status" className="text-sm text-mist-400">Checking your MUSD balance and Pool position…</p>}
          {snapshotView.status === "stale" && <p role="status" className="rounded-lg border border-risk-medium/30 bg-risk-medium/5 p-3 text-sm text-risk-medium">This information is more than two minutes old. Refresh before depositing.</p>}
          {snapshotView.status === "error" && <p role="alert" className="rounded-lg border border-risk-medium/30 bg-risk-medium/5 p-3 text-sm leading-relaxed text-risk-medium">Could not verify the current Pool data: {snapshotView.message} Refresh before depositing.</p>}
          {snapshot && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Stat label="MUSD in your wallet" value={`${formatTokenUnits(snapshot.musdBalance, 18, 6)} MUSD`} />
                <Stat label="Your MUSD in the Pool" value={`${formatTokenUnits(snapshot.compoundedDeposit, 18, 6)} MUSD`} />
                <Stat label="BTC gain so far" value={`${formatTokenUnits(snapshot.collateralGain, 18, 8)} BTC`} />
              </div>
              <details className="rounded-lg border border-line px-3">
                <summary className="min-h-11 cursor-pointer py-2 text-xs font-medium text-gold-300">Snapshot details</summary>
                <p className="pb-3 text-xs text-mist-500">Total MUSD in Pool: {formatTokenUnits(snapshot.totalMUSDDeposits, 18, 6)} · block {snapshot.blockNumber.toLocaleString()} · {new Date(snapshot.blockTimestamp * 1_000).toLocaleString()} · implementation {snapshot.implementation}</p>
              </details>
            </>
          )}

          <div className="space-y-3 border-t border-line pt-4">
            <label htmlFor="stability-pool-amount" className="block space-y-1.5 text-sm font-medium text-mist-100">
              <span>MUSD to deposit</span>
              <input id="stability-pool-amount" inputMode="decimal" autoComplete="off" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" className="min-h-12 w-full rounded-xl border border-line bg-ink-800 px-3 text-mist-100 placeholder:text-mist-500" />
              <span className="block text-xs font-normal text-mist-500">Only the amount you enter will be used. You may need to approve it first.</span>
            </label>
            {error && <p role="alert" className="rounded-lg border border-risk-medium/30 bg-risk-medium/5 p-3 text-sm leading-relaxed text-risk-medium">{error}</p>}
            <Button onClick={() => void prepareReview()} disabled={!canPrepare || Boolean(review) || !snapshot || snapshotView.status !== "done" || amount.trim() === ""} className="min-h-11 w-full">{busy ? "Checking Pool…" : "Deposit MUSD"}</Button>
            <p className="text-xs leading-relaxed text-mist-500">The app checks the amount and Pool twice before opening your wallet. Your wallet will ask you to approve; nothing is sent unless you do.</p>
          </div>

          {review && (
            <div className="space-y-4 rounded-xl border border-gold-500/30 bg-ink-800/40 p-4">
              <div>
                <p className="text-sm font-semibold text-emerald-300">Fresh checks passed</p>
                <p className="mt-2 text-sm leading-relaxed text-mist-200">
                  {review.action === "approve"
                    ? `First, approve ${formatTokenUnits(review.amountWei, 18, 18)} MUSD so the Pool can use it.`
                    : `You are depositing ${formatTokenUnits(review.amountWei, 18, 18)} MUSD into the Stability Pool.`}
                </p>
              </div>

              {review.action === "approve" ? (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-relaxed text-amber-200">
                  Two wallet confirmations are needed: approve this exact MUSD amount, then prepare again and approve the deposit. The deposit will not happen automatically.
                </p>
              ) : (
                <p className="text-sm text-mist-400">Your existing MUSD approval covers this amount, so only this deposit confirmation is needed.</p>
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
                  <Stat label="MUSD in Pool before action" value={`${formatTokenUnits(review.snapshot.compoundedDeposit, 18, 6)} MUSD`} />
                  <Stat label="BTC gain before action" value={`${formatTokenUnits(review.snapshot.collateralGain, 18, 8)} BTC`} />
                  <Stat label="Gas estimate / limit" value={`${review.gasEstimate.toLocaleString()} / ${review.gasLimit.toLocaleString()} (20% buffer)`} />
                  <Stat label="BTC sent; gas is separate" value="0 BTC" />
                  <Stat label="Checked block" value={review.snapshot.blockNumber.toLocaleString()} />
                  <Stat label="Exact calldata" value={review.transaction.data} />
                </dl>
              </details>

              <p className="text-xs leading-relaxed text-mist-500">The app checks again before opening your wallet. Nothing is signed or sent unless you approve it there.</p>
              <Button onClick={() => void recheckAndOpenWallet()} disabled={busy || pending} className="min-h-11 w-full">
                {busy ? "Checking again…" : review.action === "approve" ? "Approve MUSD in wallet" : "Deposit MUSD in wallet"}
              </Button>
            </div>
          )}

          {submission && (
            <div className="space-y-3 rounded-xl border border-line bg-ink-800/50 p-4">
              <div><h3 className="text-sm font-semibold text-mist-100">{submission.expected.action === "approve" ? "MUSD approval transaction" : "Stability Pool deposit transaction"}</h3><p className="mt-1 text-xs text-mist-400">Wallet {submission.expected.account} · chain {submission.chainId}</p><p className="mt-1 break-all font-mono text-xs text-mist-400">{submission.hash}</p></div>
              {receiptView.status === "confirmed" && <p role="status" className="text-sm text-risk-low">Confirmed on Mezo Testnet in block {receiptView.blockNumber.toLocaleString()}. {submission.expected.action === "approve" ? "Prepare a new review before any deposit; nothing else was submitted." : "Refresh the chain read to see the resulting position."}</p>}
              {receiptView.status === "reverted" && <p role="alert" className="text-sm text-risk-high">The receipt shows a revert in block {receiptView.blockNumber.toLocaleString()}. No successful action is claimed.</p>}
              {receiptView.status === "not-checked" && <p role="status" className="text-sm text-risk-medium">The wallet returned a hash, but its receipt is unchecked and remains unconfirmed.</p>}
              {receiptView.status === "pending" && <p role="status" className="text-sm text-risk-medium">No receipt is available yet. The transaction remains unconfirmed.</p>}
              {receiptView.status === "error" && <p role="alert" className="text-sm text-risk-medium">{receiptView.message}</p>}
              {receiptView.status !== "confirmed" && receiptView.status !== "reverted" && <Button variant="secondary" onClick={() => void checkReceipt()} disabled={busy} className="min-h-11">{busy ? "Checking receipt…" : "Check status"}</Button>}
              <a href={`${submission.explorerUrl.replace(/\/?$/, "/")}tx/${submission.hash}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-sm font-medium text-gold-300 hover:underline">View on Mezo Testnet Explorer</a>
            </div>
          )}
        </>
      )}

      <div className="space-y-2 border-t border-line pt-4 text-xs leading-relaxed text-mist-500">
        <details><summary className="min-h-11 cursor-pointer py-2 font-medium text-gold-300">Technical details and sources</summary><p className="mt-2">This is a direct Mezo Testnet route, not Morbit or the mainnet-only sMUSD vault. Testnet assets have no real monetary value. The app rechecks the Pool contract and its implementation before acting; a contract change between the check and transaction inclusion cannot be ruled out.</p><p className="mt-2">Sources: <a className="text-gold-300 hover:underline" href={TESTNET_STABILITY_POOL.proxyExplorerUrl} target="_blank" rel="noreferrer">Testnet contract</a>, <a className="text-gold-300 hover:underline" href={TESTNET_STABILITY_POOL.implementationExplorerUrl} target="_blank" rel="noreferrer">implementation</a>, <a className="text-gold-300 hover:underline" href={TESTNET_STABILITY_POOL.sourceUrl} target="_blank" rel="noreferrer">Mezo source</a>.</p></details>
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-lg border border-line bg-ink-900/70 p-3"><dt className="text-xs text-mist-500">{label}</dt><dd className="mt-1 break-all text-xs leading-relaxed text-mist-200">{value}</dd></div>;
}
