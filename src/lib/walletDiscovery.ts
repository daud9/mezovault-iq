/**
 * Wallet discovery without a third-party library.
 *
 * 1. EIP-6963: wallets announce themselves on window, so several installed wallets are
 *    found and no single wallet has to own window.ethereum.
 * 2. window.ethereum: the legacy injected provider, used when no announcement arrives.
 * 3. Mobile: a normal mobile browser has no injected provider. In that case the app
 *    offers a link that opens the page inside a wallet app's browser, where the wallet
 *    injects its provider.
 */
import type { Eip1193Provider } from "./wallet";

export interface DiscoveredWallet {
  uuid: string;
  name: string;
  provider: Eip1193Provider;
}

const ANNOUNCE = "eip6963:announceProvider";
const REQUEST = "eip6963:requestProvider";

function isAnnouncement(detail: unknown): detail is { info: { uuid: string; name: string }; provider: Eip1193Provider } {
  if (typeof detail !== "object" || detail === null) return false;
  const d = detail as { info?: { uuid?: unknown; name?: unknown }; provider?: { request?: unknown } };
  return (
    typeof d.info?.uuid === "string" &&
    d.info.uuid.length > 0 &&
    typeof d.info?.name === "string" &&
    typeof d.provider?.request === "function"
  );
}

/**
 * Asks installed wallets to announce themselves and collects the answers for `timeoutMs`.
 * Duplicate announcements (same uuid) are counted once. Malformed announcements are ignored.
 */
export function discoverProviders(target: EventTarget, timeoutMs = 300): Promise<DiscoveredWallet[]> {
  const found = new Map<string, DiscoveredWallet>();

  const onAnnounce = (event: Event) => {
    const detail = (event as CustomEvent).detail as unknown;
    if (!isAnnouncement(detail) || found.has(detail.info.uuid)) return;
    found.set(detail.info.uuid, { uuid: detail.info.uuid, name: detail.info.name, provider: detail.provider });
  };

  target.addEventListener(ANNOUNCE, onAnnounce);
  target.dispatchEvent(new Event(REQUEST));

  return new Promise((resolve) => {
    setTimeout(() => {
      target.removeEventListener(ANNOUNCE, onAnnounce);
      resolve([...found.values()]);
    }, timeoutMs);
  });
}

/** Prefers an EIP-6963 wallet, then falls back to window.ethereum. Returns null when neither exists. */
export function selectWallet(
  discovered: DiscoveredWallet[],
  injected: Eip1193Provider | null,
): { provider: Eip1193Provider; name: string } | null {
  if (discovered.length > 0) return { provider: discovered[0].provider, name: discovered[0].name };
  if (injected) return { provider: injected, name: "Browser wallet" };
  return null;
}

/** True on phones and tablets, where the browser usually has no wallet built in. */
export function isMobileUserAgent(userAgent: string): boolean {
  return /Android|iPhone|iPad|iPod/i.test(userAgent);
}

/**
 * Link that opens this page inside the MetaMask mobile browser. Only https pages are
 * supported, because the wallet's link service rejects plain http.
 */
export function buildMobileWalletLink(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  return `https://metamask.app.link/dapp/${url.host}${url.pathname}${url.search}`;
}
