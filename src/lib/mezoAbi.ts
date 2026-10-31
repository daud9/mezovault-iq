/**
 * Function selectors transcribed from the exact-match-verified Mezo Testnet
 * implementation ABIs supplied by the project owner via the testnet explorer.
 *
 * These constants identify interfaces only. They do not authorize execution:
 * write operations must also validate network, contract code, current Trove
 * state, sorted-trove hints, transaction value, and wallet review.
 */
export const MEZO_TESTNET_SELECTORS = {
  troveManager: {
    getTroveColl: "0x480cd578", // getTroveColl(address)
    getTroveDebt: "0xd66a2553", // getTroveDebt(address)
    getTroveStatus: "0x21e37801", // getTroveStatus(address)
  },
  priceFeed: {
    fetchPrice: "0x0fdb11cf", // fetchPrice()
    oracle: "0x7dc0d1d0", // oracle()
  },
  priceOracleCaller: {
    latestRoundData: "0xfeaf968c", // latestRoundData()
    decimals: "0x313ce567", // decimals()
  },
  borrowerOperations: {
    addColl: "0x68647db1", // addColl(address,address), payable
    adjustTrove: "0x45c842e6", // adjustTrove(uint256,uint256,bool,address,address), payable
    repayMUSD: "0xdc283bb3", // repayMUSD(uint256,address,address)
    openTrove: "0x2f3a6d98", // openTrove(uint256,address,address), payable
    withdrawColl: "0x5530273c", // withdrawColl(uint256,address,address)
    withdrawMUSD: "0xaf8b4fd0", // withdrawMUSD(uint256,address,address)
    closeTrove: "0x0e704d50", // closeTrove()
  },
} as const;

export type MezoBorrowerOperation = keyof typeof MEZO_TESTNET_SELECTORS.borrowerOperations;
