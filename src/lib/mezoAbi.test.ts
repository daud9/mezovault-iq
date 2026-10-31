import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MEZO_TESTNET_SELECTORS } from "./mezoAbi";

describe("Mezo Testnet verified ABI selector registry", () => {
  it("contains the TroveManager read selectors shown in the verified implementation ABI", () => {
    assert.deepEqual(MEZO_TESTNET_SELECTORS.troveManager, {
      getTroveColl: "0x480cd578",
      getTroveDebt: "0xd66a2553",
      getTroveStatus: "0x21e37801",
    });
  });

  it("contains the BorrowerOperations user-action selectors and keeps payable actions distinct", () => {
    assert.equal(MEZO_TESTNET_SELECTORS.borrowerOperations.addColl, "0x68647db1");
    assert.equal(MEZO_TESTNET_SELECTORS.borrowerOperations.adjustTrove, "0x45c842e6");
    assert.equal(MEZO_TESTNET_SELECTORS.borrowerOperations.repayMUSD, "0xdc283bb3");
    assert.equal(MEZO_TESTNET_SELECTORS.borrowerOperations.openTrove, "0x2f3a6d98");
    assert.equal(MEZO_TESTNET_SELECTORS.borrowerOperations.closeTrove, "0x0e704d50");
  });

  it("keeps the PriceFeed and PriceOracleCaller selectors separate", () => {
    assert.equal(MEZO_TESTNET_SELECTORS.priceFeed.fetchPrice, "0x0fdb11cf");
    assert.equal(MEZO_TESTNET_SELECTORS.priceFeed.oracle, "0x7dc0d1d0");
    assert.equal(MEZO_TESTNET_SELECTORS.priceOracleCaller.latestRoundData, "0xfeaf968c");
  });
});
