import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { APP_NAV, MOBILE_MORE_NAV, MOBILE_PRIMARY_NAV } from "./appNavigation";

describe("app navigation", () => {
  it("leads with Trove, risk analysis, Overview, and Pool Watch", () => {
    assert.deepEqual(APP_NAV.slice(0, 4).map((item) => item.to), [
      "/app/trove",
      "/app/trove-risk",
      "/app",
      "/app/pools",
    ]);
  });

  it("keeps useful wallet actions available below the primary tools", () => {
    assert.ok(APP_NAV.some((item) => item.to === "/app/swap"));
    assert.ok(APP_NAV.some((item) => item.to === "/app/send"));
    assert.ok(APP_NAV.some((item) => item.to === "/app/pay-links"));
    assert.equal(MOBILE_PRIMARY_NAV.some((item) => item.to === "/app/swap" || item.to === "/app/send"), false);
  });

  it("uses a concise Bridge Status label and canonical route", () => {
    assert.ok(APP_NAV.some((item) => item.to === "/app/bridge-status" && item.label === "Bridge Status"));
  });

  it("keeps four core phone links and retains every other route in More", () => {
    assert.deepEqual(MOBILE_PRIMARY_NAV.map((item) => item.to), [
      "/app/trove",
      "/app/trove-risk",
      "/app",
      "/app/pools",
    ]);
    const allMobileRoutes = [...MOBILE_PRIMARY_NAV, ...MOBILE_MORE_NAV].map((item) => item.to);
    assert.equal(allMobileRoutes.length, APP_NAV.length);
    assert.deepEqual([...allMobileRoutes].sort(), APP_NAV.map((item) => item.to).sort());
    assert.equal(new Set(allMobileRoutes).size, APP_NAV.length);
  });

  it("does not list removed or unavailable page surfaces", () => {
    const routes = APP_NAV.map((item) => item.to);
    assert.equal(routes.includes("/app/simulation"), false);
    assert.equal(routes.includes("/app/protocol-evidence"), false);
    assert.equal(routes.includes("/app/bridge-rescue"), false);
  });
});
