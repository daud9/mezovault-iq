import type { MezoNetworkConfig } from "../config/chains";
import { encodeAddressWord, isAddress, decodeUint256 } from "./abi";
import { MEZO_TESTNET_SELECTORS } from "./mezoAbi";
import { decodeRoundData } from "./loan";
import { parseChainId } from "./network";
import { RpcError, type RpcClient } from "./rpc";
import { MEZO_TESTNET_CHAIN_ID, type OpenTroveLiveSnapshot } from "./openTrovePlanner";

const MAX_ORACLE_AGE_SECONDS = 3_600;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

type ReadErrorKind = "stale-data" | "invalid-response";

class SnapshotReadError extends Error {
  constructor(readonly kind: ReadErrorKind, message: string) {
    super(message);
    this.name = "SnapshotReadError";
  }
}

export type OpenTroveSnapshotResult =
  | { status: "ok"; snapshot: OpenTroveLiveSnapshot }
  | { status: "not-configured"; reason: string }
  | { status: "wrong-network"; actualChainId: number | null; expectedChainId: number }
  | { status: "error"; kind: string; message: string };

interface BlockHeader {
  number?: unknown;
  timestamp?: unknown;
}

function parseHexQuantity(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new SnapshotReadError("invalid-response", `${label} was not a valid hex quantity.`);
  }
  return BigInt(value);
}

function decodeAddress(hex: string, label: string): `0x${string}` {
  if (typeof hex !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hex)) {
    throw new SnapshotReadError("invalid-response", `${label} returned an invalid ABI address.`);
  }
  const word = hex.slice(2);
  if (!/^0{24}/.test(word)) {
    throw new SnapshotReadError("invalid-response", `${label} returned a malformed ABI address.`);
  }
  const address = `0x${word.slice(-40)}`;
  if (!isAddress(address) || address.toLowerCase() === ZERO_ADDRESS) {
    throw new SnapshotReadError("invalid-response", `${label} returned a zero or invalid address.`);
  }
  return address;
}

function decodeBool(hex: string, label: string): boolean {
  const value = decodeUint256(hex);
  if (value !== 0n && value !== 1n) {
    throw new SnapshotReadError("invalid-response", `${label} returned a value other than true or false.`);
  }
  return value === 1n;
}

function checkedCode(code: unknown, label: string): void {
  if (typeof code !== "string" || !/^0x(?:[0-9a-fA-F]{2})*$/.test(code)) {
    throw new SnapshotReadError("invalid-response", `${label} returned invalid contract code data.`);
  }
  if (code.length <= 2) {
    throw new SnapshotReadError("invalid-response", `${label} has no contract code at the snapshot block.`);
  }
}

const callAt = (rpc: RpcClient, to: string, data: string, blockTag: string) =>
  rpc.call<string>("eth_call", [{ to, data }, blockTag]);

/**
 * Read every planner input from configured Mezo Testnet contracts at one block.
 * The function is read-only and fails closed if chain, code, ABI response, or oracle
 * freshness cannot be verified. It does not create transaction data.
 */
