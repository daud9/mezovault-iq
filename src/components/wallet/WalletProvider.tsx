import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import type { MezoNetworkConfig } from "../../config/chains";
import { DEFAULT_NETWORK } from "../../config/env";
import { isAddress } from "../../lib/abi";
import { parseChainId } from "../../lib/network";
import { discoverProviders, selectWallet } from "../../lib/walletDiscovery";
import { isTxHash } from "../../lib/transfer";
import {
  describeWalletError,
  INITIAL_WALLET_STATE,
  NO_WALLET_MESSAGE,
  readChainId,
  requestAccount,
  switchToNetwork,
  walletReducer,
  type Eip1193Provider,
  type WalletState,
} from "../../lib/wallet";

interface WalletContextValue {
  state: WalletState;
  network: MezoNetworkConfig;
  isSupportedNetwork: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
  /** Asks the connected wallet to sign and send. Resolves to the transaction hash, not to a confirmation. */
  sendTransaction: (tx: Record<string, string | undefined>) => Promise<string>;
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

  const sendTransaction = useCallback(
    async (tx: Record<string, string | undefined>): Promise<string> => {
      const provider = providerRef.current ?? (await resolveProvider());
      if (!provider) throw new Error(NO_WALLET_MESSAGE);
      const hash = await provider.request({ method: "eth_sendTransaction", params: [tx] });
      if (!isTxHash(hash)) throw new Error("The wallet did not return a transaction hash.");
      return hash;
    },
    [resolveProvider],
  );

  const disconnect = useCallback(() => dispatch({ type: "disconnect" }), []);

  const value = useMemo<WalletContextValue>(
    () => ({
      state,
      network,
      isSupportedNetwork: state.chainId === network.chainId,
      connect,
      disconnect,
      switchNetwork,
      sendTransaction,
    }),
    [state, network, connect, disconnect, switchNetwork, sendTransaction],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}
