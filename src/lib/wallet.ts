/**
 * EIP-1193 wallet integration with no third-party dependency.
 * The app only requests account addresses and chain switches. It never asks for
 * seed phrases or private keys, and it never signs or sends a transaction.
 */
import type { MezoNetworkConfig } from "../config/chains";
import { isAddress } from "./abi";
import { parseChainId } from "./network";

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

export function getInjectedProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  return window.ethereum ?? null;
}

export async function requestAccount(provider: Eip1193Provider): Promise<`0x${string}`> {
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new WalletError("no-account", "No account was returned by the wallet.");
  }
  const first = accounts[0];
  if (!isAddress(first)) {
    throw new WalletError("no-account", "The wallet returned an invalid address.");
  }
  return first;
}

export async function readChainId(provider: Eip1193Provider): Promise<number | null> {
  return parseChainId(await provider.request({ method: "eth_chainId" }));
}

/**
 * Asks the wallet to switch to the configured network. If the wallet does not know the
 * network (EIP-3085 error 4902), the network is added with the official parameters,
 * then the switch is retried.
 */
export async function switchToNetwork(provider: Eip1193Provider, network: MezoNetworkConfig): Promise<void> {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: network.chainIdHex }],
    });
    return;
  } catch (err) {
    if (!isWalletCode(err, 4902)) throw err;
  }

  await provider.request({
    method: "wallet_addEthereumChain",
    params: [
      {
        chainId: network.chainIdHex,
        chainName: network.label,
        nativeCurrency: network.nativeCurrency,
        rpcUrls: [network.rpcUrl],
        blockExplorerUrls: [network.explorerUrl],
      },
    ],
  });

  await provider.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: network.chainIdHex }],
  });
}

export type WalletErrorCode = "no-account" | "rejected" | "pending" | "unsupported" | "unknown";

export class WalletError extends Error {
  readonly code: WalletErrorCode;
  constructor(code: WalletErrorCode, message: string) {
    super(message);
    this.name = "WalletError";
    this.code = code;
  }
}

/** Turns an EIP-1193 or EIP-1474 error into a message that tells the user what to do. */
export function describeWalletError(err: unknown): { code: WalletErrorCode; message: string } {
  if (err instanceof WalletError) return { code: err.code, message: err.message };
  if (isWalletCode(err, 4001)) return { code: "rejected", message: "You rejected the request in your wallet." };
  if (isWalletCode(err, -32002)) {
    return { code: "pending", message: "A request is already waiting in your wallet. Open it to respond." };
  }
  if (isWalletCode(err, 4200) || isWalletCode(err, 4902)) {
    return { code: "unsupported", message: "Your wallet does not support this request. Switch network manually in your wallet." };
  }
  return { code: "unknown", message: "The wallet request failed. Try again, or check your wallet." };
}

function isWalletCode(err: unknown, code: number): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === code;
}

/* ----- Pure connection state machine (tested without a browser) ----- */

export const NO_WALLET_MESSAGE =
  "No wallet was found in this browser. Install a wallet, or open this page in a wallet app's browser.";

export type WalletStatus = "disconnected" | "connecting" | "connected" | "error";

export interface WalletState {
  status: WalletStatus;
  address: `0x${string}` | null;
  chainId: number | null;
  error: string | null;
  /** null until discovery has run. */
  walletFound: boolean | null;
  walletName: string | null;
}

export type WalletAction =
  | { type: "wallet-found"; name: string }
  | { type: "no-wallet" }
  | { type: "connect-start" }
  | { type: "connect-success"; address: `0x${string}`; chainId: number | null }
  | { type: "connect-error"; message: string }
  | { type: "chain-changed"; chainId: number | null }
  | { type: "accounts-changed"; address: `0x${string}` | null }
  | { type: "provider-disconnected" }
  | { type: "disconnect" }
  | { type: "error"; message: string };

export const INITIAL_WALLET_STATE: WalletState = {
  status: "disconnected",
  address: null,
  chainId: null,
  error: null,
  walletFound: null,
  walletName: null,
};

export function walletReducer(state: WalletState, action: WalletAction): WalletState {
  switch (action.type) {
    case "wallet-found":
      return { ...state, walletFound: true, walletName: action.name };
    case "no-wallet":
      return { ...state, walletFound: false, walletName: null };
    case "connect-start":
      return { ...state, status: "connecting", error: null };
    case "connect-success":
      return { ...state, status: "connected", address: action.address, chainId: action.chainId, error: null, walletFound: true };
    case "connect-error":
      return { ...state, status: "error", address: null, error: action.message };
    case "chain-changed":
      return state.status === "connected" ? { ...state, chainId: action.chainId } : state;
    case "accounts-changed":
      if (action.address === null) {
        return state.status === "connected"
          ? { ...INITIAL_WALLET_STATE, walletFound: state.walletFound, walletName: state.walletName }
          : state;
      }
      return state.status === "connected" ? { ...state, address: action.address } : state;
    case "provider-disconnected":
      return state.status === "connected"
        ? { ...INITIAL_WALLET_STATE, walletFound: state.walletFound, walletName: state.walletName, error: "Your wallet disconnected." }
        : state;
    case "disconnect":
      return { ...INITIAL_WALLET_STATE, walletFound: state.walletFound, walletName: state.walletName };
    case "error":
      return { ...state, error: action.message };
    default:
      return state;
  }
}
