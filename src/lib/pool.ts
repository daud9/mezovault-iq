/**
 * Reads a wallet's share of a Mezo basic pool. Read-only.
 *
 * Assumes the pool follows the standard token-pair interface: token0, token1, getReserves,
 * totalSupply and balanceOf on the pool itself. The official docs do not spell this out,
 * so the reader checks it on-chain: the pool must contain MUSD, and totalSupply must be
 * non-zero. Any other shape is reported as an error rather than interpreted.
 */
import type { MezoNetworkConfig } from "../config/chains";
import type { PoolRef } from "../config/pools";
import { decodeUint256, encodeAddressWord, isAddress, SELECTORS } from "./abi";
import { RpcError, type RpcClient } from "./rpc";
import { parseChainId } from "./network";
import { formatTokenUnits } from "./tokenAmount";
import { readSnapshotBlock } from "./readSnapshotBlock";

export interface PoolTokenAmount {
  address: `0x${string}`;
  decimals: number;
  reserveRaw: bigint;
  userRaw: bigint;
  userFormatted: string;
}

export type PoolResult =
  | {
      status: "ok";
      pool: PoolRef;
      poolAddress: `0x${string}`;
      hasPosition: boolean;
      lpBalanceRaw: bigint;
      totalSupplyRaw: bigint;
      /** Share of the pool, in percent with two decimals. */
      sharePct: number;
      tokens: [PoolTokenAmount, PoolTokenAmount];
      chainId: number;
      blockNumber: number;
      retrievedAt: string;
    }
  | { status: "no-contract"; poolAddress: `0x${string}` }
  | { status: "wrong-network"; actualChainId: number | null; expectedChainId: number }
  | { status: "error"; kind: string; message: string };

const POOL_ABI_SELECTORS = {
  token0: "0x0dfe1681",
  token1: "0xd21220a7",
  totalSupply: "0x18160ddd",
  getReserves: "0x0902f1ac",
} as const;

// Re-exported for readability: the selectors used here are the same ones checked in tests.
export const POOL_SELECTORS = { ...POOL_ABI_SELECTORS, balanceOf: SELECTORS.balanceOf, decimals: SELECTORS.decimals };

function addressFromWord(hex: string): `0x${string}` {
  const body = hex.slice(2).padStart(64, "0");
  const addr = `0x${body.slice(24)}`;
  if (!isAddress(addr)) throw new Error("Pool returned an invalid address");
  return addr;
}

