import { useState } from "react";
import { ExternalLink, Wallet } from "lucide-react";
import { Button } from "../ui/Button";
import { useWallet } from "../wallet/WalletProvider";
import { shortAddress } from "../../lib/format";
import { buildMobileWalletLink, isMobileUserAgent } from "../../lib/walletDiscovery";
import { WalletDetailsPopover } from "./WalletDetailsPopover";

/**
 * Connect Wallet control. Shows the shortened address once connected, and opens a panel with
 * the full address, network status and an app-local disconnect action. Touch targets are at least 44px tall.
 */
export function WalletButton({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const { state, network, isSupportedNetwork, connect, walletChoices, chooseWallet, disconnect, switchNetwork } = useWallet();
  const [open, setOpen] = useState(false);
  const compactPadding = compact ? "px-2 sm:px-4" : "px-4";
  const compactType = compact ? "max-[360px]:text-xs" : "";

  const isConnected = state.status === "connected" && state.address !== null;
  const mobileLink =
    state.walletFound === false && typeof navigator !== "undefined" && isMobileUserAgent(navigator.userAgent)
      ? buildMobileWalletLink(window.location.href)
      : null;

  if (state.status === "connecting") {
    return (
      <Button variant="secondary" disabled className={`min-h-11 whitespace-nowrap ${compactPadding} text-sm ${compactType} ${className}`}>
        Connecting…
      </Button>
    );
  }

  if (isConnected && state.address) {
    return (
      <WalletDetailsPopover
        className={className}
        open={open}
        onToggle={() => setOpen((current) => !current)}
        buttonClassName={`inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-xl border ${compactPadding} text-sm ${compactType} font-semibold transition ${
          isSupportedNetwork
            ? "border-gold-500/50 bg-gold-500/10 text-gold-300 hover:bg-gold-500/20"
            : "border-risk-high/50 bg-risk-high/10 text-risk-high"
        }`}
        buttonContent={
          <>
            <Wallet className="h-4 w-4" aria-hidden="true" />
            {isSupportedNetwork ? shortAddress(state.address) : "Wrong network"}
          </>
        }
        panelClassName="absolute right-0 top-full z-30 mt-2 w-[min(18rem,calc(100vw-2.5rem))] space-y-4 rounded-xl border border-line bg-ink-900 p-4 text-sm shadow-xl"
      >
        <div>
          <p className="text-xs text-mist-500">Connected{state.walletName ? ` with ${state.walletName}` : ""}</p>
          <p className="mt-1 break-all font-mono text-xs text-mist-100">{state.address}</p>
        </div>
        <div>
          <p className="text-xs text-mist-500">Network</p>
          <p className={isSupportedNetwork ? "text-mist-200" : "text-risk-high"}>
            {isSupportedNetwork ? network.label : `Not ${network.label}`}
          </p>
        </div>
        {state.error && <p role="alert" className="rounded-lg border border-risk-high/40 bg-risk-high/10 p-3 text-xs leading-relaxed text-risk-high">{state.error}</p>}
        {!isSupportedNetwork && (
          <Button onClick={switchNetwork} className="min-h-11 w-full">
            Switch to {network.label}
          </Button>
        )}
        <Button variant="secondary" onClick={() => { disconnect(); setOpen(false); }} className="min-h-11 w-full">
          Disconnect in this app
        </Button>
        <p className="text-xs leading-relaxed text-mist-500">This clears the connection shown here. It does not revoke this app’s authorization in your wallet.</p>
      </WalletDetailsPopover>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={connect}
        className={`inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-br from-gold-300 to-gold-500 ${compactPadding} text-sm ${compactType} font-semibold text-ink-950 shadow-[0_8px_30px_-12px_rgba(212,175,106,0.6)] transition hover:brightness-110`}
      >
        <Wallet className="h-4 w-4" aria-hidden="true" />
        {compact ? <><span className="sm:hidden">Connect</span><span className="hidden sm:inline">Connect Wallet</span></> : "Connect Wallet"}
      </button>

      {state.error && (
        <div role="alert" className="absolute right-0 top-full z-30 mt-2 w-[min(18rem,calc(100vw-2.5rem))] space-y-3 rounded-xl border border-risk-high/40 bg-ink-900 p-4 text-xs leading-relaxed text-mist-200 shadow-xl">
          <p>{state.error}</p>
          {mobileLink && (
            <a
              href={mobileLink}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-gold-500/50 px-3 text-sm font-semibold text-gold-300 hover:bg-gold-500/10"
            >
              Open in MetaMask app <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          )}
        </div>
      )}
      {walletChoices.length > 1 && (
        <div role="group" aria-label="Choose a wallet to connect" className="absolute right-0 top-full z-30 mt-2 w-[min(18rem,calc(100vw-2.5rem))] space-y-2 rounded-xl border border-line bg-ink-900 p-3 shadow-xl">
          <p className="px-1 text-xs font-medium text-mist-300">Choose a wallet before connecting</p>
          {walletChoices.map((wallet) => (
            <Button key={wallet.uuid} variant="secondary" onClick={() => void chooseWallet(wallet.uuid)} className="min-h-11 w-full justify-start">
              {wallet.name}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
