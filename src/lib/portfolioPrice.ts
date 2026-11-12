/**
 * Partial wallet valuation from Mezo Testnet's verified BTC/USD protocol oracle.
 * This intentionally prices only the native BTC gas balance; it does not infer a
 * MUSD peg or price MEZO, and it fails closed when the on-chain price is stale.
 */
import type { MezoNetworkConfig } from "../config/chains";
import { decodeUint256, isAddress } from "./abi";
import { MEZO_TESTNET_SELECTORS as S } from "./mezoAbi";
import { decodeRoundData } from "./loan";
import { parseChainId } from "./network";
import { RpcError, type RpcClient } from "./rpc";
import { formatTokenUnits } from "./tokenAmount";

const WAD = 10n ** 18n;
export const MAX_BTC_USD_AGE_SECONDS = 3_600;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export type BtcUsdPriceResult =
  | {
      status: "ok";
      priceUsdWad: bigint;
      blockNumber: number;
      observedAtMs: number;
      updatedAt: number;
      priceAgeSeconds: number;
    }
  | { status: "not-configured"; reason: string }
  | { status: "wrong-network"; actualChainId: number | null; expectedChainId: number }
  | { status: "error"; kind: string; message: string };

export type VerifiedBtcUsdPrice = Extract<BtcUsdPriceResult, { status: "ok" }>;

function parseQuantity(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new Error(`${label} was not a valid hex quantity.`);
  }
  return BigInt(value);
}

function decodeAddress(hex: string): `0x${string}` {
  if (typeof hex !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("PriceFeed.oracle() returned an invalid ABI address.");
  }
  const address = `0x${hex.slice(-40)}`;
  if (!isAddress(address) || address.toLowerCase() === ZERO_ADDRESS) {
    throw new Error("PriceFeed.oracle() returned a zero or invalid address.");
  }
  return address;
}

function requireCode(code: unknown, label: string): void {
  if (typeof code !== "string" || !/^0x(?:[0-9a-fA-F]{2})*$/.test(code) || code.length <= 2) {
    throw new Error(`${label} has no valid contract code at the snapshot block.`);
  }
}

const callAt = (rpc: RpcClient, to: string, data: string, blockTag: string) =>
  rpc.call<string>("eth_call", [{ to, data }, blockTag]);

