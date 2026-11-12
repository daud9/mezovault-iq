import { useRef, useState } from "react";
import { Button } from "../ui/Button";
import { useWallet } from "../wallet/WalletProvider";
import { resolveRpcUrl } from "../../config/env";
import { createRpcClient } from "../../lib/rpc";
import {
  APPROVED_OPEN_TROVE_TEST,
  OpenTrovePreflightError,
  prepareApprovedOpenTrove,
} from "../../lib/openTroveExecution";
import { MEZO_TESTNET_CHAIN_ID } from "../../lib/openTrovePlanner";
import { WalletError } from "../../lib/wallet";

const ATTEMPT_KEY = `mezovault-iq:approved-open-trove-test:${APPROVED_OPEN_TROVE_TEST.account.toLowerCase()}`;

type ActionState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "wallet" }
  | { status: "sent"; hash: string; blockNumber: number; gasEstimate: bigint }
  | { status: "error"; message: string };

function wasWalletPromptRequested(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(ATTEMPT_KEY) === "requested";
  } catch {
    return false;
  }
}

function recordWalletPromptRequest(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(ATTEMPT_KEY, "requested");
  } catch {
    // The in-memory ref still prevents repeats while this card remains mounted.
  }
}

function walletFailureMessage(error: unknown): string {
  if (error instanceof WalletError && error.code === "no-account") {
    return `${error.message} No transaction was sent.`;
  }
  if (error instanceof WalletError && error.code === "unsupported") {
    return `${error.message} No transaction was sent.`;
  }
  if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === 4001) {
    return "You rejected the request in your wallet. No transaction was sent. This one-test wallet prompt will not be repeated in this tab.";
  }
  return "Wallet confirmation did not complete. Check your wallet and the explorer before taking any further action. This one-test wallet prompt will not be repeated in this tab.";
}

