import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toFunctionSelector } from "viem";
import { MEZO_TESTNET_SELECTORS } from "./mezoAbi";

describe("Mezo Testnet verified ABI selector registry", () => {
  it("contains the TroveManager read selectors shown in the verified implementation ABI", () => {
    assert.deepEqual(MEZO_TESTNET_SELECTORS.troveManager, {
      getTroveColl: "0x480cd578",
      getTroveDebt: "0xd66a2553",
      getTroveStatus: "0x21e37801",
      checkRecoveryMode: "0x4e443d9e",
    });
  });

  it("contains the read-only open-trove parameter selectors from the official matsnet artifacts", () => {
    assert.deepEqual(
      {
        minNetDebt: MEZO_TESTNET_SELECTORS.borrowerOperations.minNetDebt,
        borrowingRate: MEZO_TESTNET_SELECTORS.borrowerOperations.borrowingRate,
        governableVariables: MEZO_TESTNET_SELECTORS.borrowerOperations.governableVariables,
        gasCompensation: MEZO_TESTNET_SELECTORS.borrowerOperations.gasCompensation,
        mcr: MEZO_TESTNET_SELECTORS.borrowerOperations.mcr,
        ccr: MEZO_TESTNET_SELECTORS.borrowerOperations.ccr,
        systemColl: MEZO_TESTNET_SELECTORS.borrowerOperations.getEntireSystemColl,
        systemDebt: MEZO_TESTNET_SELECTORS.borrowerOperations.getEntireSystemDebt,
        feeExemptAccounts: MEZO_TESTNET_SELECTORS.governableVariables.feeExemptAccounts,
      },
      {
        minNetDebt: "0x969c2452",
        borrowingRate: "0xb5b8453e",
        governableVariables: "0x5556a7ce",
        gasCompensation: "0x7af110ba",
        mcr: "0x794e5724",
        ccr: "0x5733d58f",
        systemColl: "0x887105d3",
        systemDebt: "0x795d26c3",
        feeExemptAccounts: "0x42c16ed1",
      },
    );
  });

  it("contains the BorrowerOperations user-action selectors and keeps payable actions distinct", () => {
    assert.equal(MEZO_TESTNET_SELECTORS.borrowerOperations.addColl, "0x68647db1");
    assert.equal(toFunctionSelector("addColl(address,address)"), MEZO_TESTNET_SELECTORS.borrowerOperations.addColl);
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
