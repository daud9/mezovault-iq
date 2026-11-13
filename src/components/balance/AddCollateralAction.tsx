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
import { formatUnits18, MEZO_TESTNET_CHAIN_ID, parseUnits18 } from "../../lib/openTrovePlanner";
import { createRpcClient } from "../../lib/rpc";
import { describeWalletError } from "../../lib/wallet";
import { useNativeBalance } from "../../hooks/useNativeBalance";
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
  const { view: nativeBalanceView, refresh: refreshNativeBalance } = useNativeBalance();
  const connectedAccount = walletState.status === "connected" ? walletState.address : null;
  const networkMatches = network.key === "testnet" && network.chainId === MEZO_TESTNET_CHAIN_ID;
  const chainMatches = walletState.chainId === MEZO_TESTNET_CHAIN_ID;
  const eligible = Boolean(connectedAccount && networkMatches && chainMatches);
  const [collateralBtc, setCollateralBtc] = useState("");
  const walletBalance = nativeBalanceView.status === "done" && nativeBalanceView.result.status === "ok"
    && nativeBalanceView.result.chainId === MEZO_TESTNET_CHAIN_ID
    ? nativeBalanceView.result
    : null;
  const requestedWei = parseUnits18(collateralBtc);
  const amountExceedsBalance = walletBalance !== null && requestedWei !== null && requestedWei > walletBalance.balanceRaw;
  const amountUsesAllBalance = walletBalance !== null && requestedWei !== null && requestedWei > 0n && requestedWei >= walletBalance.balanceRaw;
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
    let openingWallet = false;
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
      const fresh = await prepareAddCollateral({
        account: connectedAccount,
        walletChainId: walletState.chainId,
        collateralBtc,
        rpc,
      });
      if (currentReviewKeyRef.current !== reviewKey) {
        setNotice("The BTC amount or wallet changed while checking. Nothing was sent; check the amount again.");
        return;
      }
      if (!sameAddCollateralReview(prepared, fresh)) {
        setReviewBundle({ key: reviewKey, prepared: fresh });
        setNotice("Your Trove, BTC balance, or network fee estimate changed. Review the updated summary before continuing.");
        return;
      }
      setNotice("Fresh checks passed. Your wallet will ask you to approve this BTC addition.");
      openingWallet = true;
      const hash = await sendTransaction(
        { ...fresh.transaction },
        { account: fresh.account, chainId: MEZO_TESTNET_CHAIN_ID },
      );
      setSubmission({ hash, prepared: fresh });
      setReceiptState({ status: "not-checked" });
      setReviewBundle(null);
      setNotice("");
    } catch (caught) {
      setError(openingWallet
        ? `${describeWalletError(caught).message} No success is assumed; check the wallet and explorer before retrying.`
        : preflightMessage(caught));
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
        setNotice("The amount or wallet changed while checking. Nothing was sent; check the amount again.");
        return;
      }
      if (!sameAddCollateralReview(review, fresh)) {
        setReviewBundle({ key: reviewKey, prepared: fresh });
        setNotice("Your Trove, BTC balance, or network fee estimate changed. Review the updated summary and continue again if it still looks right.");
        return;
      }
      setNotice("Final checks passed. Your wallet will ask you to approve this BTC addition.");
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
      if (result.status === "confirmed") refreshNativeBalance();
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
        <h3 id="add-collateral-action-title" className="text-base font-semibold">Add BTC to your Trove</h3>
        <p className="mt-1 text-sm text-mist-400">Enter how much BTC you want to add. Keep some BTC in your wallet to pay network fees.</p>
      </div>

      {walletBalance && (
        <div className="rounded-lg border border-line bg-ink-800/60 p-3">
          <p className="text-xs text-mist-500">Wallet BTC balance</p>
          <p className="mt-1 text-lg font-semibold text-mist-100">{formatUnits18(walletBalance.balanceRaw, 18)} BTC</p>
          <p className="mt-1 text-xs text-mist-500">This BTC pays for both the amount you add and network fees.</p>
        </div>
      )}
      {eligible && nativeBalanceView.status === "loading" && <p role="status" className="text-xs text-mist-400">Checking wallet BTC balance…</p>}
      {amountExceedsBalance && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200" role="status">
          This is more BTC than the latest wallet balance. Lower the amount or add BTC first; you still need BTC for network fees.
        </p>
      )}
      {amountUsesAllBalance && !amountExceedsBalance && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200" role="status">
          This uses all the BTC in your wallet. Keep some for network fees.
        </p>
      )}

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
          <Button onClick={() => void prepareReview()} disabled={busy} className="min-h-11 w-full">
            {busy ? "Checking Trove and BTC…" : "Add BTC"}
          </Button>
          <p className="text-xs leading-relaxed text-mist-500">The app checks your Trove and BTC twice first. Then your wallet asks you to approve the transaction; nothing is sent unless you approve.</p>
        </div>
      )}

      {review && !submission && (
        <div className="space-y-4 rounded-xl border border-line bg-ink-800/60 p-4">
          <div>
            <p className="text-sm font-semibold text-emerald-300">Ready to add BTC</p>
            <p className="mt-2 text-sm leading-relaxed text-mist-200">You will send <strong>{formatUnits18(review.collateralWei, 18)} BTC</strong> from this wallet to add to your Trove.</p>
            <p className="mt-2 text-sm text-mist-400">Your Trove currently holds {formatUnits18(review.existingCollateralWei, 18)} BTC and has {formatUnits18(review.existingDebtWei, 18)} MUSD debt.</p>
            <p className="mt-2 text-xs text-mist-500">Wallet BTC at the same check: {formatUnits18(review.walletBalanceWei, 18)} BTC. Keep some for network fees.</p>
          </div>

          <details className="rounded-lg border border-line px-3">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-gold-300">Details</summary>
            <dl className="grid gap-2 pb-3 text-sm sm:grid-cols-2">
              <Detail label="Network" value={`Mezo Testnet · chain ${MEZO_TESTNET_CHAIN_ID}`} />
              <Detail label="Wallet / Trove owner" value={review.account} />
              <Detail label="BTC balance at checked block" value={`${formatUnits18(review.walletBalanceWei, 18)} BTC`} />
              <Detail label="BorrowerOperations contract" value={review.transaction.to} />
              <Detail label="Contract call" value={`addColl(address,address) · ${review.transaction.data.slice(0, 10)}`} />
              <Detail label="Position hints" value="Zero hints; the contract searches for the correct position." />
              <Detail label="Gas estimate / limit" value={`${review.gasEstimate.toLocaleString()} / ${review.gasLimit.toLocaleString()} (20% buffer)`} />
              <Detail label="Exact BTC value" value={`${formatUnits18(review.collateralWei, 18)} BTC · ${review.transaction.value}`} />
              <Detail label="Exact calldata" value={review.transaction.data} />
              <Detail label="Checked block" value={review.blockNumber.toLocaleString()} />
            </dl>
          </details>

          <p className="text-xs leading-relaxed text-mist-500">The app repeats the fresh checks before opening your wallet. Your wallet will ask you to approve one transaction; nothing is signed or sent unless you approve.</p>
          <Button onClick={() => void recheckAndOpenWallet()} disabled={busy || !eligible} className="min-h-11 w-full">
            {busy ? "Checking again…" : "Confirm in wallet"}
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

      <p className="text-xs leading-relaxed text-mist-500">This only adds BTC to the active Trove. Your wallet must approve the transaction; the app never signs or submits it for you.</p>
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
