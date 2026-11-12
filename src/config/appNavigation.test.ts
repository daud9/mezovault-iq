import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { APP_NAV, APP_ROUTE_REDIRECTS } from "./appNavigation";

describe("app navigation and retired route redirects", () => {
  it("keeps unavailable strategy and automation placeholders out of primary navigation", () => {
    const paths = APP_NAV.map((item) => item.to);
    assert.equal(paths.includes("/app/strategies"), false);
    assert.equal(paths.includes("/app/allocation"), false);
    assert.equal(paths.includes("/app/autopilot"), false);
  });

  it("uses the accurate bridge tracker label and canonical route", () => {
    assert.ok(APP_NAV.some((item) => item.to === "/app/bridge-status" && item.label === "Bridge Status Tracker"));
  });

  it("redirects old and unavailable routes without exposing placeholders", () => {
    assert.deepEqual(APP_ROUTE_REDIRECTS, [
      { path: "strategies", to: "/app" },
      { path: "allocation", to: "/app" },
      { path: "autopilot", to: "/app" },
      { path: "bridge-rescue", to: "/app/bridge-status" },
    ]);
  });
});
