/**
 * Reads a wallet's MUSD balance from the official token contract on the configured network.
 *
 * Every failure is returned as a typed result. A failed request never produces a
 * demonstration balance. The token's decimals and symbol are checked on-chain before the
 * balance is formatted, so a wrong contract or unexpected decimals cannot be displayed as MUSD.
 */
import type { MezoNetworkConfig } from "../config/chains";
import { RpcError, type RpcClient } from "./rpc";
import { SELECTORS, decodeAbiString, decodeUint256, encodeBalanceOf, isAddress } from "./abi";
import { formatTokenUnits } from "./tokenAmount";
import { parseChainId } from "./network";

export type MusdBalanceResult =
  | {
      status: "ok";
      balanceRaw: bigint;
      formatted: string;
      exact: string;
      symbol: "MUSD";
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

export interface ReadMusdOptions {
  network: MezoNetworkConfig;
  owner: string;
  rpc: RpcClient;
  now?: () => Date;
}

export async function readMusdBalance(options: ReadMusdOptions): Promise<MusdBalanceResult> {
  const { network, owner, rpc } = options;
  const now = options.now ?? (() => new Date());

  const token = network.musd;
  if (!token) {
    return { status: "not-configured", reason: `No verified MUSD contract is recorded for ${network.label}.` };
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

    const decimals = decodeUint256(await call(rpc, token.address, SELECTORS.decimals));
    if (Number(decimals) !== token.decimals) {
      return {
        status: "error",
        kind: "token-mismatch",
        message: `The token at ${token.address} reports ${decimals} decimals, not the expected ${token.decimals}. The balance was not displayed.`,
      };
    }

    const symbol = decodeAbiString(await call(rpc, token.address, SELECTORS.symbol));
    if (symbol !== token.symbol) {
      return {
        status: "error",
        kind: "token-mismatch",
        message: `The token at ${token.address} reports the symbol "${symbol}", not ${token.symbol}. The balance was not displayed.`,
      };
    }

    const balanceRaw = decodeUint256(await call(rpc, token.address, encodeBalanceOf(owner)));
    const blockNumber = Number(BigInt(await rpc.call<string>("eth_blockNumber")));

    return {
      status: "ok",
      balanceRaw,
      formatted: formatTokenUnits(balanceRaw, token.decimals, 6),
      exact: formatTokenUnits(balanceRaw, token.decimals, token.decimals),
      symbol: "MUSD",
      decimals: token.decimals,
      tokenAddress: token.address,
      chainId,
      blockNumber,
      retrievedAt: now().toISOString(),
    };
  } catch (err) {
    if (err instanceof RpcError) {
      return { status: "error", kind: err.kind, message: err.message };
    }
    return { status: "error", kind: "unknown", message: "The MUSD balance could not be read." };
  }
}

function call(rpc: RpcClient, to: string, data: string): Promise<string> {
  return rpc.call<string>("eth_call", [{ to, data }, "latest"]);
}