export function OpenTroveTestAction() {
  const { state: walletState, network, sendTransaction } = useWallet();
  const [walletPromptUsed, setWalletPromptUsed] = useState(wasWalletPromptRequested);
  const promptUsedRef = useRef(walletPromptUsed);
  const inFlightRef = useRef(false);
  const [action, setAction] = useState<ActionState>(() => walletPromptUsed
    ? { status: "error", message: "The one-test wallet prompt was already requested in this tab. Check the wallet and explorer before taking further action." }
    : { status: "idle" });

  const connectedAccount = walletState.status === "connected" ? walletState.address : null;
  const accountMatches = connectedAccount?.toLowerCase() === APPROVED_OPEN_TROVE_TEST.account.toLowerCase();
  const networkMatches = network.key === "testnet" && network.chainId === MEZO_TESTNET_CHAIN_ID;
  const chainMatches = walletState.chainId === MEZO_TESTNET_CHAIN_ID;
  const eligible = walletState.status === "connected" && accountMatches && networkMatches && chainMatches;
  const gateMessage = walletState.status !== "connected"
    ? "Connect the wallet approved for this one-test action."
    : !networkMatches
      ? "This action is locked to Mezo Testnet (chain 31611)."
      : !chainMatches
        ? "The connected wallet is not on Mezo Testnet (chain 31611). Switch networks before continuing."
        : !accountMatches
          ? `This action is locked to the approved test wallet ${APPROVED_OPEN_TROVE_TEST.account}.`
          : null;

  async function requestWalletConfirmation() {
    if (!eligible || !connectedAccount || inFlightRef.current || promptUsedRef.current) return;
    inFlightRef.current = true;
    setAction({ status: "checking" });
    try {
      const rpc = createRpcClient({ url: resolveRpcUrl(network) });
      const prepared = await prepareApprovedOpenTrove({
        account: connectedAccount,
        walletChainId: walletState.chainId,
        rpc,
      });
      // Lock this one-test path before invoking the wallet, including if its result is ambiguous.
      promptUsedRef.current = true;
      setWalletPromptUsed(true);
      recordWalletPromptRequest();
      setAction({ status: "wallet" });
      const hash = await sendTransaction(
        { ...prepared.transaction },
        { account: APPROVED_OPEN_TROVE_TEST.account, chainId: MEZO_TESTNET_CHAIN_ID },
      );
      setAction({ status: "sent", hash, blockNumber: prepared.snapshot.blockNumber, gasEstimate: prepared.gasEstimate });
    } catch (error) {
      const message = error instanceof OpenTrovePreflightError ? error.message : walletPromptUsed || promptUsedRef.current
        ? walletFailureMessage(error)
        : "The live preflight could not be completed. Nothing was sent; refresh the protocol data and try again.";
      setAction({ status: "error", message });
    } finally {
      inFlightRef.current = false;
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-gold-500/30 bg-gold-500/5 p-4 text-mist-100" aria-labelledby="approved-open-trove-test-title">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-gold-300">One-test wallet path</p>
        <h3 id="approved-open-trove-test-title" className="mt-1 text-base font-semibold">Owner-approved Mezo Testnet test</h3>
        <p className="mt-1 text-sm text-mist-400">Only this fixed transaction is available here. The app rechecks live protocol conditions and simulates it at one fresh block before it asks your wallet to review and confirm. The app never signs or auto-submits.</p>
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-mist-500">Wallet</dt><dd className="break-all font-mono text-mist-200">{APPROVED_OPEN_TROVE_TEST.account}</dd></div>
        <div><dt className="text-xs text-mist-500">Network</dt><dd className="text-mist-200">Mezo Testnet · chain 31611</dd></div>
        <div><dt className="text-xs text-mist-500">Collateral sent</dt><dd className="text-mist-200">0.05 BTC (native transaction value)</dd></div>
        <div><dt className="text-xs text-mist-500">Requested debt</dt><dd className="text-mist-200">3,000 MUSD</dd></div>
        <div className="sm:col-span-2"><dt className="text-xs text-mist-500">BorrowerOperations contract</dt><dd className="break-all font-mono text-mist-200">{APPROVED_OPEN_TROVE_TEST.borrowerOperations}</dd></div>
      </dl>
      {gateMessage && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200" role="status">{gateMessage} No transaction can be prepared for a different account or network.</p>}
      {action.status === "checking" && <p className="text-sm text-mist-300" role="status">Checking fresh same-block protocol data, trove status, exact call simulation, and gas estimate…</p>}
      {action.status === "wallet" && <p className="text-sm text-mist-300" role="status">Preflight passed. Waiting for you to review and approve the exact transaction in your wallet…</p>}
      {action.status === "error" && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200" role="status">{action.message}</p>}
      {action.status === "sent" && (
        <div className="space-y-2 rounded-lg border border-line bg-ink-800/60 p-3" role="status">
          <p className="text-sm text-emerald-300">Your wallet returned a transaction hash. This means submitted, not confirmed.</p>
          <p className="break-all font-mono text-xs text-mist-300">{action.hash}</p>
          <p className="text-xs text-mist-500">Preflight block {action.blockNumber} · estimated gas {action.gasEstimate.toString()}</p>
          <a href={`${network.explorerUrl.replace(/\/?$/, "/")}tx/${action.hash}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-medium text-gold-300 hover:underline">View on the Mezo Testnet explorer</a>
        </div>
      )}
      <Button
        onClick={requestWalletConfirmation}
        disabled={!eligible || action.status === "checking" || action.status === "wallet" || action.status === "sent" || walletPromptUsed}
        className="min-h-11 w-full"
      >
        {action.status === "checking" ? "Checking live testnet conditions…"
          : action.status === "wallet" ? "Waiting for wallet…"
            : action.status === "sent" || walletPromptUsed ? "One-test wallet prompt already used"
              : "Check live conditions & continue to wallet"}
      </Button>
      <p className="text-xs leading-relaxed text-mist-500">The request is limited to openTrove(3000 MUSD, zero upper hint, zero lower hint) with 0.05 BTC value. A failed preflight blocks before the wallet prompt; a wallet prompt requires this button press and your approval in the wallet.</p>
    </section>
  );
}
