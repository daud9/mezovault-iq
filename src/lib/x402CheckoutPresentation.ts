export type X402CheckoutAction = "settled" | "unresolved" | "connect-wallet" | "switch-network" | "pay";

export function getX402CheckoutAction(input: {
  connected: boolean;
  onTestnet: boolean;
  hasReceipt: boolean;
  paymentStatusUnknown: boolean;
}): X402CheckoutAction {
  if (input.hasReceipt) return "settled";
  if (input.paymentStatusUnknown) return "unresolved";
  if (!input.connected) return "connect-wallet";
  if (!input.onTestnet) return "switch-network";
  return "pay";
}
