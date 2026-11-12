import { ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { DataStatus } from "../components/ui/DataStatus";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/StateViews";
import { SectionHeader } from "../components/ui/SectionHeader";
import { useWallet } from "../components/wallet/WalletProvider";
import { OFFICIAL_SOURCES } from "../config/chains";
import { TESTNET_CL_CONTRACTS } from "../config/clPositions";
import { useClPositions } from "../hooks/useClPositions";
import { formatClAmount, type ClPositionView } from "../lib/clPositions";
import { explorerAddressUrl } from "../lib/explorer";
import { shortAddress } from "../lib/format";

export function ClPositionMonitor() {
  const { state, network } = useWallet();
  const { view, refresh } = useClPositions();
  const testnet = network.key === "testnet" && network.chainId === TESTNET_CL_CONTRACTS.chainId;
  const connected = state.status === "connected" && state.address !== null;
  const walletOnNetwork = connected && state.chainId === TESTNET_CL_CONTRACTS.chainId;

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Mezo Testnet · live on-chain · read-only"
        title="CL Position Monitor"
        description="A wallet-specific view of Slipstream concentrated-liquidity NFTs: live pool ticks, your position ranges, simulated collect estimates, and gauge reward data where the contracts expose it."
        actions={testnet && walletOnNetwork ? (
          <Button variant="ghost" onClick={refresh} className="min-h-11 px-2">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
          </Button>
        ) : undefined}
      />

      {!testnet ? (
        <Card className="space-y-3">
          <DataStatus state="not-configured" detail="Mezo Testnet only" />
          <p className="text-sm leading-relaxed text-mist-400">This monitor reads only the official Mezo Testnet CL deployments. This app build is configured for {network.label}; changing the wallet network alone cannot change the app’s configured network. No mainnet CL positions are queried.</p>
        </Card>
      ) : !connected ? (
        <Card className="space-y-3">
          <DataStatus state="not-configured" detail="Wallet connection required" />
          <h2 className="text-base font-semibold text-mist-100">Connect a wallet to inspect its positions</h2>
          <p className="text-sm leading-relaxed text-mist-400">The monitor reads only the selected public wallet address. It does not request keys or send transactions. Connect using the wallet control in the app header.</p>
        </Card>
      ) : !walletOnNetwork ? (
        <Card className="space-y-3">
          <DataStatus state="unavailable" detail="Wrong wallet network" />
          <h2 className="text-base font-semibold text-mist-100">Switch the wallet to Mezo Testnet</h2>
          <p className="text-sm leading-relaxed text-mist-400">The connected wallet is on chain {state.chainId ?? "unknown"}. The position monitor requires chain 31611 and does not query a different network.</p>
        </Card>
      ) : view.status === "loading" || view.status === "idle" ? (
        <LoadingState label="Reading the connected wallet’s CL NFTs and gauge positions from Mezo Testnet" />
      ) : view.status === "error" ? (
        <ErrorState title="Live position read unavailable" description={view.message} onRetry={refresh} />
      ) : view.snapshot.positions.length === 0 ? (
        <EmptyState
          title="No CL positions found for this wallet"
          description={`At block ${view.snapshot.blockNumber}, the position manager and all ${view.snapshot.poolCount} factory pools were checked for wallet-held NFTs and gauge-staked positions. No position was found.`}
          action={<Button variant="secondary" onClick={refresh}><RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh live reads</Button>}
        />
      ) : (
        <>
          <SnapshotSummary snapshot={view.snapshot} />
          <div className="space-y-4">
            {view.snapshot.positions.map((position) => (
              <PositionCard key={position.tokenId} position={position} network={network} />
            ))}
          </div>
          <Card className="space-y-3 text-sm leading-relaxed text-mist-400">
            <h2 className="font-medium text-mist-200">Read-only safety and data notes</h2>
            <p>Everything above is read from Mezo Testnet at block {view.snapshot.blockNumber}. “Simulated collect estimate” is the return from an <code className="text-mist-300">eth_call</code> at that block; it does not collect, transfer, or persist anything and can differ from a later wallet transaction. If the simulation is unavailable, the displayed stored-owed amounts are only the last values checkpointed by the position manager.</p>
            <p>This screen has no approval, deposit, decrease-liquidity, collect, stake, unstake, claim, or transaction action. Exit guidance describes the normal contract path only; it is not an execution button.</p>
            <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
              <a href={OFFICIAL_SOURCES.mezoPools} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 font-medium text-gold-300 hover:underline">
                Mezo Pools docs <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
              <a href={OFFICIAL_SOURCES.contractsReference} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 font-medium text-gold-300 hover:underline">
                Contract reference <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function SnapshotSummary({ snapshot }: { snapshot: { blockNumber: number; poolCount: number; positions: ClPositionView[]; fetchedAt: string } }) {
  const inRange = snapshot.positions.filter((position) => position.rangeState === "in-range").length;
  const staked = snapshot.positions.filter((position) => position.isStaked).length;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <SummaryTile label="Your CL positions" value={snapshot.positions.length.toString()} detail={`${staked} staked · ${snapshot.positions.length - staked} wallet-held`} />
      <SummaryTile label="Currently in range" value={`${inRange} / ${snapshot.positions.length}`} detail="Compared with each pool’s live tick" />
      <SummaryTile label="Testnet pools checked" value={snapshot.poolCount.toString()} detail="Factory-enumerated, including gauges" />
      <SummaryTile label="Snapshot" value={`Block ${snapshot.blockNumber.toLocaleString()}`} detail={`Read ${new Date(snapshot.fetchedAt).toLocaleTimeString()}`} />
    </div>
  );
}

function SummaryTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wider text-mist-500">{label}</p>
      <p className="text-xl font-semibold text-mist-100">{value}</p>
      <p className="text-xs text-mist-500">{detail}</p>
    </Card>
  );
}

function PositionCard({ position, network }: { position: ClPositionView; network: ReturnType<typeof useWallet>["network"] }) {
  const pair = `${position.token0.symbol}/${position.token1.symbol}`;
  const rangeTone = position.rangeState === "in-range" ? "text-emerald-300" : "text-risk-medium";
  const rangeLabel = position.rangeState === "in-range" ? "In range" : position.rangeState === "below-range" ? "Below range" : "Above range";
  const schedule = position.rewardSchedule;
  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-mist-100">{pair}</h2>
            <span className="rounded-full border border-line px-2.5 py-1 text-xs text-mist-300">NFT #{position.tokenId}</span>
          </div>
          <p className="mt-1 text-xs text-mist-500">Slipstream CL · tick spacing {position.tickSpacing} · pool {shortAddress(position.poolAddress)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DataStatus state="live" detail={position.isStaked ? "Gauge-staked" : position.gaugeAddress ? "Not staked" : "No gauge"} />
          <a href={explorerAddressUrl(network, position.poolAddress)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-gold-300 hover:underline">
            Pool explorer <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Live range status" value={rangeLabel} detail={`Live tick ${position.currentTick.toLocaleString()}`} valueClass={rangeTone} />
        <Metric label="Position range" value={`${position.tickLower.toLocaleString()} → ${position.tickUpper.toLocaleString()}`} detail="Lower-inclusive · upper-exclusive" />
        <Metric label="Liquidity" value={formatLiquidity(position.liquidity)} detail={`Exact raw liquidity: ${position.liquidity}`} />
        <Metric label="Gauge" value={position.isStaked ? "Staked" : position.gaugeAddress ? "Not staked" : "Not configured"} detail={position.gaugeAddress ? shortAddress(position.gaugeAddress) : "No pool gauge address read"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-line bg-ink-800/50 p-4" aria-label="Fee estimate">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-mist-100">Fees / collect estimate</h3>
            <span className="rounded-full border border-gold-500/30 px-2 py-1 text-[11px] font-medium text-gold-300">{position.feeRead.status === "simulated" ? "Simulated only" : "Simulation unavailable"}</span>
          </div>
          {position.feeRead.status === "simulated" ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <TokenValue token={position.token0} amount={position.feeRead.token0Amount ?? "0"} />
              <TokenValue token={position.token1} amount={position.feeRead.token1Amount ?? "0"} />
            </div>
          ) : (
            <>
              <p className="mt-3 text-sm text-mist-400">A fee simulation did not complete. These are stored amounts from the last position update, not a live collectible total.</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <TokenValue token={position.token0} amount={position.feeRead.storedToken0Owed} />
                <TokenValue token={position.token1} amount={position.feeRead.storedToken1Owed} />
              </div>
            </>
          )}
        </section>

        <section className="rounded-xl border border-line bg-ink-800/50 p-4" aria-label="Gauge reward schedule">
          <h3 className="text-sm font-semibold text-mist-100">Gauge & rewards</h3>
          {!position.gaugeAddress ? (
            <p className="mt-3 text-sm text-mist-400">No gauge is configured for this pool in the live pool state.</p>
          ) : schedule?.status !== "available" ? (
            <p className="mt-3 text-sm text-mist-400">The gauge address is known, but its reward schedule could not be read. No schedule is inferred.</p>
          ) : (
            <div className="mt-3 space-y-2 text-sm">
              <p className="text-mist-300">{schedule.active === true ? "Active reward period" : schedule.active === false ? "No active reward period at this block" : "Reward period status unavailable"}</p>
              <p className="text-mist-400">Rate: {schedule.rewardRate !== null && schedule.token ? `${formatClAmount(schedule.rewardRate, schedule.token.decimals)} ${schedule.token.symbol} / second` : "unavailable"}</p>
              <p className="text-mist-400">Period ends: {schedule.periodFinish === null ? "unavailable" : new Date(schedule.periodFinish * 1_000).toLocaleString()}</p>
              {position.isStaked && schedule.earned !== null && schedule.token && <p className="text-mist-300">Gauge <code className="text-xs">earned</code> read: {formatClAmount(schedule.earned, schedule.token.decimals)} {schedule.token.symbol}</p>}
              {position.isStaked && schedule.earned === null && <p className="text-xs text-mist-500">Per-position earned read unavailable; no reward amount is assumed.</p>}
              {!position.isStaked && <p className="text-xs text-mist-500">This NFT is not staked; no per-position gauge earnings are shown.</p>}
            </div>
          )}
        </section>
      </div>

      <div className="border-t border-line pt-4">
        <p className="text-xs font-medium uppercase tracking-wider text-mist-500">Exit-path guidance · not an action</p>
        <p className="mt-2 text-sm leading-relaxed text-mist-400">{position.isStaked
          ? "The gauge currently holds this NFT. The usual exit path starts by withdrawing the position from its gauge; after it returns to the wallet, liquidity management and fee collection are handled through the position manager."
          : "This NFT is currently held by the wallet. The usual full exit is to decrease the position’s liquidity, then collect the resulting owed tokens through the position manager; neither step is available here."}</p>
      </div>
    </Card>
  );
}

function Metric({ label, value, detail, valueClass = "text-mist-100" }: { label: string; value: string; detail: string; valueClass?: string }) {
  return (
    <div className="rounded-xl border border-line bg-ink-800/50 p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-mist-500">{label}</p>
      <p className={`mt-2 break-words text-base font-semibold ${valueClass}`}>{value}</p>
      <p className="mt-1 break-all text-xs text-mist-500">{detail}</p>
    </div>
  );
}

function TokenValue({ token, amount }: { token: ClPositionView["token0"]; amount: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-mist-500">{token.symbol}</p>
      <p className="mt-1 break-all text-sm font-semibold text-mist-100">{formatClAmount(amount, token.decimals)}</p>
      <p className="mt-1 text-[11px] text-mist-500">{shortAddress(token.address)}{token.decimals === null ? " · decimals unavailable" : ` · ${token.decimals} decimals`}</p>
    </div>
  );
}

function formatLiquidity(value: string): string {
  const n = BigInt(value);
  if (n === 0n) return "0";
  if (n < 1_000_000n) return n.toLocaleString();
  if (n < 1_000_000_000n) return `${(Number(n) / 1_000_000).toFixed(2)}M`;
  return `${(Number(n) / 1_000_000_000).toFixed(2)}B`;
}
