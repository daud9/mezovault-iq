import { Card } from "../ui/Card";

export function CoverageMap({ fromBlock, toBlock, snapshotBlock, tokens, count }: {
  fromBlock: number;
  toBlock: number;
  snapshotBlock: number;
  tokens: string[];
  count: number;
}) {
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-mist-100">Coverage map <span className="font-normal text-mist-500">(schematic, not to scale)</span></h3>
          <p className="mt-1 text-xs text-mist-500">Only the explicitly requested block interval is represented.</p>
        </div>
        <p className="text-xs text-mist-400">{count.toLocaleString()} log rows loaded</p>
      </div>
      <div role="img" aria-label={`Coverage: ${fromBlock === 0 ? "the loaded range starts at block zero" : `older blocks before ${fromBlock} have not been requested`}; token logs are loaded from block ${fromBlock} to ${toBlock}; snapshot block ${snapshotBlock}.`}>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-dashed border-line bg-ink-800/30 p-3 text-mist-500">
            <span className="block font-medium text-mist-300">{fromBlock === 0 ? "Before block zero" : "Older blocks"}</span>
            {fromBlock === 0 ? "None remain" : "Not requested"}
          </div>
          <div className="rounded-lg border border-gold-500/40 bg-gold-500/10 p-3 text-gold-300">
            <span className="block font-medium">Loaded range</span>
            {fromBlock.toLocaleString()}–{toBlock.toLocaleString()}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px] text-mist-500">
          <span>Older history omitted</span>
          <span>Snapshot endpoint · block {snapshotBlock.toLocaleString()}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <span className="text-xs text-mist-500">Queried tokens:</span>
        {tokens.map((token) => <span key={token} className="rounded-full border border-line px-2.5 py-1 text-xs text-mist-300">{token}</span>)}
      </div>
    </Card>
  );
}
