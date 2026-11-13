/**
 * Reads the connected wallet's current MUSD Trove and, when available, the
 * BTC/USD oracle and live MCR from the same Mezo block. Read-only; optional
 * risk inputs never replace or fabricate the underlying position read.
 */
import type { MezoNetworkConfig } from "../config/chains";
import { decodeUint256, encodeAddressWord, isAddress } from "./abi";
import { RpcError, type RpcClient } from "./rpc";
import { parseChainId } from "./network";
import { formatTokenUnits } from "./tokenAmount";
import { MEZO_TESTNET_SELECTORS } from "./mezoAbi";
import { readClosedTroveHistory, type ClosedTroveHistory } from "./closedTroveHistory";

/** Read selectors shared with the verified Mezo Testnet ABI registry. */
export const LOAN_SELECTORS = {
  getTroveColl: MEZO_TESTNET_SELECTORS.troveManager.getTroveColl,
  getTroveDebt: MEZO_TESTNET_SELECTORS.troveManager.getTroveDebt,
  getTroveStatus: MEZO_TESTNET_SELECTORS.troveManager.getTroveStatus,
  fetchPrice: MEZO_TESTNET_SELECTORS.priceFeed.fetchPrice,
  oracle: MEZO_TESTNET_SELECTORS.priceFeed.oracle,
  latestRoundData: MEZO_TESTNET_SELECTORS.priceOracleCaller.latestRoundData,
  decimals: MEZO_TESTNET_SELECTORS.priceOracleCaller.decimals,
  mcr: MEZO_TESTNET_SELECTORS.borrowerOperations.mcr,
} as const;

export const MAX_LOAN_READ_AGE_MS = 60_000;
export const MAX_LOAN_ORACLE_AGE_SECONDS = 3_600;

export type LoanResult =
  | {
      status: "ok";
      hasLoan: boolean;
      troveStatus: 0 | 1 | 2 | 3 | 4;
      /** Present only when the protocol status is closed by redemption (status 4). */
      closedHistory: ClosedTroveHistory | null;
      collateralRaw: bigint;
      debtRaw: bigint;
      collateralBtc: string;
      debtMusd: string;
      /** Exact protocol-normalized 18-decimal BTC/USD price, if the read succeeded. */
      btcUsdWei: bigint | null;
      /** Human-readable oracle price retained for existing supported BTC valuation UI. */
      btcUsd: number | null;
      collateralValueUsd: number | null;
      /** Informational collateral value/debt ratio; withheld without a fresh oracle. */
      collateralRatioPct: number | null;
      /** Live minimum collateral ratio, if configured and readable. */
      mcrWei: bigint | null;
      riskInputsError: string | null;
      priceUpdatedAt: string | null;
      /** Oracle update age at the pinned block, not at the later UI render time. */
      priceAgeSeconds: number | null;
      chainId: number;
      blockNumber: number;
      blockTimestamp: number;
      retrievedAt: string;
    }
  | { status: "not-configured"; reason: string }
  | { status: "wrong-network"; actualChainId: number | null; expectedChainId: number }
  | { status: "error"; kind: string; message: string };

interface BlockHeader {
  number?: unknown;
  timestamp?: unknown;
}

class LoanReadError extends Error {
  constructor(readonly kind: string, message: string) {
    super(message);
    this.name = "LoanReadError";
  }
}

function parseHexQuantity(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new LoanReadError("invalid-response", `${label} was not a valid hex quantity.`);
  }
  return BigInt(value);
}

function checkedCode(code: unknown, label: string): void {
  if (typeof code !== "string" || !/^0x(?:[0-9a-fA-F]{2})*$/.test(code)) {
    throw new LoanReadError("invalid-response", `${label} returned invalid contract code data.`);
  }
  if (code.length <= 2) {
    throw new LoanReadError("invalid-response", `${label} has no contract code at the snapshot block.`);
  }
}

