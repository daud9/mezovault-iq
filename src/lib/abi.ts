/**
 * Minimal ABI encoding and decoding for the read-only ERC-20 calls used here.
 * Implemented directly so the app has no extra runtime dependency.
 */

export const SELECTORS = {
  balanceOf: "0x70a08231",
  decimals: "0x313ce567",
  symbol: "0x95d89b41",
} as const;

export function isAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

export function encodeAddressWord(address: string): string {
  if (!isAddress(address)) throw new Error(`Invalid address: ${address}`);
  return address.slice(2).toLowerCase().padStart(64, "0");
}

export function encodeBalanceOf(owner: string): `0x${string}` {
  return `${SELECTORS.balanceOf}${encodeAddressWord(owner)}` as `0x${string}`;
}

function stripHex(hex: string): string {
  if (typeof hex !== "string" || !hex.startsWith("0x")) {
    throw new Error("Expected a 0x-prefixed hex string");
  }
  return hex.slice(2);
}

/** Decodes a single uint256 return word. Empty return data ("0x") is an error. */
export function decodeUint256(hex: string): bigint {
  const body = stripHex(hex);
  if (body.length === 0) throw new Error("Empty return data");
  if (!/^[0-9a-fA-F]+$/.test(body)) throw new Error("Return data is not hex");
  if (body.length > 64) throw new Error("Return data is longer than one word");
  return BigInt(`0x${body}`);
}

/** Decodes a dynamic ABI-encoded string (offset, length, UTF-8 bytes). */
export function decodeAbiString(hex: string): string {
  const body = stripHex(hex);
  if (body.length < 128) throw new Error("Return data too short for a string");
  if (!/^[0-9a-fA-F]+$/.test(body)) throw new Error("Return data is not hex");

  const offset = Number(BigInt(`0x${body.slice(0, 64)}`));
  const lengthStart = offset * 2;
  if (!Number.isSafeInteger(lengthStart) || body.length < lengthStart + 64) {
    throw new Error("String offset is out of range");
  }
  const length = Number(BigInt(`0x${body.slice(lengthStart, lengthStart + 64)}`));
  const dataStart = lengthStart + 64;
  const dataHex = body.slice(dataStart, dataStart + length * 2);
  if (dataHex.length !== length * 2) throw new Error("String data is truncated");

  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = parseInt(dataHex.slice(i * 2, i * 2 + 2), 16);
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
