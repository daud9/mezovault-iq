import { OFFICIAL_SOURCES } from "./chains";

/** Official Mezo Testnet Slipstream concentrated-liquidity deployments. */
export const TESTNET_CL_CONTRACTS = {
  chainId: 31_611,
  factory: "0x7B61BC8Aa460476d142F1CD107A47297002f69ff" as const,
  poolImplementation: "0xfB28eA9eC9f01775bD42E92BafeE9584808419CD" as const,
  positionManager: "0x9B753e11bFEd0D88F6e1D2777E3c7dac42F96062" as const,
  gaugeFactory: "0x5b0dbAfdcE363d6662F36163D91862B0a3808373" as const,
  gaugeImplementation: "0x1aE1a27b709A5eb4BbcF7B7AA2c28620c593a3EE" as const,
  swapRouter: "0x3112908bB72ce9c26a321Eeb22EC8e051F3b6E6a" as const,
  positionDescriptor: "0xD6018646aE1d7fAA849D2369e6157050051F0e51" as const,
  source: OFFICIAL_SOURCES.mezoPools,
  addressesSource: OFFICIAL_SOURCES.contractsReference,
} as const;
