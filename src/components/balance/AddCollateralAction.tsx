import { useEffect, useRef, useState } from "react";
import { resolveRpcUrl } from "../../config/env";
import { MEZO_NETWORKS } from "../../config/chains";
import {
  AddCollateralPreflightError,
  prepareAddCollateral,
  sameAddCollateralReview,
  type PreparedAddCollateral,
} from "../../lib/addCollateralExecution";
import { AddCollateralReceiptError, readAddCollateralReceipt } from "../../lib/addCollateralReceipt";
import { formatUnits18, MEZO_TESTNET_CHAIN_ID } from "../../lib/openTrovePlanner";
import { createRpcClient } from "../../lib/rpc";
import { describeWalletError } from "../../lib/wallet";
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
  prepared: PreparedAddCollateral;
}

interface Submission {
  hash: string;
  prepared: PreparedAddCollateral;
}

export function AddCollateralAction({ onConfirmed }: { onConfirmed(): void }) {
  const { state: walletState, network, sendTransaction } = useWallet();
  const connectedAccount = walletState.status === "connected" ? walletState.address : null;
  const networkMatches = network.key === "testnet" && network.chainId === MEZO_TESTNET_CHAIN_ID;
  const chainMatches = walletState.chainId === MEZO_TESTNET_CHAIN_ID;
  const eligible = Boolean(connectedAccount && networkMatches && chainMatches);
  const [collateralBtc, setCollateralBtc] = useState("");
  const reviewKey = `${connectedAccount?.toLowerCase() ?? ""}|${walletState.chainId ?? ""}|${collateralBtc}`;
  const currentReviewKeyRef = useRef(reviewKey);
  currentReviewKeyRef.current = reviewKey;
  const [reviewBundle, setReviewBundle] = useState<ReviewBundle | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [receiptState, setReceiptState] = useState<ReceiptState>({ status: "not-checked" });
  const review = reviewBundle?.key === reviewKey ? reviewBundle.prepared : null;

  useEffect(() => {
    if (reviewBundle && reviewBundle.key !== reviewKey) setReviewBundle(null);
    setError("");
    setNotice("");
  }, [reviewKey]);

  async function prepareReview() {
    if (!eligible || !connectedAccount || busyRef.current || submission) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    setReviewBundle(null);
    try {
      const rpc = createRpcClient({ url: resolveRpcUrl(MEZO_NETWORKS.testnet) });
      const prepared = await prepareAddCollateral({
        account: connectedAccount,
        walletChainId: walletState.chainId,
        collateralBtc,
        rpc,
      });
      if (currentReviewKeyRef.current !== reviewKey) {
        setNotice("The BTC amount or connected wallet changed during the read. No review was prepared; refresh the values and try again.");
        return;
      }
      setReviewBundle({ key: reviewKey, prepared });
      setNotice("Fresh same-block Trove checks, exact-call simulation, and gas estimation passed. Review every value below; the wallet has not been opened.");
    } catch (caught) {
      setError(preflightMessage(caught));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function recheckAndOpenWallet() {
    if (!review || !eligible || !connectedAccount || busyRef.current || submission) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const rpc = createRpcClient({ url: resolveRpcUrl(MEZO_NETWORKS.testnet) });
      const fresh = await prepareAddCollateral({
        account: connectedAccount,
        walletChainId: walletState.chainId,
        collateralBtc,
        rpc,
      });
      if (currentReviewKeyRef.current !== reviewKey) {
        setReviewBundle(null);
        setNotice("The BTC amount or connected wallet changed during the final checks. No wallet request was made; prepare a new review.");
        return;
      }
      if (!sameAddCollateralReview(review, fresh)) {
        setReviewBundle({ key: reviewKey, prepared: fresh });
        setNotice("The live Trove state or exact gas result changed. The review has been refreshed, and no wallet request was made. Check the updated values and click again if they are still what you want.");
        return;
      }
      setNotice("The exact request still matches the displayed review. Your wallet will now show the BTC addition for your approval; the app will not sign or submit on its own.");
      const hash = await sendTransaction(
        { ...fresh.transaction },
        { account: fresh.account, chainId: MEZO_TESTNET_CHAIN_ID },
      );
      setSubmission({ hash, prepared: fresh });
      setReceiptState({ status: "not-checked" });
      setReviewBundle(null);
      setNotice("");
    } catch (caught) {
      if (caught instanceof AddCollateralPreflightError) {
        setReviewBundle(null);
        setError(caught.message);
      } else {
        setError(`${describeWalletError(caught).message} No success is assumed; check the wallet and explorer before retrying.`);
      }
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
      const result = await readAddCollateralReceipt({ rpc, hash: submission.hash, expected: submission.prepared.transaction });
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
    ? "Connect a wallet before preparing an add-collateral review. Connecting alone never asks for a transaction."
    : !networkMatches
      ? "Adding BTC is configured only for Mezo Testnet (chain 31611)."
      : !chainMatches
        ? "The connected wallet is not on Mezo Testnet (chain 31611). Switch networks before preparing a review."
        : null;

  return (
    <section className="space-y-4 rounded-xl border border-gold-500/30 bg-gold-500/5 p-4 text-mist-100" aria-labelledby="add-collateral-action-title">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-gold-300">Wallet-confirmed action · add collateral only</p>
        <h3 id="add-collateral-action-title" className="mt-1 text-base font-semibold">Add BTC to this Trove</h3>
        <p className="mt-1 text-sm leading-relaxed text-mist-400">Enter the BTC amount to add to your active Trove. The amount is sent as native transaction value; network gas is paid separately. The first review is read-only, and a second click repeats the live checks before your wallet opens.</p>
      </div>

      <label htmlFor="add-collateral-btc" className="block space-y-1 text-sm text-mist-300">
        <span>BTC to add</span>
        <input
          id="add-collateral-btc"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={collateralBtc}
          onChange={(event) => setCollateralBtc(event.target.value)}
          disabled={busy || Boolean(submission)}
          placeholder="0.01"
          className="min-h-11 w-full rounded-lg border border-line bg-ink-900 px-3 py-2 text-base text-mist-100 outline-none placeholder:text-mist-600 focus:border-gold-400"
        />
      </label>

      {gateMessage && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200" role="status">{gateMessage}</p>}
      {error && <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200" role="alert">{error}</p>}
      {notice && <p className="rounded-lg border border-line bg-ink-800/60 p-3 text-sm text-mist-300" role="status">{notice}</p>}

      {eligible && !submission && !review && (
        <div className="space-y-3">
          <Button onClick={() => void prepareReview()} disabled={busy || !eligible} className="min-h-11 w-full">
            {busy ? "Checking fresh Trove conditions…" : "Prepare fresh BTC-addition review"}
          </Button>
          <p className="text-xs leading-relaxed text-mist-500">This step only reads the active Trove, estimates gas, and simulates the exact call. It does not open the wallet or change the chain.</p>
        </div>
      )}

      {review && !submission && (
        <div className="space-y-4 rounded-xl border border-line bg-ink-800/60 p-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-mist-500">Fresh exact request review</p>
            <p className="mt-1 text-sm font-semibold text-emerald-300">Simulation passed · block {review.blockNumber.toLocaleString()}</p>
            <p className="mt-1 text-xs text-mist-500">Prepared {new Date(review.reviewedAtMs).toLocaleString()}. The final click re-reads the active Trove and simulates again; if the displayed position or gas changes, the wallet will not open.</p>
          </div>

          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <Detail label="Connected wallet / Trove owner" value={review.account} />
            <Detail label="Network" value={`Mezo Testnet · chain ${MEZO_TESTNET_CHAIN_ID}`} />
            <Detail label="BTC to add as native transaction value" value={`${formatUnits18(review.collateralWei, 18)} BTC`} />
            <Detail label="Existing Trove collateral at checked block" value={`${formatUnits18(review.existingCollateralWei, 18)} BTC`} />
            <Detail label="Existing Trove debt at checked block" value={`${formatUnits18(review.existingDebtWei, 18)} MUSD`} />
            <Detail label="BorrowerOperations contract" value={review.transaction.to} />
            <Detail label="Call" value={`addColl(address,address) · payable · selector ${review.transaction.data.slice(0, 10)}`} />
            <Detail label="Upper / lower hints" value="Zero / zero; Mezo's sorted-Trove contract performs its fallback position search." />
            <Detail label="Gas estimate / wallet gas limit" value={`${review.gasEstimate.toLocaleString()} / ${review.gasLimit.toLocaleString()} (20% buffer)`} />
            <Detail label="Native BTC value" value={`${formatUnits18(review.collateralWei, 18)} BTC · ${review.transaction.value}`} />
          </dl>

          <details>
            <summary className="min-h-11 cursor-pointer py-2 text-xs font-medium text-gold-300">Show exact calldata</summary>
            <p className="break-all font-mono text-[11px] leading-relaxed text-mist-400">{review.transaction.data}</p>
          </details>

          <p className="text-xs leading-relaxed text-mist-500">The call contains only `addColl(address,address)`; the BTC amount is attached as `msg.value`. Zero hints invoke the contract's fallback sorted-list search, which is included in the fresh gas estimate. The simulation is not a transaction or receipt.</p>
          <Button onClick={() => void recheckAndOpenWallet()} disabled={busy || !eligible} className="min-h-11 w-full">
            {busy ? "Rechecking exact transaction…" : "Recheck & open wallet to review and confirm"}
          </Button>
        </div>
      )}

      {submission && (
        <div className="space-y-3 rounded-xl border border-line bg-ink-800/60 p-4">
          <div>
            <h4 className="text-sm font-semibold text-mist-100">Add-collateral transaction</h4>
            <p className="mt-1 break-all font-mono text-xs text-mist-400">{submission.hash}</p>
          </div>
          {receiptState.status === "not-checked" && <p role="status" className="text-sm text-amber-200">Your wallet returned a hash, but the receipt has not been checked. This is unconfirmed.</p>}
          {receiptState.status === "pending" && <p role="status" className="text-sm text-amber-200">No receipt is available yet. The transaction remains unconfirmed; check again later.</p>}
          {receiptState.status === "error" && <p role="alert" className="text-sm text-amber-200">{receiptState.message}</p>}
          {receiptState.status === "confirmed" && <p role="status" className="text-sm text-emerald-300">The exact transaction, successful receipt, and matching TroveUpdated(adjustTrove) event were verified in block {receiptState.blockNumber.toLocaleString()}. Refreshing the Trove read.</p>}
          {receiptState.status === "reverted" && <p role="alert" className="text-sm text-rose-300">The exact transaction receipt shows a revert in block {receiptState.blockNumber.toLocaleString()}. No successful collateral addition is claimed.</p>}
          {receiptState.status !== "confirmed" && receiptState.status !== "reverted" && (
            <Button variant="secondary" onClick={() => void checkReceipt()} disabled={busy} className="min-h-11">{busy ? "Checking receipt…" : "Check transaction receipt"}</Button>
          )}
          {receiptState.status === "reverted" && (
            <Button variant="secondary" onClick={() => { setSubmission(null); setReceiptState({ status: "not-checked" }); setReviewBundle(null); setError(""); }} className="min-h-11">Prepare a new review after the reverted transaction</Button>
          )}
          <a href={`${MEZO_NETWORKS.testnet.explorerUrl.replace(/\/?$/, "/")}tx/${submission.hash}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-medium text-gold-300 hover:underline">View on the Mezo Testnet explorer</a>
        </div>
      )}

      <p className="text-xs leading-relaxed text-mist-500">Scope: adding BTC collateral to the existing active Trove only. This action does not borrow more, repay, withdraw, close, or sign automatically. Submission requires your own wallet approval.</p>
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
  return error instanceof AddCollateralPreflightError
    ? error.message
    : "The fresh Testnet add-collateral preflight failed. No wallet request was made; refresh the reads and review again.";
}

function receiptMessage(error: unknown): string {
  return error instanceof AddCollateralReceiptError
    ? error.message
    : "The receipt could not be verified; confirmation is unknown. Check again later.";
}
