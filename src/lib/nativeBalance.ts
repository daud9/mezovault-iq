/**
 * Native BTC (gas token) balance via eth_getBalance. Uses the same RPC client and chain
 * check as the MUSD reader, and never returns a fabricated value on failure.
 */
import type { MezoNetworkConfig } from "../config/chains";
import { isAddress } from "./abi";
import { RpcError, type RpcClient } from "./rpc";
import { parseChainId } from "./network";
import { formatTokenUnits } from "./tokenAmount";

export type NativeBalanceResult =
  | {
      status: "ok";
      balanceRaw: bigint;
      formatted: string;
      exact: string;
      symbol: string;
      decimals: number;
      chainId: number;
      blockNumber: number;
      retrievedAt: string;
    }
  | { status: "wrong-network"; actualChainId: number | null; expectedChainId: number }
  | { status: "error"; kind: string; message: string };

export async function readNativeBalance(options: {
  network: MezoNetworkConfig;
  owner: string;
  rpc: RpcClient;
  now?: () => Date;
}): Promise<NativeBalanceResult> {
  const { network, owner, rpc } = options;
  const now = options.now ?? (() => new Date());
  if (!isAddress(owner)) {
    return { status: "error", kind: "invalid-input", message: "The connected address is not a valid EVM address." };
  }
  try {
    const chainId = parseChainId(await rpc.call<string>("eth_chainId"));
    if (chainId !== network.chainId) {
      return { status: "wrong-network", actualChainId: chainId, expectedChainId: network.chainId };
    }
    const hex = await rpc.call<string>("eth_getBalance", [owner, "latest"]);
    if (typeof hex !== "string" || !/^0x[0-9a-fA-F]+$/.test(hex)) {
      return { status: "error", kind: "invalid-response", message: "The balance response was not valid hex." };
    }
    const balanceRaw = BigInt(hex);
    const blockNumber = Number(BigInt(await rpc.call<string>("eth_blockNumber")));
    const { decimals, symbol } = network.nativeCurrency;
    return {
      status: "ok",
      balanceRaw,
      formatted: formatTokenUnits(balanceRaw, decimals, 6),
      exact: formatTokenUnits(balanceRaw, decimals, decimals),
      symbol,
      decimals,
      chainId,
      blockNumber,
      retrievedAt: now().toISOString(),
    };
  } catch (err) {
    if (err instanceof RpcError) return { status: "error", kind: err.kind, message: err.message };
    return { status: "error", kind: "unknown", message: "The BTC balance could not be read." };
  }
}
