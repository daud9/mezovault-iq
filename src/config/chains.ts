/**
 * Blockchain configuration. Kept separate from UI components.
 *
 * Every value below was checked against an official Mezo source. Sources are recorded
 * next to each value so a reviewer can re-check them. Values without a verified source
 * must be left null rather than guessed.
 */
export type MezoNetworkKey = "testnet" | "mainnet";

export const OFFICIAL_SOURCES = {
  developerGuide: "https://mezo.org/docs/developers/getting-started/",
  x402Payments: "https://mezo.org/docs/developers/getting-started/musd-payments-x402/",
  contractsReference: "https://mezo.org/docs/users/resources/contracts-reference/",
  musdRedemptions: "https://mezo.org/docs/developers/musd/musd-redemptions",
  mezoPools: "https://mezo.org/docs/developers/features/mezo-pools",
} as const;

export interface VerifiedAddress {
  address: `0x${string}`;
  source: string;
}

export interface MezoNetworkConfig {
  key: MezoNetworkKey;
  label: string;
  chainId: number;
  chainIdHex: `0x${string}`;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrl: string;
  wssUrl: string | null;
  explorerUrl: string;
  faucetUrl: string | null;
  /** The official MUSD token. null when not verified. */
  musd: (VerifiedAddress & { symbol: "MUSD"; name: "Mezo USD"; decimals: 18 }) | null;
  /** The MEZO token as listed in the official contracts reference. Its testnet deployment is confirmed at runtime. */
  mezo: (VerifiedAddress & { symbol: "MEZO" }) | null;
  /** The official BorrowerOperations proxy. null when not verified. */
  borrowerOperations: VerifiedAddress | null;
  /** Human-readable source note for the network parameters. */
  parametersSource: string;
}

export const MEZO_NETWORKS: Record<MezoNetworkKey, MezoNetworkConfig> = {
  testnet: {
    key: "testnet",
    label: "Mezo Testnet",
    chainId: 31611,
    chainIdHex: "0x7b7b",
    nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
    rpcUrl: "https://rpc.test.mezo.org",
    wssUrl: "wss://rpc-ws.test.mezo.org",
    explorerUrl: "https://explorer.test.mezo.org/",
    faucetUrl: "https://faucet.test.mezo.org/",
    musd: {
      address: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
      source: `${OFFICIAL_SOURCES.contractsReference} and ${OFFICIAL_SOURCES.x402Payments}`,
      symbol: "MUSD",
      name: "Mezo USD",
      decimals: 18,
    },
    mezo: {
      address: "0x7B7c000000000000000000000000000000000001",
      source: OFFICIAL_SOURCES.contractsReference,
      symbol: "MEZO",
    },
    borrowerOperations: {
      address: "0xCdF7028ceAB81fA0C6971208e83fa7872994beE5",
      source: OFFICIAL_SOURCES.musdRedemptions,
    },
    parametersSource: OFFICIAL_SOURCES.developerGuide,
  },
  mainnet: {
    key: "mainnet",
    label: "Mezo Mainnet",
    chainId: 31612,
    chainIdHex: "0x7b7c",
    nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
    rpcUrl: "https://rpc-http.mezo.boar.network",
    wssUrl: "wss://rpc-ws.mezo.boar.network",
    explorerUrl: "https://explorer.mezo.org",
    faucetUrl: null,
    musd: {
      address: "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186",
      source: `${OFFICIAL_SOURCES.contractsReference} and ${OFFICIAL_SOURCES.x402Payments}`,
      symbol: "MUSD",
      name: "Mezo USD",
      decimals: 18,
    },
    mezo: {
      address: "0x7B7c000000000000000000000000000000000001",
      source: OFFICIAL_SOURCES.contractsReference,
      symbol: "MEZO",
    },
    borrowerOperations: {
      address: "0x44b1bac67dDA612a41a58AAf779143B181dEe031",
      source: OFFICIAL_SOURCES.musdRedemptions,
    },
    parametersSource: OFFICIAL_SOURCES.developerGuide,
  },
};
