import { isAddress } from "./abi.ts";

export const X402_TESTNET_NETWORK = "eip155:31611" as const;
export const MUSD_LINK_MIN_AMOUNT = "0.001";
export const MUSD_LINK_MAX_AMOUNT = "1000";
const SCALE = 10n ** 18n;
const MIN_UNITS = 10n ** 15n;
const MAX_UNITS = 1000n * SCALE;

export interface LinkAuthorizationFields {
  recipient: string;
  amount: string;
  issuedAt: number;
  nonce: string;
}

function decimalUnits(input: string): bigint | null {
  if (!/^\d+(?:\.\d{1,18})?$/.test(input)) return null;
  const [whole, fraction = ""] = input.split(".");
  try {
    return BigInt(whole) * SCALE + BigInt((fraction + "0".repeat(18)).slice(0, 18));
  } catch {
    return null;
  }
}

/** Return a normalized decimal MUSD price or a safe, user-facing validation error. */
export function normalizeMUSDLinkAmount(input: string): { amount: string; error: null } | { amount: null; error: string } {
  const trimmed = input.trim();
  if (trimmed.length > 128) {
    return { amount: null, error: "Enter a plain decimal amount with up to 18 decimal places and at most 128 characters." };
  }
  const units = decimalUnits(trimmed);
  if (units === null) {
    return { amount: null, error: "Enter a plain decimal amount with up to 18 decimal places." };
  }
  if (units < MIN_UNITS) {
    return { amount: null, error: `The minimum x402 link amount is ${MUSD_LINK_MIN_AMOUNT} MUSD.` };
  }
  if (units > MAX_UNITS) {
    return { amount: null, error: `The maximum x402 link amount is ${MUSD_LINK_MAX_AMOUNT} MUSD.` };
  }

  const [whole, fraction = ""] = trimmed.split(".");
  const normalizedWhole = whole.replace(/^0+(?=\d)/, "");
  const normalizedFraction = fraction.replace(/0+$/, "");
  return { amount: normalizedFraction ? `${normalizedWhole}.${normalizedFraction}` : normalizedWhole, error: null };
}

export function normalizeMUSDRecipient(input: unknown): `0x${string}` | null {
  if (typeof input !== "string" || !isAddress(input)) return null;
  if (/^0x0{40}$/i.test(input)) return null;
  return input.toLowerCase() as `0x${string}`;
}

/** Canonical EIP-191 message: authorization only, never a transaction or buyer payment. */
export function buildLinkAuthorizationMessage(fields: LinkAuthorizationFields): string {
  const recipient = normalizeMUSDRecipient(fields.recipient);
  const amount = normalizeMUSDLinkAmount(fields.amount);
  if (!recipient) throw new Error("Invalid MUSD payment recipient.");
  if (amount.error || amount.amount === null) throw new Error(amount.error ?? "Invalid MUSD amount.");
  if (!Number.isSafeInteger(fields.issuedAt) || fields.issuedAt <= 0) throw new Error("Invalid authorization time.");
  if (!/^[0-9a-f]{32}$/.test(fields.nonce)) throw new Error("Invalid authorization nonce.");

  return [
    "MezoVault IQ — create a gasless MUSD x402 payment link",
    `Network: ${X402_TESTNET_NETWORK}`,
    `Recipient: ${recipient}`,
    `Amount: ${amount.amount} MUSD`,
    `Issued at: ${fields.issuedAt}`,
    `Nonce: ${fields.nonce}`,
    "This is an off-chain link-creation message. It does not transfer MUSD or pay gas.",
  ].join("\n");
}
