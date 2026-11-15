const STORAGE_PREFIX = "mezovault-iq:x402:pending:v1:";
const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export interface X402PendingAttempt {
  version: 1;
  attemptedAt: number;
  transaction?: string;
}

type PendingStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getStorage(storage?: PendingStorage): PendingStorage {
  if (storage) return storage;
  if (typeof window === "undefined") throw new Error("Browser storage is unavailable.");
  return window.localStorage;
}

async function getStorageKey(linkToken: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(linkToken));
  const suffix = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${STORAGE_PREFIX}${suffix}`;
}

function parsePendingAttempt(value: string): X402PendingAttempt {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return { version: 1, attemptedAt: 0 };
    const record = parsed as Record<string, unknown>;
    if (record.version !== 1 || !Number.isSafeInteger(record.attemptedAt) || (record.attemptedAt as number) < 0) {
      return { version: 1, attemptedAt: 0 };
    }
    if (record.transaction !== undefined && (typeof record.transaction !== "string" || !HASH_PATTERN.test(record.transaction))) {
      return { version: 1, attemptedAt: 0 };
    }
    return {
      version: 1,
      attemptedAt: record.attemptedAt as number,
      ...(typeof record.transaction === "string" ? { transaction: record.transaction } : {}),
    };
  } catch {
    // A corrupt existing marker still blocks another authorization; do not treat it as proof of no attempt.
    return { version: 1, attemptedAt: 0 };
  }
}

export async function readX402PendingAttempt(linkToken: string, storage?: PendingStorage): Promise<X402PendingAttempt | null> {
  const target = getStorage(storage);
  const value = target.getItem(await getStorageKey(linkToken));
  return value === null ? null : parsePendingAttempt(value);
}

export async function saveX402PendingAttempt(
  linkToken: string,
  attempt: Omit<X402PendingAttempt, "version">,
  storage?: PendingStorage,
): Promise<void> {
  if (!Number.isSafeInteger(attempt.attemptedAt) || attempt.attemptedAt < 0) throw new Error("Invalid pending-attempt time.");
  if (attempt.transaction !== undefined && !HASH_PATTERN.test(attempt.transaction)) throw new Error("Invalid pending transaction hash.");
  const record: X402PendingAttempt = { version: 1, ...attempt };
  getStorage(storage).setItem(await getStorageKey(linkToken), JSON.stringify(record));
}

export async function clearX402PendingAttempt(linkToken: string, storage?: PendingStorage): Promise<void> {
  getStorage(storage).removeItem(await getStorageKey(linkToken));
}
