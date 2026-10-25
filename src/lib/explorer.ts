/**
 * Builds explorer links for contract addresses. The explorer's standard path is /address/<address>.
 * Confirm one link on the device before submission.
 */
import type { MezoNetworkConfig } from "../config/chains";

export function explorerAddressUrl(network: MezoNetworkConfig, address: string): string {
  const base = network.explorerUrl.replace(/\/?$/, "/");
  return `${base}address/${address}`;
}
