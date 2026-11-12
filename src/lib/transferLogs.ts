/**
 * Incoming and outgoing ERC-20 transfers, read from Transfer event logs.
 * Native BTC transfers emit no events, so they cannot be listed this way.
 */
import { encodeAddressWord, isAddress } from "./abi";
import type { RpcClient } from "./rpc";

/** keccak256("Transfer(address,address,uint256)"), checked against the standard value in tests. */
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export interface TransferLog {
  txHash: string;
  logIndex: number;
  blockNumber: number;
  from: `0x${string}`;
  to: `0x${string}`;
  valueRaw: bigint;
  direction: "incoming" | "outgoing" | "self";
}

export function logFilter(options: {
  token: `0x${string}`;
  owner: `0x${string}`;
  direction: "incoming" | "outgoing";
  fromBlock: number;
  toBlock: number;
}) {
  const ownerTopic = `0x${encodeAddressWord(options.owner)}`;
  return {
    address: options.token,
    fromBlock: `0x${options.fromBlock.toString(16)}`,
    toBlock: `0x${options.toBlock.toString(16)}`,
    topics: options.direction === "incoming" ? [TRANSFER_TOPIC, null, ownerTopic] : [TRANSFER_TOPIC, ownerTopic],
  };
}

function addressFromTopic(topic: string): `0x${string}` {
  const addr = `0x${topic.slice(-40)}`;
  if (!isAddress(addr)) throw new Error("Log contains an invalid address");
  return addr;
}

export function decodeTransferLog(log: {
  transactionHash: string;
  blockNumber: string;
  logIndex: string;
  topics: string[];
  data: string;
}, direction: "incoming" | "outgoing"): TransferLog {
  if (log.topics.length < 3 || log.topics[0].toLowerCase() !== TRANSFER_TOPIC) throw new Error("Not a Transfer event");
  const blockNumber = Number(BigInt(log.blockNumber));
  const logIndex = Number(BigInt(log.logIndex));
  if (!Number.isSafeInteger(blockNumber) || !Number.isSafeInteger(logIndex)) throw new Error("Log position is unsafe");
  const from = addressFromTopic(log.topics[1]);
  const to = addressFromTopic(log.topics[2]);
  return {
    txHash: log.transactionHash,
    logIndex,
    blockNumber,
    from,
    to,
    valueRaw: BigInt(log.data === "0x" ? "0x0" : log.data),
    direction: from.toLowerCase() === to.toLowerCase() ? "self" : direction,
  };
}

/** Reads one explicit, inclusive block range in both directions, newest first. */
export async function readTransfersInRange(options: {
  rpc: RpcClient;
  token: `0x${string}`;
  owner: `0x${string}`;
  fromBlock: number;
  toBlock: number;
}): Promise<TransferLog[]> {
  const { fromBlock, toBlock } = options;
  if (
    !Number.isSafeInteger(fromBlock) ||
    !Number.isSafeInteger(toBlock) ||
    fromBlock < 0 ||
    toBlock < fromBlock
  ) {
    throw new Error("The transfer-log block range is invalid.");
  }

  const directions = ["incoming", "outgoing"] as const;
  const logsByDirection = await Promise.all(
    directions.map((direction) =>
      options.rpc.call<{ transactionHash: string; blockNumber: string; logIndex: string; topics: string[]; data: string }[]>(
        "eth_getLogs",
        [logFilter({ token: options.token, owner: options.owner, direction, fromBlock, toBlock })],
      ),
    ),
  );
  const byEvent = new Map<string, TransferLog>();
  logsByDirection
    .flatMap((logs, index) => logs.map((log) => decodeTransferLog(log, directions[index])))
    .forEach((log) => byEvent.set(`${log.txHash.toLowerCase()}:${log.logIndex}`, log));
  return [...byEvent.values()].sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex);
}

/** Reads a bounded recent range in both directions. The RPC may refuse the range, so callers handle errors. */
export async function readRecentTransfers(options: {
  rpc: RpcClient;
  token: `0x${string}`;
  owner: `0x${string}`;
  lookbackBlocks: number;
}): Promise<TransferLog[]> {
  if (!Number.isSafeInteger(options.lookbackBlocks) || options.lookbackBlocks < 1) {
    throw new Error("The transfer-log lookback must be a positive block count.");
  }
  const latestBig = BigInt(await options.rpc.call<string>("eth_blockNumber"));
  if (latestBig > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("The RPC returned an unsafe block number.");
  const latest = Number(latestBig);
  const fromBlock = Math.max(0, latest - options.lookbackBlocks + 1);
  return readTransfersInRange({ ...options, fromBlock, toBlock: latest });
}
