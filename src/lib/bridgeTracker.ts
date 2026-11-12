import { BRIDGE_TRACKER_PAGE_SIZE, MEZO_TESTNET_NTT } from "../config/bridge";

export type BridgeStage = "source-indexed" | "attestation-available" | "destination-indexed" | "unknown";

export interface WormholeChainRecord {
  chainId?: number;
  status?: string;
  timestamp?: string;
  transaction?: { txHash?: string };
  from?: string;
  to?: string;
}

export interface WormholeOperation {
  id?: string;
  emitterChain?: number;
  emitterAddress?: { hex?: string; native?: string };
  sequence?: string;
  vaa?: { raw?: string; guardianSetIndex?: number; isDuplicated?: boolean } | null;
  sourceChain?: WormholeChainRecord | null;
  targetChain?: WormholeChainRecord | null;
  content?: {
    standarizedProperties?: {
      fromChain?: number;
      toChain?: number;
      fromAddress?: string;
      toAddress?: string;
    };
    standardizedProperties?: {
      fromChain?: number;
      toChain?: number;
      fromAddress?: string;
      toAddress?: string;
    };
  };
}

export interface BridgeLookupResult {
  operation: WormholeOperation | null;
  stage: BridgeStage | "not-found";
  checkedRecords: number;
  pageSize: number;
}

export interface BridgeLookupOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeMezoTxHash(value: string): string | null {
  const trimmed = value.trim();
  return /^0x[0-9a-fA-F]{64}$/.test(trimmed) ? trimmed.toLowerCase() : null;
}

function sourceTransactionHash(operation: unknown): string | null {
  if (!isRecord(operation) || !isRecord(operation.sourceChain)) return null;
  const transaction = operation.sourceChain.transaction;
  if (!isRecord(transaction) || typeof transaction.txHash !== "string") return null;
  return normalizeMezoTxHash(transaction.txHash);
}

export function getBridgeStage(operation: WormholeOperation): BridgeStage {
  if (operation.targetChain?.transaction?.txHash) return "destination-indexed";
  if (operation.vaa?.raw) return "attestation-available";
  if (operation.sourceChain?.transaction?.txHash) return "source-indexed";
  return "unknown";
}

/**
 * Search the latest indexed NTT operations for the official Mezo Testnet transceiver.
 * The user-supplied transaction hash is compared locally and is not sent to Wormholescan.
 * This reports indexed status only; it never signs, submits, redeems, or rescues a transfer.
 */
export async function lookupMezoNttTransaction(
  transactionHash: string,
  options: BridgeLookupOptions = {},
): Promise<BridgeLookupResult> {
  const normalizedHash = normalizeMezoTxHash(transactionHash);
  if (!normalizedHash) throw new Error("Enter a valid 0x-prefixed 32-byte Mezo transaction hash.");

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 12_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const url = new URL(`${MEZO_TESTNET_NTT.wormholescanApi}/operations`);
  url.searchParams.set("address", MEZO_TESTNET_NTT.transceiverAddress);
  url.searchParams.set("pageSize", String(BRIDGE_TRACKER_PAGE_SIZE));

  let response: Response;
  try {
    response = await fetchImpl(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    if (typeof error === "object" && error !== null && (error as { name?: string }).name === "AbortError") {
      throw new Error("Wormholescan did not respond before the lookup timed out. Try again later.");
    }
    throw new Error("Wormholescan could not be reached. No bridge status was inferred.");
  }

  if (!response.ok) {
    clearTimeout(timer);
    throw new Error(`Wormholescan returned HTTP ${response.status}. No bridge status was inferred.`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    clearTimeout(timer);
    if (typeof error === "object" && error !== null && (error as { name?: string }).name === "AbortError") {
      throw new Error("Wormholescan did not respond before the lookup timed out. Try again later.");
    }
    throw new Error("Wormholescan returned data that could not be read. No bridge status was inferred.");
  }
  clearTimeout(timer);
  if (!isRecord(payload) || !Array.isArray(payload.operations)) {
    throw new Error("Wormholescan returned an unexpected response. No bridge status was inferred.");
  }

  const operations = payload.operations as unknown[];
  const operation = operations.find((item) => sourceTransactionHash(item) === normalizedHash) as WormholeOperation | undefined;
  return {
    operation: operation ?? null,
    stage: operation ? getBridgeStage(operation) : "not-found",
    checkedRecords: operations.length,
    pageSize: BRIDGE_TRACKER_PAGE_SIZE,
  };
}

export function operationRoute(operation: WormholeOperation): { fromChain: number | null; toChain: number | null } {
  const properties = operation.content?.standarizedProperties ?? operation.content?.standardizedProperties;
  return {
    fromChain: typeof properties?.fromChain === "number" ? properties.fromChain : null,
    toChain: typeof properties?.toChain === "number" ? properties.toChain : null,
  };
}
