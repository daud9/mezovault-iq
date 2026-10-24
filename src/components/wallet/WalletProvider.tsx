import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useCallback,
  type ReactNode,
} from "react";
import type { MezoNetworkConfig } from "../../config/chains";
import { DEFAULT_NETWORK } from "../../config/env";
import { parseChainId } from "../../lib/network";
import {
  describeWalletError,
  getInjectedProvider,
  INITIAL_WALLET_STATE,
  readChainId,
  requestAccount,
  switchToNetwork,
  walletReducer,
  type Eip1193Provider,
  type WalletState,
} from "../../lib/wallet";
import { isAddress } from "../../lib/abi";

interface WalletContextValue {
  state: WalletState;
  network: MezoNetworkConfig;
  isSupportedNetwork: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

/**
 * Holds wallet state for the whole app. Nothing connects automatically: the user must
 * press Connect. The app never reads private keys, seed phrases or signatures.
 */
export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(walletReducer, undefined, () =>
    getInjectedProvider() ? INITIAL_WALLET_STATE : { ...INITIAL_WALLET_STATE, status: "no-wallet" as const },
  );
  const network = DEFAULT_NETWORK;

  useEffect(() => {
    const provider = getInjectedProvider();
    if (!provider || !provider.on || !provider.removeListener) return;

    const onAccounts = (accounts: unknown) => {
      const first = Array.isArray(accounts) ? accounts[0] : undefined;
      dispatch({ type: "accounts-changed", address: isAddress(first) ? first : null });
    };
    const onChain = (chainId: unknown) => {
      dispatch({ type: "chain-changed", chainId: parseChainId(chainId) });
    };

    provider.on("accountsChanged", onAccounts);
    provider.on("chainChanged", onChain);
    return () => {
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const connect = useCallback(async () => {
    const provider = getInjectedProvider();
    if (!provider) {
      dispatch({ type: "provider-detected", present: false });
      return;
    }
    dispatch({ type: "connect-start" });
    try {
      const address = await requestAccount(provider);
      const chainId = await readChainId(provider);
      dispatch({ type: "connect-success", address, chainId });
    } catch (err) {
      dispatch({ type: "connect-error", message: describeWalletError(err).message });
    }
  }, []);

  const switchNetwork = useCallback(async () => {
    const provider: Eip1193Provider | null = getInjectedProvider();
    if (!provider) {
      dispatch({ type: "error", message: "No wallet is available to switch networks." });
      return;
    }
    try {
      await switchToNetwork(provider, network);
      const chainId = await readChainId(provider);
      dispatch({ type: "chain-changed", chainId });
    } catch (err) {
      dispatch({ type: "error", message: describeWalletError(err).message });
    }
  }, [network]);

  const disconnect = useCallback(() => dispatch({ type: "disconnect" }), []);

  const value = useMemo<WalletContextValue>(
    () => ({
      state,
      network,
      isSupportedNetwork: state.chainId === network.chainId,
      connect,
      disconnect,
      switchNetwork,
    }),
    [state, network, connect, disconnect, switchNetwork],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}
