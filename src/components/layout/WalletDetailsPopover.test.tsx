import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WalletDetailsPopover } from "./WalletDetailsPopover";

it("gives each wallet-details disclosure a unique ARIA control and matching panel", () => {
  const first = createElement(WalletDetailsPopover, {
    open: true,
    onToggle: () => {},
    buttonClassName: "",
    buttonContent: "Wallet one",
    panelClassName: "",
    children: createElement("p", null, "First wallet details"),
  });
  const second = createElement(WalletDetailsPopover, {
    open: true,
    onToggle: () => {},
    buttonClassName: "",
    buttonContent: "Wallet two",
    panelClassName: "",
    children: createElement("p", null, "Second wallet details"),
  });
  const markup = renderToStaticMarkup(createElement("main", null, first, second));
  const controls = [...markup.matchAll(/aria-controls="([^"]+)"/g)].map(([, id]) => id);
  const panels = [...markup.matchAll(/<div id="([^"]+)" role="region" aria-label="Wallet details"/g)].map(([, id]) => id);

  assert.equal(controls.length, 2);
  assert.equal(panels.length, 2);
  assert.equal(new Set(controls).size, 2);
  assert.deepEqual(controls, panels);
});
