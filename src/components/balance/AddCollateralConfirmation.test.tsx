import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AddCollateralConfirmationNotice, type AddCollateralConfirmationReceipt } from "./AddCollateralConfirmation";

it("renders verified collateral receipt details in the parent-level confirmation notice", () => {
  const receipt: AddCollateralConfirmationReceipt = {
    hash: `0x${"ab".repeat(32)}`,
    blockNumber: 123456,
    amountBtc: "0.025",
    account: "0x1234567890abcdef1234567890abcdef12345678",
  };
  const markup = renderToStaticMarkup(createElement(AddCollateralConfirmationNotice, { receipt }));

  assert.match(markup, /BTC addition confirmed/);
  assert.match(markup, /0\.025 BTC/);
  assert.match(markup, /block 123,456/);
  assert.match(markup, new RegExp(`Transaction: ${receipt.hash}`));
  assert.match(markup, /finality is not independently checked/);
});
