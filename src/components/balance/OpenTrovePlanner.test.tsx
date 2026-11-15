import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OpenTrovePlanner } from "./OpenTrovePlanner";

function renderPlanner(overrides: Partial<Parameters<typeof OpenTrovePlanner>[0]> = {}): string {
  return renderToStaticMarkup(createElement(OpenTrovePlanner, {
    live: null,
    collateralBtc: "0.01",
    requestedMusd: "100",
    onCollateralBtcChange: () => {},
    onRequestedMusdChange: () => {},
    ...overrides,
  }));
}

function inputTags(markup: string): string[] {
  return [...markup.matchAll(/<input\b[^>]*>/g)].map(([tag]) => tag);
}

it("keeps both Trove amount fields editable when either amount is cleared", () => {
  for (const values of [
    { collateralBtc: "", requestedMusd: "100" },
    { collateralBtc: "0.01", requestedMusd: "" },
  ]) {
    const inputs = inputTags(renderPlanner(values));
    assert.equal(inputs.length, 2);
    assert.ok(inputs.every((tag) => !/\sdisabled(?:=""|\s|>)/.test(tag)));
  }
});

it("respects an explicit disabled prop for both Trove amount fields", () => {
  const inputs = inputTags(renderPlanner({ disabled: true }));
  assert.equal(inputs.length, 2);
  assert.ok(inputs.every((tag) => /\sdisabled(?:=""|\s|>)/.test(tag)));
});
