import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { parsePaymentParams } from "../lib/paymentRequest";
import { addEntry, browserStore, updateEntry, type LedgerStatus } from "../lib/txLedger";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { SectionHeader } from "../components/ui/SectionHeader";
import { DataStatus } from "../components/ui/DataStatus";
import { FormErrors } from "../components/forms/FormErrors";
import { ChoiceGroup } from "../components/forms/ChoiceGroup";
import { useWallet } from "../components/wallet/WalletProvider";
import { useNativeBalance } from "../hooks/useNativeBalance";
import { useMusdBalance } from "../hooks/useMusdBalance";
import { useMezoBalance } from "../hooks/useMezoBalance";
import { resolveRpcUrl } from "../config/env";
import { createRpcClient } from "../lib/rpc";
import { formatTokenUnits } from "../lib/tokenAmount";
import { shortAddress } from "../lib/format";
import {
  buildTransfer,
  describeSendError,
  nativeTotalCost,
  parseAmount,
  validateRecipient,
  waitForReceipt,
  type ReceiptOutcome,
  type SendToken,
  type TxRequest,
} from "../lib/transfer";

type SendSymbol = "BTC" | "MUSD" | "MEZO";

interface Review {
  recipient: string;
  tx: TxRequest;
  token: SendToken;
  amountRaw: bigint;
  amountText: string;
  feeWei: bigint;
  gasLimit: bigint;
}