/** Reads BTC/USD and its update time against one explicitly verified Testnet block. */
export async function readBtcUsdPrice(options: {
  network: MezoNetworkConfig;
  rpc: RpcClient;
  maxAgeSeconds?: number;
}): Promise<BtcUsdPriceResult> {
  const { network, rpc } = options;
  const priceFeed = network.priceFeed;
  if (!priceFeed || network.key !== "testnet" || network.chainId !== 31_611) {
    return { status: "not-configured", reason: `A verified BTC/USD oracle is not configured for ${network.label}.` };
  }
  const maxAgeSeconds = options.maxAgeSeconds ?? MAX_BTC_USD_AGE_SECONDS;
  if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds < 0) {
    return { status: "error", kind: "invalid-input", message: "The oracle freshness limit is invalid." };
  }

  try {
    const chainId = parseChainId(await rpc.call<string>("eth_chainId"));
    if (chainId !== network.chainId) {
      return { status: "wrong-network", actualChainId: chainId, expectedChainId: network.chainId };
    }

    const blockNumberBig = parseQuantity(await rpc.call<string>("eth_blockNumber"), "Block number");
    if (blockNumberBig <= 0n || blockNumberBig > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("The RPC returned an invalid block number.");
    }
    const blockNumber = Number(blockNumberBig);
    const blockTag = `0x${blockNumberBig.toString(16)}`;
    const block = await rpc.call<{ number?: unknown; timestamp?: unknown } | null>("eth_getBlockByNumber", [blockTag, false]);
    if (!block || typeof block !== "object") throw new Error("The snapshot block header is unavailable.");
    const headerNumber = parseQuantity(block.number, "Snapshot block number");
    const blockTimestampBig = parseQuantity(block.timestamp, "Snapshot block timestamp");
    if (
      headerNumber !== blockNumberBig ||
      blockTimestampBig <= 0n ||
      blockTimestampBig > 8_640_000_000_000n
    ) {
      throw new Error("The RPC returned an inconsistent or invalid snapshot block header.");
    }
    const blockTimestamp = Number(blockTimestampBig);
    requireCode(await rpc.call<string>("eth_getCode", [priceFeed.address, blockTag]), "Mezo PriceFeed");

    const [priceHex, oracleHex] = await Promise.all([
      callAt(rpc, priceFeed.address, S.priceFeed.fetchPrice, blockTag),
      callAt(rpc, priceFeed.address, S.priceFeed.oracle, blockTag),
    ]);
    const priceUsdWad = decodeUint256(priceHex);
    if (priceUsdWad <= 0n) throw new Error("Mezo PriceFeed returned a non-positive BTC/USD price.");

    const oracleAddress = decodeAddress(oracleHex);
    requireCode(await rpc.call<string>("eth_getCode", [oracleAddress, blockTag]), "PriceOracleCaller");
    const [decimalsHex, roundHex] = await Promise.all([
      callAt(rpc, oracleAddress, S.priceOracleCaller.decimals, blockTag),
      callAt(rpc, oracleAddress, S.priceOracleCaller.latestRoundData, blockTag),
    ]);
    const oracleDecimals = decodeUint256(decimalsHex);
    const round = decodeRoundData(roundHex);
    if (oracleDecimals > 36n || round.answer <= 0n || !Number.isSafeInteger(round.updatedAt) || round.updatedAt <= 0) {
      throw new Error("PriceOracleCaller returned invalid price or update-time metadata.");
    }
    const priceAgeSeconds = blockTimestamp - round.updatedAt;
    if (priceAgeSeconds < 0 || priceAgeSeconds > maxAgeSeconds) {
      return {
        status: "error",
        kind: "stale-data",
        message: "The Mezo BTC/USD oracle update is stale or newer than the snapshot block.",
      };
    }

    return {
      status: "ok",
      priceUsdWad,
      blockNumber,
      observedAtMs: blockTimestamp * 1_000,
      updatedAt: round.updatedAt,
      priceAgeSeconds,
    };
  } catch (err) {
    if (err instanceof RpcError) return { status: "error", kind: err.kind, message: err.message };
    return {
      status: "error",
      kind: "invalid-response",
      message: err instanceof Error ? err.message : "The Mezo BTC/USD oracle could not be verified.",
    };
  }
}

/** Returns a display-only BTC balance estimate, using integer arithmetic throughout. */
export function estimateBtcBalanceUsd(balanceRaw: bigint, priceUsdWad: bigint): string {
  if (balanceRaw < 0n) throw new Error("Negative BTC balances are not valid.");
  if (priceUsdWad <= 0n) throw new Error("A positive verified BTC/USD price is required.");
  return formatTokenUnits((balanceRaw * priceUsdWad) / WAD, 18, 2);
}

/** Advances the price age from its chain-block observation to the current browser time. */
export function btcUsdPriceAgeSeconds(price: VerifiedBtcUsdPrice, nowMs: number): number {
  if (
    !Number.isFinite(nowMs) ||
    !Number.isSafeInteger(price.observedAtMs) ||
    !Number.isSafeInteger(price.priceAgeSeconds) ||
    price.priceAgeSeconds < 0
  ) {
    return MAX_BTC_USD_AGE_SECONDS + 1;
  }
  const elapsedSeconds = Math.floor(Math.max(0, nowMs - price.observedAtMs) / 1_000);
  return price.priceAgeSeconds + elapsedSeconds;
}

/** A displayed quote is valid only while its age remains within the oracle freshness limit. */
export function isBtcUsdPriceFresh(price: VerifiedBtcUsdPrice, nowMs: number): boolean {
  return btcUsdPriceAgeSeconds(price, nowMs) <= MAX_BTC_USD_AGE_SECONDS;
}
