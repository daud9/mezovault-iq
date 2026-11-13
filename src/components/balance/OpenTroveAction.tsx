import { useEffect, useRef, useState } from "react";
import { resolveRpcUrl } from "../../config/env";
import { MEZO_NETWORKS } from "../../config/chains";
import {
  OpenTrovePreflightError,
  prepareOpenTrove,
  type PreparedOpenTrove,
} from "../../lib/openTroveExecution";
import { formatOpenTroveActionError, recheckReviewedOpenTrove } from "../../lib/openTroveConfirmation";
import { formatBasisPoints, formatUnits18, MEZO_TESTNET_CHAIN_ID, OPEN_TROVE_SELECTOR } from "../../lib/openTrovePlanner";
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

interface ReviewBundle {
  key: string;
  prepared: PreparedOpenTrove;
}

interface ReadyBundle {
  key: string;
  prepared: PreparedOpenTrove;
  checkedAtMs: number;
}

interface Submission {
  hash: string;
  prepared: PreparedOpenTrove;
}

export function OpenTroveAction({
  collateralBtc,
  requestedMusd,
  onConfirmed,
  onExistingTroveDetected,
}: {
  collateralBtc: string;
  requestedMusd: string;
  onConfirmed(): void;
  onExistingTroveDetected(): void;
}) {
  const { state: walletState, network, checkWalletContext, sendReviewedTransaction } = useWallet();
  const connectedAccount = walletState.status === "connected" ? walletState.address : null;
  const networkMatches = network.key === "testnet" && network.chainId === MEZO_TESTNET_CHAIN_ID;
  const chainMatches = walletState.chainId === MEZO_TESTNET_CHAIN_ID;
  const eligible = Boolean(connectedAccount && networkMatches && chainMatches);
  const reviewKey = `${connectedAccount?.toLowerCase() ?? ""}|${walletState.chainId ?? ""}|${collateralBtc}|${requestedMusd}`;
  const currentReviewKeyRef = useRef(reviewKey);
  currentReviewKeyRef.current = reviewKey;
  const [reviewBundle, setReviewBundle] = useState<ReviewBundle | null>(null);
  const [readyBundle, setReadyBundle] = useState<ReadyBundle | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [receiptState, setReceiptState] = useState<ReceiptState>({ status: "not-checked" });
  const review = reviewBundle?.key === reviewKey ? reviewBundle.prepared : null;
  const ready = readyBundle?.key === reviewKey ? readyBundle : null;

  useEffect(() => {
    if (reviewBundle && reviewBundle.key !== reviewKey) setReviewBundle(null);
    if (readyBundle && readyBundle.key !== reviewKey) setReadyBundle(null);
    setError("");
    setNotice("");
  }, [reviewKey]);

  function reportPreflightError(caught: unknown) {
    setError(formatOpenTroveActionError(caught, "preflight"));
    if (caught instanceof OpenTrovePreflightError && caught.code === "existing-trove") {
      onExistingTroveDetected();
    }
  }

  async function prepareReview() {
    if (!eligible || !connectedAccount || busyRef.current || submission) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    setReviewBundle(null);
    setReadyBundle(null);
    try {
      const rpc = createRpcClient({ url: resolveRpcUrl(MEZO_NETWORKS.testnet) });
      const prepared = await prepareOpenTrove({
        account: connectedAccount,
        walletChainId: walletState.chainId,
        collateralBtc,
        requestedMusd,
        rpc,
      });
      if (currentReviewKeyRef.current !== reviewKey) {
        setNotice("The planner values or connected wallet changed during the read. No review was prepared; refresh the values and try again.");
        return;
      }
      setReviewBundle({ key: reviewKey, prepared });
      setNotice("Fresh same-block protocol checks, exact-call simulation, and gas estimation passed. Review every value below; the wallet has not been opened.");
    } catch (caught) {
      reportPreflightError(caught);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function recheckFinalRequest() {
    if (!review || !eligible || !connectedAccount || busyRef.current || submission) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    setReadyBundle(null);
    try {
      const rpc = createRpcClient({ url: resolveRpcUrl(MEZO_NETWORKS.testnet) });
      const result = await recheckReviewedOpenTrove({
        review,
        recheck: () => prepareOpenTrove({
          account: connectedAccount,
          walletChainId: walletState.chainId,
          collateralBtc,
          requestedMusd,
          rpc,
        }),
        reviewIsCurrent: () => currentReviewKeyRef.current === reviewKey,
        checkWalletContext,
      });
      if (result.status === "stale") {
        setReviewBundle(null);
        setNotice("The planner values or connected wallet changed during the final checks. No wallet request was made; prepare a new review.");
        return;
      }
      if (result.status === "changed") {
        setReviewBundle({ key: reviewKey, prepared: result.fresh });
        setNotice("Live protocol terms or the exact gas result changed. The review has been refreshed, and no wallet request was made. Check the updated values and click again if they are still what you want.");
        return;
      }
      setReviewBundle({ key: reviewKey, prepared: result.fresh });
      setReadyBundle({ key: reviewKey, prepared: result.fresh, checkedAtMs: Date.now() });
      setNotice("Fresh protocol checks, exact-call simulation, gas estimate, and wallet account/network checks passed. The wallet provider has not been called yet; use the button below for an immediate wallet request.");
    } catch (caught) {
      if (caught instanceof OpenTrovePreflightError) {
        setReviewBundle(null);
        setReadyBundle(null);
        reportPreflightError(caught);
      } else {
        setReadyBundle(null);
        setError(formatOpenTroveActionError(caught, "wallet-context"));
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function openWalletForApproval() {
    if (!ready || !eligible || !connectedAccount || busyRef.current || submission) return;
    if (currentReviewKeyRef.current !== reviewKey || ready.prepared.account.toLowerCase() !== connectedAccount.toLowerCase()) {
      setReadyBundle(null);
      setNotice("The connected wallet or planner values changed. No wallet request was made; run the final recheck again.");
      return;
    }
    if (Date.now() - ready.checkedAtMs > 15_000) {
      setReadyBundle(null);
      setNotice("The final review expired before the wallet tap. No wallet request was made; run the final recheck again.");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("Wallet provider call: not made yet.");
    let providerCalled = false;
    try {
      const pending = sendReviewedTransaction(
        { ...ready.prepared.transaction },
        { account: ready.prepared.account, chainId: MEZO_TESTNET_CHAIN_ID },
        () => {
          providerCalled = true;
          setNotice(`Wallet provider call: sent eth_sendTransaction to ${walletState.walletName ?? "the selected wallet"}. Waiting for its approval; the app has not signed or submitted automatically.`);
        },
      );
      const hash = await pending;
      setSubmission({ hash, prepared: ready.prepared });
      setReceiptState({ status: "not-checked" });
      setReviewBundle(null);
      setReadyBundle(null);
      setNotice("");
    } catch (caught) {
      setError(formatOpenTroveActionError(caught));
      setNotice(providerCalled
        ? `Wallet provider call: made to ${walletState.walletName ?? "the selected wallet"}, but no transaction hash was returned. Check wallet activity before retrying.`
        : "Wallet provider call: not made. No transaction request was sent; reconnect and recheck before trying again.");
      setReadyBundle(null);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function checkReceipt() {
    if (!submission || busyRef.current || receiptState.status === "confirmed" || receiptState.status === "reverted") return;
    busyRef.current = true;
    setBusy(true);
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
      setBusy(false);
    }
  }

  const gateMessage = walletState.status !== "connected"
    ? "Connect a wallet before preparing an open-Trove review. Connecting alone never asks for a transaction."
    : !networkMatches
      ? "Opening a Trove is configured only for Mezo Testnet (chain 31611)."
      : !chainMatches
        ? "The connected wallet is not on Mezo Testnet (chain 31611). Switch networks before preparing a review."
        : null;

  return (
    <section className="space-y-4 rounded-xl border border-gold-500/30 bg-gold-500/5 p-4 text-mist-100" aria-labelledby="open-trove-action-title">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-gold-300">Wallet-confirmed action · open only</p>
        <h3 id="open-trove-action-title" className="mt-1 text-base font-semibold">Open a new Trove</h3>
        <p className="mt-1 text-sm leading-relaxed text-mist-400">This action uses the editable planner values above. Review the exact request, run a final fresh check, then make one separate tap that immediately calls the selected wallet for your approval. The app never signs or auto-submits.</p>
      </div>

      {gateMessage && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200" role="status">{gateMessage}</p>}
      {error && <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200" role="alert">{error}</p>}
      {notice && <p className="rounded-lg border border-line bg-ink-800/60 p-3 text-sm text-mist-300" role="status">{notice}</p>}

      {eligible && !submission && !review && (
        <div className="space-y-3">
          <Button onClick={() => void prepareReview()} disabled={busy || !eligible} className="min-h-11 w-full">
            {busy ? "Checking fresh Testnet conditions…" : "Prepare fresh open-Trove review"}
          </Button>
          <p className="text-xs leading-relaxed text-mist-500">This first step is read-only and does not open your wallet. After reviewing the exact amounts and gas, run a separate final freshness check; if it passes unchanged, the next tap immediately sends the request to your wallet.</p>
        </div>
      )}

      {review && !submission && (
        <div className="space-y-4 rounded-xl border border-line bg-ink-800/60 p-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-mist-500">Fresh exact request review</p>
            <p className="mt-1 text-sm font-semibold text-emerald-300">Simulation passed · block {review.snapshot.blockNumber.toLocaleString()}</p>
            <p className="mt-1 text-xs text-mist-500">Prepared {new Date(review.reviewedAtMs).toLocaleString()}. The final freshness check repeats the protocol reads, exact simulation, and gas estimate; changed terms refresh this review without calling the wallet.</p>
          </div>

          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <Detail label="Connected wallet / recipient" value={review.account} />
            <Detail label="Network" value={`Mezo Testnet · chain ${review.snapshot.chainId}`} />
            <Detail label="BTC collateral sent as native msg.value" value={`${formatUnits18(review.plan.collateralWei ?? 0n)} BTC`} />
            <Detail label="Requested MUSD (_debtAmount)" value={`${formatUnits18(review.plan.requestWei ?? 0n)} MUSD`} />
            <Detail label="Borrowing fee" value={`${formatUnits18(review.plan.feeWei ?? 0n)} MUSD`} />
            <Detail label="Net debt (request + fee)" value={`${formatUnits18(review.plan.netDebtWei ?? 0n)} MUSD`} />
            <Detail label="MUSD gas reserve" value={`${formatUnits18(review.plan.reserveWei ?? 0n)} MUSD`} />
            <Detail label="Composite debt" value={`${formatUnits18(review.plan.compositeDebtWei ?? 0n)} MUSD`} />
            <Detail label="Live BTC/USD oracle price" value={`$${formatUnits18(review.snapshot.btcUsdWei, 2)}`} />
            <Detail label="Live system mode" value={review.snapshot.mode === "normal" ? "Normal Mode" : "Recovery Mode"} />
            <Detail label="Open-time ICR" value={formatBasisPoints(review.plan.icrBasisPoints)} />
            {review.snapshot.mode === "normal" && <Detail label="Projected post-open TCR" value={formatBasisPoints(review.plan.postOpenTcrBasisPoints)} />}
            <Detail label="BorrowerOperations contract" value={review.transaction.to} />
            <Detail label="Call" value={`openTrove(uint256,address,address) · payable · selector ${OPEN_TROVE_SELECTOR}`} />
            <Detail label="Upper / lower hints" value="0x0000000000000000000000000000000000000000 / 0x0000000000000000000000000000000000000000" />
            <Detail label="Gas estimate / wallet gas limit" value={`${review.gasEstimate.toLocaleString()} / ${review.gasLimit.toLocaleString()} (20% buffer)`} />
            <Detail label="Native BTC value" value={`${formatUnits18(review.plan.collateralWei ?? 0n)} BTC · ${review.transaction.value}`} />
          </dl>

          <details>
            <summary className="min-h-11 cursor-pointer py-2 text-xs font-medium text-gold-300">Show exact calldata</summary>
            <p className="break-all font-mono text-[11px] leading-relaxed text-mist-400">{review.transaction.data}</p>
          </details>

          <p className="text-xs leading-relaxed text-mist-500">The requested MUSD is the `_debtAmount` argument; BTC collateral is attached as native `msg.value`. Borrowing fee, net debt and reserve are calculated from current same-block values. Network gas is paid separately in native BTC, and your wallet shows its fee before approval. A simulation is not a transaction or receipt.</p>
          {ready && <p className="text-xs leading-relaxed text-emerald-300" role="status">Fresh review passed at {new Date(ready.checkedAtMs).toLocaleTimeString()}. The provider has not been called. Tap the button within 15 seconds; if you wait longer, the app will require another recheck.</p>}
          <Button onClick={() => void (ready ? openWalletForApproval() : recheckFinalRequest())} disabled={busy || !eligible} className="min-h-11 w-full">
            {busy ? ready ? "Waiting for wallet approval…" : "Rechecking exact transaction…" : ready ? "Open wallet to review and confirm" : "Run final freshness check"}
          </Button>
        </div>
      )}

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
            <Button variant="secondary" onClick={() => void checkReceipt()} disabled={busy} className="min-h-11">{busy ? "Checking receipt…" : "Check transaction receipt"}</Button>
          )}
          {receiptState.status === "reverted" && (
            <Button variant="secondary" onClick={() => { setSubmission(null); setReceiptState({ status: "not-checked" }); setReviewBundle(null); setError(""); }} className="min-h-11">Prepare a new review after the reverted transaction</Button>
          )}
          <a href={`${MEZO_NETWORKS.testnet.explorerUrl.replace(/\/?$/, "/")}tx/${submission.hash}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-medium text-gold-300 hover:underline">View on the Mezo Testnet explorer</a>
        </div>
      )}

      <p className="text-xs leading-relaxed text-mist-500">Scope: opening a new Trove only. This flow does not add collateral, borrow more, repay, withdraw, close, liquidate, or sign automatically. A submitted transaction is reported as successful only after its exact call details and a success receipt are verified.</p>
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

function receiptMessage(error: unknown): string {
  return error instanceof OpenTroveReceiptError
    ? error.message
    : "The receipt could not be verified; confirmation is unknown. Check again later.";
}
