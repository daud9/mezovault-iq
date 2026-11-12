/**
 * Public bridge-tracker configuration. Values are from the official Mezo Testnet
 * NTT deployment manifest; this config is read-only and contains no credentials.
 * https://github.com/mezo-org/ntt-bridge-mezo-testnet/blob/main/deployment.json
 */
export const MEZO_TESTNET_NTT = {
  networkName: "Mezo Testnet",
  managerAddress: "0xde402D7021f3F7F00be5D0Ab5C238B2bE1d2904F",
  transceiverAddress: "0xA55dB3D16228A3AD146aC393256d1D5e14558eD4",
  tokenAddress: "0x7B7c000000000000000000000000000000000001",
  wormholescanApi: "https://api.testnet.wormholescan.io/api/v1",
  explorerUrl: "https://explorer.test.mezo.org/",
  deploymentSource: "https://github.com/mezo-org/ntt-bridge-mezo-testnet/blob/main/deployment.json",
  bridgeDocs: "https://testnet.mezo.org/docs/de/docs/users/mezo/mezo-bridge/",
  wormholescanDocs: "https://wormhole.com/docs/products/messaging/guides/wormholescan-api/",
} as const;

/** Wormholescan supports pageSize for the recent-operations query; keep the lookup bounded. */
export const BRIDGE_TRACKER_PAGE_SIZE = 100;
