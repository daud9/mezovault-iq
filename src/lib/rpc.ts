/**
 * Minimal JSON-RPC client for read-only calls. Every failure becomes a typed RpcError,
 * so callers can show a specific message and never substitute demonstration data.
 */

export type RpcErrorKind =
  | "not-configured"
  | "network"
  | "timeout"
  | "http"
  | "rpc"
  | "invalid-response";

export class RpcError extends Error {
  readonly kind: RpcErrorKind;
  readonly code: number | undefined;

  constructor(kind: RpcErrorKind, message: string, code?: number) {
    super(message);
    this.name = "RpcError";
    this.kind = kind;
    this.code = code;
  }
}

export interface RpcClientOptions {
  url: string | undefined;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface RpcClient {
  call<T>(method: string, params?: unknown[]): Promise<T>;
}

export function createRpcClient(options: RpcClientOptions): RpcClient {
  const url = options.url?.trim();
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  let nextId = 1;

  return {
    async call<T>(method: string, params: unknown[] = []): Promise<T> {
      if (!url) {
        throw new RpcError("not-configured", "No RPC endpoint is configured.");
      }

      const id = nextId++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new RpcError("http", `The RPC endpoint returned HTTP ${response.status}.`, response.status);
        }

        let payload: unknown;
        try {
          payload = await response.json();
        } catch (err) {
          if (isAbortError(err)) throw err;
          throw new RpcError("invalid-response", "The RPC endpoint returned data that is not JSON.");
        }

        if (!isRecord(payload) || payload.jsonrpc !== "2.0" || payload.id !== id) {
          throw new RpcError("invalid-response", "The RPC response has an invalid JSON-RPC version, id, or shape.");
        }
        const hasResult = Object.prototype.hasOwnProperty.call(payload, "result");
        const hasError = Object.prototype.hasOwnProperty.call(payload, "error");
        if (hasResult === hasError) {
          throw new RpcError("invalid-response", "The RPC response must contain exactly one of result or error.");
        }
        if (hasError) {
          const error = payload.error;
          if (!isRecord(error) || !Number.isSafeInteger(error.code) || typeof error.message !== "string") {
            throw new RpcError("invalid-response", "The RPC response contains a malformed error object.");
          }
          throw new RpcError("rpc", error.message, error.code as number);
        }
        return payload.result as T;
      } catch (err) {
        if (err instanceof RpcError) throw err;
        if (isAbortError(err) || controller.signal.aborted) {
          throw new RpcError("timeout", `The RPC endpoint did not respond within ${timeoutMs} ms.`);
        }
        throw new RpcError("network", "The RPC endpoint could not be reached.");
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

function isAbortError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { name?: string }).name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
