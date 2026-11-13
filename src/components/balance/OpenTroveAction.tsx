import { useEffect, useRef, useState } from "react";
import { resolveRpcUrl } from "../../config/env";
import { MEZO_NETWORKS } from "../../config/chains";
import {
  OpenTrovePreflightError,
  prepareOpenTrove,
  type PreparedOpenTrove,
} from "../../lib/openTroveExecution";
import {
  formatOpenTroveActionError,
  requestReadyOpenTrove,
  type ReadyOpenTrove,
} from "../../lib/openTroveConfirmation";
import { formatBasisPoints, formatUnits18, MEZO_TESTNET_CHAIN_ID, OPEN_TROVE_SELECTOR, type OpenTroveLiveSnapshot } from "../../lib/openTrovePlanner";
import { OpenTroveReceiptError, readOpenTroveReceipt } from "../../lib/openTroveReceipt";
import { createRpcClient } from "../../lib/rpc";
import { Button } from "../ui/Button";
import { useWallet } from "../wallet/WalletProvider";

type ReceiptState =
  | { status: "not-checked" }
  | { status: "pending" }
  | { status: "confirmed"; blockNumber: number }
  | { status: "reverted"; blockNumber: number }
  | { status: "error"; message: string };

interface Submission {
  hash: string;
  prepared: PreparedOpenTrove;
}

const PREPARE_REFRESH_MS = 30_000;

