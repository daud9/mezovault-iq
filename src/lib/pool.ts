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

  const call = (to: string, data: string) => rpc.call<string>("eth_call", [{ to, data }, "latest"]);

  try {
    const chainId = parseChainId(await rpc.call<string>("eth_chainId"));
    if (chainId !== network.chainId) return { status: "wrong-network", actualChainId: chainId, expectedChainId: network.chainId };

    const code = await rpc.call<string>("eth_getCode", [pool.address, "latest"]);
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

    const blockNumber = Number(BigInt(await rpc.call<string>("eth_blockNumber")));
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
