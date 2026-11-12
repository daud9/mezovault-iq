import { useRef, useState, type FormEvent } from "react";
import { ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { SectionHeader } from "../components/ui/SectionHeader";
import {
  CHAIN_WATCH_BRIDGE_GUIDES,
  CHAIN_WATCH_NETWORKS,
  CHAIN_WATCH_SOURCES,
  WATCHED_SYMBOLS,
  type ChainWatchNetworkConfig,
  type ChainWatchSymbol,
} from "../config/chainWatch";
import { isAddress } from "../lib/abi";
import {
  readChainWatchNetwork,
  type ChainWatchNetworkBalance,
  type ChainWatchTokenBalance,
} from "../lib/chainWatch";

interface LookupView {
  status: "idle" | "loading" | "done" | "failed";
  address: string | null;
  results: ChainWatchNetworkBalance[];
  error: string | null;
}

const EMPTY_VIEW: LookupView = { status: "idle", address: null, results: [], error: null };

export function ChainWatch() {
  const [address, setAddress] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [view, setView] = useState<LookupView>(EMPTY_VIEW);
  const requestSequence = useRef(0);

  async function lookup(rawAddress: string) {
    const normalized = rawAddress.trim();
    if (!isAddress(normalized)) {
      setValidationError("Enter a valid 0x-prefixed 20-byte EVM address.");
      setView(EMPTY_VIEW);
      return;
    }

    const requestId = ++requestSequence.current;
    setValidationError(null);
    setView({ status: "loading", address: normalized, results: [], error: null });
    try {
      const results = await Promise.all(
        CHAIN_WATCH_NETWORKS.map((network) => readChainWatchNetwork(network, normalized)),
      );
      if (requestSequence.current === requestId) {
        setView({ status: "done", address: normalized, results, error: null });
      }
    } catch {
      if (requestSequence.current === requestId) {
        setView({
          status: "failed",
          address: normalized,
          results: [],
          error: "The lookup could not be completed. Check the address and try again.",
        });
      }
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void lookup(address);
  }

  function handleAddressChange(value: string) {
    requestSequence.current += 1;
    setAddress(value);
    setValidationError(null);
    setView(EMPTY_VIEW);
  }

  function clear() {
    requestSequence.current += 1;
    setAddress("");
    setValidationError(null);
    setView(EMPTY_VIEW);
  }

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Access & Distribution · Public read-only checks"
        title="MUSD / MEZO Chain Watch"
        description="Check a public EVM address across verified Mezo, Ethereum, Base, and BNB Chain token routes. No wallet connection is needed."
      />

      <Card highlight className="space-y-5">
        <form onSubmit={handleSubmit} noValidate className="space-y-3">
          <label htmlFor="chain-watch-address" className="block text-sm font-semibold text-mist-100">
            Public EVM address
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="chain-watch-address"
              name="public-address"
              type="text"
              inputMode="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={address}
              onChange={(event) => handleAddressChange(event.target.value)}
              placeholder="0x…"
              aria-invalid={validationError ? "true" : "false"}
              aria-describedby="chain-watch-address-hint chain-watch-address-error"
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-ink-950 px-4 py-2.5 font-mono text-sm text-mist-100 placeholder:text-mist-500"
            />
            <Button type="submit" disabled={view.status === "loading"} className="min-h-11 px-5">
              {view.status === "loading" ? <><RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> Checking chains…</> : "Check balances"}
            </Button>
            <Button type="button" variant="secondary" onClick={clear} className="min-h-11">
              Clear
            </Button>
          </div>
          <p id="chain-watch-address-hint" className="text-xs leading-relaxed text-mist-500">
            Nothing is queried until you press Check balances. The address is not added to the URL or browser storage by this page.
          </p>
          <p id="chain-watch-address-error" className="min-h-5 text-sm text-risk-high" role="alert">
            {validationError ?? ""}
          </p>
        </form>

        <div className="flex gap-3 rounded-xl border border-gold-500/20 bg-gold-500/5 p-4 text-sm leading-relaxed text-mist-300">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" aria-hidden="true" />
          <p>
            <span className="font-semibold text-mist-100">Privacy and permissions:</span> on submission, the relevant public RPC providers receive the address in read-only balance requests and may log it. This page does not connect a wallet, sign, bridge, transfer, or save the address. Use only an address you are comfortable querying through those providers.
          </p>
        </div>
      </Card>

      {view.status === "loading" && (
        <Card>
          <p role="status" className="text-sm text-mist-300">Checking verified token contracts on each supported EVM network…</p>
        </Card>
      )}
      {view.status === "failed" && (
        <Card>
          <p role="alert" className="text-sm text-risk-high">{view.error}</p>
        </Card>
      )}
      {view.status === "done" && (
        <section aria-labelledby="chain-watch-results-title" className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="chain-watch-results-title" className="text-lg font-semibold text-mist-100">Balances by network</h2>
              <p className="mt-1 text-sm text-mist-400">For {shortAddress(view.address ?? "")} · each network is a separate balance, not a combined portfolio.</p>
            </div>
            <Button type="button" variant="ghost" onClick={() => void lookup(view.address ?? "")} className="min-h-11 px-2">
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh reads
            </Button>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {view.results.map((result) => (
              <NetworkCard key={result.network.key} result={result} address={view.address ?? ""} />
            ))}
          </div>
          <Card className="space-y-2 text-sm leading-relaxed text-mist-400">
            <p className="font-medium text-mist-200">How to read these balances</p>
            <p>Each figure is read from that network at the displayed block after the RPC chain ID and token contract code, symbol, and 18 decimals are checked. A verified zero is shown as 0; an unavailable read stays unavailable. No USD valuation, total, price, or cross-network fungibility is implied.</p>
          </Card>
        </section>
      )}

      <section aria-labelledby="chain-watch-bridges-title" className="space-y-4">
        <div>
          <h2 id="chain-watch-bridges-title" className="text-lg font-semibold text-mist-100">Official bridge guides</h2>
          <p className="mt-1 text-sm leading-relaxed text-mist-400">These are Mezo documentation links, not bridge actions. Review the route and transaction details on the official interface before deciding whether to connect or sign there.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {CHAIN_WATCH_BRIDGE_GUIDES.map((guide) => (
            <Card key={guide.symbol} className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-400">{guide.symbol} route</p>
                <p className="mt-2 text-base font-semibold text-mist-100">{guide.route}</p>
                <p className="mt-2 text-sm leading-relaxed text-mist-400">{guide.note}</p>
              </div>
              <a href={guide.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-gold-300 hover:underline">
                Mezo official bridge documentation <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            </Card>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-mist-500">
          Token addresses come from the <a href={CHAIN_WATCH_SOURCES.contracts} target="_blank" rel="noopener noreferrer" className="text-gold-300 hover:underline">Mezo contracts reference</a>. Ethereum, Base, and BNB use shared PublicNode RPC endpoints; Mezo uses its public mainnet/testnet endpoints. Providers are independent services, not part of this app.
        </p>
      </section>
    </div>
  );
}

function NetworkCard({ result, address }: { result: ChainWatchNetworkBalance; address: string }) {
  const network = result.network;
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-mist-100">{network.label}</h3>
          <p className="mt-1 text-xs text-mist-500">Chain ID {network.chainId} · {network.rpcProvider}</p>
        </div>
        <span className={[
          "rounded-full border px-2.5 py-1 text-xs font-medium",
          result.status === "available"
            ? "border-risk-low/30 bg-risk-low/10 text-risk-low"
            : "border-risk-medium/30 bg-risk-medium/10 text-risk-medium",
        ].join(" ")}>
          {result.status === "available" ? "Chain verified" : "Unavailable"}
        </span>
      </div>

      {result.message && <p className="rounded-lg border border-risk-medium/20 bg-risk-medium/5 p-3 text-xs leading-relaxed text-mist-300">{result.message}</p>}

      <div className="space-y-3">
        {WATCHED_SYMBOLS.map((symbol) => (
          <TokenRow
            key={symbol}
            network={network}
            symbol={symbol}
            token={result.tokens[symbol]}
            address={address}
          />
        ))}
      </div>

      {result.blockNumber && result.retrievedAt && (
        <p className="border-t border-line pt-3 text-xs text-mist-500">Read at block {Number(result.blockNumber).toLocaleString()} · {new Date(result.retrievedAt).toLocaleString()}</p>
      )}
    </Card>
  );
}

function TokenRow({
  network,
  symbol,
  token,
  address,
}: {
  network: ChainWatchNetworkConfig;
  symbol: ChainWatchSymbol;
  token: ChainWatchTokenBalance;
  address: string;
}) {
  const config = network.tokens[symbol];
  if (token.status === "not-supported" || !config) {
    return (
      <div className="rounded-xl border border-line bg-ink-800/40 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-mist-200">{symbol}</p>
          <span className="text-xs font-medium text-mist-500">Not supported</span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-mist-500">No verified {symbol} route is listed for this network. This is not a zero balance.</p>
      </div>
    );
  }

  const tokenAddress = token.status === "ok" ? token.tokenAddress : token.tokenAddress;
  const explorerRoot = network.explorerUrl.replace(/\/?$/, "/");
  return (
    <div className="rounded-xl border border-line bg-ink-800/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-mist-200">{symbol}</p>
        <span className={token.status === "ok" ? "text-xs font-medium text-risk-low" : "text-xs font-medium text-risk-medium"}>
          {token.status === "ok" ? "Contract verified" : "Balance unavailable"}
        </span>
      </div>
      {token.status === "ok" ? (
        <>
          <p className="mt-2 break-all text-2xl font-semibold tracking-tight text-mist-100">{token.formatted} <span className="text-base text-mist-400">{token.symbol}</span></p>
          <p className="mt-1 text-xs text-mist-500">On-chain symbol matched · {token.decimals} decimals · no price applied</p>
        </>
      ) : (
        <p className="mt-2 text-sm leading-relaxed text-mist-400">{token.reason}</p>
      )}
      <p className="mt-3 break-all font-mono text-[11px] text-mist-500">Token {tokenAddress}</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <a href={`${explorerRoot}address/${address}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-gold-300 hover:underline">
          Address <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
        <a href={`${explorerRoot}address/${tokenAddress}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-gold-300 hover:underline">
          Token contract <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

function shortAddress(address: string): string {
  return address.length > 14 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}
