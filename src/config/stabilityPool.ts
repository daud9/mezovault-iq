/**
 * Mezo Testnet Stability Pool deployment. Addresses are cross-checked against
 * the official matsnet artifact and the verified explorer proxy source.
 */
export const TESTNET_STABILITY_POOL = {
  chainId: 31611,
  proxy: "0x1CCA7E410eE41739792eA0A24e00349Dd247680e" as const,
  // Corrected from the owner note: the explorer constructor and official artifact
  // both include the extra `f` in `...AF4Bf6A...`.
  implementation: "0x8f0cA419bB1D54AF4Bf6A644f605cC247d6d3E19" as const,
  eip1967ImplementationSlot: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const,
  sourceUrl: "https://github.com/mezo-org/musd/blob/main/solidity/contracts/StabilityPool.sol",
  deploymentArtifactUrl: "https://github.com/mezo-org/musd/blob/main/solidity/artifacts/deployments/matsnet/StabilityPool.json",
  proxyExplorerUrl: "https://explorer.test.mezo.org/address/0x1CCA7E410eE41739792eA0A24e00349Dd247680e?tab=contract",
  implementationExplorerUrl: "https://explorer.test.mezo.org/address/0x8f0cA419bB1D54AF4Bf6A644f605cC247d6d3E19?tab=contract",
} as const;
