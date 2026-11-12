import express, { type ErrorRequestHandler, type Request, type Response } from "express";
import { parseUnits, recoverMessageAddress } from "viem";
import {
  HTTPFacilitatorClient,
  x402HTTPResourceServer,
  x402ResourceServer,
  withPrivateCacheControl,
  type FacilitatorClient,
  type HTTPAdapter,
  type HTTPRequestContext,
  type HTTPResponseInstructions,
} from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { MEZO_NETWORKS } from "../src/config/chains.ts";
import { buildLinkAuthorizationMessage, normalizeMUSDLinkAmount, normalizeMUSDRecipient, X402_TESTNET_NETWORK } from "../src/lib/x402PayLinks.ts";
import { isPayLinkSecretConfigured, mintPayLinkToken, verifyPayLinkToken } from "./payLinkToken.ts";

export const X402_FACILITATOR_URL = "https://facilitator.vativ.io";
const LINK_QUERY_PARAMETER = "link";
const RESOURCE_PATH = "/api/x402/pay";
const CHECKOUT_PATH = "/pay";
const LINK_TTL_DESCRIPTION = "Links expire 30 days after creation.";
const CREATE_WINDOW_MS = 60_000;
const CREATE_PER_IP_LIMIT = 10;
const CREATE_PER_RECIPIENT_LIMIT = 10;
const CREATE_AUTH_MAX_AGE_MS = 5 * 60_000;
const CREATE_AUTH_REPLAY_WINDOW_MS = 10 * 60_000;
const PAYMENT_WINDOW_MS = 60_000;
const PAYMENT_PER_LINK_LIMIT = 20;
const PAYMENT_PER_IP_LIMIT = 20;

interface WindowCount {
  startsAt: number;
  count: number;
  durationMs: number;
}

const MAX_WINDOW_ENTRIES = 5000;

/** Bounded per-process limiter; throttle keys stay in memory and are not written to durable storage. */
export class FixedWindowLimiter {
  private readonly windows = new Map<string, WindowCount>();

  consume(key: string, limit: number, durationMs: number, now = Date.now()): boolean {
    const current = this.windows.get(key);
    if (!current || now - current.startsAt >= durationMs || now < current.startsAt) {
      if (this.windows.size >= MAX_WINDOW_ENTRIES) {
        for (const [storedKey, value] of this.windows) {
          if (now - value.startsAt >= value.durationMs || now < value.startsAt) this.windows.delete(storedKey);
        }
        while (this.windows.size >= MAX_WINDOW_ENTRIES) {
          const oldestKey = this.windows.keys().next().value;
          if (oldestKey === undefined) break;
          this.windows.delete(oldestKey);
        }
      }
      this.windows.set(key, { startsAt: now, count: 1, durationMs });
      return true;
    }
    if (current.count >= limit) return false;
    current.count += 1;
    return true;
  }
}

export interface MerchantAppOptions {
  /** Required for creation and checkout; it is never returned to the client. */
  payLinkSecret?: string;
  /** Injection seam for tests; production always uses the documented facilitator. */
  facilitator?: FacilitatorClient;
  /** Optional static directory; set to null in tests. */
  staticDir?: string | null;
  now?: () => number;
  recoverSigner?: (message: string, signature: `0x${string}`) => Promise<string>;
}

function getSingleLinkQuery(context: HTTPRequestContext): string | null {
  const body = context.adapter.getBody?.();
  if (!isPlainRecord(body)) return null;
  const value = body[LINK_QUERY_PARAMETER];
  return typeof value === "string" ? value : null;
}

