import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import type { MezoNetworkConfig } from "../../config/chains";
import { DEFAULT_NETWORK } from "../../config/env";
import type { ClientEvmSigner } from "@x402/evm";
import { MEZO_NETWORKS } from "../../config/chains";
import { isAddress } from "../../lib/abi";
import { parseChainId } from "../../lib/network";
import { discoverProviders, selectWallet } from "../../lib/walletDiscovery";
import {
  describeWalletError,
  assertWalletContext,
  INITIAL_WALLET_STATE,
  NO_WALLET_MESSAGE,
  readStableWalletContext,
  requestAccount,
  requestCachedReviewedWalletTransaction,
  requestWalletTransaction,
  switchToNetwork,
  walletReducer,
  type Eip1193Provider,
  type CachedWalletContext,
  type WalletExpectation,
  type WalletState,
} from "../../lib/wallet";

interface WalletContextValue {
  state: WalletState;
  network: MezoNetworkConfig;
  isSupportedNetwork: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
  switchToTestnet: () => Promise<void>;
  createX402Signer: (expected: WalletExpectation) => Promise<ClientEvmSigner>;
  /** Asks the connected wallet to sign and send. Resolves to the transaction hash, not to a confirmation. */
  sendTransaction: (tx: Record<string, string | undefined>, expected?: WalletExpectation) => Promise<string>;
  /** Rechecks account and chain without prompting, during preflight rather than the final tap. */
  checkWalletContext: (expected: WalletExpectation) => Promise<void>;
  /** Calls eth_sendTransaction synchronously for a just-reviewed request. */
  sendReviewedTransaction: (tx: Record<string, string | undefined>, expected: WalletExpectation, onProviderCall?: () => void) => Promise<string>;
  /** Requests an off-chain personal_sign message; no transaction is sent. */
  signMessage: (message: string, expected: WalletExpectation) => Promise<`0x${string}`>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

/**
 * App-wide wallet state. Nothing connects on its own: every connection starts from a
 * user press. Wallet discovery runs again on each connect press, so a wallet that loads
 * after the page can still be used.
 */
export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(walletReducer, INITIAL_WALLET_STATE);
  const providerRef = useRef<Eip1193Provider | null>(null);
  const detachRef = useRef<(() => void) | null>(null);
  const cachedWalletContextRef = useRef<CachedWalletContext>({ account: null, chainId: null });
  const walletContextEventVersionRef = useRef(0);
  const walletOperationGenerationRef = useRef(0);
  const manualDisconnectRef = useRef(false);
  const walletContextPendingRef = useRef(false);
  const walletEventsRef = useRef(false);
  const network = DEFAULT_NETWORK;

  /** Subscribes to account, chain and disconnect events from the selected provider. */
  const attach = useCallback((provider: Eip1193Provider) => {
    detachRef.current?.();
    if (!provider.on || !provider.removeListener) {
      walletEventsRef.current = false;
      detachRef.current = null;
      return;
    }
    walletEventsRef.current = true;

    const onAccounts = (accounts: unknown) => {
      walletContextEventVersionRef.current += 1;
      if (manualDisconnectRef.current) {
        cachedWalletContextRef.current = { account: null, chainId: null };
        return;
      }
      const first = Array.isArray(accounts) ? accounts[0] : undefined;
      const address = isAddress(first) ? first : null;
      cachedWalletContextRef.current = { ...cachedWalletContextRef.current, account: address };
      dispatch({ type: "accounts-changed", address });
    };
    const onChain = (rawChainId: unknown) => {
      walletContextEventVersionRef.current += 1;
      if (manualDisconnectRef.current) {
        cachedWalletContextRef.current = { account: null, chainId: null };
        return;
      }
      const chainId = parseChainId(rawChainId);
      cachedWalletContextRef.current = { ...cachedWalletContextRef.current, chainId };
      dispatch({ type: "chain-changed", chainId });
    };
    const onDisconnect = () => {
      walletContextEventVersionRef.current += 1;
      walletOperationGenerationRef.current += 1;
      manualDisconnectRef.current = true;
      walletContextPendingRef.current = false;
      cachedWalletContextRef.current = { account: null, chainId: null };
      dispatch({ type: "provider-disconnected" });
    };

    provider.on("accountsChanged", onAccounts);
    provider.on("chainChanged", onChain);
    provider.on("disconnect", onDisconnect);
    detachRef.current = () => {
      walletEventsRef.current = false;
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
      provider.removeListener?.("disconnect", onDisconnect);
    };
  }, []);

  /** Finds a wallet, or returns null after the discovery window closes. */
  const resolveProvider = useCallback(async (): Promise<Eip1193Provider | null> => {
    if (providerRef.current) return providerRef.current;
    const discovered = await discoverProviders(window, 300);
    const injected = window.ethereum ?? null;
    const selected = selectWallet(discovered, injected);
    if (!selected) {
      dispatch({ type: "no-wallet" });
      return null;
    }
    providerRef.current = selected.provider;
    dispatch({ type: "wallet-found", name: selected.name });
    attach(selected.provider);
    return selected.provider;
  }, [attach]);

