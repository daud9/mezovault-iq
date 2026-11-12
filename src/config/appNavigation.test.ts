import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { APP_NAV, APP_ROUTE_REDIRECTS } from "./appNavigation";

describe("app navigation and legacy route alias", () => {
  it("keeps the working Simulation Lab in primary navigation", () => {
    assert.ok(APP_NAV.some((item) => item.to === "/app/simulation" && item.label === "Simulation Lab"));
  });

  it("uses the accurate bridge tracker label and canonical route", () => {
    assert.ok(APP_NAV.some((item) => item.to === "/app/bridge-status" && item.label === "Bridge Status Tracker"));
  });

  it("does not expose the removed Protocol Evidence page in navigation", () => {
    assert.equal(
      APP_NAV.some((item) => item.to === "/app/protocol-evidence" || item.label === "Protocol Evidence"),
      false,
    );
  });

  it("preserves the legacy bridge route only", () => {
    assert.deepEqual(APP_ROUTE_REDIRECTS, [
      { path: "bridge-rescue", to: "/app/bridge-status" },
    ]);
  });
});
