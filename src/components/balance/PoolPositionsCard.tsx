import { RefreshCw } from "lucide-react";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { DataStatus } from "../ui/DataStatus";
import { useWallet } from "../wallet/WalletProvider";
import { usePoolPositions } from "../../hooks/usePoolPositions";
import { TESTNET_BASIC_POOLS } from "../../config/pools";
import { formatTime, shortAddress } from "../../lib/format";

/** The wallet's share of each verified testnet basic pool, read from the pool contracts. */
export function PoolPositionsCard() {
  const { state, network, isSupportedNetwork } = useWallet();
  const { view, refresh } = usePoolPositions();

  let body: React.ReactNode;
  if (state.status !== "connected") {
    body = <p className="text-sm text-mist-400">Connect a wallet to read its pool positions.</p>;
  } else if (!isSupportedNetwork) {
    body = <p className="text-sm text-mist-400">Switch to {network.label} to read pool positions.</p>;
  } else if (view.status === "idle" || view.status === "loading") {
    body = <p className="text-sm text-mist-400" role="status">Reading pool positions from {network.label}…</p>;
  } else {
    body = (
      <div className="space-y-4">
        {view.results.map(({ poolId, result: r }) => {
          const pool = TESTNET_BASIC_POOLS.find((p) => p.id === poolId)!;
          if (r.status === "ok") {
            return (
              <div key={poolId} className="rounded-xl border border-line bg-ink-800/60 p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-mist-100">{pool.name} pool</p>
                  <span className="text-xs text-mist-500">{shortAddress(r.poolAddress)}</span>
                </div>
                {r.hasPosition ? (
                  <>
                    <p className="text-xs text-mist-400">Your share: <span className="text-mist-100">{r.sharePct.toFixed(2)}%</span></p>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {r.tokens.map((t) => (
                        <div key={t.address}>
                          <p className="text-xs text-mist-500">{shortAddress(t.address)} ({t.decimals} dec.)</p>
                          <p className="text-mist-100">{t.userFormatted}</p>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-mist-500">No position in this pool.</p>
                )}
                <p className="text-xs text-mist-500">Block {r.blockNumber} · retrieved {formatTime(r.retrievedAt)}</p>
              </div>
            );
          }
          if (r.status === "no-contract") {
            return <p key={poolId} className="text-xs text-mist-400">{pool.name}: no contract found at this address. Not shown.</p>;
          }
          if (r.status === "wrong-network") {
            return <p key={poolId} className="text-xs text-mist-400">{pool.name}: the RPC reports a different network. Not shown.</p>;
          }
          return (
            <div key={poolId} className="space-y-1">
              <DataStatus state="unavailable" detail={pool.name} />
              <p className="text-xs text-mist-400">{r.message} No substitute value is shown.</p>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-mist-500">Liquidity positions</p>
          <p className="mt-1 text-sm text-mist-400">Your share of the official basic pools on {network.label}</p>
        </div>
        {state.status === "connected" && isSupportedNetwork && (
          <Button variant="ghost" onClick={refresh} className="min-h-11 px-2">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
          </Button>
        )}
      </div>
      {body}
      <p className="border-t border-line pt-4 text-xs leading-relaxed text-mist-500">
        Amounts are your share of each pool's reserves, read from the pool contract. Fees earned are not included. The app
        does not add, remove or claim liquidity; use the official Mezo Pools app for that.
      </p>
    </Card>
  );
}