  const readAndCommitWalletContext = useCallback(async (
    provider: Eip1193Provider,
    operationId: number,
    mode: "connect" | "switch",
  ): Promise<boolean> => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const context = await readStableWalletContext(provider, () => walletContextEventVersionRef.current);
      if (manualDisconnectRef.current || operationId !== walletOperationGenerationRef.current) return false;
      if (context.eventVersion !== walletContextEventVersionRef.current) continue;
      cachedWalletContextRef.current = { account: context.account, chainId: context.chainId };
      walletContextPendingRef.current = false;
      if (mode === "connect") {
        dispatch({ type: "connect-success", address: context.account, chainId: context.chainId });
      } else {
        dispatch({ type: "accounts-changed", address: context.account });
        dispatch({ type: "chain-changed", chainId: context.chainId });
      }
      return true;
    }
    throw new Error("Wallet changed while checking. Reconnect and try again.");
  }, []);

  useEffect(() => {
    void resolveProvider();
    return () => detachRef.current?.();
  }, [resolveProvider]);

  const connect = useCallback(async () => {
    const operationId = ++walletOperationGenerationRef.current;
    manualDisconnectRef.current = false;
    walletContextEventVersionRef.current += 1;
    walletContextPendingRef.current = true;
    cachedWalletContextRef.current = { account: null, chainId: null };
    dispatch({ type: "connect-start" });
    try {
      const provider = await resolveProvider();
      if (manualDisconnectRef.current || operationId !== walletOperationGenerationRef.current) return;
      if (!provider) {
        walletContextPendingRef.current = false;
        dispatch({ type: "connect-error", message: NO_WALLET_MESSAGE });
        return;
      }
      await requestAccount(provider);
      if (manualDisconnectRef.current || operationId !== walletOperationGenerationRef.current) return;
      await readAndCommitWalletContext(provider, operationId, "connect");
    } catch (err) {
      if (manualDisconnectRef.current || operationId !== walletOperationGenerationRef.current) return;
      walletContextPendingRef.current = false;
      cachedWalletContextRef.current = { account: null, chainId: null };
      dispatch({ type: "connect-error", message: describeWalletError(err).message });
    }
  }, [readAndCommitWalletContext, resolveProvider]);

  const switchNetwork = useCallback(async () => {
    const operationId = ++walletOperationGenerationRef.current;
    walletContextPendingRef.current = true;
    walletContextEventVersionRef.current += 1;
    cachedWalletContextRef.current = { account: null, chainId: null };
    try {
      const provider = providerRef.current ?? (await resolveProvider());
      if (manualDisconnectRef.current || operationId !== walletOperationGenerationRef.current) return;
      if (!provider) {
        walletContextPendingRef.current = false;
        dispatch({ type: "error", message: NO_WALLET_MESSAGE });
        return;
      }
      await switchToNetwork(provider, network);
      if (manualDisconnectRef.current || operationId !== walletOperationGenerationRef.current) return;
      await readAndCommitWalletContext(provider, operationId, "switch");
    } catch (err) {
      if (manualDisconnectRef.current || operationId !== walletOperationGenerationRef.current) return;
      const provider = providerRef.current;
      if (provider) {
        try {
          await readAndCommitWalletContext(provider, operationId, "switch");
        } catch {
          if (!manualDisconnectRef.current && operationId === walletOperationGenerationRef.current) {
            cachedWalletContextRef.current = { account: null, chainId: null };
            walletContextPendingRef.current = false;
          }
        }
      } else {
        cachedWalletContextRef.current = { account: null, chainId: null };
        walletContextPendingRef.current = false;
      }
      if (!manualDisconnectRef.current && operationId === walletOperationGenerationRef.current) {
        dispatch({ type: "error", message: describeWalletError(err).message });
      }
    }
  }, [network, readAndCommitWalletContext, resolveProvider]);

  const switchToTestnet = useCallback(async () => {
    const operationId = ++walletOperationGenerationRef.current;
    walletContextPendingRef.current = true;
    walletContextEventVersionRef.current += 1;
    cachedWalletContextRef.current = { account: null, chainId: null };
    try {
      const provider = providerRef.current ?? (await resolveProvider());
      if (manualDisconnectRef.current || operationId !== walletOperationGenerationRef.current) return;
      if (!provider) {
        walletContextPendingRef.current = false;
        dispatch({ type: "error", message: NO_WALLET_MESSAGE });
        return;
      }
      await switchToNetwork(provider, MEZO_NETWORKS.testnet);
      if (manualDisconnectRef.current || operationId !== walletOperationGenerationRef.current) return;
      await readAndCommitWalletContext(provider, operationId, "switch");
    } catch (err) {
      if (manualDisconnectRef.current || operationId !== walletOperationGenerationRef.current) return;
      const provider = providerRef.current;
      if (provider) {
        try {
          await readAndCommitWalletContext(provider, operationId, "switch");
        } catch {
          if (!manualDisconnectRef.current && operationId === walletOperationGenerationRef.current) {
            cachedWalletContextRef.current = { account: null, chainId: null };
            walletContextPendingRef.current = false;
          }
        }
      } else {
        cachedWalletContextRef.current = { account: null, chainId: null };
        walletContextPendingRef.current = false;
      }
      if (!manualDisconnectRef.current && operationId === walletOperationGenerationRef.current) {
        dispatch({ type: "error", message: describeWalletError(err).message });
      }
    }
  }, [readAndCommitWalletContext, resolveProvider]);

  const sendTransaction = useCallback(
    async (tx: Record<string, string | undefined>, expected?: WalletExpectation): Promise<string> => {
      const provider = providerRef.current ?? (await resolveProvider());
      if (!provider) throw new Error(NO_WALLET_MESSAGE);
      return requestWalletTransaction(provider, tx, expected, network.chainId);
    },
    [network, resolveProvider],
  );

  const checkWalletContext = useCallback(async (expected: WalletExpectation) => {
    const provider = providerRef.current ?? (await resolveProvider());
    if (!provider) throw new Error(NO_WALLET_MESSAGE);
    await assertWalletContext(provider, expected);
  }, [resolveProvider]);

  const sendReviewedTransaction = useCallback(
    (tx: Record<string, string | undefined>, expected: WalletExpectation, onProviderCall?: () => void): Promise<string> => {
      const provider = providerRef.current;
      if (!provider) return Promise.reject(new Error("The selected wallet provider is unavailable. Reconnect before preparing another review."));
      if (manualDisconnectRef.current) return Promise.reject(new Error("Wallet is disconnected. Reconnect and review again."));
      if (state.status !== "connected" || state.address?.toLowerCase() !== expected.account.toLowerCase() || state.chainId !== expected.chainId) {
        return Promise.reject(new Error("Wallet account or network changed. Review again."));
      }
      if (!walletEventsRef.current) return Promise.reject(new Error("This wallet cannot confirm account/network changes. Reconnect before reviewing again."));
      return requestCachedReviewedWalletTransaction(provider, tx, expected, cachedWalletContextRef.current, network.chainId, onProviderCall, walletContextPendingRef.current);
    },
    [network, state],
  );

  const signMessage = useCallback(async (message: string, expected: WalletExpectation): Promise<`0x${string}`> => {
    if (expected.chainId !== MEZO_NETWORKS.testnet.chainId) {
      throw new Error("Link authorization signing is restricted to Mezo Testnet.");
    }
    const provider = providerRef.current ?? (await resolveProvider());
    if (!provider) throw new Error(NO_WALLET_MESSAGE);
    await assertWalletContext(provider, expected);
    const signature = await provider.request({
      method: "personal_sign",
      params: [message, expected.account],
    });
    if (typeof signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(signature)) {
      throw new Error("The wallet did not return a valid message signature.");
    }
    await assertWalletContext(provider, expected);
    return signature as `0x${string}`;
  }, [resolveProvider]);

  const createX402Signer = useCallback(async (expected: WalletExpectation): Promise<ClientEvmSigner> => {
    if (expected.chainId !== MEZO_NETWORKS.testnet.chainId) {
      throw new Error("x402 payment signing is restricted to Mezo Testnet.");
    }
    const provider = providerRef.current ?? (await resolveProvider());
    if (!provider) throw new Error(NO_WALLET_MESSAGE);
    await assertWalletContext(provider, expected);
    const { createInjectedMezoTestnetSigner } = await import("../../lib/x402Buyer");
    return createInjectedMezoTestnetSigner(provider, expected.account);
  }, [resolveProvider]);

  const disconnect = useCallback(() => {
    walletOperationGenerationRef.current += 1;
    manualDisconnectRef.current = true;
    walletContextEventVersionRef.current += 1;
    walletContextPendingRef.current = false;
    cachedWalletContextRef.current = { account: null, chainId: null };
    dispatch({ type: "disconnect" });
  }, []);

  const value = useMemo<WalletContextValue>(
    () => ({
      state,
      network,
      isSupportedNetwork: state.chainId === network.chainId,
      connect,
      disconnect,
      switchNetwork,
      switchToTestnet,
      createX402Signer,
      sendTransaction,
      checkWalletContext,
      sendReviewedTransaction,
      signMessage,
    }),
    [state, network, connect, disconnect, switchNetwork, switchToTestnet, createX402Signer, sendTransaction, checkWalletContext, sendReviewedTransaction, signMessage],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}
