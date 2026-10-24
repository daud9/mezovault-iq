/**
 * Mezo protocol availability investigation.
 *
 * Each candidate records where its address came from and what it was verified to do.
 * "verified" is used only where an official Mezo source supports the capability.
 * Anything found only in third-party repositories is recorded as "third-party-only"
 * and is never used by the app.
 *
 * Stage 2 is read-only. No deposit, withdrawal, lending or vault transaction is implemented.
 */
import { OFFICIAL_SOURCES } from "./chains";

export type CapabilityStatus = "verified" | "not-verified" | "not-applicable";

export type ProtocolEvidence =
  | "official-address"
  | "official-docs-no-testnet-address"
  | "third-party-only"
  | "mainnet-only";

export interface ProtocolCandidate {
  id: string;
  name: string;
  purpose: string;
  evidence: ProtocolEvidence;
  /** Address only when an official source records it for the named network. */
  testnetAddress: `0x${string}` | null;
  addressSource: string | null;
  capabilities: {
    deposit: CapabilityStatus;
    withdraw: CapabilityStatus;
    lend: CapabilityStatus;
    borrow: CapabilityStatus;
    yield: CapabilityStatus;
  };
  notes: string;
  /** Whether the app calls this protocol. Always false in this stage. */
  usedByApp: false;
}

const NOT_VERIFIED: ProtocolCandidate["capabilities"] = {
  deposit: "not-verified",
  withdraw: "not-verified",
  lend: "not-verified",
  borrow: "not-verified",
  yield: "not-verified",
};

export const PROTOCOL_CANDIDATES: ProtocolCandidate[] = [
  {
    id: "musd-token",
    name: "MUSD token",
    purpose: "Bitcoin-backed stablecoin, the asset the app reads balances for.",
    evidence: "official-address",
    testnetAddress: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
    addressSource: OFFICIAL_SOURCES.contractsReference,
    capabilities: { deposit: "not-applicable", withdraw: "not-applicable", lend: "not-applicable", borrow: "not-applicable", yield: "not-applicable" },
    notes: "Balance reads only. The token is minted by borrowing against BTC, not by a faucet.",
    usedByApp: false,
  },
  {
    id: "borrower-operations",
    name: "BorrowerOperations",
    purpose: "Opens and manages BTC-collateralised loans that mint MUSD.",
    evidence: "official-address",
    testnetAddress: "0xCdF7028ceAB81fA0C6971208e83fa7872994beE5",
    addressSource: OFFICIAL_SOURCES.musdRedemptions,
    capabilities: { ...NOT_VERIFIED, deposit: "not-verified", borrow: "not-verified", withdraw: "not-verified" },
    notes: "The official source lists this proxy address. Its functions are not verified in this build, and no write call is made.",
    usedByApp: false,
  },
  {
    id: "mezo-earn",
    name: "Mezo Earn",
    purpose: "Gauge and DEX incentive system.",
    evidence: "official-docs-no-testnet-address",
    testnetAddress: null,
    addressSource: OFFICIAL_SOURCES.developerGuide,
    capabilities: { ...NOT_VERIFIED },
    notes: "The official developer guide says deployed addresses exist but does not list the testnet ones in the pages reviewed.",
    usedByApp: false,
  },
  {
    id: "yield-vaults",
    name: "Bitcoin savings and yield vaults",
    purpose: "Vaults that generate yield on BTC or MUSD deposits.",
    evidence: "official-docs-no-testnet-address",
    testnetAddress: null,
    addressSource: null,
    capabilities: { ...NOT_VERIFIED },
    notes: "Mentioned in Mezo's public overview. No testnet vault address or interface was located in official sources.",
    usedByApp: false,
  },
  {
    id: "morpho-musd-vault",
    name: "Morpho Alpha MUSD Core Vault (aMUSD)",
    purpose: "Vault that issues the aMUSD receipt token for deposits.",
    evidence: "official-docs-no-testnet-address",
    testnetAddress: null,
    addressSource: OFFICIAL_SOURCES.contractsReference,
    capabilities: { ...NOT_VERIFIED },
    notes: "Official contracts reference names the vault and receipt token. No testnet address is recorded there.",
    usedByApp: false,
  },
  {
    id: "mezo-router",
    name: "Mezo Router (MUSD/BTC swaps)",
    purpose: "Swap between MUSD and BTC.",
    evidence: "third-party-only",
    testnetAddress: null,
    addressSource: null,
    capabilities: { ...NOT_VERIFIED },
    notes: "A router address appears only in third-party repositories. It is not used.",
    usedByApp: false,
  },
  {
    id: "collat-vault",
    name: "Collat CollatVault (third-party)",
    purpose: "BTC collateral vault for card spending, built by a third party.",
    evidence: "third-party-only",
    testnetAddress: null,
    addressSource: null,
    capabilities: { ...NOT_VERIFIED },
    notes: "Built by an outside team on Mezo. Not an official Mezo contract, so it is not used.",
    usedByApp: false,
  },
];

export function verifiedCapabilityCount(): number {
  return PROTOCOL_CANDIDATES.reduce(
    (count, p) => count + Object.values(p.capabilities).filter((c) => c === "verified").length,
    0,
  );
}