function createRequestContext(req: Request): HTTPRequestContext {
  const adapter: HTTPAdapter = {
    getHeader: (name) => {
      const value = req.header(name);
      return Array.isArray(value) ? value[0] : value ?? undefined;
    },
    getMethod: () => req.method,
    getPath: () => req.path,
    getUrl: () => `${req.protocol}://${req.headers.host ?? "localhost"}${req.originalUrl}`,
    getAcceptHeader: () => req.header("Accept") ?? "",
    getUserAgent: () => req.header("User-Agent") ?? "",
    getQueryParams: () => req.query as Record<string, string | string[]>,
    getQueryParam: (name) => {
      const value = req.query[name];
      return typeof value === "string" || Array.isArray(value) ? value as string | string[] : undefined;
    },
    getBody: () => req.body,
  };
  let decodedPath = req.path;
  try {
    decodedPath = decodeURIComponent(req.path);
  } catch {
    // Keep the original path when a malformed escape is supplied.
  }
  return {
    adapter,
    path: req.path,
    decodedPath,
    method: req.method,
    paymentHeader: adapter.getHeader("payment-signature") || adapter.getHeader("x-payment"),
  };
}

function getClientIp(req: Request): string {
  // Express's proxy-aware req.ip is used only as an ephemeral rate-limit key.
  return req.ip || req.socket.remoteAddress || "unknown";
}

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: code, message });
}

