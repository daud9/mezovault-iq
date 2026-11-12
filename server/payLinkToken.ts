import { normalizeMUSDLinkAmount, normalizeMUSDRecipient, X402_TESTNET_NETWORK } from "../src/lib/x402PayLinks.ts";

export const PAY_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const encoder = new TextEncoder();

export interface PayLinkClaims {
  version: 1;
  network: typeof X402_TESTNET_NETWORK;
  recipient: `0x${string}`;
  amount: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("invalid base64url");
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function hasStrongSecret(secret: string): boolean {
  return encoder.encode(secret).byteLength >= 32;
}

async function hmac(secret: string, content: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(content)));
}

export async function mintPayLinkToken(
  secret: string,
  recipientInput: unknown,
  amountInput: string,
  now = Date.now(),
): Promise<{ token: string; claims: PayLinkClaims }> {
  if (!hasStrongSecret(secret)) throw new Error("PAY_LINK_SECRET must contain at least 32 UTF-8 bytes.");
  const recipient = normalizeMUSDRecipient(recipientInput);
  if (!recipient) throw new Error("Enter a valid, non-zero EVM recipient address.");
  const amount = normalizeMUSDLinkAmount(amountInput);
  if (amount.error || amount.amount === null) throw new Error(amount.error ?? "Invalid MUSD amount.");
  if (!Number.isSafeInteger(now) || now <= 0) throw new Error("Invalid link issue time.");

  const claims: PayLinkClaims = {
    version: 1,
    network: X402_TESTNET_NETWORK,
    recipient,
    amount: amount.amount,
    issuedAt: now,
    expiresAt: now + PAY_LINK_TTL_MS,
    nonce: toBase64Url(crypto.getRandomValues(new Uint8Array(16))),
  };
  const payload = toBase64Url(encoder.encode(JSON.stringify(claims)));
  const signature = toBase64Url(await hmac(secret, payload));
  return { token: `${payload}.${signature}`, claims };
}

function isPayLinkClaims(value: unknown, now: number): value is PayLinkClaims {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const claims = value as Record<string, unknown>;
  if (claims.version !== 1 || claims.network !== X402_TESTNET_NETWORK) return false;
  if (typeof claims.recipient !== "string" || normalizeMUSDRecipient(claims.recipient) !== claims.recipient) return false;
  if (typeof claims.amount !== "string") return false;
  const normalized = normalizeMUSDLinkAmount(claims.amount);
  if (normalized.error || normalized.amount !== claims.amount) return false;
  if (!Number.isSafeInteger(claims.issuedAt) || !Number.isSafeInteger(claims.expiresAt)) return false;
  if ((claims.issuedAt as number) > now + 60_000 || (claims.expiresAt as number) <= now) return false;
  if ((claims.expiresAt as number) - (claims.issuedAt as number) > PAY_LINK_TTL_MS) return false;
  if (typeof claims.nonce !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(claims.nonce)) return false;
  return true;
}

export async function verifyPayLinkToken(secret: string, token: unknown, now = Date.now()): Promise<PayLinkClaims | null> {
  if (!hasStrongSecret(secret) || typeof token !== "string" || token.length > 2048) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  try {
    const [payload, signature] = parts;
    const suppliedSignature = fromBase64Url(signature);
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("HMAC", key, suppliedSignature as BufferSource, encoder.encode(payload));
    if (!valid) return null;
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(fromBase64Url(payload));
    const claims: unknown = JSON.parse(decoded);
    return isPayLinkClaims(claims, now) ? claims : null;
  } catch {
    return null;
  }
}

export function isPayLinkSecretConfigured(secret: string | undefined): secret is string {
  return typeof secret === "string" && hasStrongSecret(secret);
}
