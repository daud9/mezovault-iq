import { MEZO_NETWORKS, type MezoNetworkConfig, type MezoNetworkKey } from "./chains";

/**
 * Public, build-time configuration only.
 * VITE_* values are embedded in the browser bundle and must never contain secrets.
 */
const requested = import.meta.env.VITE_DEFAULT_NETWORK as string | undefined;

export const DEFAULT_NETWORK_KEY: MezoNetworkKey =
  requested === "mainnet" ? "mainnet" : "testnet";

export const DEFAULT_NETWORK: MezoNetworkConfig = MEZO_NETWORKS[DEFAULT_NETWORK_KEY];
