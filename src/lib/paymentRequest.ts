/**
 * Payment request links. A link only pre-fills the Send page. The payer still reviews the
 * recipient, token and amount, and signs in their own wallet. A link never sends funds.
 */
import { isAddress } from "./abi";

export type PaymentToken = "BTC" | "MUSD";

export interface PaymentRequest {
  to: `0x${string}`;
  token: PaymentToken;
  amount: string;
}

const AMOUNT = /^\d+(\.\d{1,18})?$/;

export function buildSendQuery(req: PaymentRequest): string {
  if (!isAddress(req.to)) throw new Error("Invalid recipient address.");
  if (!AMOUNT.test(req.amount) || Number(req.amount) <= 0) throw new Error("Enter a positive amount.");
  const params = new URLSearchParams({ to: req.to, token: req.token, amount: req.amount });
  return params.toString();
}

/** Reads a payment request from the Send page's query string. Missing parameters mean no request. */
export function parsePaymentParams(params: URLSearchParams): { error: string | null; request: PaymentRequest | null } {
  const to = params.get("to");
  const token = params.get("token") ?? "BTC";
  const amount = params.get("amount") ?? "";
  if (to === null && params.get("token") === null && params.get("amount") === null) {
    return { error: null, request: null };
  }
  if (to === null || !isAddress(to)) return { error: "The payment link has an invalid recipient address. Nothing was filled in.", request: null };
  if (token !== "BTC" && token !== "MUSD" && token !== "MEZO") return { error: "The payment link names an unknown token.", request: null };
  if (amount !== "" && !AMOUNT.test(amount)) return { error: "The payment link has an invalid amount. Enter it again.", request: null };
  return {
    error: null,
    request: { to, token: token as PaymentToken, amount },
  };
}
