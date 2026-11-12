import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getBridgeStage, lookupMezoNttTransaction, normalizeMezoTxHash, operationRoute } from "./bridgeTracker";
import { MEZO_TESTNET_NTT, BRIDGE_TRACKER_PAGE_SIZE } from "../config/bridge";

const TX = `0x${"ab".repeat(32)}`;
const OTHER_TX = `0x${"cd".repeat(32)}`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("Mezo Testnet bridge tracker", () => {
  it("accepts only a 32-byte 0x-prefixed EVM transaction hash and normalizes case", () => {
    assert.equal(normalizeMezoTxHash(`  ${TX.toUpperCase().replace("0X", "0x")}  `), TX);
    assert.equal(normalizeMezoTxHash("0x1234"), null);
    assert.equal(normalizeMezoTxHash("ab".repeat(32)), null);
    assert.equal(normalizeMezoTxHash(`0x${"gg".repeat(32)}`), null);
  });

  it("classifies an indexed source, an available VAA, and an indexed destination", () => {
    assert.equal(getBridgeStage({ sourceChain: { transaction: { txHash: TX } } }), "source-indexed");
    assert.equal(getBridgeStage({ sourceChain: { transaction: { txHash: TX } }, vaa: { raw: "0xvaa" } }), "attestation-available");
    assert.equal(getBridgeStage({ sourceChain: { transaction: { txHash: TX } }, targetChain: { transaction: { txHash: OTHER_TX } } }), "destination-indexed");
    assert.equal(getBridgeStage({}), "unknown");
    assert.equal(getBridgeStage({ targetChain: {} }), "unknown");
  });

  it("queries only the configured transceiver and compares the user's hash locally", async () => {
    let requestedUrl = "";
    const fetchImpl: typeof fetch = async (input) => {
      requestedUrl = String(input);
      return jsonResponse({ operations: [
        { sourceChain: { transaction: { txHash: OTHER_TX } } },
        {
          sourceChain: { chainId: 100, status: "confirmed", transaction: { txHash: TX } },
          vaa: { raw: "0xvaa" },
          content: { standarizedProperties: { fromChain: 100, toChain: 2 } },
        },
      ] });
    };

    const result = await lookupMezoNttTransaction(TX.toUpperCase().replace("0X", "0x"), { fetchImpl });
    const url = new URL(requestedUrl);
    assert.equal(url.searchParams.get("address"), MEZO_TESTNET_NTT.transceiverAddress);
    assert.equal(url.searchParams.get("pageSize"), String(BRIDGE_TRACKER_PAGE_SIZE));
    assert.equal(url.searchParams.has("txHash"), false);
    assert.equal(requestedUrl.includes(TX), false);
    assert.equal(result.stage, "attestation-available");
    assert.equal(result.checkedRecords, 2);
    assert.equal(operationRoute(result.operation!).fromChain, 100);
    assert.equal(operationRoute(result.operation!).toChain, 2);
  });

  it("returns not-found without inferring failure when the hash is not in the indexed page", async () => {
    const fetchImpl: typeof fetch = async () => jsonResponse({ operations: [] });
    const result = await lookupMezoNttTransaction(TX, { fetchImpl });
    assert.equal(result.operation, null);
    assert.equal(result.stage, "not-found");
    assert.equal(result.checkedRecords, 0);
    assert.equal(result.pageSize, 100);
  });

  it("rejects invalid input before making a network request", async () => {
    let called = false;
    const fetchImpl: typeof fetch = async () => { called = true; return jsonResponse({ operations: [] }); };
    await assert.rejects(lookupMezoNttTransaction("not-a-hash", { fetchImpl }), /valid 0x-prefixed/);
    assert.equal(called, false);
  });

  it("keeps the lookup timeout active while reading the response body", async () => {
    const fetchImpl: typeof fetch = async (_input, init) => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        const delayedBody = setTimeout(() => {
          controller.enqueue(new TextEncoder().encode('{"operations":[]}'));
          controller.close();
        }, 100);
        const abort = () => {
          clearTimeout(delayedBody);
          controller.error(new DOMException("Aborted", "AbortError"));
        };
        if (init?.signal?.aborted) abort();
        else init?.signal?.addEventListener("abort", abort, { once: true });
      },
    }), { headers: { "Content-Type": "application/json" } });

    await assert.rejects(lookupMezoNttTransaction(TX, { fetchImpl, timeoutMs: 20 }), /lookup timed out/);
  });

  it("does not turn HTTP or malformed index responses into a status", async () => {
    await assert.rejects(lookupMezoNttTransaction(TX, { fetchImpl: async () => jsonResponse({}, 503) }), /HTTP 503/);
    await assert.rejects(lookupMezoNttTransaction(TX, { fetchImpl: async () => jsonResponse({ data: [] }) }), /unexpected response/);
  });
});
