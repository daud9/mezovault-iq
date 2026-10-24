import { Wallet } from "lucide-react";
import { Button } from "../ui/Button";
import { useWallet } from "../wallet/WalletProvider";
import { shortAddress } from "../../lib/format";

/** Header control: connect, show the connected address and network, and disconnect. */
export function WalletButton() {
  const { state, network, isSupportedNetwork, connect, disconnect } = useWallet();

  if (state.status === "no-wallet") {
    return (
      <Button variant="secondary" disabled title="No browser wallet was found. Install one, then reload." className="px-3 py-2 text-xs sm:text-sm">
        <Wallet className="h-4 w-4" aria-hidden="true" />
        No wallet
      </Button>
    );
  }

  if (state.status === "connecting") {
    return (
      <Button variant="secondary" disabled className="px-3 py-2 text-xs sm:text-sm">
        Connecting…
      </Button>
    );
  }

  if (state.status === "connected" && state.address) {
    return (
      <div className="flex items-center gap-2">
        <span
          className={`hidden rounded-full border px-2.5 py-1 text-xs font-medium sm:inline ${
            isSupportedNetwork ? "border-line text-mist-300" : "border-risk-high/40 text-risk-high"
          }`}
          title={isSupportedNetwork ? network.label : "Wrong network"}
        >
          {isSupportedNetwork ? shortAddress(state.address) : "Wrong network"}
        </span>
        <Button variant="secondary" onClick={disconnect} className="px-3 py-2 text-xs sm:text-sm">
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <Button variant="secondary" onClick={connect} className="px-3 py-2 text-xs sm:text-sm">
      <Wallet className="h-4 w-4" aria-hidden="true" />
      Connect wallet
    </Button>
  );
}
