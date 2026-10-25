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
  blockNumber: number;
  from: `0x${string}`;
  to: `0x${string}`;
  valueRaw: bigint;
  direction: "incoming" | "outgoing";
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
  topics: string[];
  data: string;
}, direction: "incoming" | "outgoing"): TransferLog {
  if (log.topics.length < 3 || log.topics[0].toLowerCase() !== TRANSFER_TOPIC) throw new Error("Not a Transfer event");
  return {
    txHash: log.transactionHash,
    blockNumber: Number(BigInt(log.blockNumber)),
    from: addressFromTopic(log.topics[1]),
    to: addressFromTopic(log.topics[2]),
    valueRaw: BigInt(log.data === "0x" ? "0x0" : log.data),
    direction,
  };
}

/** Reads recent transfers in both directions, newest first. The RPC may refuse large ranges, so callers handle errors. */
export async function readRecentTransfers(options: {
  rpc: RpcClient;
  token: `0x${string}`;
  owner: `0x${string}`;
  lookbackBlocks: number;
}): Promise<TransferLog[]> {
  const latest = Number(BigInt(await options.rpc.call<string>("eth_blockNumber")));
  const fromBlock = Math.max(0, latest - options.lookbackBlocks);
  const out: TransferLog[] = [];
  for (const direction of ["incoming", "outgoing"] as const) {
    const logs = await options.rpc.call<{ transactionHash: string; blockNumber: string; topics: string[]; data: string }[]>(
      "eth_getLogs",
      [logFilter({ token: options.token, owner: options.owner, direction, fromBlock, toBlock: latest })],
    );
    for (const l of logs) out.push(decodeTransferLog(l, direction));
  }
  return out.sort((a, b) => b.blockNumber - a.blockNumber);
}
