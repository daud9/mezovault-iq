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

      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
          signal: controller.signal,
        });
      } catch (err) {
        if (isAbortError(err)) {
          throw new RpcError("timeout", `The RPC endpoint did not respond within ${timeoutMs} ms.`);
        }
        throw new RpcError("network", "The RPC endpoint could not be reached.");
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        throw new RpcError("http", `The RPC endpoint returned HTTP ${response.status}.`, response.status);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new RpcError("invalid-response", "The RPC endpoint returned data that is not JSON.");
      }

      if (typeof payload !== "object" || payload === null) {
        throw new RpcError("invalid-response", "The RPC response has an unexpected shape.");
      }

      const body = payload as { id?: unknown; result?: unknown; error?: { code?: number; message?: string } };

      if (body.error) {
        throw new RpcError("rpc", body.error.message ?? "The RPC endpoint returned an error.", body.error.code);
      }

      if (body.id !== id) {
        throw new RpcError("invalid-response", "The RPC response id does not match the request.");
      }

      if (body.result === undefined) {
        throw new RpcError("invalid-response", `The RPC response for ${method} has no result.`);
      }

      return body.result as T;
    },
  };
}

function isAbortError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { name?: string }).name === "AbortError";
}
