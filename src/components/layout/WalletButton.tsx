import { Wallet } from "lucide-react";
import { Button } from "../ui/Button";

/**
 * Stage 1 placeholder. No wallet is connected and no connection is simulated.
 * Replace with a real EVM wallet integration in Stage 2.
 */
export function WalletButton() {
  return (
    <Button variant="secondary" disabled title="Wallet connection arrives in Stage 2" className="px-3 py-2 text-xs sm:text-sm">
      <Wallet className="h-4 w-4" aria-hidden="true" />
      Connect wallet
    </Button>
  );
}