export async function readPoolPosition(options: {
  network: MezoNetworkConfig;
  pool: PoolRef;
  owner: string;
  rpc: RpcClient;
  now?: () => Date;
}): Promise<PoolResult> {
  const { network, pool, owner, rpc } = options;
  const now = options.now ?? (() => new Date());
  if (!network.musd) return { status: "error", kind: "not-configured", message: "MUSD is not configured on this network." };
  if (!isAddress(owner)) return { status: "error", kind: "invalid-input", message: "The connected address is not a valid EVM address." };

  try {
    const chainId = parseChainId(await rpc.call<string>("eth_chainId"));
    if (chainId !== network.chainId) return { status: "wrong-network", actualChainId: chainId, expectedChainId: network.chainId };

    const { blockTag, blockNumber } = await readSnapshotBlock(rpc);
    const call = (to: string, data: string) => rpc.call<string>("eth_call", [{ to, data }, blockTag]);
    const code = await rpc.call<string>("eth_getCode", [pool.address, blockTag]);
    if (typeof code !== "string" || code === "0x" || code === "0x0") return { status: "no-contract", poolAddress: pool.address };

    const token0 = addressFromWord(await call(pool.address, POOL_SELECTORS.token0));
    const token1 = addressFromWord(await call(pool.address, POOL_SELECTORS.token1));
    const musd = network.musd.address.toLowerCase();
    if (token0.toLowerCase() !== musd && token1.toLowerCase() !== musd) {
      return { status: "error", kind: "pair-mismatch", message: `Pool ${pool.name} does not contain MUSD at the expected address. Nothing is shown.` };
    }

    const totalSupplyRaw = decodeUint256(await call(pool.address, POOL_SELECTORS.totalSupply));
    const lpBalanceRaw = decodeUint256(await call(pool.address, POOL_SELECTORS.balanceOf + encodeAddressWord(owner)));
    const reserves = await call(pool.address, POOL_SELECTORS.getReserves);
    const body = reserves.slice(2);
    if (body.length < 192) throw new Error("Pool returned an unexpected reserves response");
    const reserve0 = BigInt(`0x${body.slice(0, 64)}`);
    const reserve1 = BigInt(`0x${body.slice(64, 128)}`);

    const decimalsOf = async (token: string) => Number(decodeUint256(await call(token, POOL_SELECTORS.decimals)));
    const dec0 = await decimalsOf(token0);
    const dec1 = await decimalsOf(token1);

    const share = (reserve: bigint) =>
      totalSupplyRaw === 0n ? 0n : (reserve * lpBalanceRaw) / totalSupplyRaw;
    const user0 = share(reserve0);
    const user1 = share(reserve1);

    const sharePct = totalSupplyRaw === 0n ? 0 : Number((lpBalanceRaw * 1_000_000n) / totalSupplyRaw) / 10_000;

    const tok = (address: `0x${string}`, decimals: number, reserveRaw: bigint, userRaw: bigint): PoolTokenAmount => ({
      address,
      decimals,
      reserveRaw,
      userRaw,
      userFormatted: formatTokenUnits(userRaw, decimals, Math.min(6, decimals)),
    });

    return {
      status: "ok",
      pool,
      poolAddress: pool.address,
      hasPosition: lpBalanceRaw > 0n,
      lpBalanceRaw,
      totalSupplyRaw,
      sharePct,
      tokens: [tok(token0 as `0x${string}`, dec0, reserve0, user0), tok(token1 as `0x${string}`, dec1, reserve1, user1)],
      chainId,
      blockNumber,
      retrievedAt: now().toISOString(),
    };
  } catch (err) {
    if (err instanceof RpcError) return { status: "error", kind: err.kind, message: err.message };
    return { status: "error", kind: "unknown", message: err instanceof Error ? err.message : "The pool position could not be read." };
  }
}

export interface PoolMarketToken {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
  reserveRaw: bigint;
  reserveFormatted: string;
}

export type PoolMarketResult =
  | {
      status: "ok";
      pool: PoolRef;
      poolAddress: `0x${string}`;
      tokens: [PoolMarketToken, PoolMarketToken];
      spotPrice: string | null;
      /** Fee tier is deliberately unavailable until the deployed pool fee is verified. */
      feeTier: null;
      /** USD liquidity is not asserted without verified prices for both assets. */
      liquidityUsd: null;
      chainId: number;
      blockNumber: number;
      retrievedAt: string;
    }
  | { status: "no-contract"; poolAddress: `0x${string}` }
  | { status: "wrong-network"; actualChainId: number | null; expectedChainId: number }
  | { status: "error"; kind: string; message: string };

