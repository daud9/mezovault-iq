import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ReadFlightCoordinator } from "./readFlight";

describe("CL Planner read-flight coordination", () => {
  it("does not start another automatic read for the same context until the active read settles", () => {
    const reads = new ReadFlightCoordinator();
    const first = reads.begin("testnet:31611:https://rpc.example");
    assert.ok(first);

    // The automatic refresh callback uses this check before it increments the effect tick.
    assert.equal(reads.isActive(first.context), true);
    assert.equal(reads.begin(first.context), null);
    assert.equal(reads.isCurrent(first), true);

    reads.finish(first);
    const next = reads.begin(first.context);
    assert.ok(next, "a later refresh may start after the prior read settles");
    assert.notEqual(next, first);
  });

  it("allows a new context to take over without letting stale cleanup clear it", () => {
    const reads = new ReadFlightCoordinator();
    const oldContext = reads.begin("testnet:31611:https://rpc-one.example");
    assert.ok(oldContext);

    const newContext = reads.begin("testnet:31611:https://rpc-two.example");
    assert.ok(newContext, "a changed RPC context can start a new read");
    assert.equal(reads.isCurrent(oldContext), false);
    reads.finish(oldContext);
    assert.equal(reads.isCurrent(newContext), true, "old completion cannot clear the newer read");

    reads.cancel(newContext);
    assert.equal(reads.isActive(newContext.context), false, "unmount or effect cleanup invalidates its lease");
  });

  it("lets an explicit manual refresh supersede a same-context read", () => {
    const reads = new ReadFlightCoordinator();
    const first = reads.begin("testnet:31611:https://rpc.example");
    assert.ok(first);

    // The public manual-refresh callback cancels the current lease before ticking the effect.
    reads.cancelContext(first.context);
    const manual = reads.begin(first.context);
    assert.ok(manual);
    assert.equal(reads.isCurrent(first), false);
    reads.finish(first);
    assert.equal(reads.isCurrent(manual), true, "the superseded read cannot clear the manual read");
  });
});
