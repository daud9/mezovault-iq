/**
 * Mezo Basic Pools on Mezo Testnet, copied from the official Mezo Pools documentation
 * (https://mezo.org/docs/developers/features/mezo-pools). Only these addresses are read.
 * Concentrated-liquidity pools are not listed with addresses in the official testnet docs,
 * so they are not read.
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
