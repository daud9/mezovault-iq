import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { explorerAddressUrl } from "./explorer";
import { MEZO_NETWORKS } from "../config/chains";

describe("explorer links", () => {
  it("builds the testnet address link with a single slash", () => {
    assert.equal(
      explorerAddressUrl(MEZO_NETWORKS.testnet, "0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0"),
      "https://explorer.test.mezo.org/address/0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0",
    );
  });
});
