import {
  CHAIN_WATCH_NETWORKS,
  WATCHED_SYMBOLS,
  type ChainWatchNetworkConfig,
  type ChainWatchSymbol,
} from "../config/chainWatch";
import { decodeAbiString, decodeUint256, encodeBalanceOf, isAddress, SELECTORS } from "./abi";
import { parseChainId } from "./network";
import { createRpcClient, RpcError } from "./rpc";
import { formatTokenUnits } from "./tokenAmount";

export type ChainWatchTokenBalance =
  | {
      status: "ok";
      tokenAddress: `0x${string}`;
      balanceRaw: bigint;
      formatted: string;
      symbol: ChainWatchSymbol;
      decimals: number;
    }
  | {
      status: "unavailable";
      tokenAddress: `0x${string}`;
      reason: string;
    }
  | { status: "not-supported" };

export interface ChainWatchNetworkBalance {
  network: ChainWatchNetworkConfig;
  status: "available" | "unavailable";
  message: string | null;
  blockNumber: string | null;
  retrievedAt: string | null;
  tokens: Record<ChainWatchSymbol, ChainWatchTokenBalance>;
}

export interface ChainWatchReadOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => Date;
}

const ADDRESS_REQUIRED = "Enter a valid 0x-prefixed 20-byte EVM address.";

/**
 * Reads balances for the explicitly selected public address only. It never uses an injected
 * wallet, signing API, storage, or a balance/price indexer. Each chain is checked independently.
 */
export async function readChainWatchNetwork(
  network: ChainWatchNetworkConfig,
  ownerInput: string,
  options: ChainWatchReadOptions = {},
): Promise<ChainWatchNetworkBalance> {
  const owner = ownerInput.trim();
  if (!isAddress(owner)) throw new Error(ADDRESS_REQUIRED);

  const rpc = createRpcClient({
    url: network.rpcUrl,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
  });
  const now = options.now ?? (() => new Date());

  let blockTag: `0x${string}`;
  let blockNumber: string;
  try {
    const actualChainId = parseChainId(await rpc.call<string>("eth_chainId"));
    if (actualChainId !== network.chainId) {
      return unavailableNetwork(network, `RPC chain ID did not match ${network.chainId}; no balance is shown.`);
    }

    const blockHex = await rpc.call<string>("eth_blockNumber");
    if (!/^0x[0-9a-fA-F]+$/.test(blockHex)) throw new Error("Invalid block number");
    const blockValue = BigInt(blockHex);
    blockTag = `0x${blockValue.toString(16)}`;
    blockNumber = blockValue.toString(10);
  } catch (error) {
    return unavailableNetwork(network, safeNetworkFailure(error));
  }

  const tokenEntries = await Promise.all(WATCHED_SYMBOLS.map(async (symbol) => {
    const token = network.tokens[symbol];
    if (!token) return [symbol, { status: "not-supported" } satisfies ChainWatchTokenBalance] as const;
    return [symbol, await readTokenBalance(token, owner, blockTag, rpc)] as const;
  }));

  const tokens = Object.fromEntries(tokenEntries) as Record<ChainWatchSymbol, ChainWatchTokenBalance>;
  return {
    network,
    status: "available",
    message: null,
    blockNumber,
    retrievedAt: now().toISOString(),
    tokens,
  };
}

export async function readChainWatchBalances(
  owner: string,
  options: ChainWatchReadOptions = {},
): Promise<ChainWatchNetworkBalance[]> {
  if (!isAddress(owner.trim())) throw new Error(ADDRESS_REQUIRED);
  return Promise.all(CHAIN_WATCH_NETWORKS.map((network) => readChainWatchNetwork(network, owner, options)));
}

async function readTokenBalance(
  token: NonNullable<ChainWatchNetworkConfig["tokens"][ChainWatchSymbol]>,
  owner: string,
  blockTag: `0x${string}`,
  rpc: ReturnType<typeof createRpcClient>,
): Promise<ChainWatchTokenBalance> {
  const failed = (reason: string): ChainWatchTokenBalance => ({
    status: "unavailable",
    tokenAddress: token.address,
    reason,
  });

  try {
    const code = await rpc.call<string>("eth_getCode", [token.address, blockTag]);
    if (typeof code !== "string" || !/^0x(?:[0-9a-fA-F]{2})+$/.test(code) || /^0x0+$/i.test(code)) {
      return failed("No contract bytecode was found at the verified token address; balance withheld.");
    }

    const [symbolData, decimalsData] = await Promise.all([
      rpc.call<string>("eth_call", [{ to: token.address, data: SELECTORS.symbol }, blockTag]),
      rpc.call<string>("eth_call", [{ to: token.address, data: SELECTORS.decimals }, blockTag]),
    ]);
    const actualSymbol = decodeAbiString(symbolData);
    if (actualSymbol !== token.symbol) {
      return failed("The on-chain symbol did not match the verified token; balance withheld.");
    }

    const decimalsRaw = decodeUint256(decimalsData);
    if (decimalsRaw !== BigInt(token.decimals)) {
      return failed("The on-chain decimals did not match the verified value; balance withheld.");
    }

    const balanceData = await rpc.call<string>(
      "eth_call",
      [{ to: token.address, data: encodeBalanceOf(owner) }, blockTag],
    );
    const balanceRaw = decodeUint256(balanceData);
    return {
      status: "ok",
      tokenAddress: token.address,
      balanceRaw,
      formatted: formatTokenUnits(balanceRaw, token.decimals, token.decimals),
      symbol: token.symbol,
      decimals: token.decimals,
    };
  } catch {
    return failed("The public RPC or token check failed; no balance is shown.");
  }
}

function unavailableNetwork(network: ChainWatchNetworkConfig, message: string): ChainWatchNetworkBalance {
  const tokens = Object.fromEntries(WATCHED_SYMBOLS.map((symbol) => {
    const token = network.tokens[symbol];
    const result: ChainWatchTokenBalance = token
      ? { status: "unavailable", tokenAddress: token.address, reason: message }
      : { status: "not-supported" };
    return [symbol, result];
  })) as Record<ChainWatchSymbol, ChainWatchTokenBalance>;

  return {
    network,
    status: "unavailable",
    message,
    blockNumber: null,
    retrievedAt: null,
    tokens,
  };
}

function safeNetworkFailure(error: unknown): string {
  if (error instanceof RpcError && error.kind === "timeout") {
    return "The public RPC timed out; no balance is shown for this network.";
  }
  return "The public RPC could not verify this network; no balance is shown.";
}
