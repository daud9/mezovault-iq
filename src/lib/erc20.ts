/**
 * Generic read-only ERC-20 balance reader for tokens other than MUSD.
 * Checks the contract code, the on-chain symbol and the on-chain decimals before formatting.
 * Nothing is substituted when a read fails. The MUSD reader in musd.ts is unchanged.
 */
import type { MezoNetworkConfig } from "../config/chains";
import { SELECTORS, decodeAbiString, decodeUint256, encodeBalanceOf, isAddress } from "./abi";
import { RpcError, type RpcClient } from "./rpc";
import { parseChainId } from "./network";
import { formatTokenUnits } from "./tokenAmount";

export interface TokenRef {
  address: `0x${string}`;
  symbol: string;
}

export type Erc20BalanceResult =
  | {
      status: "ok";
      balanceRaw: bigint;
      formatted: string;
      exact: string;
      symbol: string;
      decimals: number;
      tokenAddress: `0x${string}`;
      chainId: number;
      blockNumber: number;
      retrievedAt: string;
    }
  | { status: "not-configured"; reason: string }
  | { status: "wrong-network"; actualChainId: number | null; expectedChainId: number }
  | { status: "no-contract"; tokenAddress: `0x${string}` }
  | { status: "error"; kind: string; message: string };

export async function readErc20Balance(options: {
  network: MezoNetworkConfig;
  token: TokenRef | null;
  owner: string;
  rpc: RpcClient;
  now?: () => Date;
}): Promise<Erc20BalanceResult> {
  const { network, token, owner, rpc } = options;
  const now = options.now ?? (() => new Date());

  if (!token) {
    return { status: "not-configured", reason: `No verified token contract is recorded for ${network.label}.` };
  }
  if (!isAddress(owner)) {
    return { status: "error", kind: "invalid-input", message: "The connected address is not a valid EVM address." };
  }

  try {
    const chainId = parseChainId(await rpc.call<string>("eth_chainId"));
    if (chainId !== network.chainId) {
      return { status: "wrong-network", actualChainId: chainId, expectedChainId: network.chainId };
    }

    const code = await rpc.call<string>("eth_getCode", [token.address, "latest"]);
    if (typeof code !== "string" || code === "0x" || code === "0x0") {
      return { status: "no-contract", tokenAddress: token.address };
    }

    const symbol = decodeAbiString(await call(rpc, token.address, SELECTORS.symbol));
    if (symbol !== token.symbol) {
      return {
        status: "error",
        kind: "token-mismatch",
        message: `The token at ${token.address} reports the symbol "${symbol}", not ${token.symbol}. No balance is shown.`,
      };
    }

    const decimalsRaw = decodeUint256(await call(rpc, token.address, SELECTORS.decimals));
    if (decimalsRaw > 78n) {
      return { status: "error", kind: "token-mismatch", message: "The token reports an unsupported number of decimals." };
    }
    const decimals = Number(decimalsRaw);

    const balanceRaw = decodeUint256(await call(rpc, token.address, encodeBalanceOf(owner)));
    const blockNumber = Number(BigInt(await rpc.call<string>("eth_blockNumber")));

    return {
      status: "ok",
      balanceRaw,
      formatted: formatTokenUnits(balanceRaw, decimals, Math.min(6, decimals)),
      exact: formatTokenUnits(balanceRaw, decimals, decimals),
      symbol,
      decimals,
      tokenAddress: token.address,
      chainId,
      blockNumber,
      retrievedAt: now().toISOString(),
    };
  } catch (err) {
    if (err instanceof RpcError) return { status: "error", kind: err.kind, message: err.message };
    return { status: "error", kind: "unknown", message: "The token balance could not be read." };
  }
}

function call(rpc: RpcClient, to: string, data: string): Promise<string> {
  return rpc.call<string>("eth_call", [{ to, data }, "latest"]);
}
