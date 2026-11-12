import { OFFICIAL_SOURCES } from "./chains";

export type EvidenceState = "confirmed" | "partial" | "not-verified";
export interface EvidenceCheck {
  state: EvidenceState;
  detail: string;
}
export interface ProtocolEvidenceRecord {
  id: string;
  name: string;
  purpose: string;
  address: `0x${string}` | null;
  source: string | null;
  documented: EvidenceCheck;
  deployed: EvidenceCheck;
  sourceVerified: EvidenceCheck;
  operationallyTested: EvidenceCheck;
  /** The date of the stored repository evidence record, not a fresh network check. */
  lastCheck: string | null;
  candidateOnly?: boolean;
  notes: string;
}

const CHECK_DATE = "2026-11-12 repository evidence record; not a live re-check";
const confirmed = (detail: string): EvidenceCheck => ({ state: "confirmed", detail });
const partial = (detail: string): EvidenceCheck => ({ state: "partial", detail });
const unknown = (detail: string): EvidenceCheck => ({ state: "not-verified", detail });

/** Evidence labels describe records and checks; they are not protocol safety ratings. */
export const PROTOCOL_EVIDENCE: ProtocolEvidenceRecord[] = [
  {
    id: "musd-token",
    name: "MUSD token",
    purpose: "Testnet token used for wallet balance reads.",
    address: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
    source: OFFICIAL_SOURCES.contractsReference,
    documented: confirmed("Official Mezo contract reference records the Testnet address."),
    deployed: partial("The balance reader checks code when it runs; this board has not repeated a live check."),
    sourceVerified: unknown("No implementation-source verification is recorded here."),
    operationallyTested: partial("Read-only balance calls are supported; token economics are not evaluated."),
    lastCheck: CHECK_DATE,
    notes: "A token address and readable balance do not establish a dollar value, yield, or lending capability.",
  },
  {
    id: "borrower-operations",
    name: "BorrowerOperations proxy",
    purpose: "Read-only source of live Trove parameters; no Trove transaction flow is enabled.",
    address: "0xCdF7028ceAB81fA0C6971208e83fa7872994beE5",
    source: OFFICIAL_SOURCES.musdRedemptions,
    documented: confirmed("Official Mezo Testnet contract address is recorded."),
    deployed: partial("The read-only snapshot checks code when it runs; this board has not repeated a live check."),
    sourceVerified: partial("Repository evidence records explorer source verification and an implementation ABI; independent proxy re-resolution remains pending."),
    operationallyTested: partial("Read-only parameter snapshots are exercised; no general Trove transaction is enabled or claimed."),
    lastCheck: CHECK_DATE,
    notes: "General borrowing, repayment, adjustment, withdrawal, and close operations remain unavailable.",
  },
  {
    id: "trove-manager",
    name: "TroveManager proxy",
    purpose: "Read-only source for wallet Trove collateral, debt, and status.",
    address: "0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0",
    source: OFFICIAL_SOURCES.musdRedemptions,
    documented: confirmed("Official Mezo Testnet contract address is recorded."),
    deployed: partial("Reads target the configured address; a current deployment check is not recorded by this board."),
    sourceVerified: partial("Explorer method evidence is recorded; full implementation identity and independent live verification remain pending."),
    operationallyTested: partial("Read selectors have local tests; tests do not prove live RPC behavior."),
    lastCheck: CHECK_DATE,
    notes: "Trove reads are not general transaction support.",
  },
  {
    id: "price-feed",
    name: "PriceFeed proxy",
    purpose: "Read-only BTC/USD price source used by Trove calculations.",
    address: "0x86bCF0841622a5dAC14A313a15f96A95421b9366",
    source: OFFICIAL_SOURCES.musdRedemptions,
    documented: confirmed("Official Mezo Testnet PriceFeed address is recorded."),
    deployed: partial("The read-only snapshot checks code when it runs; this board has not repeated a live check."),
    sourceVerified: partial("Explorer ABI and owner-supplied evidence are recorded; implementation identity is not independently re-resolved here."),
    operationallyTested: partial("Oracle freshness is checked by the read-only snapshot when it runs; no standalone live test is recorded here."),
    lastCheck: CHECK_DATE,
    notes: "This price source does not create MUSD or MEZO portfolio-dollar totals.",
  },
  {
    id: "pool-musd-btc",
    name: "MUSD/BTC basic pool",
    purpose: "Official Testnet pool monitored for reserves and reserve-implied spot price.",
    address: "0xd16A5Df82120ED8D626a1a15232bFcE2366d6AA9",
    source: OFFICIAL_SOURCES.mezoPools,
    documented: confirmed("Listed in official Mezo Pools Testnet documentation."),
    deployed: partial("Pool Watch checks code at the read block; a live result appears only after a successful read."),
    sourceVerified: unknown("Pool implementation source and fee behavior have not been independently verified."),
    operationallyTested: partial("Pool Watch reads reserves and spot price only when the configured RPC succeeds."),
    lastCheck: CHECK_DATE,
    notes: "Fee tier and USD liquidity are not verified; no APY or recommendation is shown.",
  },
  {
    id: "pool-musd-musdc",
    name: "MUSD/mUSDC basic pool",
    purpose: "Official Testnet pool monitored for reserves and reserve-implied spot price.",
    address: "0x525F049A4494dA0a6c87E3C4df55f9929765Dc3e",
    source: OFFICIAL_SOURCES.mezoPools,
    documented: confirmed("Listed in official Mezo Pools Testnet documentation."),
    deployed: partial("Pool Watch checks code at the read block; a live result appears only after a successful read."),
    sourceVerified: unknown("Pool implementation source and fee behavior have not been independently verified."),
    operationallyTested: partial("Pool Watch reads reserves and spot price only when the configured RPC succeeds."),
    lastCheck: CHECK_DATE,
    notes: "Fee tier and USD liquidity are not verified; no APY or recommendation is shown.",
  },
  {
    id: "pool-musd-musdt",
    name: "MUSD/mUSDT basic pool",
    purpose: "Official Testnet pool monitored for reserves and reserve-implied spot price.",
    address: "0x27414B76CF00E24ed087adb56E26bAeEEe93494e",
    source: OFFICIAL_SOURCES.mezoPools,
    documented: confirmed("Listed in official Mezo Pools Testnet documentation."),
    deployed: partial("Pool Watch checks code at the read block; a live result appears only after a successful read."),
    sourceVerified: unknown("Pool implementation source and fee behavior have not been independently verified."),
    operationallyTested: partial("Pool Watch reads reserves and spot price only when the configured RPC succeeds."),
    lastCheck: CHECK_DATE,
    notes: "Fee tier and USD liquidity are not verified; no APY or recommendation is shown.",
  },
  {
    id: "mezo-router",
    name: "Mezo Router",
    purpose: "Documented router associated with the basic pools.",
    address: "0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9",
    source: OFFICIAL_SOURCES.mezoPools,
    documented: confirmed("Address is recorded in the repository's official-pool evidence."),
    deployed: unknown("No current deployment check is recorded."),
    sourceVerified: partial("Explorer verification is noted in repository records; router behavior is not independently validated here."),
    operationallyTested: unknown("No swap or router operation is performed by this app."),
    lastCheck: CHECK_DATE,
    notes: "Swap functions and parameters are not verified in this app; no swap is offered.",
  },
  {
    id: "morpho-musd-vault",
    name: "Morpho Alpha MUSD Core Vault (aMUSD)",
    purpose: "Vault documented for Ethereum, not established as a Mezo Testnet vault.",
    address: null,
    source: OFFICIAL_SOURCES.contractsReference,
    documented: partial("Named in the official contracts reference, which identifies it as Ethereum-only."),
    deployed: unknown("No Mezo Testnet deployment is established."),
    sourceVerified: unknown("No Mezo Testnet implementation is available to verify."),
    operationallyTested: unknown("No deposit, withdrawal, or yield operation is tested."),
    lastCheck: CHECK_DATE,
    notes: "No Testnet address, asset mapping, live share price, or rate source is recorded.",
  },
  {
    id: "opturafi-range",
    name: "OpturaFi Range",
    purpose: "Candidate protocol; validation is pending.",
    address: null,
    source: null,
    documented: unknown("No authoritative documentation or implementation source is recorded in this repository."),
    deployed: unknown("No Mezo Testnet deployment has been verified."),
    sourceVerified: unknown("The implementation and deployed source have not been verified."),
    operationallyTested: unknown("Assets, market behavior, and operation have not been validated."),
    lastCheck: null,
    candidateOnly: true,
    notes: "Candidate only. Do not treat it as a deployed vault or product until implementation, assets, and operation are validated.",
  },
];
