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
  readChainId,
  requestAccount,
  requestReviewedWalletTransaction,
  requestWalletTransaction,
  switchToNetwork,
  walletReducer,
  type Eip1193Provider,
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
  const network = DEFAULT_NETWORK;

  /** Subscribes to account, chain and disconnect events from the selected provider. */
  const attach = useCallback((provider: Eip1193Provider) => {
    detachRef.current?.();
    if (!provider.on || !provider.removeListener) {
      detachRef.current = null;
      return;
    }

    const onAccounts = (accounts: unknown) => {
      const first = Array.isArray(accounts) ? accounts[0] : undefined;
      dispatch({ type: "accounts-changed", address: isAddress(first) ? first : null });
    };
    const onChain = (chainId: unknown) => dispatch({ type: "chain-changed", chainId: parseChainId(chainId) });
    const onDisconnect = () => dispatch({ type: "provider-disconnected" });

    provider.on("accountsChanged", onAccounts);
    provider.on("chainChanged", onChain);
    provider.on("disconnect", onDisconnect);
    detachRef.current = () => {
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

  useEffect(() => {
    void resolveProvider();
    return () => detachRef.current?.();
  }, [resolveProvider]);

  const connect = useCallback(async () => {
    dispatch({ type: "connect-start" });
    const provider = await resolveProvider();
    if (!provider) {
      dispatch({ type: "connect-error", message: NO_WALLET_MESSAGE });
      return;
    }
    try {
      const address = await requestAccount(provider);
      const chainId = await readChainId(provider);
      dispatch({ type: "connect-success", address, chainId });
    } catch (err) {
      dispatch({ type: "connect-error", message: describeWalletError(err).message });
    }
  }, [resolveProvider]);

  const switchNetwork = useCallback(async () => {
    const provider = providerRef.current ?? (await resolveProvider());
    if (!provider) {
      dispatch({ type: "error", message: NO_WALLET_MESSAGE });
      return;
    }
    try {
      await switchToNetwork(provider, network);
      const chainId = await readChainId(provider);
      dispatch({ type: "chain-changed", chainId });
    } catch (err) {
      dispatch({ type: "error", message: describeWalletError(err).message });
    }
  }, [network, resolveProvider]);

  const switchToTestnet = useCallback(async () => {
    const provider = providerRef.current ?? (await resolveProvider());
    if (!provider) {
      dispatch({ type: "error", message: NO_WALLET_MESSAGE });
      return;
    }
    try {
      await switchToNetwork(provider, MEZO_NETWORKS.testnet);
      const chainId = await readChainId(provider);
      dispatch({ type: "chain-changed", chainId });
    } catch (err) {
      dispatch({ type: "error", message: describeWalletError(err).message });
    }
  }, [resolveProvider]);

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
      return requestReviewedWalletTransaction(provider, tx, expected, network.chainId, onProviderCall);
    },
    [network],
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

  const disconnect = useCallback(() => dispatch({ type: "disconnect" }), []);

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