export function Send() {
  const { state, network, isSupportedNetwork, sendTransaction } = useWallet();
  const native = useNativeBalance();
  const musd = useMusdBalance();
  const mezo = useMezoBalance();

  const [params] = useSearchParams();
  const prefill = useMemo(() => parsePaymentParams(params), [params]);
  const [symbol, setSymbol] = useState<SendSymbol>(prefill.request?.token ?? "BTC");
  const [recipient, setRecipient] = useState(prefill.request?.to ?? "");
  const [amountText, setAmountText] = useState(prefill.request?.amount ?? "");
  const [errors, setErrors] = useState<string[]>(prefill.error ? [prefill.error] : []);
  const [busy, setBusy] = useState<"estimating" | "signing" | "checking" | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ReceiptOutcome | null>(null);
  const [receiptLookupFailed, setReceiptLookupFailed] = useState(false);

  const btcBalance = native.view.status === "done" && native.view.result.status === "ok" ? native.view.result : null;
  const musdBalance = musd.view.status === "done" && musd.view.result.status === "ok" ? musd.view.result : null;
  const mezoBalance = mezo.view.status === "done" && mezo.view.result.status === "ok" ? mezo.view.result : null;

  const options: { value: SendSymbol; label: string }[] = [{ value: "BTC", label: "BTC" }];
  if (musdBalance || network.musd) options.push({ value: "MUSD", label: "MUSD" });
  if (mezoBalance) options.push({ value: "MEZO", label: "MEZO" });

  const from = state.address;
  const ready = state.status === "connected" && from !== null && isSupportedNetwork;
  const locked = busy !== null || (hash !== null && outcome?.status !== "success" && outcome?.status !== "reverted");
  const reviewContextValid = review !== null && state.status === "connected" && from !== null &&
    from.toLowerCase() === review.tx.from.toLowerCase() && state.chainId === network.chainId && isSupportedNetwork;
  const balanceText = (view: typeof native.view | typeof musd.view | typeof mezo.view, tokenSymbol: string) => {
    if (view.status !== "done") return view.status === "loading" ? "loading" : "not read";
    return view.result.status === "ok" ? `${view.result.formatted} ${tokenSymbol}` : "unavailable";
  };
  const balanceIssues = [
    native.view.status === "done" && native.view.result.status !== "ok" ? `BTC: ${balanceProblem(native.view.result)}` : null,
    musd.view.status === "done" && musd.view.result.status !== "ok" ? `MUSD: ${balanceProblem(musd.view.result)}` : null,
    mezo.view.status === "done" && mezo.view.result.status !== "ok" ? `MEZO: ${balanceProblem(mezo.view.result)}` : null,
  ].filter((issue): issue is string => issue !== null);

  function tokenFor(sym: SendSymbol): { token: SendToken; balanceRaw: bigint | null; decimals: number } | string {
    if (sym === "BTC") return { token: { kind: "native", symbol: "BTC", decimals: 18 }, balanceRaw: btcBalance?.balanceRaw ?? null, decimals: 18 };
    if (sym === "MUSD") {
      if (!network.musd) return "MUSD is not configured on this network.";
      return { token: { kind: "erc20", symbol: "MUSD", decimals: 18, address: network.musd.address }, balanceRaw: musdBalance?.balanceRaw ?? null, decimals: 18 };
    }
    if (!mezoBalance || !network.mezo) return "MEZO is not verified on this network, so it cannot be sent.";
    return {
      token: { kind: "erc20", symbol: "MEZO", decimals: mezoBalance.decimals, address: network.mezo.address },
      balanceRaw: mezoBalance.balanceRaw,
      decimals: mezoBalance.decimals,
    };
  }

  async function prepare() {
    setErrors([]);
    setReview(null);
    if (!from || !ready) return setErrors([`Connect a wallet on ${network.label} first.`]);
    const resolved = tokenFor(symbol);
    if (typeof resolved === "string") return setErrors([resolved]);

    const problems: string[] = [];
    const recipientError = validateRecipient(recipient, from);
    if (recipientError) problems.push(recipientError);
    const amount = parseAmount(amountText, resolved.decimals);
    if (!amount.ok) problems.push(amount.error);
    if (btcBalance === null) problems.push("Your BTC balance is not verified yet. Retry its read before preparing a transfer.");
    if (resolved.token.kind !== "native" && resolved.balanceRaw === null) problems.push(`Your ${symbol} balance is not verified yet. Retry its read before preparing a transfer.`);
    if (problems.length > 0 || !amount.ok) return setErrors(problems);

    setBusy("estimating");
    try {
      const rpc = createRpcClient({ url: resolveRpcUrl(network) });
      const tx = buildTransfer(resolved.token, from, recipient as `0x${string}`, amount.raw);
      const gasLimit = BigInt(await rpc.call<string>("eth_estimateGas", [{ ...tx }]));
      const gasPrice = BigInt(await rpc.call<string>("eth_gasPrice", []));
      const feeWei = gasLimit * gasPrice;

      const btcRaw = btcBalance?.balanceRaw ?? null;
      const balanceProblems: string[] = [];
      if (btcRaw === null) balanceProblems.push("Your BTC balance is not loaded yet. Wait for it, then try again.");
      else if (resolved.token.kind === "native") {
        if (nativeTotalCost(amount.raw, gasLimit, gasPrice) > btcRaw) balanceProblems.push("Insufficient BTC for this amount plus network fees.");
      } else {
        if (feeWei > btcRaw) balanceProblems.push("You need some BTC to pay network fees.");
        if (resolved.balanceRaw === null) balanceProblems.push(`Your ${symbol} balance is not loaded yet.`);
        else if (amount.raw > resolved.balanceRaw) balanceProblems.push(`Insufficient ${symbol} for this amount.`);
      }
      if (balanceProblems.length > 0) return setErrors(balanceProblems);

      setReview({ recipient, tx, token: resolved.token, amountRaw: amount.raw, amountText: amountText.trim(), feeWei, gasLimit });
    } catch (err) {
      setErrors([describeSendError(err)]);
    } finally {
      setBusy(null);
    }
  }

  async function confirm() {
    if (!review) return;
    if (!reviewContextValid) return setErrors(["The wallet account or network changed after review. Edit the transaction and prepare it again."]);
    setErrors([]);
    setBusy("signing");
    setOutcome(null);
    setReceiptLookupFailed(false);
    try {
      const txHash = await sendTransaction({ ...review.tx }, { account: review.tx.from, chainId: network.chainId });
      setHash(txHash);
      // Record the submitted transaction before waiting, so it is kept even if the page is closed.
      addEntry(browserStore(), {
        hash: txHash,
        chainId: network.chainId,
        from: review.tx.from,
        to: review.recipient,
        token: review.token.symbol,
        amount: review.amountText,
        createdAt: new Date().toISOString(),
        status: "pending",
        blockNumber: null,
      });
      setBusy(null);
      await checkReceipt(txHash);
    } catch (err) {
      setErrors([describeSendError(err)]);
    } finally {
      setBusy(null);
    }
  }

  async function checkReceipt(txHash: string) {
    setReceiptLookupFailed(false);
    setBusy("checking");
    try {
      const rpc = createRpcClient({ url: resolveRpcUrl(network) });
      const result = await waitForReceipt({ rpc, hash: txHash });
      setOutcome(result);
      if (result.status === "success") {
        native.refresh();
        musd.refresh();
        mezo.refresh();
      }
      const ledgerStatus: LedgerStatus =
        result.status === "success" ? "success" : result.status === "reverted" ? "reverted" : "unconfirmed";
      updateEntry(browserStore(), txHash, { status: ledgerStatus, blockNumber: result.status === "timeout" ? null : result.blockNumber });
    } catch {
      setReceiptLookupFailed(true);
    } finally {
      setBusy(null);
    }
  }

  function startOver() {
    setReview(null);
    setHash(null);
    setOutcome(null);
    setReceiptLookupFailed(false);
    setErrors([]);
    setAmountText("");
    setRecipient("");
  }

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Standard wallet transfer"
        title="Send BTC, MUSD or MEZO"
        description="Review every direct transfer and approve it in your wallet. Direct on-chain transfers require BTC for network fees; gasless x402 MUSD links are a separate feature and require a configured merchant server."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card className="space-y-6">
          {prefill.request && (
            <div className="rounded-lg border border-gold-500/40 bg-gold-500/10 p-3 text-xs leading-relaxed text-mist-200">
              {prefill.request.amount
                ? "Filled in from a payment link. Check the recipient, token and amount against what you expect before you review."
                : "Recipient and token filled in. Enter the amount, then review."}
            </div>
          )}
          {!from || state.status !== "connected" ? (
            <p className="text-sm text-mist-400">Connect a wallet to send funds.</p>
          ) : !isSupportedNetwork ? (
            <p className="text-sm text-mist-400">Switch your wallet to {network.label} to send.</p>
          ) : (
            <>
              <ChoiceGroup label="Token" value={symbol} options={options} onChange={(v) => { setSymbol(v); setReview(null); }} />
              <div className="space-y-1.5">
                <label htmlFor="send-to" className="text-sm font-medium text-mist-100">Recipient address</label>
                <input
                  id="send-to"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value.trim())}
                  disabled={locked}
                  placeholder="0x…"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full rounded-xl border border-line bg-ink-800 px-3 py-2.5 font-mono text-sm text-mist-100 outline-none focus:border-gold-500/60"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="send-amount" className="text-sm font-medium text-mist-100">Amount ({symbol})</label>
                <input
                  id="send-amount"
                  inputMode="decimal"
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value)}
                  disabled={locked}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-line bg-ink-800 px-3 py-2.5 text-sm text-mist-100 outline-none focus:border-gold-500/60"
                />
                <p className="text-xs text-mist-500">
                  Available: {symbol === "BTC" ? balanceText(native.view, "BTC") : symbol === "MUSD" ? balanceText(musd.view, "MUSD") : balanceText(mezo.view, "MEZO")}
                </p>
              </div>
              {balanceIssues.length > 0 && (
                <div className="space-y-2 rounded-xl border border-risk-medium/30 bg-risk-medium/5 p-3">
                  <p className="text-sm font-medium text-mist-200">Some balance reads are unavailable; a transfer that needs an unverified balance cannot be prepared.</p>
                  <ul className="list-inside list-disc space-y-1 text-xs text-mist-400">{balanceIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
                  <Button variant="secondary" onClick={() => { native.refresh(); musd.refresh(); mezo.refresh(); }} disabled={busy !== null} className="min-h-11">Retry balance reads</Button>
                </div>
              )}
              <FormErrors errors={errors} />
              {!review && (
                <Button onClick={prepare} disabled={locked} className="min-h-11 w-full">
                  {busy === "estimating" ? "Estimating fee…" : "Review transaction"}
                </Button>
              )}
            </>
          )}
        </Card>

        <div className="space-y-6">
          {review && !hash && (
            <Card highlight className="space-y-4">
              <h2 className="text-sm font-semibold text-mist-100">Review before you confirm</h2>
              <dl className="grid gap-3 text-sm">
                <div><dt className="text-xs text-mist-500">From</dt><dd className="font-mono text-mist-200">{shortAddress(from!)}</dd></div>
                <div><dt className="text-xs text-mist-500">To</dt><dd className="break-all font-mono text-mist-200">{review.tx.to}</dd></div>
                <div><dt className="text-xs text-mist-500">Amount</dt><dd className="text-mist-100">{review.amountText} {review.token.symbol}</dd></div>
                <div><dt className="text-xs text-mist-500">Estimated network fee</dt><dd className="text-mist-100">{formatTokenUnits(review.feeWei, 18, 8)} BTC</dd></div>
                <div><dt className="text-xs text-mist-500">Network</dt><dd className="text-mist-100">{network.label} (chain {network.chainId})</dd></div>
              </dl>
              <p className="text-xs leading-relaxed text-mist-500">
                Check the recipient carefully. A confirmed transaction cannot be reversed by this app.
              </p>
              {!reviewContextValid && <p role="alert" className="text-sm text-risk-medium">The wallet account or network changed after this review. Edit and prepare again before continuing.</p>}
              <div className="grid gap-3 sm:grid-cols-2">
                <Button variant="secondary" onClick={() => setReview(null)} disabled={busy !== null} className="min-h-11">Edit</Button>
                <Button onClick={confirm} disabled={busy !== null || !reviewContextValid} className="min-h-11">
                  {busy === "signing" ? "Waiting for wallet…" : "Confirm in wallet"}
                </Button>
              </div>
            </Card>
          )}

          {hash && (
            <Card className="space-y-4">
              <h2 className="text-sm font-semibold text-mist-100">Transaction</h2>
              <p className="break-all font-mono text-xs text-mist-300">{hash}</p>
              <a href={`${network.explorerUrl.replace(/\/?$/, "/")}tx/${hash}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-medium text-gold-300 hover:underline">
                View on the {network.label} explorer
              </a>
              {!outcome && !receiptLookupFailed && <DataStatus state="unverified" detail={busy === "checking" ? "checking receipt" : "waiting for confirmation"} />}
              {receiptLookupFailed && (
                <div className="space-y-2" role="status">
                  <DataStatus state="unverified" detail="receipt lookup failed; transaction outcome unknown" />
                  <p className="text-sm text-mist-300">The wallet returned this transaction hash, but the network receipt could not be checked. It may have succeeded or remain pending. This retry checks the existing hash and will not submit another transaction.</p>
                  <Button variant="secondary" onClick={() => void checkReceipt(hash)} disabled={busy !== null} className="min-h-11">{busy === "checking" ? "Checking receipt…" : "Check receipt again"}</Button>
                </div>
              )}
              {outcome?.status === "success" && (
                <div className="space-y-2">
                  <DataStatus state="live" detail="confirmed" />
                  <p className="text-sm text-mist-300">Confirmed in block {outcome.blockNumber}. Refresh the balance on the Overview page to see the change.</p>
                </div>
              )}
              {outcome?.status === "reverted" && (
                <div className="space-y-2">
                  <DataStatus state="unavailable" detail="failed on-chain" />
                  <p className="text-sm text-mist-300">The network included this transaction, but it failed. Check the explorer for details.</p>
                </div>
              )}
              {outcome?.status === "timeout" && (
                <div className="space-y-2">
                  <DataStatus state="unverified" detail="not yet confirmed" />
                  <p className="text-sm text-mist-300">No confirmation yet. It may still complete. Check the explorer link before sending again.</p>
                  <Button variant="secondary" onClick={() => void checkReceipt(hash)} disabled={busy !== null} className="min-h-11">{busy === "checking" ? "Checking receipt…" : "Check receipt again"}</Button>
                </div>
              )}
              {(outcome?.status === "success" || outcome?.status === "reverted") && <Button variant="secondary" onClick={startOver} className="min-h-11">Send another</Button>}
            </Card>
          )}

          <Card className="space-y-2 text-sm leading-relaxed text-mist-400">
            <p className="font-medium text-mist-200">How this works</p>
            <p>BTC is sent as the native gas token. MUSD and MEZO are standard token transfers. Each transaction is shown for review, then sent from your wallet; MUSD and MEZO transfers need BTC available for network fees.</p>
            <p>Success is shown only when the network receipt reports success. Until then the transaction is shown as waiting.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function balanceProblem(result: { status: string; message?: string; reason?: string }): string {
  if (result.status === "error") return result.message ?? "The RPC read failed.";
  if (result.status === "wrong-network") return "The RPC reports a different chain.";
  if (result.status === "not-configured") return result.reason ?? "No token contract is configured.";
  if (result.status === "no-contract") return "The configured token address has no contract code.";
  return `Read status: ${result.status}.`;
}
