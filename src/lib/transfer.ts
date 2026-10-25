/**
 * Send MUSD, MEZO or BTC from the connected wallet.
 *
 * The app builds the transaction, the user reviews it, and the wallet signs it. The app never
 * sees a private key. Nothing is sent until the user presses Confirm in the app and approves in
 * the wallet. Success is reported only when the receipt shows status 0x1.
 */
import { isAddress, encodeAddressWord } from "./abi";
import { RpcError, type RpcClient } from "./rpc";
import { parseChainId } from "./network";

/** ERC-20 transfer(address,uint256). Selector derived with Keccak-256 and checked in tests. */
export const TRANSFER_SELECTOR = "0xa9059cbb";

export type SendToken =
  | { kind: "native"; symbol: "BTC"; decimals: 18 }
  | { kind: "erc20"; symbol: "MUSD" | "MEZO"; decimals: number; address: `0x${string}` };

export interface TxRequest {
  from: `0x${string}`;
  to: `0x${string}`;
  value: string;
  data?: string;
}

const ZERO = "0x0000000000000000000000000000000000000000";

/** Parses a user-entered decimal amount into base units without floating-point rounding. */
export function parseAmount(input: string, decimals: number): { ok: true; raw: bigint } | { ok: false; error: string } {
  const text = input.trim();
  if (text.length === 0) return { ok: false, error: "Enter an amount." };
  if (!/^\d*\.?\d*$/.test(text) || text === "." ) return { ok: false, error: "Enter a plain number, such as 0.01." };
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > decimals) return { ok: false, error: `This token supports at most ${decimals} decimal places.` };
  const raw = BigInt((whole || "0") + fraction.padEnd(decimals, "0")) ;
  if (raw <= 0n) return { ok: false, error: "The amount must be greater than zero." };
  return { ok: true, raw };
}

export function validateRecipient(recipient: string, from: string): string | null {
  if (!isAddress(recipient)) return "Enter a valid recipient address (0x followed by 40 hex characters).";
  if (recipient.toLowerCase() === ZERO) return "The zero address cannot receive funds.";
  if (recipient.toLowerCase() === from.toLowerCase()) return "This is your own address. Check it before sending.";
  return null;
}

/** Builds the transaction object. Native BTC uses value; ERC-20 tokens call transfer(). */
export function buildTransfer(token: SendToken, from: `0x${string}`, recipient: `0x${string}`, amountRaw: bigint): TxRequest {
  if (token.kind === "native") {
    return { from, to: recipient, value: `0x${amountRaw.toString(16)}` };
  }
  const data = `${TRANSFER_SELECTOR}${encodeAddressWord(recipient)}${amountRaw.toString(16).padStart(64, "0")}`;
  return { from, to: token.address, value: "0x0", data };
}

/** Total BTC a native send needs: amount plus the estimated gas cost. */
export function nativeTotalCost(amountRaw: bigint, gasLimit: bigint, gasPriceWei: bigint): bigint {
  return amountRaw + gasLimit * gasPriceWei;
}

export type ReceiptOutcome =
  | { status: "success"; hash: string; blockNumber: number; gasUsed: bigint }
  | { status: "reverted"; hash: string; blockNumber: number; gasUsed: bigint }
  | { status: "timeout"; hash: string };

/**
 * Polls for the receipt. Returns success only on status 0x1. A missing receipt after the timeout
 * is reported as "timeout", meaning unknown, not failed.
 */
export async function waitForReceipt(options: {
  rpc: RpcClient;
  hash: string;
  intervalMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<ReceiptOutcome> {
  const interval = options.intervalMs ?? 3000;
  const timeout = options.timeoutMs ?? 120_000;
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const deadline = Date.now() + timeout;
  while (true) {
    const receipt = await options.rpc.call<{ status: string; blockNumber: string; gasUsed: string } | null>(
      "eth_getTransactionReceipt",
      [options.hash],
    );
    if (receipt) {
      const blockNumber = Number(BigInt(receipt.blockNumber));
      const gasUsed = BigInt(receipt.gasUsed);
      if (receipt.status === "0x1") return { status: "success", hash: options.hash, blockNumber, gasUsed };
      return { status: "reverted", hash: options.hash, blockNumber, gasUsed };
    }
    if (Date.now() >= deadline) return { status: "timeout", hash: options.hash };
    await sleep(interval);
  }
}

export function isTxHash(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

/** Maps wallet and RPC failures to messages the user can act on. */
export function describeSendError(err: unknown): string {
  if (err instanceof RpcError) {
    if (/insufficient funds/i.test(err.message)) return "Insufficient funds for this amount plus network fees.";
    return `The network request failed: ${err.message}`;
  }
  const code = typeof err === "object" && err !== null ? (err as { code?: unknown }).code : undefined;
  const message = err instanceof Error ? err.message : "";
  if (code === 4001) return "You rejected the transaction in your wallet. Nothing was sent.";
  if (code === -32002) return "A request is already waiting in your wallet. Open it to respond.";
  if (/insufficient funds/i.test(message)) return "Insufficient funds for this amount plus network fees.";
  if (/gas/i.test(message) && /exceed|limit/i.test(message)) return "The network rejected the gas limit. Try a smaller amount.";
  return "The transaction could not be sent. Nothing was confirmed on-chain.";
}

export function assertChain(actual: unknown, expected: number): void {
  if (parseChainId(actual) !== expected) throw new Error("Your wallet is on a different network.");
}
