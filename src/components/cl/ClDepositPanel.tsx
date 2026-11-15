import { useEffect, useMemo, useState } from "react";
import { ExternalLink, ShieldCheck, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import type { MezoNetworkConfig } from "../../config/chains";
import { TESTNET_CL_CONTRACTS } from "../../config/clPositions";
import { resolveRpcUrl } from "../../config/env";
import { formatClAmount } from "../../lib/clPositions";
import {
  ClDepositPreflightError,
  formatClFeePips,
  formatRawTokenAmount,
  readClDepositReview,
  simulateClApproval,
  simulateClMint,
  type ClDepositReview,
  type SimulatedClTransaction,
} from "../../lib/clDeposit";
import { createRpcClient } from "../../lib/rpc";
import { addEntry, browserStore } from "../../lib/txLedger";
import { describeSendError } from "../../lib/transfer";
import type { ClPlannerPool } from "../../lib/clPlanner";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { useWallet } from "../wallet/WalletProvider";

interface ClDepositPanelProps {
  pool: ClPlannerPool;
  lowerPrice: string;
  upperPrice: string;
  budgetToken1: string;
  plannerBlockNumber: number;
  enabled: boolean;
  network: MezoNetworkConfig;
}

interface ReviewBundle {
  key: string;
  review: ClDepositReview;
}

interface SimulationBundle {
  key: string;
  simulation: SimulatedClTransaction;
}

interface Submission {
  hash: string;
  kind: "mint" | "approve" | "reset-approval";
}

type ReceiptState =
  | { status: "not-checked" }
  | { status: "pending" }
  | { status: "confirmed"; blockNumber: number }
  | { status: "reverted"; blockNumber: number }
  | { status: "error"; message: string };

const SLIPPAGE_CHOICES = [
  { value: 50, label: "0.5%" },
  { value: 100, label: "1%" },
  { value: 200, label: "2%" },
] as const;

export function ClDepositPanel({ pool, lowerPrice, upperPrice, budgetToken1, plannerBlockNumber, enabled, network }: ClDepositPanelProps) {
  const wallet = useWallet();
  const rpc = useMemo(() => createRpcClient({ url: resolveRpcUrl(network) }), [network]);
  const [slippageBps, setSlippageBps] = useState<number>(50);
  const [reviewBundle, setReviewBundle] = useState<ReviewBundle | null>(null);
  const [simulationBundle, setSimulationBundle] = useState<SimulationBundle | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [receiptState, setReceiptState] = useState<ReceiptState>({ status: "not-checked" });

  const account = wallet.state.address;
  const connected = wallet.state.status === "connected" && account !== null;
  const testnet = network.key === "testnet" && network.chainId === TESTNET_CL_CONTRACTS.chainId;
  const formKey = `${pool.address.toLowerCase()}|${lowerPrice}|${upperPrice}|${budgetToken1}|${slippageBps}|${account?.toLowerCase() ?? ""}|${plannerBlockNumber}`;
  const review = reviewBundle?.key === formKey ? reviewBundle.review : null;
  const simulation = simulationBundle?.key === formKey ? simulationBundle.simulation : null;
  const allowance0 = review ? BigInt(review.allowance0) : 0n;
  const allowance1 = review ? BigInt(review.allowance1) : 0n;
  const amount0 = review ? BigInt(review.amount0Desired) : 0n;
  const amount1 = review ? BigInt(review.amount1Desired) : 0n;
  const nextApproval: 0 | 1 | null = review
    ? allowance0 < amount0 ? 0 : allowance1 < amount1 ? 1 : null
    : null;
  const hasPendingSubmission = submission !== null && receiptState.status !== "confirmed" && receiptState.status !== "reverted";
  const canPrepare = testnet && enabled && connected && wallet.isSupportedNetwork && !busy && !hasPendingSubmission;

  useEffect(() => {
    setReviewBundle(null);
    setSimulationBundle(null);
    setError("");
  }, [formKey]);

  async function prepareReview() {
    if (!canPrepare || !account) return;
    setBusy(true);
    setError("");
    setSimulationBundle(null);
    try {
      const freshReview = await readClDepositReview({
        network,
        rpc,
        account,
        selectedPool: pool,
        lowerPrice,
        upperPrice,
        budgetToken1,
        slippageBps,
      });
      setReviewBundle({ key: formKey, review: freshReview });
    } catch (caught) {
      setReviewBundle(null);
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function simulateNextAction() {
    if (!review || !account || busy || hasPendingSubmission) return;
    setBusy(true);
    setError("");
    setSimulationBundle(null);
    try {
      const result = nextApproval === null
        ? await simulateClMint({ network, rpc, review })
        : await simulateClApproval({ network, rpc, review, tokenIndex: nextApproval });
      setSimulationBundle({ key: formKey, simulation: result });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function openWalletForPreparedCall() {
    if (!review || !simulation || !account || busy || hasPendingSubmission) return;
    if (Date.now() < simulation.checkedAtMs || Date.now() - simulation.checkedAtMs > 30_000) {
      setSimulationBundle(null);
      setError("The transaction simulation is older than 30 seconds. Simulate the exact call again before opening your wallet.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const transactionRequest: Record<string, string> = {
        from: simulation.transaction.from,
        to: simulation.transaction.to,
        data: simulation.transaction.data,
        value: simulation.transaction.value,
        gas: simulation.transaction.gas,
      };
      const hash = await wallet.sendTransaction(transactionRequest, { account, chainId: TESTNET_CL_CONTRACTS.chainId });
      recordClAction(hash, simulation, review);
      setSubmission({ hash, kind: simulation.kind });
      setReceiptState({ status: "not-checked" });
      setSimulationBundle(null);
      setError("");
    } catch (caught) {
      setError(describeSendError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function checkReceipt() {
    if (!submission || busy) return;
    setBusy(true);
    setError("");
    try {
      const receipt = await rpc.call<{ status?: unknown; blockNumber?: unknown } | null>("eth_getTransactionReceipt", [submission.hash]);
      if (receipt === null) {
        setReceiptState({ status: "pending" });
        return;
      }
      if (typeof receipt.status !== "string" || !/^0x[0-9a-fA-F]+$/.test(receipt.status) || typeof receipt.blockNumber !== "string" || !/^0x[0-9a-fA-F]+$/.test(receipt.blockNumber)) {
        setReceiptState({ status: "error", message: "The RPC returned an incomplete transaction receipt; confirmation is unknown." });
        return;
      }
      const blockBigInt = BigInt(receipt.blockNumber);
      if (blockBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
        setReceiptState({ status: "error", message: "The receipt block number is outside the safe integer range; confirmation is unknown." });
        return;
      }
      const blockNumber = Number(blockBigInt);
      const receiptStatus = BigInt(receipt.status);
      if (receiptStatus === 1n) {
        setReceiptState({ status: "confirmed", blockNumber });
        setReviewBundle(null);
        setSimulationBundle(null);
      } else if (receiptStatus === 0n) {
        setReceiptState({ status: "reverted", blockNumber });
        setReviewBundle(null);
        setSimulationBundle(null);
      } else {
        setReceiptState({ status: "error", message: "The receipt status was not recognized; confirmation is unknown." });
      }
    } catch (caught) {
      setReceiptState({ status: "error", message: errorMessage(caught) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="rounded-xl border border-gold-500/30 bg-gold-500/10 p-2 text-gold-300">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-mist-500">Separate wallet flow · Testnet only</p>
          <h2 className="mt-1 text-base font-semibold text-mist-100">Create a CL position</h2>
          <p className="mt-1 text-sm text-mist-400">Separate Testnet mint flow. Confirm each wallet action.</p>
        </div>
      </div>

      {!testnet ? (
        <p className="rounded-xl border border-risk-medium/30 bg-risk-medium/5 p-3 text-sm text-risk-medium">This deposit flow is locked to Mezo Testnet (chain 31611).</p>
      ) : !connected ? (
        <div className="space-y-3 rounded-xl border border-line bg-ink-800/50 p-4">
          <p className="text-sm text-mist-300">Connect a wallet to read balances and allowances.</p>
          <Button onClick={() => void wallet.connect()} disabled={wallet.state.status === "connecting"} className="min-h-11">
            <Wallet className="h-4 w-4" aria-hidden="true" /> {wallet.state.status === "connecting" ? "Connecting…" : "Connect wallet"}
          </Button>
          {wallet.state.error && <p role="alert" className="text-sm text-risk-medium">{wallet.state.error}</p>}
        </div>
      ) : !wallet.isSupportedNetwork ? (
        <div className="space-y-3 rounded-xl border border-risk-medium/30 bg-risk-medium/5 p-4">
          <p className="text-sm text-risk-medium">The connected wallet is not on Mezo Testnet (chain 31611). No deposit action is available.</p>
          <Button variant="secondary" onClick={() => void wallet.switchNetwork()} className="min-h-11">Switch to Mezo Testnet</Button>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <div className="rounded-xl border border-line bg-ink-800/50 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-mist-500">Connected recipient</p>
              <p className="mt-2 break-all font-mono text-xs text-mist-200">{account}</p>
              <p className="mt-2 text-xs text-mist-500">Mezo Testnet · chain 31611</p>
            </div>
            <label className="space-y-1.5 text-sm font-medium text-mist-100" htmlFor="cl-deposit-slippage">
              <span>Slippage tolerance</span>
              <select id="cl-deposit-slippage" value={slippageBps} onChange={(event) => setSlippageBps(Number(event.target.value))} className="min-h-12 w-full rounded-xl border border-line bg-ink-800 px-3 text-sm text-mist-100">
                {SLIPPAGE_CHOICES.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
              </select>
              <span className="block text-xs font-normal text-mist-500">Sets minimum mint amounts.</span>
            </label>
          </div>

          {!enabled && <p role="status" className="rounded-xl border border-risk-medium/30 bg-risk-medium/5 p-3 text-sm text-risk-medium">Prepare is disabled until the planner has a fresh pool snapshot and a valid range and budget.</p>}
          {error && <p role="alert" className="rounded-xl border border-risk-high/30 bg-risk-high/5 p-3 text-sm leading-relaxed text-risk-high">{error}</p>}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void prepareReview()} disabled={!canPrepare} className="min-h-11">
              {busy ? "Checking live state…" : "Prepare exact deposit review"}
            </Button>
          </div>

          {review && (
            <div className="space-y-4 rounded-2xl border border-gold-500/30 bg-ink-800/40 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-mist-500">Exact transaction review</p>
                  <h3 className="mt-1 text-lg font-semibold text-mist-100">{review.pool.token0.symbol}/{review.pool.token1.symbol} · {review.split.inRange ? "current price in range" : "current price outside range"}</h3>
                </div>
                <span className="rounded-full border border-line px-2.5 py-1 text-xs text-mist-300">Block {review.blockNumber.toLocaleString()}</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <AmountBox token={review.pool.token0} desired={review.amount0Desired} minimum={review.amount0Min} balance={review.balance0} allowance={review.allowance0} />
                <AmountBox token={review.pool.token1} desired={review.amount1Desired} minimum={review.amount1Min} balance={review.balance1} allowance={review.allowance1} />
              </div>

              <dl className="grid gap-3 sm:grid-cols-2">
                <Detail label="Pool" value={`${review.pool.token0.symbol}/${review.pool.token1.symbol} · ${review.pool.address}`} />
                <Detail label="Current swap fee" value={`${formatClFeePips(review.feePips)} (${review.feePips} pips from live factory getter)`} />
                <Detail label="Entered price range" value={`${lowerPrice} to ${upperPrice} ${review.pool.token1.symbol} per ${review.pool.token0.symbol}`} />
                <Detail label="Tick spacing and range" value={`${review.pool.tickSpacing} · ${review.split.lowerTick.toLocaleString()} to ${review.split.upperTick.toLocaleString()}`} />
                <Detail label="Active status at review" value={`${review.split.inRange ? "In range" : "Out of range"} · current tick ${review.pool.currentTick.toLocaleString()}`} />
                <Detail label="Current spot price" value={`1 ${review.pool.token0.symbol} ≈ ${formatPrice(review.split.currentPrice)} ${review.pool.token1.symbol}`} />
                <Detail label="Entered budget" value={`${budgetToken1} ${review.pool.token1.symbol} (token1-valued, not USD)`} />
                <Detail label="Recipient" value={review.wallet} />
                <Detail label="Network" value={`Mezo Testnet · chain ${review.chainId}`} />
                <Detail label="CL Factory" value={review.factory} />
                <Detail label="Manager contract" value={review.manager} />
                <Detail label="Deadline" value={`${new Date(review.deadline * 1_000).toLocaleString()} · Unix ${review.deadline}`} />
              </dl>

              <div className="rounded-xl border border-line bg-ink-900/80 p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-mist-500">Contract call</p>
                <p className="mt-2 break-all font-mono text-xs leading-relaxed text-mist-200">{"mint((address,address,int24,int24,int24,uint256,uint256,uint256,uint256,address,uint256,uint160))"}</p>
                <p className="mt-2 text-xs text-mist-400">Pool creation disabled (<span className="font-mono">sqrtPriceX96 = 0</span>); native value 0. The displayed fee is not a mint argument.</p>
                <details className="mt-3">
                  <summary className="min-h-11 cursor-pointer py-2 text-xs font-medium text-gold-300">Show exact mint calldata</summary>
                  <p className="break-all font-mono text-[11px] leading-relaxed text-mist-400">{review.mintTransaction.data}</p>
                </details>
              </div>

              <p className="text-xs text-mist-500">Desired amounts are rounded maximum inputs; unused tokens stay in your wallet. Minimums apply the chosen tolerance. Simulation is not a receipt.</p>

              {nextApproval !== null ? (
                <div className="space-y-3 rounded-xl border border-risk-medium/30 bg-risk-medium/5 p-4">
                  <h4 className="text-sm font-semibold text-mist-100">A separate token approval is required</h4>
                  <p className="text-sm text-mist-300">One exact token approval at a time; no unlimited allowance. Prepare a fresh review after confirmation.</p>
                  {simulation && simulation.kind !== "mint" ? <SimulationDetails simulation={simulation} review={review} /> : null}
                  {simulation && simulation.kind !== "mint" ? (
                    <Button onClick={() => void openWalletForPreparedCall()} disabled={busy || hasPendingSubmission} className="min-h-11">{busy ? "Waiting…" : simulation.kind === "reset-approval" ? "Open wallet to reset this allowance" : "Open wallet to approve exact amount"}</Button>
                  ) : (
                    <Button variant="secondary" onClick={() => void simulateNextAction()} disabled={busy || hasPendingSubmission} className="min-h-11">{busy ? "Simulating approval…" : `Simulate ${review.pool[ nextApproval === 0 ? "token0" : "token1" ].symbol} approval`}</Button>
                  )}
                </div>
              ) : (
                <div className="space-y-3 rounded-xl border border-line bg-ink-900/60 p-4">
                  <h4 className="text-sm font-semibold text-mist-100">Both allowances cover the exact desired amounts</h4>
                  {simulation?.kind === "mint" ? <SimulationDetails simulation={simulation} review={review} /> : null}
                  {simulation?.kind === "mint" ? (
                    <Button onClick={() => void openWalletForPreparedCall()} disabled={busy || hasPendingSubmission} className="min-h-11">{busy ? "Waiting…" : "Open wallet to mint this position"}</Button>
                  ) : (
                    <Button variant="secondary" onClick={() => void simulateNextAction()} disabled={busy || hasPendingSubmission} className="min-h-11">{busy ? "Simulating mint…" : "Simulate exact mint call (read-only)"}</Button>
                  )}
                </div>
              )}
            </div>
          )}

          {submission && (
            <div className="space-y-3 rounded-xl border border-line bg-ink-800/50 p-4">
              <div>
                <h3 className="text-sm font-semibold text-mist-100">{submission.kind === "mint" ? "Mint transaction" : submission.kind === "approve" ? "Token approval" : "Allowance reset"}</h3>
                <p className="mt-1 break-all font-mono text-xs text-mist-400">{submission.hash}</p>
              </div>
              {receiptState.status === "confirmed" && <p role="status" className="text-sm text-risk-low">Execution succeeded in block {receiptState.blockNumber.toLocaleString()}; finality is not checked. {submission.kind === "mint" ? "Position event and token ID are not verified; refresh CL Positions." : "Approval succeeded; prepare again."}</p>}
              {receiptState.status === "reverted" && <p role="alert" className="text-sm text-risk-high">Transaction reverted in block {receiptState.blockNumber.toLocaleString()}.</p>}
              {receiptState.status === "not-checked" && <p role="status" className="text-sm text-risk-medium">Hash received; receipt not checked.</p>}
              {receiptState.status === "pending" && <p role="status" className="text-sm text-risk-medium">No receipt yet; transaction unconfirmed.</p>}
              {receiptState.status === "error" && <p role="alert" className="text-sm text-risk-medium">{receiptState.message}</p>}
              {receiptState.status !== "confirmed" && receiptState.status !== "reverted" ? (
                <Button variant="secondary" onClick={() => void checkReceipt()} disabled={busy} className="min-h-11">{busy ? "Checking receipt…" : "Check transaction receipt"}</Button>
              ) : null}
              {receiptState.status === "confirmed" && submission.kind === "mint" ? (
                <Link to="/app/cl-positions" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-gold-300 hover:underline">Open CL Position Monitor <ExternalLink className="h-4 w-4" aria-hidden="true" /></Link>
              ) : null}
            </div>
          )}

          <p className="text-xs text-mist-500">Wallet actions are explicit; no backend signer. Sources: <a className="text-gold-300 hover:underline" href="https://explorer.test.mezo.org/address/0x9B753e11bFEd0D88F6e1D2777E3c7dac42F96062?tab=contract" target="_blank" rel="noreferrer">manager</a> · <a className="text-gold-300 hover:underline" href="https://mezo.org/docs/developers/features/mezo-pools/" target="_blank" rel="noreferrer">Mezo Pools</a>.</p>
        </>
      )}
    </Card>
  );
}

function recordClAction(hash: string, simulation: SimulatedClTransaction, review: ClDepositReview) {
  const approvalToken = simulation.approvalTokenIndex === undefined
    ? null
    : simulation.approvalTokenIndex === 0 ? review.pool.token0 : review.pool.token1;
  const action = simulation.kind === "mint"
    ? `Mint ${review.pool.token0.symbol}/${review.pool.token1.symbol} CL position`
    : simulation.kind === "reset-approval"
      ? `Reset ${approvalToken?.symbol ?? "token"} allowance for CL position`
      : `Approve ${approvalToken?.symbol ?? "token"} for CL position`;
  const amount = simulation.kind === "mint"
    ? `${review.pool.token0.decimals === null ? `${review.amount0Desired} base units` : `${formatRawTokenAmount(review.amount0Desired, review.pool.token0.decimals)} ${review.pool.token0.symbol}`} + ${review.pool.token1.decimals === null ? `${review.amount1Desired} base units` : `${formatRawTokenAmount(review.amount1Desired, review.pool.token1.decimals)} ${review.pool.token1.symbol}`}`
    : `${formatRawTokenAmount(simulation.approvalAmount ?? "0", approvalToken?.decimals ?? 0)} ${approvalToken?.symbol ?? "token"}`;
  addEntry(browserStore(), {
    hash,
    chainId: review.chainId,
    from: review.wallet,
    to: simulation.transaction.to,
    token: simulation.kind === "mint" ? "CL position" : approvalToken?.symbol ?? "token",
    amount,
    action,
    createdAt: new Date().toISOString(),
    status: "pending",
    blockNumber: null,
  });
}

function AmountBox({ token, desired, minimum, balance, allowance }: { token: ClPlannerPool["token0"]; desired: string; minimum: string; balance: string; allowance: string }) {
  const desiredDisplay = formatRawTokenAmount(desired, token.decimals ?? 0);
  const minimumDisplay = formatRawTokenAmount(minimum, token.decimals ?? 0);
  const allowanceDisplay = formatRawTokenAmount(allowance, token.decimals ?? 0);
  const balanceDisplay = formatRawTokenAmount(balance, token.decimals ?? 0);
  return (
    <div className="min-w-0 rounded-xl border border-line bg-ink-900 p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-mist-500">{token.symbol} · {token.decimals} decimals</p>
      <p className="mt-2 break-all text-base font-semibold text-mist-100">Desired max: {desiredDisplay} {token.symbol}</p>
      <p className="mt-1 break-all text-xs text-mist-300">Minimum: {minimumDisplay} {token.symbol}</p>
      <p className="mt-2 break-all font-mono text-[11px] leading-relaxed text-mist-500">Raw desired {desired} · raw minimum {minimum}</p>
      <p className="mt-2 break-all text-xs text-mist-500">Wallet balance {balanceDisplay} · manager allowance {allowanceDisplay}</p>
      <p className="mt-1 break-all text-[11px] text-mist-600">Token contract {token.address}</p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-ink-900/70 p-3">
      <dt className="text-xs text-mist-500">{label}</dt>
      <dd className="mt-1 break-all text-xs leading-relaxed text-mist-200">{value}</dd>
    </div>
  );
}

function SimulationDetails({ simulation, review }: { simulation: SimulatedClTransaction; review: ClDepositReview }) {
  const tokenIndex = simulation.approvalTokenIndex;
  const token = tokenIndex === undefined ? null : tokenIndex === 0 ? review.pool.token0 : review.pool.token1;
  const method = simulation.kind === "mint" ? "mint(MintParams)" : "approve(address,uint256)";
  const amountRaw = simulation.approvalAmount;
  return (
    <div className="space-y-2 rounded-lg border border-risk-low/30 bg-risk-low/5 p-3 text-xs leading-relaxed text-mist-300">
      <p className="font-semibold text-risk-low">Read-only simulation passed at block {simulation.blockNumber.toLocaleString()}</p>
      <p>Call: <span className="font-mono">{method}</span> · target: <span className="break-all font-mono">{simulation.transaction.to}</span></p>
      {token && amountRaw !== undefined && <p>Approval amount: <span className="font-semibold">{formatRawTokenAmount(amountRaw, token.decimals ?? 0)} {token.symbol}</span> · raw {amountRaw} · spender: <span className="break-all font-mono">{review.manager}</span></p>}
      {simulation.kind === "mint" && simulation.simulatedAmount0 !== undefined && simulation.simulatedAmount1 !== undefined && (
        <p>Simulated token use (not a receipt): {formatClAmount(simulation.simulatedAmount0, review.pool.token0.decimals)} {review.pool.token0.symbol} + {formatClAmount(simulation.simulatedAmount1, review.pool.token1.decimals)} {review.pool.token1.symbol}; simulated liquidity {simulation.simulatedLiquidity}.</p>
      )}
      <p>Gas estimate {BigInt(simulation.gasEstimate).toLocaleString()} · wallet gas limit {BigInt(simulation.gasLimit).toLocaleString()} · native value 0.</p>
      <p>Exact transaction data: <span className="break-all font-mono text-[11px]">{simulation.transaction.data}</span></p>
    </div>
  );
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "unavailable";
  return new Intl.NumberFormat("en-US", { maximumSignificantDigits: 8 }).format(value);
}

function errorMessage(error: unknown): string {
  if (error instanceof ClDepositPreflightError) return error.message;
  return describeSendError(error);
}
