import assert from "node:assert/strict";
import test from "node:test";
import { startAutoRefresh, type AutoRefreshEnvironment, type AutoRefreshEvent } from "./autoRefresh";

class FakeEnvironment implements AutoRefreshEnvironment {
  visible = true;
  time = 1_000;
  nextId = 0;
  intervals = new Map<number, { callback: () => void; delayMs: number }>();
  listeners: Record<AutoRefreshEvent, Set<() => void>> = {
    focus: new Set(),
    visibilitychange: new Set(),
  };

  setInterval(callback: () => void, delayMs: number): unknown {
    const id = ++this.nextId;
    this.intervals.set(id, { callback, delayMs });
    return id;
  }
  clearInterval(handle: unknown): void { this.intervals.delete(handle as number); }
  addListener(event: AutoRefreshEvent, listener: () => void): void { this.listeners[event].add(listener); }
  removeListener(event: AutoRefreshEvent, listener: () => void): void { this.listeners[event].delete(listener); }
  isVisible(): boolean { return this.visible; }
  now(): number { return this.time; }
  emit(event: AutoRefreshEvent): void { for (const listener of this.listeners[event]) listener(); }
}

test("automatic reads poll while visible, refresh once on wake, suspend while hidden, and clean up", () => {
  const environment = new FakeEnvironment();
  let reads = 0;
  const stop = startAutoRefresh(() => { reads += 1; }, { intervalMs: 60_000 }, environment);
  const [timer] = environment.intervals.values();
  assert.equal(timer.delayMs, 60_000);

  timer.callback();
  assert.equal(reads, 1);
  environment.emit("focus");
  environment.emit("visibilitychange");
  assert.equal(reads, 2, "duplicate wake events are throttled");

  environment.visible = false;
  timer.callback();
  environment.emit("focus");
  assert.equal(reads, 2, "hidden tabs do not poll or refresh on focus");

  environment.visible = true;
  environment.time += 15_000;
  environment.emit("visibilitychange");
  assert.equal(reads, 3, "returning to a visible tab refreshes after the wake throttle");

  stop();
  assert.equal(environment.intervals.size, 0);
  assert.equal(environment.listeners.focus.size, 0);
  assert.equal(environment.listeners.visibilitychange.size, 0);
});
