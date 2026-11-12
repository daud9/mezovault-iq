/**
 * Function selectors transcribed from owner-supplied exact-match-verified Mezo
 * Testnet ABIs and the official Mezo MUSD matsnet deployment ABI artifacts.
 *
 * These constants identify interfaces only; they do not authorize execution.
 * Only the separate wallet-reviewed openTrove flow uses a write selector; the
 * planner stays read-only and all other borrower operations remain disabled.
 */
export const MEZO_TESTNET_SELECTORS = {
  troveManager: {
    getTroveColl: "0x480cd578", // getTroveColl(address)
    getTroveDebt: "0xd66a2553", // getTroveDebt(address)
    getTroveStatus: "0x21e37801", // getTroveStatus(address)
    checkRecoveryMode: "0x4e443d9e", // checkRecoveryMode(uint256)
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
    minNetDebt: "0x969c2452", // minNetDebt()
    borrowingRate: "0xb5b8453e", // borrowingRate()
    governableVariables: "0x5556a7ce", // governableVariables()
    gasCompensation: "0x7af110ba", // MUSD_GAS_COMPENSATION()
    mcr: "0x794e5724", // MCR()
    ccr: "0x5733d58f", // CCR()
    getEntireSystemColl: "0x887105d3", // getEntireSystemColl()
    getEntireSystemDebt: "0x795d26c3", // getEntireSystemDebt()
    addColl: "0x68647db1", // addColl(address,address), payable
    adjustTrove: "0x45c842e6", // adjustTrove(uint256,uint256,bool,address,address), payable
    repayMUSD: "0xdc283bb3", // repayMUSD(uint256,address,address)
    openTrove: "0x2f3a6d98", // openTrove(uint256,address,address), payable
    withdrawColl: "0x5530273c", // withdrawColl(uint256,address,address)
    withdrawMUSD: "0xaf8b4fd0", // withdrawMUSD(uint256,address,address)
    closeTrove: "0x0e704d50", // closeTrove()
  },
  governableVariables: {
    feeExemptAccounts: "0x42c16ed1", // feeExemptAccounts(address)
  },
} as const;

/** Known borrower operation names; listing a selector does not enable its transaction path. */
export type MezoBorrowerOperation =
  | "addColl"
  | "adjustTrove"
  | "repayMUSD"
  | "openTrove"
  | "withdrawColl"
  | "withdrawMUSD"
  | "closeTrove";