export function OpenTroveAction({
  enabled,
  collateralBtc,
  requestedMusd,
  onConfirmed,
  onExistingTroveDetected,
  onFreshSnapshot,
  onRefreshMinimums,
}: {
  enabled: boolean;
  collateralBtc: string;
  requestedMusd: string;
  onConfirmed(): void;
  onExistingTroveDetected(): void;
  onFreshSnapshot(snapshot: OpenTroveLiveSnapshot): void;
  onRefreshMinimums(): void;
}) {
  const { state: walletState, network, checkWalletContext, sendReviewedTransaction } = useWallet();
  const connectedAccount = walletState.status === "connected" ? walletState.address : null;
  const networkMatches = network.key === "testnet" && network.chainId === MEZO_TESTNET_CHAIN_ID;
  const chainMatches = walletState.chainId === MEZO_TESTNET_CHAIN_ID;
  const eligible = Boolean(connectedAccount && networkMatches && chainMatches);
  const currentKey = `${connectedAccount?.toLowerCase() ?? ""}|${walletState.chainId ?? ""}|${collateralBtc}|${requestedMusd}`;
  const currentKeyRef = useRef(currentKey);
  currentKeyRef.current = currentKey;

  const [readyBundle, setReadyBundle] = useState<ReadyOpenTrove | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [walletRequestPending, setWalletRequestPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [receiptState, setReceiptState] = useState<ReceiptState>({ status: "not-checked" });
  const [receiptBusy, setReceiptBusy] = useState(false);
  const busyRef = useRef(false);
  const ready = readyBundle?.key === currentKey ? readyBundle : null;
  const submissionHash = submission?.hash ?? "";

  useEffect(() => {
    if (!enabled || !eligible || !connectedAccount || !collateralBtc.trim() || !requestedMusd.trim() || submissionHash || walletRequestPending) {
      setReadyBundle(null);
      setIsChecking(false);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function prepareInBackground() {
      setReadyBundle(null);
      setIsChecking(true);
      try {
        const rpc = createRpcClient({ url: resolveRpcUrl(MEZO_NETWORKS.testnet) });
        const prepared = await prepareOpenTrove({
          account: connectedAccount,
          walletChainId: walletState.chainId,
          collateralBtc,
          requestedMusd,
          rpc,
        });
        await checkWalletContext({ account: prepared.account, chainId: MEZO_TESTNET_CHAIN_ID });
        if (cancelled || currentKeyRef.current !== currentKey) return;
        onFreshSnapshot(prepared.snapshot);
        setReadyBundle({ key: currentKey, prepared, checkedAtMs: Date.now() });
        setError("");
        setNotice("");
      } catch (caught) {
        if (cancelled) return;
        setReadyBundle(null);
        setError(preflightMessage(caught));
        setNotice("");
        if (caught instanceof OpenTrovePreflightError && caught.code === "existing-trove") {
          onExistingTroveDetected();
        } else {
          onRefreshMinimums();
        }
      } finally {
        if (!cancelled) {
          setIsChecking(false);
          timer = setTimeout(() => void prepareInBackground(), PREPARE_REFRESH_MS);
        }
      }
    }

    void prepareInBackground();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [
    enabled,
    eligible,
    connectedAccount,
    walletState.chainId,
    collateralBtc,
    requestedMusd,
    currentKey,
    checkWalletContext,
    onFreshSnapshot,
    onRefreshMinimums,
    onExistingTroveDetected,
    submissionHash,
    walletRequestPending,
    refreshNonce,
  ]);

  function openWalletForApproval() {
    if (!ready || !eligible || !connectedAccount || busyRef.current || submission) return;
    busyRef.current = true;
    const request = requestReadyOpenTrove({
      ready,
      currentKey: currentKeyRef.current,
      connectedAccount,
      nowMs: Date.now(),
      send: sendReviewedTransaction,
      onProviderCall: () => {
        setNotice(`Wallet request sent to ${walletState.walletName ?? "your selected wallet"}. Review and approve it there; the app has not signed or submitted automatically.`);
      },
    });

    if (request.status !== "requested") {
      busyRef.current = false;
      setReadyBundle(null);
      if (request.status === "stale") {
        setError("Live Testnet data was stale. No wallet request was made; refreshing automatically.");
        onRefreshMinimums();
        setRefreshNonce((current) => current + 1);
      } else {
        setError("The wallet, network, or form changed. No wallet request was made; checking again automatically.");
        setRefreshNonce((current) => current + 1);
      }
      return;
    }

    setError("");
    setNotice("Opening your wallet for approval…");
    setWalletRequestPending(true);
    void request.promise
      .then((hash) => {
        setSubmission({ hash, prepared: ready.prepared });
        setReceiptState({ status: "not-checked" });
        setNotice("");
      })
      .catch((caught: unknown) => {
        setError(formatOpenTroveActionError(caught));
        setNotice("No success is assumed. Check wallet activity before retrying.");
      })
      .finally(() => {
        busyRef.current = false;
        setWalletRequestPending(false);
      });
  }

  async function checkReceipt() {
    if (!submission || busyRef.current || receiptState.status === "confirmed" || receiptState.status === "reverted") return;
    busyRef.current = true;
    setReceiptBusy(true);
    setError("");
    try {
      const rpc = createRpcClient({ url: resolveRpcUrl(MEZO_NETWORKS.testnet) });
      const result = await readOpenTroveReceipt({ rpc, hash: submission.hash, expected: submission.prepared.transaction });
      setReceiptState(result);
      if (result.status === "confirmed") onConfirmed();
    } catch (caught) {
      setReceiptState({ status: "error", message: receiptMessage(caught) });
    } finally {
      busyRef.current = false;
      setReceiptBusy(false);
    }
  }

  const gateMessage = walletState.status !== "connected"
    ? "Connect your wallet before opening a Trove."
    : !networkMatches
      ? "Opening a Trove is available only on Mezo Testnet (chain 31611)."
      : !chainMatches
        ? "Switch your wallet to Mezo Testnet (chain 31611)."
        : null;

  return (
    <section className="space-y-3 rounded-xl border border-gold-500/30 bg-gold-500/5 p-3 text-mist-100" aria-labelledby="open-trove-action-title">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-gold-300">One wallet confirmation · Testnet only</p>
        <h3 id="open-trove-action-title" className="mt-1 text-base font-semibold">Open your Trove</h3>
        <p className="mt-1 text-sm leading-relaxed text-mist-400">Live checks run automatically. Your wallet opens only after they pass; you approve the transaction there.</p>
      </div>

      {gateMessage && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200" role="status">{gateMessage}</p>}
      {error && <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200" role="alert">{error}</p>}
      {notice && <p className="rounded-lg border border-line bg-ink-800/60 p-3 text-sm text-mist-300" role="status">{notice}</p>}

      {!submission && (
        <div className="space-y-2">
          <Button
            onClick={openWalletForApproval}
            disabled={!eligible || !ready || isChecking || walletRequestPending}
            className="min-h-11 w-full"
          >
            {walletRequestPending
              ? "Waiting for wallet approval…"
              : ready
                ? "Open wallet to review and confirm"
                : isChecking
                  ? "Checking live Testnet conditions…"
                  : "Waiting for fresh checks…"}
          </Button>
          <p className="text-xs leading-relaxed text-mist-500" role="status">
            {ready
              ? `Ready · block ${ready.prepared.snapshot.blockNumber.toLocaleString()}. Tap once to open your wallet.`
              : "No wallet request is sent while checks are pending or unavailable. The app retries automatically."}
          </p>
        </div>
      )}

      <details>
        <summary className="min-h-11 cursor-pointer py-2 text-xs font-medium text-gold-300">Checks and transaction details</summary>
        <div className="space-y-2 pb-2 text-xs leading-relaxed text-mist-400">
          <p>The app verifies the current account and network, live debt and collateral limits, oracle data, existing-Trove status, exact openTrove call simulation, and gas estimate. A failed or stale check never opens the wallet.</p>
          {ready && (
            <dl className="grid gap-2 sm:grid-cols-2">
              <Detail label="Live system mode" value={ready.prepared.snapshot.mode === "normal" ? "Normal Mode" : "Recovery Mode"} />
              <Detail label="Open-time collateral ratio" value={formatBasisPoints(ready.prepared.plan.icrBasisPoints)} />
              <Detail label="Requested MUSD + live fee" value={`${formatUnits18(ready.prepared.plan.requestWei ?? 0n)} + ${formatUnits18(ready.prepared.plan.feeWei ?? 0n)}`} />
              <Detail label="BTC collateral sent" value={`${formatUnits18(ready.prepared.plan.collateralWei ?? 0n)} BTC`} />
              <Detail label="Gas estimate / limit" value={`${ready.prepared.gasEstimate.toLocaleString()} / ${ready.prepared.gasLimit.toLocaleString()}`} />
              <Detail label="BorrowerOperations" value={ready.prepared.transaction.to} />
              <Detail label="Call" value={`openTrove(uint256,address,address) · ${OPEN_TROVE_SELECTOR}`} />
              <Detail label="Snapshot block" value={ready.prepared.snapshot.blockNumber.toLocaleString()} />
            </dl>
          )}
          <p>Network gas is paid separately in native BTC and is shown by your wallet. No transaction is signed or submitted unless you approve it in the wallet.</p>
        </div>
      </details>

      {submission && (
        <div className="space-y-3 rounded-xl border border-line bg-ink-800/60 p-4">
          <div>
            <h4 className="text-sm font-semibold text-mist-100">Open-Trove transaction</h4>
            <p className="mt-1 break-all font-mono text-xs text-mist-400">{submission.hash}</p>
          </div>
          {receiptState.status === "not-checked" && <p role="status" className="text-sm text-amber-200">Your wallet returned a hash, but the receipt has not been checked. This is unconfirmed.</p>}
          {receiptState.status === "pending" && <p role="status" className="text-sm text-amber-200">No receipt is available yet. The transaction remains unconfirmed; check again later.</p>}
          {receiptState.status === "error" && <p role="alert" className="text-sm text-amber-200">{receiptState.message}</p>}
          {receiptState.status === "confirmed" && <p role="status" className="text-sm text-emerald-300">The exact transaction, successful receipt, and matching TroveCreated event were verified in block {receiptState.blockNumber.toLocaleString()}. Refreshing the Trove read.</p>}
          {receiptState.status === "reverted" && <p role="alert" className="text-sm text-rose-300">The exact transaction receipt shows a revert in block {receiptState.blockNumber.toLocaleString()}. No successful Trove opening is claimed.</p>}
          {receiptState.status !== "confirmed" && receiptState.status !== "reverted" && (
            <Button variant="secondary" onClick={() => void checkReceipt()} disabled={receiptBusy} className="min-h-11">{receiptBusy ? "Checking receipt…" : "Check transaction receipt"}</Button>
          )}
          {receiptState.status === "reverted" && (
            <Button variant="secondary" onClick={() => { setSubmission(null); setReceiptState({ status: "not-checked" }); setError(""); setRefreshNonce((current) => current + 1); }} className="min-h-11">Prepare automatically after the revert</Button>
          )}
          <a href={`${MEZO_NETWORKS.testnet.explorerUrl.replace(/\/?$/, "/")}tx/${submission.hash}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-medium text-gold-300 hover:underline">View on the Mezo Testnet explorer</a>
        </div>
      )}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-ink-900/70 p-3">
      <dt className="text-xs text-mist-500">{label}</dt>
      <dd className="mt-1 break-all text-xs leading-relaxed text-mist-200">{value}</dd>
    </div>
  );
}

function preflightMessage(error: unknown): string {
  if (error instanceof OpenTrovePreflightError && error.code === "existing-trove") return error.message;
  if (error instanceof OpenTrovePreflightError) return `${error.message} Automatic retry is on.`;
  const formatted = formatOpenTroveActionError(error, "preflight");
  return formatted;
}

function receiptMessage(error: unknown): string {
  return error instanceof OpenTroveReceiptError
    ? error.message
    : "The receipt could not be verified; confirmation is unknown. Check again later.";
}