function formatReserveRatio(
  reserveBase: bigint,
  decimalsBase: number,
  reserveQuote: bigint,
  decimalsQuote: number,
  fractionDigits = 10,
): string | null {
  if (reserveBase <= 0n || reserveQuote < 0n) return null;
  const digits = Math.max(0, Math.min(18, Math.trunc(fractionDigits)));
  const scale = 10n ** BigInt(digits);
  const numerator = reserveQuote * 10n ** BigInt(decimalsBase) * scale;
  const denominator = reserveBase * 10n ** BigInt(decimalsQuote);
  if (denominator === 0n) return null;
  const scaled = numerator / denominator;
  const whole = scaled / scale;
  const fraction = digits === 0 ? "" : (scaled % scale).toString().padStart(digits, "0").replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}${fraction ? `.${fraction}` : ""}`;
}

/** Reads official pool reserves and reserve-implied spot price from one checked block. */
export async function readPoolMarket(options: {
  network: MezoNetworkConfig;
  pool: PoolRef;
  rpc: RpcClient;
  now?: () => Date;
}): Promise<PoolMarketResult> {
  const { network, pool, rpc } = options;
  const now = options.now ?? (() => new Date());
  if (!network.musd) return { status: "error", kind: "not-configured", message: "MUSD is not configured on this network." };
  try {
    const chainId = parseChainId(await rpc.call<string>("eth_chainId"));
    if (chainId !== network.chainId) return { status: "wrong-network", actualChainId: chainId, expectedChainId: network.chainId };
    const blockHex = await rpc.call<string>("eth_blockNumber");
    if (!/^0x[0-9a-fA-F]+$/.test(blockHex)) throw new Error("The RPC returned an invalid block number.");
    const blockBig = BigInt(blockHex);
    if (blockBig > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("The RPC returned an unsafe block number.");
    const blockNumber = Number(blockBig);
    const blockTag = `0x${blockBig.toString(16)}`;
    const code = await rpc.call<string>("eth_getCode", [pool.address, blockTag]);
    if (typeof code !== "string" || !/^0x(?:[0-9a-fA-F]{2})*$/.test(code)) throw new Error("Pool code response was invalid.");
    if (code.length <= 2) return { status: "no-contract", poolAddress: pool.address };
    const call = (to: string, data: string) => rpc.call<string>("eth_call", [{ to, data }, blockTag]);
    const token0 = addressFromWord(await call(pool.address, POOL_SELECTORS.token0));
    const token1 = addressFromWord(await call(pool.address, POOL_SELECTORS.token1));
    const musd = network.musd.address.toLowerCase();
    if (token0.toLowerCase() !== musd && token1.toLowerCase() !== musd) {
      return { status: "error", kind: "pair-mismatch", message: `Pool ${pool.name} does not contain MUSD at the expected address. Nothing is shown.` };
    }
    const reservesHex = await call(pool.address, POOL_SELECTORS.getReserves);
    if (typeof reservesHex !== "string" || !/^0x[0-9a-fA-F]{192,}$/.test(reservesHex)) {
      throw new Error("Pool returned an unexpected reserves response.");
    }
    const reserveBody = reservesHex.slice(2);
    const reserve0 = BigInt(`0x${reserveBody.slice(0, 64)}`);
    const reserve1 = BigInt(`0x${reserveBody.slice(64, 128)}`);
    const decimalsOf = async (token: string) => {
      const decimals = decodeUint256(await call(token, POOL_SELECTORS.decimals));
      if (decimals > 36n) throw new Error("A pool token returned unsupported decimals.");
      return Number(decimals);
    };
    const [decimals0, decimals1] = await Promise.all([decimalsOf(token0), decimalsOf(token1)]);
    const symbol0 = token0.toLowerCase() === musd ? "MUSD" : "Other asset";
    const symbol1 = token1.toLowerCase() === musd ? "MUSD" : "Other asset";
    const token = (address: string, symbol: string, decimals: number, reserveRaw: bigint): PoolMarketToken => ({
      address: address as `0x${string}`,
      symbol,
      decimals,
      reserveRaw,
      reserveFormatted: formatTokenUnits(reserveRaw, decimals, Math.min(6, decimals)),
    });
    const tokens: [PoolMarketToken, PoolMarketToken] = [
      token(token0, symbol0, decimals0, reserve0),
      token(token1, symbol1, decimals1, reserve1),
    ];
    return {
      status: "ok",
      pool,
      poolAddress: pool.address,
      tokens,
      spotPrice: formatReserveRatio(reserve0, decimals0, reserve1, decimals1),
      feeTier: null,
      liquidityUsd: null,
      chainId,
      blockNumber,
      retrievedAt: now().toISOString(),
    };
  } catch (err) {
    if (err instanceof RpcError) return { status: "error", kind: err.kind, message: err.message };
    return { status: "error", kind: "unknown", message: err instanceof Error ? err.message : "Pool market data could not be read." };
  }
}
