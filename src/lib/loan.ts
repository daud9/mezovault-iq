/**
 * Reads the connected wallet's MUSD loan (trove) and the BTC/USD price from official contracts.
 * Read-only. The collateral ratio is computed from on-chain values. The protocol's own
 * thresholds are not assumed, because they are not verified here. Price is read through
 * Mezo PriceFeed.fetchPrice(); its oracle() pointer is used only for update-time metadata.
 */
import type { MezoNetworkConfig } from "../config/chains";
import { decodeUint256, isAddress, encodeAddressWord } from "./abi";
import { RpcError, type RpcClient } from "./rpc";
import { parseChainId } from "./network";
import { formatTokenUnits } from "./tokenAmount";
import { MEZO_TESTNET_SELECTORS } from "./mezoAbi";

/** Read selectors shared with the verified Mezo Testnet ABI registry. */
export const LOAN_SELECTORS = {
  getTroveColl: MEZO_TESTNET_SELECTORS.troveManager.getTroveColl,
  getTroveDebt: MEZO_TESTNET_SELECTORS.troveManager.getTroveDebt,
  getTroveStatus: MEZO_TESTNET_SELECTORS.troveManager.getTroveStatus,
  fetchPrice: MEZO_TESTNET_SELECTORS.priceFeed.fetchPrice,
  oracle: MEZO_TESTNET_SELECTORS.priceFeed.oracle,
  latestRoundData: MEZO_TESTNET_SELECTORS.priceOracleCaller.latestRoundData,
  decimals: MEZO_TESTNET_SELECTORS.priceOracleCaller.decimals,
} as const;

export type LoanResult =
  | {
      status: "ok";
      hasLoan: boolean;
      collateralRaw: bigint;
      debtRaw: bigint;
      collateralBtc: string;
      debtMusd: string;
      btcUsd: number | null;
      collateralValueUsd: number | null;
      /** Collateral value divided by debt. Null when there is no debt or no verified price. */
      collateralRatioPct: number | null;
      priceUpdatedAt: string | null;
      priceAgeSeconds: number | null;
      chainId: number;
      blockNumber: number;
      retrievedAt: string;
    }
  | { status: "not-configured"; reason: string }
  | { status: "wrong-network"; actualChainId: number | null; expectedChainId: number }
  | { status: "error"; kind: string; message: string };

const call = (rpc: RpcClient, to: string, data: string) => rpc.call<string>("eth_call", [{ to, data }, "latest"]);

/** Decodes the answer from latestRoundData: (roundId, answer, startedAt, updatedAt, answeredInRound). */
export function decodeRoundData(hex: string): { answer: bigint; updatedAt: number } {
  const body = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (body.length < 64 * 5 || !/^[0-9a-fA-F]+$/.test(body)) throw new Error("Oracle returned an unexpected response");
  const word = (i: number) => body.slice(i * 64, (i + 1) * 64);
  const answerWord = BigInt(`0x${word(1)}`);
  // int256: values with the top bit set are negative. A negative price is never valid.
  if (answerWord >> 255n === 1n) throw new Error("Oracle reported a negative price");
  return { answer: answerWord, updatedAt: Number(BigInt(`0x${word(3)}`)) };
}

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

    const ownerWord = encodeAddressWord(owner);
    const collateralRaw = decodeUint256(await call(rpc, trove.address, LOAN_SELECTORS.getTroveColl + ownerWord));
    const debtRaw = decodeUint256(await call(rpc, trove.address, LOAN_SELECTORS.getTroveDebt + ownerWord));
    const troveStatus = decodeUint256(await call(rpc, trove.address, LOAN_SELECTORS.getTroveStatus + ownerWord));
    // Liquity-derived status enum: 1 = active; 0 and other terminal states are not active.
    const hasLoan = troveStatus === 1n;

    // BTC is the gas token with 18 decimals, and MUSD has 18 decimals (both verified in the official docs).
    const collateralBtc = formatTokenUnits(collateralRaw, 18, 8);
    const debtMusd = formatTokenUnits(debtRaw, 18, 2);

    let btcUsd: number | null = null;
    let priceUpdatedAt: string | null = null;
    let priceAgeSeconds: number | null = null;

    // A wallet with no active Trove does not need an oracle read. Mezo's PriceFeed
    // proxy exposes fetchPrice() in 18-decimal protocol units. Do not call the
    // PriceOracleCaller directly as though it were the PriceFeed proxy.
    const priceFeed = network.priceFeed;
    if (hasLoan && priceFeed) {
      try {
        const priceRaw = decodeUint256(await call(rpc, priceFeed.address, LOAN_SELECTORS.fetchPrice));
        // Build the decimal string from exact digits. Number(raw) / 1e18 loses precision, and
        // formatTokenUnits adds thousands separators that Number() cannot parse.
        const digits = priceRaw.toString().padStart(19, "0");
        const parsedPrice = Number(`${digits.slice(0, -18)}.${digits.slice(-18)}`);
        if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
          throw new Error("Mezo PriceFeed returned an invalid BTC/USD price");
        }
        btcUsd = parsedPrice;

        // PriceFeed.oracle() points to a PriceOracleCaller that exposes the
        // Chainlink-compatible decimals() and latestRoundData() methods.
        // Failure here affects freshness metadata only, not fetchPrice().
        try {
          const oracleHex = await call(rpc, priceFeed.address, LOAN_SELECTORS.oracle);
          const oracleAddress = `0x${oracleHex.slice(-40)}`;
          if (!isAddress(oracleAddress)) throw new Error("PriceFeed returned an invalid oracle address");
          const decimals = Number(decodeUint256(await call(rpc, oracleAddress, LOAN_SELECTORS.decimals)));
          const round = decodeRoundData(await call(rpc, oracleAddress, LOAN_SELECTORS.latestRoundData));
          if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
            throw new Error("Oracle returned invalid price decimals");
          }
          if (round.answer <= 0n) throw new Error("Oracle returned a non-positive BTC/USD price");
          priceUpdatedAt = new Date(round.updatedAt * 1000).toISOString();
          priceAgeSeconds = Math.max(0, Math.floor(now().getTime() / 1000) - round.updatedAt);
        } catch {
          priceUpdatedAt = null;
          priceAgeSeconds = null;
        }
      } catch {
        btcUsd = null;
        priceUpdatedAt = null;
        priceAgeSeconds = null;
      }
    }

    const collateralValueUsd = btcUsd === null ? null : (Number(collateralRaw) / 1e18) * btcUsd;
    const debtUsd = Number(debtRaw) / 1e18;
    const collateralRatioPct =
      collateralValueUsd === null || debtUsd === 0 ? null : (collateralValueUsd / debtUsd) * 100;

    const blockNumber = Number(BigInt(await rpc.call<string>("eth_blockNumber")));
    return {
      status: "ok",
      hasLoan,
      collateralRaw,
      debtRaw,
      collateralBtc,
      debtMusd,
      btcUsd,
      collateralValueUsd,
      collateralRatioPct,
      priceUpdatedAt,
      priceAgeSeconds,
      chainId,
      blockNumber,
      retrievedAt: now().toISOString(),
    };
  } catch (err) {
    if (err instanceof RpcError) return { status: "error", kind: err.kind, message: err.message };
    return { status: "error", kind: "unknown", message: err instanceof Error ? err.message : "The loan position could not be read." };
  }
}