function decodeAddress(hex: string, label: string): `0x${string}` {
  if (typeof hex !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hex)) {
    throw new LoanReadError("invalid-response", `${label} returned an invalid ABI address.`);
  }
  const word = hex.slice(2);
  if (!/^0{24}/.test(word)) throw new LoanReadError("invalid-response", `${label} returned a malformed ABI address.`);
  const address = `0x${word.slice(-40)}`;
  if (!isAddress(address) || /^0x0{40}$/i.test(address)) {
    throw new LoanReadError("invalid-response", `${label} returned a zero or invalid address.`);
  }
  return address;
}

/** Decodes the answer from latestRoundData: (roundId, answer, startedAt, updatedAt, answeredInRound). */
export function decodeRoundData(hex: string): { answer: bigint; updatedAt: number } {
  const body = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (body.length < 64 * 5 || !/^[0-9a-fA-F]+$/.test(body)) throw new Error("Oracle returned an unexpected response");
  const word = (i: number) => body.slice(i * 64, (i + 1) * 64);
  const answerWord = BigInt(`0x${word(1)}`);
  // int256: values with the top bit set are negative. A negative price is never valid.
  if (answerWord >> 255n === 1n) throw new Error("Oracle reported a negative price");
  const updatedAtBig = BigInt(`0x${word(3)}`);
  if (updatedAtBig > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Oracle returned an invalid update time");
  return { answer: answerWord, updatedAt: Number(updatedAtBig) };
}

const callAt = (rpc: RpcClient, to: string, data: string, blockTag: string) =>
  rpc.call<string>("eth_call", [{ to, data }, blockTag]);

function toFinitePriceNumber(value: bigint): number | null {
  const digits = value.toString().padStart(19, "0");
  const parsed = Number(`${digits.slice(0, -18)}.${digits.slice(-18)}`);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Reads position fields and optional risk inputs at a single chain-checked
 * block. Trove state errors fail the read; oracle/MCR failures retain the
 * verified position but make risk calculations explicitly unavailable.
 */
export async function readLoan(options: {
  network: MezoNetworkConfig;
  owner: string;
  rpc: RpcClient;
  now?: () => Date;
}): Promise<LoanResult> {
  const { network, owner, rpc } = options;
  const now = options.now ?? (() => new Date());
  const trove = network.troveManager;
  if (!trove) {
    return { status: "not-configured", reason: `No verified TroveManager is recorded for ${network.label}.` };
  }
  if (!isAddress(owner)) return { status: "error", kind: "invalid-input", message: "The connected address is not a valid EVM address." };

  try {
    const chainId = parseChainId(await rpc.call<string>("eth_chainId"));
    if (chainId !== network.chainId) return { status: "wrong-network", actualChainId: chainId, expectedChainId: network.chainId };

    const blockNumberBig = parseHexQuantity(await rpc.call<string>("eth_blockNumber"), "Block number");
    if (blockNumberBig <= 0n || blockNumberBig > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new LoanReadError("invalid-response", "The RPC returned an invalid block number.");
    }
    const blockNumber = Number(blockNumberBig);
    const blockTag = `0x${blockNumberBig.toString(16)}`;
    const block = await rpc.call<BlockHeader | null>("eth_getBlockByNumber", [blockTag, false]);
    if (!block || typeof block !== "object") throw new LoanReadError("invalid-response", "The snapshot block header is unavailable.");
    const headerNumber = parseHexQuantity(block.number, "Snapshot block number");
    const blockTimestampBig = parseHexQuantity(block.timestamp, "Snapshot block timestamp");
    if (headerNumber !== blockNumberBig || blockTimestampBig <= 0n || blockTimestampBig > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new LoanReadError("invalid-response", "The RPC returned an inconsistent snapshot block header.");
    }
    const blockTimestamp = Number(blockTimestampBig);

    checkedCode(await rpc.call<string>("eth_getCode", [trove.address, blockTag]), "TroveManager");

    const ownerWord = encodeAddressWord(owner);
    const [collateralHex, debtHex, statusHex] = await Promise.all([
      callAt(rpc, trove.address, LOAN_SELECTORS.getTroveColl + ownerWord, blockTag),
      callAt(rpc, trove.address, LOAN_SELECTORS.getTroveDebt + ownerWord, blockTag),
      callAt(rpc, trove.address, LOAN_SELECTORS.getTroveStatus + ownerWord, blockTag),
    ]);
    const collateralRaw = decodeUint256(collateralHex);
    const debtRaw = decodeUint256(debtHex);
    const troveStatus = decodeUint256(statusHex);
    // Liquity-derived enum: 0, 2, 3 and 4 are recognized inactive states; 1 is active.
    if (![0n, 1n, 2n, 3n, 4n].includes(troveStatus)) {
      throw new LoanReadError("invalid-response", "TroveManager returned an unknown Trove status.");
    }
    const hasLoan = troveStatus === 1n;
    let closedHistory: ClosedTroveHistory | null = null;
    if (troveStatus === 4n) {
      closedHistory = await readClosedTroveHistory({ network, owner, blockNumber, blockTag, rpc });
    }
    if (hasLoan && (collateralRaw <= 0n || debtRaw <= 0n)) {
      throw new LoanReadError("invalid-response", "TroveManager marked this Trove active but returned zero collateral or debt.");
    }
    if (!hasLoan && (collateralRaw !== 0n || debtRaw !== 0n)) {
      throw new LoanReadError("invalid-response", "TroveManager returned nonzero collateral or debt for a recognized inactive Trove status.");
    }

    const collateralBtc = formatTokenUnits(collateralRaw, 18, 8);
    const debtMusd = formatTokenUnits(debtRaw, 18, 2);
    let btcUsdWei: bigint | null = null;
    let btcUsd: number | null = null;
    let collateralValueUsd: number | null = null;
    let collateralRatioPct: number | null = null;
    let mcrWei: bigint | null = null;
    let priceUpdatedAt: string | null = null;
    let priceAgeSeconds: number | null = null;
    let riskInputsError: string | null = null;

    if (hasLoan) {
      if (!network.priceFeed) {
        riskInputsError = `No verified BTC/USD PriceFeed is configured for ${network.label}.`;
      } else {
        try {
          checkedCode(await rpc.call<string>("eth_getCode", [network.priceFeed.address, blockTag]), "PriceFeed");
          const priceHex = await callAt(rpc, network.priceFeed.address, LOAN_SELECTORS.fetchPrice, blockTag);
          const priceRaw = decodeUint256(priceHex);
          if (priceRaw <= 0n) throw new LoanReadError("invalid-response", "Mezo PriceFeed returned a non-positive BTC/USD price.");

          const oracleHex = await callAt(rpc, network.priceFeed.address, LOAN_SELECTORS.oracle, blockTag);
          const oracleAddress = decodeAddress(oracleHex, "PriceFeed.oracle()");
          checkedCode(await rpc.call<string>("eth_getCode", [oracleAddress, blockTag]), "PriceOracleCaller");
          const [decimalsHex, roundHex] = await Promise.all([
            callAt(rpc, oracleAddress, LOAN_SELECTORS.decimals, blockTag),
            callAt(rpc, oracleAddress, LOAN_SELECTORS.latestRoundData, blockTag),
          ]);
          const decimals = decodeUint256(decimalsHex);
          const round = decodeRoundData(roundHex);
          if (decimals > 36n || round.answer <= 0n || round.updatedAt <= 0) {
            throw new LoanReadError("invalid-response", "PriceOracleCaller returned invalid BTC/USD freshness metadata.");
          }
          const oracleAge = blockTimestamp - round.updatedAt;
          if (oracleAge < 0) throw new LoanReadError("invalid-response", "The BTC/USD oracle update is newer than the snapshot block.");

          btcUsdWei = priceRaw;
          btcUsd = toFinitePriceNumber(priceRaw);
          priceUpdatedAt = new Date(round.updatedAt * 1_000).toISOString();
          priceAgeSeconds = oracleAge;
          if (btcUsd !== null) {
            const collateralBtcNumber = Number(collateralRaw) / 1e18;
            const debtNumber = Number(debtRaw) / 1e18;
            collateralValueUsd = Number.isFinite(collateralBtcNumber * btcUsd) ? collateralBtcNumber * btcUsd : null;
            collateralRatioPct = debtNumber > 0 && collateralValueUsd !== null ? (collateralValueUsd / debtNumber) * 100 : null;
          }
        } catch (err) {
          riskInputsError = err instanceof Error ? err.message : "BTC/USD oracle data could not be verified.";
        }
      }

      if (network.borrowerOperations) {
        try {
          checkedCode(await rpc.call<string>("eth_getCode", [network.borrowerOperations.address, blockTag]), "BorrowerOperations");
          const rawMcr = decodeUint256(await callAt(rpc, network.borrowerOperations.address, LOAN_SELECTORS.mcr, blockTag));
          if (rawMcr <= 0n) throw new LoanReadError("invalid-response", "BorrowerOperations returned a non-positive MCR.");
          mcrWei = rawMcr;
        } catch (err) {
          riskInputsError ??= err instanceof Error ? err.message : "The live MCR could not be verified.";
        }
      } else {
        riskInputsError ??= `No verified BorrowerOperations contract is configured for ${network.label}.`;
      }
    }

    return {
      status: "ok",
      hasLoan,
      troveStatus: Number(troveStatus) as 0 | 1 | 2 | 3 | 4,
      closedHistory,
      collateralRaw,
      debtRaw,
      collateralBtc,
      debtMusd,
      btcUsdWei,
      btcUsd,
      collateralValueUsd,
      collateralRatioPct,
      mcrWei,
      riskInputsError,
      priceUpdatedAt,
      priceAgeSeconds,
      chainId,
      blockNumber,
      blockTimestamp,
      retrievedAt: now().toISOString(),
    };
  } catch (err) {
    if (err instanceof RpcError) return { status: "error", kind: err.kind, message: err.message };
    if (err instanceof LoanReadError) return { status: "error", kind: err.kind, message: err.message };
    return { status: "error", kind: "unknown", message: err instanceof Error ? err.message : "The loan position could not be read." };
  }
}

/** A cached Trove is current only for a short UI window; stale results remain labeled, never relabeled live. */
export function loanReadAgeMs(result: Extract<LoanResult, { status: "ok" }>, nowMs = Date.now()): number | null {
  const retrievedAt = Date.parse(result.retrievedAt);
  if (!Number.isFinite(retrievedAt) || !Number.isFinite(nowMs) || nowMs < retrievedAt) return null;
  return nowMs - retrievedAt;
}

export function isLoanReadFresh(result: Extract<LoanResult, { status: "ok" }>, nowMs = Date.now()): boolean {
  const age = loanReadAgeMs(result, nowMs);
  return age !== null && age <= MAX_LOAN_READ_AGE_MS;
}

/** Oracle freshness ages forward from the pinned block as the UI reuses that snapshot. */
export function isLoanPriceFresh(result: Extract<LoanResult, { status: "ok" }>, nowMs = Date.now()): boolean {
  const readAge = loanReadAgeMs(result, nowMs);
  if (readAge === null || result.btcUsdWei === null || result.priceAgeSeconds === null || result.priceAgeSeconds < 0) return false;
  if (!Number.isSafeInteger(result.blockTimestamp) || result.blockTimestamp <= 0) return false;
  const elapsedSeconds = Math.floor((nowMs - result.blockTimestamp * 1_000) / 1_000);
  const currentAge = result.priceAgeSeconds + Math.max(0, elapsedSeconds);
  return currentAge <= MAX_LOAN_ORACLE_AGE_SECONDS;
}
