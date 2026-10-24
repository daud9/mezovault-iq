import { MEZO_NETWORKS, type MezoNetworkConfig } from "../config/chains";

/** Parses an EIP-695 hex chain id ("0x7b7b") or a number. Returns null for anything else. */
export function parseChainId(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value === "string" && /^0x[0-9a-fA-F]+$/.test(value)) {
    const n = Number(BigInt(value));
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  }
  return null;
}

export type NetworkCheck =
  | { status: "match"; network: MezoNetworkConfig }
  | { status: "unknown-chain"; actualChainId: null }
  | { status: "mismatch"; actualChainId: number; expected: MezoNetworkConfig; actualLabel: string | null };

/**
 * Verifies that the wallet is on the network the app expects.
 * A chain that is not in the configured set is reported as a mismatch, never as a match.
 */
export function checkNetwork(actualChainId: number | null, expected: MezoNetworkConfig): NetworkCheck {
  if (actualChainId === null) return { status: "unknown-chain", actualChainId: null };
  if (actualChainId === expected.chainId) return { status: "match", network: expected };

  const known = Object.values(MEZO_NETWORKS).find((n) => n.chainId === actualChainId) ?? null;
  return {
    status: "mismatch",
    actualChainId,
    expected,
    actualLabel: known ? known.label : null,
  };
}
