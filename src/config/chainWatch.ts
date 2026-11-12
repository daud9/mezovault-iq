import { OFFICIAL_SOURCES } from "./chains";

export const CHAIN_WATCH_SOURCES = {
  buildathon: "https://mezo.org/blog/mezo-buildathon-is-underway/",
  contracts: OFFICIAL_SOURCES.contractsReference,
  developerGuide: OFFICIAL_SOURCES.developerGuide,
  publicNode: "https://publicnode.com/",
  musdBridge: "https://mezo.org/docs/users/borrow/musd-bridge/",
  mezoBridge: "https://mezo.org/docs/users/mezo/mezo-bridge",
} as const;

export const WATCHED_SYMBOLS = ["MUSD", "MEZO"] as const;
export type ChainWatchSymbol = (typeof WATCHED_SYMBOLS)[number];

export interface ChainWatchTokenConfig {
  symbol: ChainWatchSymbol;
  address: `0x${string}`;
  /** Expected value is checked against the live token contract before any balance is shown. */
  decimals: 18;
  source: string;
}

export interface ChainWatchNetworkConfig {
  key: "mezo-mainnet" | "ethereum" | "base" | "bnb" | "mezo-testnet";
  label: string;
  chainId: number;
  rpcUrl: string;
  rpcProvider: string;
  explorerUrl: string;
  tokens: Partial<Record<ChainWatchSymbol, ChainWatchTokenConfig>>;
}

const mainnetMusd: ChainWatchTokenConfig = {
  symbol: "MUSD",
  address: "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186",
  decimals: 18,
  source: CHAIN_WATCH_SOURCES.contracts,
};

const mainnetMezo: ChainWatchTokenConfig = {
  symbol: "MEZO",
  address: "0x7B7c000000000000000000000000000000000001",
  decimals: 18,
  source: CHAIN_WATCH_SOURCES.contracts,
};

const bridgedMezo: ChainWatchTokenConfig = {
  symbol: "MEZO",
  address: "0x8e4cbBcc33dB6c0a18561fDE1F6bA35906d4848b",
  decimals: 18,
  source: CHAIN_WATCH_SOURCES.contracts,
};

export const CHAIN_WATCH_NETWORKS: readonly ChainWatchNetworkConfig[] = [
  {
    key: "mezo-mainnet",
    label: "Mezo Mainnet",
    chainId: 31612,
    rpcUrl: "https://rpc-http.mezo.boar.network",
    rpcProvider: "Mezo public RPC",
    explorerUrl: "https://explorer.mezo.org/",
    tokens: { MUSD: mainnetMusd, MEZO: mainnetMezo },
  },
  {
    key: "ethereum",
    label: "Ethereum",
    chainId: 1,
    rpcUrl: "https://ethereum-rpc.publicnode.com",
    rpcProvider: "PublicNode shared RPC",
    explorerUrl: "https://etherscan.io/",
    tokens: { MUSD: mainnetMusd, MEZO: bridgedMezo },
  },
  {
    key: "base",
    label: "Base",
    chainId: 8453,
    rpcUrl: "https://base-rpc.publicnode.com",
    rpcProvider: "PublicNode shared RPC",
    explorerUrl: "https://basescan.org/",
    tokens: { MUSD: mainnetMusd, MEZO: bridgedMezo },
  },
  {
    key: "bnb",
    label: "BNB Chain",
    chainId: 56,
    rpcUrl: "https://bsc-rpc.publicnode.com",
    rpcProvider: "PublicNode shared RPC",
    explorerUrl: "https://bscscan.com/",
    tokens: { MEZO: bridgedMezo },
  },
  {
    key: "mezo-testnet",
    label: "Mezo Testnet",
    chainId: 31611,
    rpcUrl: "https://rpc.test.mezo.org",
    rpcProvider: "Mezo Testnet public RPC",
    explorerUrl: "https://explorer.test.mezo.org/",
    tokens: {
      MUSD: {
        symbol: "MUSD",
        address: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
        decimals: 18,
        source: CHAIN_WATCH_SOURCES.contracts,
      },
      MEZO: {
        symbol: "MEZO",
        address: "0x7B7c000000000000000000000000000000000001",
        decimals: 18,
        source: CHAIN_WATCH_SOURCES.contracts,
      },
    },
  },
];

export const CHAIN_WATCH_BRIDGE_GUIDES = [
  {
    symbol: "MUSD" as const,
    route: "Mezo ↔ Ethereum ↔ Base",
    note: "BNB Chain is not a supported MUSD route. No testnet bridge route is claimed here.",
    href: CHAIN_WATCH_SOURCES.musdBridge,
  },
  {
    symbol: "MEZO" as const,
    route: "Mezo ↔ Ethereum ↔ Base ↔ BNB Chain",
    note: "Solana is also in Mezo's guide, but this first version is EVM-only.",
    href: CHAIN_WATCH_SOURCES.mezoBridge,
  },
] as const;
