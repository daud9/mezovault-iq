import { ExternalLink } from "lucide-react";
import { useWallet } from "../wallet/WalletProvider";
import { Button } from "../ui/Button";

/**
 * Opens the official Mezo Testnet faucet in a new tab. It does not request or send funds itself.
 */
export function FaucetPanel() {
  const { state, network, isSupportedNetwork, switchNetwork } = useWallet();
  const faucetUrl = network.faucetUrl;
  const connectedElsewhere = state.status === "connected" && !isSupportedNetwork;

  return (
    <div className="space-y-3 border-t border-line pt-5">
      <p className="text-sm leading-relaxed text-mist-400">
        The faucet provides testnet funds for testing. You may need testnet BTC before obtaining MUSD.
      </p>
      <p className="text-xs leading-relaxed text-mist-500">
        Pressing the button opens the faucet in a new tab. It does not request or deposit funds for you.
      </p>

      {connectedElsewhere && (
        <div className="space-y-2 rounded-lg border border-risk-medium/30 bg-risk-medium/10 p-3">
          <p className="text-xs text-mist-200">
            The faucet is for {network.label}. Your wallet is on another network.
          </p>
          <Button variant="secondary" onClick={switchNetwork} className="min-h-11 w-full">
            Switch to {network.label}
          </Button>
        </div>
      )}

      {faucetUrl ? (
        <a
          href={faucetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-gold-500/50 bg-gold-500/10 px-4 text-sm font-semibold text-gold-300 transition hover:bg-gold-500/20 sm:w-auto"
        >
          Get Testnet Funds <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      ) : (
        <p className="text-xs text-mist-500">No faucet is configured for this network.</p>
      )}
    </div>
  );
}
