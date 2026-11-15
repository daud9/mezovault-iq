import type { RpcClient } from "./rpc";

/** Confirms that an Activity RPC endpoint is serving the selected network. */
export async function verifyActivityRpcChain(rpc: RpcClient, expectedChainId: number): Promise<void> {
  if (!Number.isSafeInteger(expectedChainId) || expectedChainId < 1) {
    throw new Error("The selected network has an invalid chain ID.");
  }

  const response = await rpc.call<unknown>("eth_chainId");
  if (typeof response !== "string" || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(response)) {
    throw new Error("The RPC returned an invalid chain ID.");
  }

  let actualChainId: bigint;
  try {
    actualChainId = BigInt(response);
  } catch {
    throw new Error("The RPC returned an invalid chain ID.");
  }
  if (actualChainId !== BigInt(expectedChainId)) {
    throw new Error(`The RPC chain ID does not match the selected network (expected ${expectedChainId}, received ${response}).`);
  }
}

/** Runs a read only after the RPC has proved it is on the selected chain. */
export async function withVerifiedActivityChain<T>(
  rpc: RpcClient,
  expectedChainId: number,
  read: () => Promise<T>,
): Promise<T> {
  await verifyActivityRpcChain(rpc, expectedChainId);
  return read();
}

/** Transfer history is visible only for the wallet/network context that loaded it. */
export function isActivityContextCurrent(loadedContext: string | null, selectedContext: string | null): boolean {
  return selectedContext !== null && loadedContext === selectedContext;
}

/** A receipt may only update the requested ledger row when its returned hash agrees. */
export function receiptMatchesRequestedHash(value: unknown, requestedHash: string): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const transactionHash = (value as { transactionHash?: unknown }).transactionHash;
  return typeof transactionHash === "string" && transactionHash.toLowerCase() === requestedHash.toLowerCase();
}
