import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { DataStatus } from "../components/ui/DataStatus";
import { SectionHeader } from "../components/ui/SectionHeader";
import { useWallet } from "../components/wallet/WalletProvider";
import { resolveRpcUrl } from "../config/env";
import { createRpcClient } from "../lib/rpc";
import {
  formatMUSDTokenAmount,
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

  function clearReview() {
    setPrepared(null);
    setError(null);
    setProviderCalled(false);
    setSubmission(null);
    setReceiptOutcome(null);
  }

  async function prepare() {
    setError(null);
    setPrepared(null);
    if (!ready || !from) {
      setError(testnet ? `Connect a wallet on ${network.label} first.` : "MUSD-to-BTC swap is available only on Mezo Testnet.");
      return;
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "The live swap checks did not complete.");
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
    if (!reviewFresh) {
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
      const sent = { hash, prepared };
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
  const showPrepare = submission === null || receiptOutcome?.status === "confirmed" || receiptOutcome?.status === "reverted";
  const prepareButtonLabel = prepared?.kind === "approve" ? "Prepare MUSD approval" : "Prepare swap";

  return (
    <div className="space-y-5">
      <SectionHeader
        eyebrow="Mezo Testnet · MUSD"
        title="Swap MUSD for BTC"
        description="A single live-quoted swap through the verified MUSD/BTC basic pool. Your wallet reviews every approval and swap."
      />

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
                onChange={(event) => onSlippageChange(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-line bg-ink-800 px-3 text-sm text-mist-100"
              >
                {MUSD_SWAP_SLIPPAGE_OPTIONS.map((bps) => (
                  <option key={bps} value={bps}>{(bps / 100).toFixed(1)}%</option>
                ))}
              </select>
            </div>

            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
              You can swap only MUSD held in this wallet; MUSD deposited in the Stability Pool is not available here. The output is the pool’s BTC token (an ERC-20), not native BTC and not usable for gas. Keep native BTC in this wallet for network fees; the app’s Send page does not yet send this pool BTC token.
            </p>

            {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}

            {showPrepare && (
              <Button onClick={() => { void prepare(); }} disabled={!ready || busy !== null} className="min-h-12 w-full">
                {busy === "preparing" ? "Checking quote and simulating…" : prepareButtonLabel}
              </Button>
            )}

            {prepared && (
              <div className="space-y-4 rounded-xl border border-gold-500/30 bg-ink-800/70 p-4">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gold-300">Live review · block {prepared.quote.blockNumber.toLocaleString()}</p>
                  <p className="text-sm text-mist-300">You pay <span className="font-semibold text-mist-100">{formatMUSDTokenAmount(prepared.quote.amountInRaw)} MUSD</span></p>
                  <p className="text-sm text-mist-300">Current quote <span className="font-semibold text-mist-100">{formatMUSDTokenAmount(prepared.quote.quotedOutRaw)} BTC token</span></p>
                  <p className="text-sm text-mist-300">Minimum received <span className="font-semibold text-mist-100">{formatMUSDTokenAmount(prepared.quote.minimumOutRaw)} BTC token</span> at {(prepared.quote.slippageBps / 100).toFixed(1)}% slippage</p>
                  <p className="text-sm text-mist-300">Wallet MUSD balance <span className="font-semibold text-mist-100">{formatMUSDTokenAmount(prepared.quote.walletMusdRaw)} MUSD</span></p>
                  <p className="text-sm text-mist-300">Maximum reviewed gas fee <span className="font-semibold text-mist-100">{formatTokenUnits(prepared.maximumFeeRaw, 18, 18)} native BTC</span></p>
                </div>

                {prepared.kind === "approve" ? (
                  <div className="space-y-3 rounded-lg border border-line bg-ink-900/70 p-3">
                    <p className="text-sm font-semibold text-mist-100">Approval needed</p>
                    <p className="text-sm text-mist-300">The wallet currently allows less than this swap. The prepared approval is exactly {formatMUSDTokenAmount(prepared.quote.amountInRaw)} MUSD for the verified router—no unlimited allowance.</p>
                  </div>
                ) : (
                  <p className="rounded-lg border border-line bg-ink-900/70 p-3 text-sm text-mist-300">
                    Exact swap call was simulated against the quoted block and returned {formatMUSDTokenAmount(prepared.simulatedOutRaw)} BTC token. The request spends {formatMUSDTokenAmount(prepared.quote.amountInRaw)} MUSD and sets a five-minute deadline.
                  </p>
                )}

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button onClick={confirmInWallet} disabled={busy !== null || submission !== null || !reviewContextValid || !reviewFresh} className="min-h-12 w-full sm:flex-1">
                    {busy === "wallet" ? "Opening wallet…" : prepared.kind === "approve" ? "Approve MUSD in wallet" : "Confirm swap in wallet"}
                  </Button>
                  <Button variant="secondary" onClick={clearReview} disabled={busy !== null} className="min-h-12 w-full sm:w-auto">Cancel review</Button>
                </div>
                <p className="text-xs text-mist-500" role="status">
                  {providerCalled ? "Wallet provider was called for this reviewed request." : "Wallet provider has not been called. Review details above; the final button opens your wallet."}
                  {!reviewFresh && " This review has expired; prepare again."}
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
                    Confirmed in block {receiptOutcome.blockNumber.toLocaleString()}.{submission.prepared.kind === "approve"
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
                {receiptOutcome?.status === "confirmed" && submission.prepared.kind === "approve" && (
                  <Button onClick={() => { void prepare(); }} disabled={busy !== null || !ready} className="min-h-11 w-full">Prepare swap with fresh quote</Button>
                )}
                {receiptOutcome?.status === "confirmed" && submission.prepared.kind === "swap" && (
                  <Button variant="secondary" onClick={clearReview} disabled={busy !== null} className="min-h-11 w-full">Start another swap</Button>
                )}
              </div>
            )}
          </div>
        )}

        <p className="text-xs leading-relaxed text-mist-500">
          The route is locked to the verified Mezo Testnet MUSD/BTC basic pool. Quotes can change before execution; the wallet shows the final request. No transaction is signed or sent automatically. See <Link to="/app/pools" className="text-gold-300 hover:underline">Pool Watch</Link> for read-only reserve data.
        </p>
      </Card>
    </div>
  );
}
