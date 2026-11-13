import { decodeUint256, encodeAddressWord, isAddress } from "./abi";
import type { MezoNetworkConfig } from "../config/chains";
import { formatTokenUnits } from "./tokenAmount";
import { toEventSelector, toFunctionSelector } from "viem";
import type { RpcClient } from "./rpc";

const TROVE_UPDATED_TOPIC = toEventSelector("TroveUpdated(address,uint256,uint256,uint256,uint256,uint16,uint256,uint8)").toLowerCase();
const COLL_SURPLUS_POOL_SELECTOR = toFunctionSelector("collSurplusPool()");
const GET_COLLATERAL_SELECTOR = toFunctionSelector("getCollateral(address)");
const MAX_LOG_RANGE = 9_999n;

export interface ClosedTroveHistory {
  closure: { transactionHash: `0x${string}`; blockNumber: number } | null;
  closureUnavailableReason: string | null;
  claimableSurplusRaw: bigint | null;
  claimableSurplusBtc: string | null;
  surplusUnavailableReason: string | null;
  snapshotBlock: number;
}

interface TroveUpdatedLog {
  address?: unknown;
  topics?: unknown;
  data?: unknown;
  blockNumber?: unknown;
  transactionHash?: unknown;
  transactionIndex?: unknown;
  logIndex?: unknown;
}

/**
 * Reads only redemption closure evidence and current claimable collateral for an inactive
 * status-4 Trove. The log scan is deliberately bounded to the latest 10,000 blocks because
 * the public Testnet RPC rejects larger eth_getLogs ranges.
 */
export async function readClosedTroveHistory(options: {
  network: MezoNetworkConfig;
  owner: string;
  blockNumber: number;
  blockTag: string;
  rpc: RpcClient;
}): Promise<ClosedTroveHistory> {
  const { network, owner, blockNumber, blockTag, rpc } = options;
  if (!network.troveManager || !isAddress(owner) || network.key !== "testnet") {
    return emptyHistory(blockNumber, "Closed-Trove history is not configured for this wallet or network.");
  }
  const closureStart = Math.max(0, blockNumber - Number(MAX_LOG_RANGE));
  let closure: ClosedTroveHistory["closure"] = null;
  let closureUnavailableReason: string | null = null;
  try {
    const logs = await rpc.call<TroveUpdatedLog[]>("eth_getLogs", [{
      address: network.troveManager.address,
      fromBlock: `0x${closureStart.toString(16)}`,
      toBlock: blockTag,
      topics: [TROVE_UPDATED_TOPIC, `0x${encodeAddressWord(owner)}`],
    }]);
    if (!Array.isArray(logs)) throw new Error("The RPC returned malformed Trove history logs.");
    const closing = logs
      .map((log) => decodeRedemptionClosure(log, network.troveManager!.address, owner))
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => a.blockNumber - b.blockNumber || a.transactionIndex - b.transactionIndex || a.logIndex - b.logIndex)
      .at(-1);
    if (closing) closure = { transactionHash: closing.transactionHash, blockNumber: closing.blockNumber };
    else closureUnavailableReason = "The verified closed-by-redemption event was not found in the latest 10,000 blocks.";
  } catch (error) {
    closureUnavailableReason = error instanceof Error ? error.message : "The closure event could not be read.";
  }

  let claimableSurplusRaw: bigint | null = null;
  let claimableSurplusBtc: string | null = null;
  let surplusUnavailableReason: string | null = null;
  try {
    const poolHex = await rpc.call<string>("eth_call", [{ to: network.troveManager.address, data: COLL_SURPLUS_POOL_SELECTOR }, blockTag]);
    const pool = decodeAddress(poolHex);
    const code = await rpc.call<string>("eth_getCode", [pool, blockTag]);
    if (typeof code !== "string" || !/^0x(?:[0-9a-fA-F]{2})+$/.test(code)) throw new Error("The CollSurplusPool contract is unavailable at the snapshot block.");
    const raw = await rpc.call<string>("eth_call", [{ to: pool, data: `${GET_COLLATERAL_SELECTOR}${encodeAddressWord(owner)}` }, blockTag]);
    claimableSurplusRaw = decodeUint256(raw);
    claimableSurplusBtc = formatTokenUnits(claimableSurplusRaw, network.nativeCurrency.decimals, network.nativeCurrency.decimals);
  } catch (error) {
    surplusUnavailableReason = error instanceof Error ? error.message : "Claimable BTC surplus could not be read.";
  }

  return {
    closure,
    closureUnavailableReason,
    claimableSurplusRaw,
    claimableSurplusBtc,
    surplusUnavailableReason,
    snapshotBlock: blockNumber,
  };
}

function decodeRedemptionClosure(log: TroveUpdatedLog, manager: string, owner: string): (NonNullable<ClosedTroveHistory["closure"]> & { transactionIndex: number; logIndex: number }) | null {
  if (typeof log.address !== "string" || log.address.toLowerCase() !== manager.toLowerCase() ||
      !Array.isArray(log.topics) || log.topics.length < 2 ||
      typeof log.topics[0] !== "string" || log.topics[0].toLowerCase() !== TROVE_UPDATED_TOPIC ||
      typeof log.topics[1] !== "string" || log.topics[1].toLowerCase() !== `0x${encodeAddressWord(owner)}`.toLowerCase() ||
      typeof log.data !== "string" || !/^0x[0-9a-fA-F]{448}$/.test(log.data) ||
      typeof log.transactionHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(log.transactionHash)) return null;
  const eventData = log.data as string;
  const words = Array.from({ length: 7 }, (_, i) => eventData.slice(2 + i * 64, 2 + (i + 1) * 64));
  const principal = BigInt(`0x${words[0]}`);
  const interest = BigInt(`0x${words[1]}`);
  const collateral = BigInt(`0x${words[2]}`);
  const operation = BigInt(`0x${words[6]}`);
  if (operation !== 2n || principal !== 0n || interest !== 0n || collateral !== 0n) return null;
  const blockNumber = parseSafeHex(log.blockNumber);
  const transactionIndex = parseSafeHex(log.transactionIndex);
  const logIndex = parseSafeHex(log.logIndex);
  if (blockNumber === null || transactionIndex === null || logIndex === null) return null;
  return { transactionHash: log.transactionHash as `0x${string}`, blockNumber, transactionIndex, logIndex };
}

function parseSafeHex(value: unknown): number | null {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value)) return null;
  const n = BigInt(value);
  return n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : null;
}

function decodeAddress(value: string): `0x${string}` {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value) || !/^0{24}/i.test(value.slice(2))) {
    throw new Error("TroveManager returned an invalid CollSurplusPool address.");
  }
  const address = `0x${value.slice(-40)}`;
  if (!isAddress(address) || /^0x0{40}$/i.test(address)) throw new Error("TroveManager returned a zero CollSurplusPool address.");
  return address;
}

function emptyHistory(blockNumber: number, message: string): ClosedTroveHistory {
  return { closure: null, closureUnavailableReason: message, claimableSurplusRaw: null, claimableSurplusBtc: null, surplusUnavailableReason: message, snapshotBlock: blockNumber };
}
