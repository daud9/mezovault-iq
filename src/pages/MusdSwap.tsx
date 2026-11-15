import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { DataStatus } from "../components/ui/DataStatus";
import { SectionHeader } from "../components/ui/SectionHeader";
import { useWallet } from "../components/wallet/WalletProvider";
import { resolveRpcUrl } from "../config/env";
import { TESTNET_POOL_BTC_TOKEN } from "../config/pools";
import { MEZO_NETWORKS } from "../config/chains";
import { createRpcClient } from "../lib/rpc";
import { addEntry, browserStore, updateEntryForContext } from "../lib/txLedger";
import {
  formatMUSDTokenAmount,
  isMUSDReviewFresh,
  MUSD_SWAP_MAX_REVIEW_AGE_MS,
  MUSD_SWAP_SLIPPAGE_OPTIONS,
  prepareMUSDAction,
  readMUSDReceipt,
  type MUSDReceiptOutcome,
  type PreparedMUSDAction,
} from "../lib/musdSwap";
import { formatTokenUnits } from "../lib/tokenAmount";

interface Submission {
  hash: string;
  chainId: number;
  prepared: PreparedMUSDAction;
}

export function MusdSwap() {
  const { state, network, isSupportedNetwork, checkWalletContext, sendReviewedTransaction } = useWallet();
  const rpc = useMemo(() => createRpcClient({ url: resolveRpcUrl(network) }), [network]);
  const [amount, setAmount] = useState("1");
  const [slippageBps, setSlippageBps] = useState<number>(100);
  const [prepared, setPrepared] = useState<PreparedMUSDAction | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [receiptOutcome, setReceiptOutcome] = useState<MUSDReceiptOutcome | null>(null);
  const [approvalReceipt, setApprovalReceipt] = useState<{ hash: string; blockNumber: number; account: string } | null>(null);
  const [providerCalled, setProviderCalled] = useState(false);
  const [busy, setBusy] = useState<"preparing" | "wallet" | "checking" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const from = state.status === "connected" ? state.address : null;
  const testnet = network.key === "testnet" && network.chainId === 31_611;
  const ready = testnet && isSupportedNetwork && state.status === "connected" && from !== null;
  const reviewAgeMs = prepared ? Math.max(0, nowMs - prepared.preparedAtMs) : null;
  const reviewFresh = reviewAgeMs !== null && reviewAgeMs <= MUSD_SWAP_MAX_REVIEW_AGE_MS;
  const reviewContextValid = prepared !== null && ready && from !== null &&
    from.toLowerCase() === prepared.transaction.from.toLowerCase() && state.chainId === network.chainId;
  const locked = busy !== null || (submission !== null && receiptOutcome?.status !== "confirmed" && receiptOutcome?.status !== "reverted");
  const showPrepare = (prepared === null || !reviewContextValid || !reviewFresh || receiptOutcome?.status === "reverted") &&
    (submission === null || receiptOutcome?.status === "confirmed" || receiptOutcome?.status === "reverted");

  function clearReview() {
    setPrepared(null);
    setError(null);
    setProviderCalled(false);
    setApprovalReceipt(null);
    setSubmission(null);
    setReceiptOutcome(null);
  }

  async function prepare(): Promise<PreparedMUSDAction | null> {
    setError(null);
    setPrepared(null);
    if (!ready || !from) {
      setError(testnet ? `Connect a wallet on ${network.label} first.` : "MUSD-to-BTC swap is available only on Mezo Testnet.");
      return null;
    }
    setBusy("preparing");
    try {
      const expected = { account: from, chainId: network.chainId };
      await checkWalletContext(expected);
      const result = await prepareMUSDAction({ network, owner: from, amount, slippageBps, rpc });
      await checkWalletContext(expected);
      setSubmission(null);
      setReceiptOutcome(null);
      setProviderCalled(false);
      setPrepared(result);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : "The live swap checks did not complete.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  function confirmInWallet() {
    if (!prepared || !from || locked) return;
    if (!reviewContextValid) {
      setError("The wallet account or network changed after review. Prepare again before continuing.");
      return;
    }
    if (!isMUSDReviewFresh(prepared.preparedAtMs, Date.now())) {
      setError("This quote and simulation are more than 30 seconds old. Prepare again for a fresh review.");
      return;
    }
    setError(null);
    setProviderCalled(false);
    setReceiptOutcome(null);
    // This final click immediately invokes the selected wallet provider. No RPC read or await precedes it.
    const walletRequest = sendReviewedTransaction(
      { ...prepared.transaction },
      { account: from, chainId: network.chainId },
      () => setProviderCalled(true),
    );
    setBusy("wallet");
    void walletRequest.then((hash) => {
      const sent = { hash, chainId: network.chainId, prepared };
      addEntry(browserStore(), {
        hash,
        chainId: network.chainId,
        from: prepared.transaction.from,
        to: prepared.transaction.to,
        token: "MUSD",
        amount: formatMUSDTokenAmount(prepared.quote.amountInRaw),
        action: prepared.kind === "approve" ? "Approve MUSD for MUSD swap" : "Swap MUSD for Pool BTC (ERC-20)",
        createdAt: new Date().toISOString(),
        status: "pending",
        blockNumber: null,
      });
      setSubmission(sent);
      setBusy("checking");
      void checkReceipt(sent);
    }).catch((err) => {
      setError(err instanceof Error ? err.message : "The wallet request failed.");
      setBusy(null);
    });
  }

  async function checkReceipt(target = submission) {
    if (!target) return;
    setBusy("checking");
    setError(null);
    try {
      const outcome = await readMUSDReceipt({ network, rpc, prepared: target.prepared, transactionHash: target.hash });
      setReceiptOutcome(outcome);
      if (outcome.status === "confirmed" || outcome.status === "reverted") {
        updateEntryForContext(browserStore(), target.hash, target.prepared.transaction.from, target.chainId, {
          status: outcome.status === "confirmed" ? "success" : "reverted",
          blockNumber: outcome.blockNumber,
        });
      }
      if (outcome.status === "confirmed" && target.prepared.kind === "approve") {
        setApprovalReceipt({ hash: target.hash, blockNumber: outcome.blockNumber, account: target.prepared.transaction.from });
        const refreshed = await prepare();
        if (refreshed?.kind === "approve") {
          setError("The exact approval was confirmed, but the refreshed allowance is still short. Review the new exact approval before continuing.");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The receipt could not be checked. No second transaction was submitted.");
    } finally {
      setBusy(null);
    }
  }

  const onAmountChange = (value: string) => {
    setAmount(value);
    clearReview();
  };
  const onSlippageChange = (value: string) => {
    setSlippageBps(Number(value));
    clearReview();
  };

  const explorerTx = submission ? `${network.explorerUrl.replace(/\/$/, "")}/tx/${submission.hash}` : null;
  return (
    <div className="space-y-5">
      <SectionHeader
        eyebrow="Mezo Testnet · MUSD"
        title="Swap MUSD for Pool BTC"
        description="Review a fresh quote and simulation. Approve each wallet action separately."
      />

      <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">The quote does not separate the documented 0.30% pool fee from price impact. Pool BTC is a configured Testnet ERC-20; its canonical identity is unverified. <a className="underline" href="https://mezo.org/docs/developers/features/mezo-pools/" target="_blank" rel="noopener noreferrer">Pool docs</a> · <a className="underline" href={`${MEZO_NETWORKS.testnet.explorerUrl.replace(/\/?$/, "/")}address/${TESTNET_POOL_BTC_TOKEN.address}`} target="_blank" rel="noopener noreferrer">Inspect token</a>.</p>

      <Card className="space-y-4">
        {!testnet ? (
          <DataStatus state="unavailable" detail="Testnet only · switch to Mezo Testnet to use this swap" />
        ) : state.status !== "connected" ? (
          <p className="text-sm text-mist-400">Connect a wallet on Mezo Testnet to read its MUSD balance and prepare a swap.</p>
        ) : !isSupportedNetwork ? (
          <p className="text-sm text-mist-400">Switch your wallet to Mezo Testnet before preparing a swap.</p>
        ) : (
          <div className="space-y-4">
            <label className="block space-y-2" htmlFor="musd-swap-amount">
              <span className="text-sm font-medium text-mist-100">You pay</span>
              <div className="flex min-h-14 items-center gap-3 rounded-xl border border-line bg-ink-800 px-3">
                <input
                  id="musd-swap-amount"
                  aria-label="MUSD amount to swap"
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  disabled={locked}
                  onChange={(event) => onAmountChange(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent py-3 text-lg text-mist-100 outline-none placeholder:text-mist-600"
                  placeholder="0.0"
                />
                <span className="font-semibold text-mist-100">MUSD</span>
              </div>
            </label>

            <div className="space-y-2">
              <label htmlFor="musd-swap-slippage" className="text-sm font-medium text-mist-100">Slippage tolerance</label>
              <select
                id="musd-swap-slippage"
                value={slippageBps}
                disabled={locked}
                onChange={(event) => onSlippageChange(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-line bg-ink-800 px-3 text-sm text-mist-100"
              >
                {MUSD_SWAP_SLIPPAGE_OPTIONS.map((bps) => (
                  <option key={bps} value={bps}>{(bps / 100).toFixed(1)}%</option>
                ))}
              </select>
            </div>

            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">Only wallet-held MUSD is available. Pool BTC is an ERC-20, not native BTC; gas requires native BTC.</p>

            {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}

            {showPrepare && (
              <Button onClick={() => { void prepare(); }} disabled={!ready || busy !== null} className="min-h-12 w-full">
                {busy === "preparing" ? "Checking quote and simulating…" : "Review swap"}
              </Button>
            )}

            {prepared && submission === null && (
              <div className="space-y-4 rounded-xl border border-gold-500/30 bg-ink-800/70 p-4">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gold-300">Live review · block {prepared.quote.blockNumber.toLocaleString()}</p>
                  {approvalReceipt && prepared.kind === "swap" && state.status === "connected" && state.address !== null && state.address.toLowerCase() === approvalReceipt.account.toLowerCase() && (
                    <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                      The exact MUSD approval was verified in block {approvalReceipt.blockNumber.toLocaleString()}; this swap quote was refreshed afterward.
                      <a href={`${network.explorerUrl.replace(/\/$/, "")}/tx/${approvalReceipt.hash}`} target="_blank" rel="noopener noreferrer" className="ml-1 underline">View approval</a>
                    </p>
                  )}
                  <p className="text-sm text-mist-300">You pay <span className="font-semibold text-mist-100">{formatMUSDTokenAmount(prepared.quote.amountInRaw)} MUSD</span></p>
                  <p className="text-sm text-mist-300">Current quote <span className="font-semibold text-mist-100">{formatMUSDTokenAmount(prepared.quote.quotedOutRaw)} BTC token</span></p>
                  <p className="text-sm text-mist-300">Minimum received <span className="font-semibold text-mist-100">{formatMUSDTokenAmount(prepared.quote.minimumOutRaw)} BTC token</span> at {(prepared.quote.slippageBps / 100).toFixed(1)}% slippage</p>
                  <p className="text-sm text-mist-300">Wallet MUSD balance <span className="font-semibold text-mist-100">{formatMUSDTokenAmount(prepared.quote.walletMusdRaw)} MUSD</span></p>
                  <p className="text-sm text-mist-300">Maximum reviewed gas fee <span className="font-semibold text-mist-100">{formatTokenUnits(prepared.maximumFeeRaw, 18, 18)} native BTC</span></p>
                </div>

                {prepared.kind === "approve" ? (
                  <div className="space-y-3 rounded-lg border border-line bg-ink-900/70 p-3">
                    <p className="text-sm font-semibold text-mist-100">Step 1 · exact MUSD approval needed</p>
                    <p className="text-sm text-mist-300">Approve exactly {formatMUSDTokenAmount(prepared.quote.amountInRaw)} MUSD for the configured router. No unlimited allowance.</p>
                  </div>
                ) : (
                  <p className="rounded-lg border border-line bg-ink-900/70 p-3 text-sm text-mist-300">
                    Exact swap call was simulated against the quoted block and returned {formatMUSDTokenAmount(prepared.simulatedOutRaw)} BTC token. The request spends {formatMUSDTokenAmount(prepared.quote.amountInRaw)} MUSD and sets a five-minute deadline.
                  </p>
                )}

                <Button onClick={confirmInWallet} disabled={busy !== null || submission !== null || !reviewContextValid || !reviewFresh} className="min-h-12 w-full">
                  {busy === "wallet" ? "Opening wallet…" : prepared.kind === "approve" ? "Approve exact MUSD" : "Swap MUSD"}
                </Button>
                <p className="text-xs text-mist-500" role="status">
                  {providerCalled ? "Request sent to wallet." : "No wallet request sent."}
                  {!reviewFresh && " Review expired; prepare again."}
                </p>
                <details className="rounded-lg border border-line bg-ink-900/50 px-3">
                  <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-mist-300">Contract and gas details</summary>
                  <div className="space-y-2 break-all pb-4 text-xs text-mist-400">
                    <p>Router: <span className="font-mono text-mist-200">{prepared.quote.router}</span></p>
                    <p>Pool: <span className="font-mono text-mist-200">{prepared.quote.pool}</span></p>
                    <p>Output token: <span className="font-mono text-mist-200">{prepared.quote.tokenOut}</span></p>
                    <p>Factory: <span className="font-mono text-mist-200">{prepared.quote.factory}</span></p>
                    <p>Gas estimate: {prepared.gasEstimate.toString()} · buffered gas limit: {prepared.gasLimit.toString()} · gas price: {formatTokenUnits(prepared.gasPrice, 18, 18)} BTC/ gas unit</p>
                    <p>Exact calldata: <span className="font-mono text-mist-200">{prepared.transaction.data}</span></p>
                  </div>
                </details>
              </div>
            )}

            {submission && (
              <div className="space-y-3 rounded-xl border border-line bg-ink-800/70 p-4">
                <p className="text-sm font-semibold text-mist-100">{submission.prepared.kind === "approve" ? "MUSD approval" : "MUSD/BTC swap"} transaction</p>
                <p className="break-all font-mono text-xs text-mist-300">{submission.hash}</p>
                {explorerTx && <a href={explorerTx} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-medium text-gold-300 hover:underline">Open transaction in Mezo Testnet explorer</a>}
                {receiptOutcome?.status === "confirmed" && (
                  <p role="status" className="text-sm text-emerald-300">
                    Receipt reports successful execution in block {receiptOutcome.blockNumber.toLocaleString()}. The app has not checked finality. {submission.prepared.kind === "approve"
                      ? " Approval event matches the exact MUSD allowance. Prepare again for a fresh swap quote."
                      : ` Received ${formatMUSDTokenAmount(receiptOutcome.actualOutRaw ?? 0n)} BTC token.`}
                  </p>
                )}
                {receiptOutcome?.status === "reverted" && <p role="alert" className="text-sm text-rose-200">The transaction reverted in block {receiptOutcome.blockNumber.toLocaleString()}. No successful swap or approval is shown.</p>}
                {receiptOutcome?.status === "pending" && <p role="status" className="text-sm text-amber-200">The wallet returned a hash, but a receipt is not available yet. No second transaction was sent.</p>}
                {receiptOutcome?.status === "unverified" && <p role="alert" className="text-sm text-rose-200">Receipt is not verified: {receiptOutcome.message} No second transaction was sent.</p>}
                {error && <p role="alert" className="text-sm text-rose-200">{error}</p>}
                {(receiptOutcome?.status === "pending" || receiptOutcome?.status === "unverified" || receiptOutcome === null) && (
                  <Button variant="secondary" onClick={() => { void checkReceipt(submission); }} disabled={busy !== null} className="min-h-11 w-full">
                    {busy === "checking" ? "Checking receipt…" : "Check existing receipt"}
                  </Button>
                )}
                {receiptOutcome?.status === "confirmed" && submission.prepared.kind === "swap" && (
                  <Button variant="secondary" onClick={clearReview} disabled={busy !== null} className="min-h-11 w-full">Start another swap</Button>
                )}
              </div>
            )}
          </div>
        )}

        <p className="text-xs leading-relaxed text-mist-500">Each action requires wallet confirmation. See <Link to="/app/pools" className="text-gold-300 hover:underline">Pool Watch</Link> for reserve data.</p>
      </Card>
    </div>
  );
}
