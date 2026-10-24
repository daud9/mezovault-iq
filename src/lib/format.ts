export function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatRange([low, high]: [number, number]): string {
  return `${low}%–${high}%`;
}

export function formatUsdCents(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function shortAddress(address: string): string {
  return /^0x[0-9a-fA-F]{40}$/.test(address) ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "unknown time"
    : d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}
