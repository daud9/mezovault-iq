import { useCallback, useEffect, useRef, useState } from "react";
import { useWallet } from "../components/wallet/WalletProvider";
import { resolveRpcUrl } from "../config/env";
import { readLoan, type LoanResult } from "../lib/loan";
import { createRpcClient } from "../lib/rpc";

export type LoanView =
  | { status: "idle" }
  | { status: "wrong-network"; actualChainId: number | null; expectedChainId: number }
  | { status: "loading" }
  | { status: "done"; result: LoanResult };

interface KeyedLoanView {
  key: string;
  view: LoanView;
}

/** Shared, read-only current Trove read for the connected wallet and selected Mezo network. */
export function useLoan(): { view: LoanView; refresh: () => void } {
  const { state, network } = useWallet();
  const [tick, setTick] = useState(0);
  const address = state.address;
  const connected = state.status === "connected" && address !== null;
  const walletContextKey = `${connected}|${address?.toLowerCase() ?? ""}|${state.chainId ?? ""}|${network.key}|${network.chainId}`;
  const readKey = `${address?.toLowerCase() ?? ""}|${state.chainId ?? ""}|${network.key}|${network.chainId}|${tick}`;
  const [stored, setStored] = useState<KeyedLoanView | null>(null);
  const previousContextKey = useRef(walletContextKey);

  useEffect(() => {
    if (previousContextKey.current !== walletContextKey) {
      previousContextKey.current = walletContextKey;
      setStored(null);
    }
  }, [walletContextKey]);

  useEffect(() => {
    if (!connected || !address) return;
    if (state.chainId !== network.chainId) return;

    let cancelled = false;
    setStored({ key: readKey, view: { status: "loading" } });
    const rpc = createRpcClient({ url: resolveRpcUrl(network) });
    void readLoan({ network, owner: address, rpc })
      .then((result) => {
        if (!cancelled) setStored({ key: readKey, view: { status: "done", result } });
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "The Trove position could not be read.";
        if (!cancelled) {
          setStored({ key: readKey, view: { status: "done", result: { status: "error", kind: "unknown", message } } });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [connected, address, state.chainId, network, readKey]);

  const refresh = useCallback(() => setTick((current) => current + 1), []);

  let view: LoanView;
  if (!connected || !address) {
    view = { status: "idle" };
  } else if (state.chainId !== network.chainId) {
    view = { status: "wrong-network", actualChainId: state.chainId, expectedChainId: network.chainId };
  } else if (stored?.key === readKey) {
    view = stored.view;
  } else {
    view = { status: "loading" };
  }

  return { view, refresh };
}
