import { MEZO_NETWORKS, type MezoNetworkConfig, type MezoNetworkKey } from "./chains";

/**
 * Public, build-time configuration only.
 * VITE_* values are embedded in the browser bundle and must never contain secrets.
 */
const requested = import.meta.env.VITE_DEFAULT_NETWORK as string | undefined;

export const DEFAULT_NETWORK_KEY: MezoNetworkKey =
  requested === "mainnet" ? "mainnet" : "testnet";

export const DEFAULT_NETWORK: MezoNetworkConfig = MEZO_NETWORKS[DEFAULT_NETWORK_KEY];

/**
 * RPC override for the testnet. Falls back to the official endpoint in chains.ts.
 * An empty value is treated as "not set".
 */
export function resolveRpcUrl(network: MezoNetworkConfig): string {
  const override =
    network.key === "testnet"
      ? (import.meta.env.VITE_MEZO_TESTNET_RPC as string | undefined)
      : undefined;
  const trimmed = override?.trim();
  return trimmed ? trimmed : network.rpcUrl;
}
