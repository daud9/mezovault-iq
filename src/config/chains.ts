/**
 * Blockchain configuration. Kept separate from UI components.
 * Values verified against Mezo developer documentation (Oct 2026).
 * Stage 1 reads configuration only; no transactions are sent.
 */
export type MezoNetworkKey = "testnet" | "mainnet";

export interface MezoNetworkConfig {
  key: MezoNetworkKey;
  label: string;
  chainId: number;
  caip2: string;
  rpcUrl: string;
  explorerUrl: string;
  faucetUrl?: string;
  musd: {
    symbol: "MUSD";
    address: `0x${string}`;
    decimals: 18;
  };
}

export const MEZO_NETWORKS: Record<MezoNetworkKey, MezoNetworkConfig> = {
  testnet: {
    key: "testnet",
    label: "Mezo Testnet",
    chainId: 31611,
    caip2: "eip155:31611",
    rpcUrl: "https://rpc.test.mezo.org",
    explorerUrl: "https://explorer.test.mezo.org",
    faucetUrl: "https://faucet.test.mezo.org",
    musd: {
      symbol: "MUSD",
      address: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
      decimals: 18,
    },
  },
  mainnet: {
    key: "mainnet",
    label: "Mezo Mainnet",
    chainId: 31612,
    caip2: "eip155:31612",
    rpcUrl: "https://mezo.drpc.org",
    explorerUrl: "https://explorer.mezo.org",
    musd: {
      symbol: "MUSD",
      address: "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186",
      decimals: 18,
    },
  },
};
