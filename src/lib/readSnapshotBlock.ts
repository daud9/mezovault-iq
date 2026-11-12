import type { RpcClient } from "./rpc";

export interface RpcSnapshotBlock {
  blockTag: `0x${string}`;
  blockNumber: number;
}

/** Reads one canonical block height and returns the exact tag to use for every snapshot call. */
export async function readSnapshotBlock(rpc: RpcClient): Promise<RpcSnapshotBlock> {
  const hex = await rpc.call<string>("eth_blockNumber");
  if (typeof hex !== "string" || !/^0x[0-9a-fA-F]+$/.test(hex)) {
    throw new Error("The RPC returned an invalid block number.");
  }
  const value = BigInt(hex);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("The RPC returned an unsafe block number.");
  }
  return { blockTag: `0x${value.toString(16)}`, blockNumber: Number(value) };
}
