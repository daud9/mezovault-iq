import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clearX402PendingAttempt,
  readX402PendingAttempt,
  saveX402PendingAttempt,
  type X402PendingAttempt,
} from "./x402CheckoutState.ts";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
  firstValue(): string | null { return this.values.values().next().value ?? null; }
}

describe("browser-local x402 pending checkout state", () => {
  it("persists pending state without storing the bearer link token and clears after confirmed settlement", async () => {
    const storage = new MemoryStorage();
    const token = "private-link-token.payload.signature";
    const attempt: Omit<X402PendingAttempt, "version"> = { attemptedAt: 1_800_000_000_000 };

    assert.equal(await readX402PendingAttempt(token, storage), null);
    await saveX402PendingAttempt(token, attempt, storage);
    assert.equal(storage.firstValue()?.includes(token), false);
    assert.deepEqual(await readX402PendingAttempt(token, storage), { version: 1, ...attempt });

    const transaction = `0x${"ab".repeat(32)}`;
    await saveX402PendingAttempt(token, { ...attempt, transaction }, storage);
    assert.deepEqual(await readX402PendingAttempt(token, storage), { version: 1, ...attempt, transaction });

    await clearX402PendingAttempt(token, storage);
    assert.equal(await readX402PendingAttempt(token, storage), null);
  });

  it("treats a corrupt existing marker as pending rather than allowing a new authorization", async () => {
    const storage = new MemoryStorage();
    const token = "another-private-link-token";
    const key = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const suffix = Array.from(new Uint8Array(key), (byte) => byte.toString(16).padStart(2, "0")).join("");
    storage.setItem(`mezovault-iq:x402:pending:v1:${suffix}`, "not-json");

    assert.deepEqual(await readX402PendingAttempt(token, storage), { version: 1, attemptedAt: 0 });
  });
});
