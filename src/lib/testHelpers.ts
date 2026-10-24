/**
 * Test-only helpers: a scripted fake JSON-RPC transport and ABI encoders.
 * Lives under src/lib so the glob used by `npm test` picks it up as a non-test module.
 * It is excluded from the app build because nothing in the app imports it.
 */
export type Handler = (method: string, params: unknown[]) => unknown | Error | { httpStatus: number } | { raw: string };

export function fakeFetch(handler: Handler): { fetchImpl: typeof fetch; calls: { method: string; params: unknown[] }[] } {
  const calls: { method: string; params: unknown[] }[] = [];
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { id: number; method: string; params: unknown[] };
    calls.push({ method: body.method, params: body.params });
    const out = handler(body.method, body.params);

    if (out instanceof Error) throw out;
    if (out && typeof out === "object" && "httpStatus" in out) {
      return new Response("error", { status: (out as { httpStatus: number }).httpStatus });
    }
    if (out && typeof out === "object" && "raw" in out) {
      return new Response((out as { raw: string }).raw, { status: 200 });
    }
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: out }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

export function encodeStringResult(text: string): string {
  const bytes = Buffer.from(text, "utf8");
  const len = bytes.length.toString(16).padStart(64, "0");
  const data = bytes.toString("hex").padEnd(Math.ceil(bytes.length / 32) * 64, "0");
  return `0x${(32).toString(16).padStart(64, "0")}${len}${data}`;
}

export function encodeUintResult(value: bigint): string {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

export const OWNER = "0x1111111111111111111111111111111111111111" as const;
