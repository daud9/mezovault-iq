/**
 * Mezo Basic Pools on Mezo Testnet, copied from the official Mezo Pools documentation
 * (https://mezo.org/docs/developers/features/mezo-pools). This list is limited to the
 * three fungible basic pools; wallet-specific CL NFT positions are read separately by
 * the read-only monitor in `src/lib/clPositions.ts`.
 */
import { OFFICIAL_SOURCES } from "./chains";

export interface PoolRef {
  id: string;
  name: string;
  address: `0x${string}`;
  kind: "volatile" | "stable";
  source: string;
}

export const TESTNET_BASIC_POOLS: PoolRef[] = [
  { id: "musd-btc", name: "MUSD/BTC", address: "0xd16A5Df82120ED8D626a1a15232bFcE2366d6AA9", kind: "volatile", source: OFFICIAL_SOURCES.mezoPools },
  { id: "musd-musdc", name: "MUSD/mUSDC", address: "0x525F049A4494dA0a6c87E3C4df55f9929765Dc3e", kind: "stable", source: OFFICIAL_SOURCES.mezoPools },
  { id: "musd-musdt", name: "MUSD/mUSDT", address: "0x27414B76CF00E24ed087adb56E26bAeEEe93494e", kind: "stable", source: OFFICIAL_SOURCES.mezoPools },
];

/**
 * The MUSD/BTC pool's transferable BTC ERC-20 output, confirmed from the live
 * Mezo Testnet pool reads. This is not native BTC and cannot pay gas.
 */
export const TESTNET_POOL_BTC_TOKEN = {
  address: "0x7b7c000000000000000000000000000000000000" as const,
  symbol: "BTC" as const,
  decimals: 18 as const,
};

/** The official Mezo Testnet basic-pool router and its live default factory. */
export const TESTNET_BASIC_POOL_ROUTER = {
  address: "0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9" as const,
  factory: "0x4947243CC818b627A5D06d14C4eCe7398A23Ce1A" as const,
  source: OFFICIAL_SOURCES.mezoPools,
} as const;