export async function readOpenTroveSnapshot(options: {
  network: MezoNetworkConfig;
  owner: string;
  rpc: RpcClient;
}): Promise<OpenTroveSnapshotResult> {
  const { network, owner, rpc } = options;
  const borrowerOperations = network.borrowerOperations;
  const troveManager = network.troveManager;
  const priceFeed = network.priceFeed;
  if (!borrowerOperations || !troveManager || !priceFeed) {
    return { status: "not-configured", reason: `Verified open-trove read contracts are not configured for ${network.label}.` };
  }
  if (network.chainId !== MEZO_TESTNET_CHAIN_ID || network.key !== "testnet") {
    return { status: "not-configured", reason: "The open-trove planner has verified read contracts only for Mezo Testnet." };
  }
  if (!isAddress(owner)) {
    return { status: "error", kind: "invalid-input", message: "The connected address is not a valid EVM address." };
  }

  try {
    const chainId = parseChainId(await rpc.call<string>("eth_chainId"));
    if (chainId !== MEZO_TESTNET_CHAIN_ID) {
      return { status: "wrong-network", actualChainId: chainId, expectedChainId: MEZO_TESTNET_CHAIN_ID };
    }

    const blockHex = await rpc.call<string>("eth_blockNumber");
    const blockNumberBig = parseHexQuantity(blockHex, "Block number");
    if (blockNumberBig <= 0n || blockNumberBig > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new SnapshotReadError("invalid-response", "The RPC returned an invalid block number.");
    }
    const blockNumber = Number(blockNumberBig);
    const blockTag = `0x${blockNumberBig.toString(16)}`;
    const block = await rpc.call<BlockHeader | null>("eth_getBlockByNumber", [blockTag, false]);
    if (!block || typeof block !== "object") {
      throw new SnapshotReadError("invalid-response", "The snapshot block header is unavailable.");
    }
    const headerNumber = parseHexQuantity(block.number, "Snapshot block number");
    const blockTimestampBig = parseHexQuantity(block.timestamp, "Snapshot block timestamp");
    if (headerNumber !== blockNumberBig || blockTimestampBig <= 0n || blockTimestampBig > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new SnapshotReadError("invalid-response", "The RPC returned an inconsistent snapshot block header.");
    }
    const blockTimestamp = Number(blockTimestampBig);

    const [borrowerCode, troveCode, priceFeedCode] = await Promise.all([
      rpc.call<string>("eth_getCode", [borrowerOperations.address, blockTag]),
      rpc.call<string>("eth_getCode", [troveManager.address, blockTag]),
      rpc.call<string>("eth_getCode", [priceFeed.address, blockTag]),
    ]);
    checkedCode(borrowerCode, "BorrowerOperations proxy");
    checkedCode(troveCode, "TroveManager proxy");
    checkedCode(priceFeedCode, "PriceFeed proxy");

    const selectors = MEZO_TESTNET_SELECTORS;
    const [priceHex, minDebtHex, rateHex, reserveHex, mcrHex, ccrHex, systemCollHex, systemDebtHex, governableHex] = await Promise.all([
      callAt(rpc, priceFeed.address, selectors.priceFeed.fetchPrice, blockTag),
      callAt(rpc, borrowerOperations.address, selectors.borrowerOperations.minNetDebt, blockTag),
      callAt(rpc, borrowerOperations.address, selectors.borrowerOperations.borrowingRate, blockTag),
      callAt(rpc, borrowerOperations.address, selectors.borrowerOperations.gasCompensation, blockTag),
      callAt(rpc, borrowerOperations.address, selectors.borrowerOperations.mcr, blockTag),
      callAt(rpc, borrowerOperations.address, selectors.borrowerOperations.ccr, blockTag),
      callAt(rpc, borrowerOperations.address, selectors.borrowerOperations.getEntireSystemColl, blockTag),
      callAt(rpc, borrowerOperations.address, selectors.borrowerOperations.getEntireSystemDebt, blockTag),
      callAt(rpc, borrowerOperations.address, selectors.borrowerOperations.governableVariables, blockTag),
    ]);

    const btcUsdWei = decodeUint256(priceHex);
    const minNetDebtWei = decodeUint256(minDebtHex);
    const borrowingRateWei = decodeUint256(rateHex);
    const gasCompensationWei = decodeUint256(reserveHex);
    const mcrWei = decodeUint256(mcrHex);
    const ccrWei = decodeUint256(ccrHex);
    const systemCollateralBtcWei = decodeUint256(systemCollHex);
    const systemDebtWei = decodeUint256(systemDebtHex);
    if (btcUsdWei <= 0n) throw new SnapshotReadError("invalid-response", "Mezo PriceFeed returned a non-positive BTC/USD price.");

    const governableVariables = decodeAddress(governableHex, "BorrowerOperations.governableVariables()");
    const governableCode = await rpc.call<string>("eth_getCode", [governableVariables, blockTag]);
    checkedCode(governableCode, "GovernableVariables contract");
    const feeExemptHex = await callAt(
      rpc,
      governableVariables,
      `${selectors.governableVariables.feeExemptAccounts}${encodeAddressWord(owner)}`,
      blockTag,
    );
    const feeExempt = decodeBool(feeExemptHex, "feeExemptAccounts(address)");

    const oracleHex = await callAt(rpc, priceFeed.address, selectors.priceFeed.oracle, blockTag);
    const oracleAddress = decodeAddress(oracleHex, "PriceFeed.oracle()");
    const oracleCode = await rpc.call<string>("eth_getCode", [oracleAddress, blockTag]);
    checkedCode(oracleCode, "PriceOracleCaller contract");
    const [decimalsHex, roundHex] = await Promise.all([
      callAt(rpc, oracleAddress, selectors.priceOracleCaller.decimals, blockTag),
      callAt(rpc, oracleAddress, selectors.priceOracleCaller.latestRoundData, blockTag),
    ]);
    const oracleDecimals = decodeUint256(decimalsHex);
    const round = decodeRoundData(roundHex);
    if (oracleDecimals > 36n || round.answer <= 0n || !Number.isSafeInteger(round.updatedAt) || round.updatedAt <= 0) {
      throw new SnapshotReadError("invalid-response", "The PriceOracleCaller returned invalid freshness metadata.");
    }
    const priceAgeSeconds = blockTimestamp - round.updatedAt;
    if (priceAgeSeconds < 0 || priceAgeSeconds > MAX_ORACLE_AGE_SECONDS) {
      throw new SnapshotReadError("stale-data", "The BTC/USD oracle update is stale or newer than the snapshot block.");
    }

    const recoveryHex = await callAt(
      rpc,
      troveManager.address,
      `${selectors.troveManager.checkRecoveryMode}${btcUsdWei.toString(16).padStart(64, "0")}`,
      blockTag,
    );
    const mode = decodeBool(recoveryHex, "TroveManager.checkRecoveryMode(price)") ? "recovery" : "normal";

    return {
      status: "ok",
      snapshot: {
        chainId,
        blockNumber,
        observedAtMs: blockTimestamp * 1_000,
        mode,
        minNetDebtWei,
        borrowingRateWei,
        gasCompensationWei,
        mcrWei,
        ccrWei,
        btcUsdWei,
        feeExempt,
        systemCollateralBtcWei,
        systemDebtWei,
        priceUpdatedAt: round.updatedAt,
        priceAgeSeconds,
      },
    };
  } catch (err) {
    if (err instanceof RpcError) return { status: "error", kind: err.kind, message: err.message };
    if (err instanceof SnapshotReadError) return { status: "error", kind: err.kind, message: err.message };
    return {
      status: "error",
      kind: "invalid-response",
      message: err instanceof Error ? err.message : "Open-trove protocol data could not be verified.",
    };
  }
}
