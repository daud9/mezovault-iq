/**
 * Developer support address. Supplied by the project owner. The app does not verify who controls it.
 * Support payments open the Send page for review. Nothing is sent until the user confirms in their wallet.
 */
export const SUPPORT_ADDRESS = "0x66f7eec6ced7b0c93b0b995ef0007d3e2f62f353" as const;

export const SUPPORT_PRESETS = [
  { token: "BTC" as const, amount: "0.001", label: "0.001 BTC" },
  { token: "MUSD" as const, amount: "1", label: "1 MUSD" },
  { token: "MEZO" as const, amount: "1", label: "1 MEZO" },
];