function sendX402Response(res: Response, response: HTTPResponseInstructions): void {
  for (const [name, value] of Object.entries(response.headers)) res.setHeader(name, value);
  res.status(response.status);
  const contentType = response.headers["Content-Type"] ?? response.headers["content-type"] ?? "";
  const mediaType = contentType.split(";")[0]?.trim().toLowerCase();
  if (response.isHtml || (mediaType === "text/plain" && typeof response.body === "string")) {
    res.send(response.body ?? "");
  } else if (mediaType === "application/json" || (typeof response.body === "object" && response.body !== null)) {
    res.json(response.body ?? {});
  } else {
    res.send(response.body ?? "");
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSignature(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]{130}$/.test(value);
}

export function createMerchantApp(options: MerchantAppOptions = {}) {
  const app = express();
  const secret = options.payLinkSecret;
  const now = options.now ?? Date.now;
  const signerRecovery = options.recoverSigner ?? (async (message, signature) => recoverMessageAddress({ message, signature }));
  const rateLimiter = new FixedWindowLimiter();
  const facilitator = options.facilitator ?? new HTTPFacilitatorClient({ url: X402_FACILITATOR_URL });
  const resourceServer = new x402ResourceServer(facilitator).register(
    X402_TESTNET_NETWORK,
    new ExactEvmScheme(),
  );
  const httpResourceServer = new x402HTTPResourceServer(resourceServer, {
    [`POST ${RESOURCE_PATH}`]: {
      accepts: {
        scheme: "exact",
        network: X402_TESTNET_NETWORK,
        payTo: async (context: HTTPRequestContext) => {
          const claims = await verifyPayLinkToken(secret ?? "", getSingleLinkQuery(context), now());
          if (!claims) throw new Error("Invalid or expired payment link.");
          return claims.recipient;
        },
        price: async (context: HTTPRequestContext) => {
          const claims = await verifyPayLinkToken(secret ?? "", getSingleLinkQuery(context), now());
          if (!claims) throw new Error("Invalid or expired payment link.");
          return `$${claims.amount}`;
        },
      },
      description: "MUSD payment link on Mezo Testnet",
      serviceName: "MezoVault IQ",
      mimeType: "application/json",
    },
  });

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.get("/api/pay-links/status", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      enabled: isPayLinkSecretConfigured(secret),
      network: X402_TESTNET_NETWORK,
      facilitator: X402_FACILITATOR_URL,
    });
  });

  app.post(
    "/api/pay-links",
    (req, res, next) => {
      res.setHeader("Cache-Control", "no-store");
      if (!rateLimiter.consume(`create-ip:${getClientIp(req)}`, CREATE_PER_IP_LIMIT, CREATE_WINDOW_MS, now())) {
        return sendError(res, 429, "rate_limited", "Too many link requests. Wait a minute and try again.");
      }
      next();
    },
    express.json({ limit: "4kb", strict: true }),
    async (req, res) => {
      if (!isPayLinkSecretConfigured(secret)) {
        return sendError(res, 503, "not_configured", "Gasless pay links are not configured on this server yet.");
      }
      if (!isPlainRecord(req.body)) return sendError(res, 400, "invalid_request", "The link request was invalid.");

      const recipient = normalizeMUSDRecipient(req.body.recipient);
      if (!recipient) return sendError(res, 400, "invalid_recipient", "Enter a valid, non-zero EVM recipient address.");
      if (typeof req.body.amount !== "string") return sendError(res, 400, "invalid_amount", "Enter a MUSD amount as a plain decimal.");
      const amount = normalizeMUSDLinkAmount(req.body.amount);
      if (amount.error || amount.amount === null) return sendError(res, 400, "invalid_amount", amount.error ?? "Enter a valid MUSD amount.");

      const issuedAt = req.body.issuedAt;
      const authorizationNow = now();
      if (!Number.isSafeInteger(issuedAt) || Math.abs(authorizationNow - (issuedAt as number)) >= CREATE_AUTH_MAX_AGE_MS) {
        return sendError(res, 400, "expired_authorization", "The wallet message expired. Create a fresh link request.");
      }
      if (typeof req.body.nonce !== "string" || !/^[0-9a-f]{32}$/.test(req.body.nonce)) {
        return sendError(res, 400, "invalid_authorization", "The wallet authorization was not valid.");
      }
      if (!isSignature(req.body.signature)) return sendError(res, 400, "invalid_authorization", "The wallet authorization was not valid.");

      let message: string;
      try {
        message = buildLinkAuthorizationMessage({ recipient, amount: amount.amount, issuedAt: issuedAt as number, nonce: req.body.nonce });
      } catch {
        return sendError(res, 400, "invalid_authorization", "The wallet authorization was not valid.");
      }

      let recovered: string;
      try {
        recovered = await signerRecovery(message, req.body.signature);
      } catch {
        return sendError(res, 401, "signature_invalid", "The wallet signature could not be verified. No payment was made.");
      }
      if (recovered.toLowerCase() !== recipient) {
        return sendError(res, 401, "recipient_not_controlled", "Sign the link-creation message with the wallet receiving this payment.");
      }
      if (!rateLimiter.consume(`create-nonce:${recipient}:${req.body.nonce}`, 1, CREATE_AUTH_REPLAY_WINDOW_MS, now())) {
        return sendError(res, 409, "authorization_replayed", "This signed link-creation message was already used. Sign a fresh message to create another link.");
      }
      if (!rateLimiter.consume(`create-recipient:${recipient}`, CREATE_PER_RECIPIENT_LIMIT, 60 * 60_000, now())) {
        return sendError(res, 429, "recipient_rate_limited", "This wallet has created many links recently. Try again later.");
      }

      try {
        const { token, claims } = await mintPayLinkToken(secret, recipient, amount.amount, now());
        const fragment = new URLSearchParams({ [LINK_QUERY_PARAMETER]: token });
        res.status(201).json({
          path: `${CHECKOUT_PATH}#${fragment.toString()}`,
          network: claims.network,
          recipient: claims.recipient,
          amount: claims.amount,
          expiresAt: claims.expiresAt,
          expiryDescription: LINK_TTL_DESCRIPTION,
        });
      } catch {
        sendError(res, 500, "link_creation_failed", "A secure pay link could not be created. No payment was made.");
      }
    },
  );

  let initialization: Promise<void> | null = null;
  async function initializeX402(): Promise<void> {
    if (!initialization) {
      initialization = httpResourceServer.initialize().catch((error: unknown) => {
        initialization = null;
        throw error;
      });
    }
    await initialization;
  }

  app.post(
    RESOURCE_PATH,
    (req, res, next) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Referrer-Policy", "no-referrer");
      if (!isPayLinkSecretConfigured(secret)) {
        return sendError(res, 503, "not_configured", "Gasless pay links are not configured on this server yet.");
      }
      if (!rateLimiter.consume(`pay-ip:${getClientIp(req)}`, PAYMENT_PER_IP_LIMIT, PAYMENT_WINDOW_MS, now())) {
        return sendError(res, 429, "rate_limited", "Too many checkout attempts. Wait a minute and try again.");
      }
      next();
    },
    express.json({ limit: "4kb", strict: true }),
    async (req, res) => {
      if (!isPlainRecord(req.body) || typeof req.body[LINK_QUERY_PARAMETER] !== "string") {
        return sendError(res, 400, "invalid_link", "This payment link is missing or invalid.");
      }
      const linkToken = req.body[LINK_QUERY_PARAMETER];
      const claims = await verifyPayLinkToken(secret!, linkToken, now());
      if (!claims) return sendError(res, 404, "invalid_or_expired_link", "This payment link is invalid or has expired.");
      const expectedAtomicAmount = parseUnits(claims.amount, MEZO_NETWORKS.testnet.musd!.decimals).toString();
      if (!rateLimiter.consume(`pay-link:${claims.nonce}`, PAYMENT_PER_LINK_LIMIT, PAYMENT_WINDOW_MS, now())) {
        return sendError(res, 429, "rate_limited", "Too many checkout attempts. Wait a minute and try again.");
      }

      try {
        await initializeX402();
        const context = createRequestContext(req);
        const result = await httpResourceServer.processHTTPRequest(context);
        if (result.type === "payment-error") return sendX402Response(res, result.response);
        if (result.type !== "payment-verified") {
          return sendError(res, 404, "resource_not_protected", "This payment resource is unavailable.");
        }

        const requirements = result.paymentRequirements;
        if (requirements.scheme !== "exact" || requirements.network !== X402_TESTNET_NETWORK ||
            requirements.asset.toLowerCase() !== MEZO_NETWORKS.testnet.musd!.address.toLowerCase() ||
            requirements.payTo.toLowerCase() !== claims.recipient || requirements.amount !== expectedAtomicAmount) {
          return sendError(res, 502, "payment_terms_mismatch", "The verified payment terms did not match this link. No paid confirmation was returned.");
        }

        const body = {
          ok: true,
          message: "Payment settled by the Mezo x402 facilitator.",
          network: X402_TESTNET_NETWORK,
        };
        const responseBody = Buffer.from(JSON.stringify(body), "utf8");
        const settlement = await httpResourceServer.processSettlement(
          result.paymentPayload,
          result.paymentRequirements,
          result.declaredExtensions,
          {
            request: context,
            responseBody,
            responseHeaders: { "Content-Type": "application/json; charset=utf-8" },
          },
          undefined,
          result.beforeHandlerSettlement,
        );
        if (!settlement.success) return sendX402Response(res, settlement.response);

        if (settlement.network !== X402_TESTNET_NETWORK ||
            (settlement.amount !== undefined && settlement.amount !== expectedAtomicAmount) ||
            !/^0x[0-9a-fA-F]{64}$/.test(settlement.transaction)) {
          return sendError(res, 502, "settlement_receipt_mismatch", "The facilitator receipt did not match this Testnet MUSD payment. Check wallet activity before retrying.");
        }

        for (const [name, value] of Object.entries(settlement.headers)) res.setHeader(name, value);
        res.setHeader("Cache-Control", withPrivateCacheControl(String(res.getHeader("Cache-Control") ?? "no-store")));
        return res.status(200).json(body);
      } catch {
        return sendError(res, 502, "facilitator_unavailable", "The x402 facilitator could not verify or settle this payment. No paid response was returned.");
      }
    },
  );

  if (options.staticDir !== null) {
    const staticDir = options.staticDir ?? "dist";
    app.use(express.static(staticDir, { index: false, fallthrough: true, dotfiles: "deny" }));
    app.get("*", (req, res, next) => {
      if (req.path.split("/").pop()?.includes(".")) return next();
      res.sendFile("index.html", { root: staticDir }, (error) => {
        if (error) next(error);
      });
    });
  }

  app.use((_req, res) => sendError(res, 404, "not_found", "The requested route was not found."));

  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    const status = isPlainRecord(error) && error.type === "entity.too.large" ? 413 :
      error instanceof SyntaxError ? 400 : 500;
    sendError(res, status, status === 413 ? "request_too_large" : status === 400 ? "invalid_json" : "server_error",
      status === 413 ? "The request is too large." : status === 400 ? "The request body is not valid JSON." : "The request could not be completed.");
  };
  app.use(errors);
  return app;
}
