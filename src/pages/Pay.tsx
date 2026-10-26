import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { ButtonLink } from "../components/ui/Button";
import { SectionHeader } from "../components/ui/SectionHeader";
import { DataStatus } from "../components/ui/DataStatus";
import { useWallet } from "../components/wallet/WalletProvider";
import { parsePaymentParams, buildSendQuery } from "../lib/paymentRequest";
import { shortAddress } from "../lib/format";

/** Shows a payment request from a link. It moves no funds. The payer reviews and authorizes on the Send page. */
export function Pay() {
  const [params] = useSearchParams();
  const { state, network, isSupportedNetwork } = useWallet();
  const parsed = useMemo(() => parsePaymentParams(params), [params]);

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Mezo Pay"
        title="Payment request"
        description="Review the details below. Nothing is sent from this page. Authorizing happens in your own wallet on the next screen."
      />

      {parsed.error && (
        <Card className="space-y-3 border-risk-high/40">
          <DataStatus state="unavailable" detail="invalid request" />
          <p className="text-sm text-mist-300">{parsed.error}</p>
          <Link to="/app" className="inline-flex min-h-11 items-center text-sm font-medium text-gold-300 hover:underline">Go to the portfolio</Link>
        </Card>
      )}

      {!parsed.error && !parsed.request && (
        <Card className="space-y-3">
          <p className="text-sm text-mist-300">This link does not contain a payment request.</p>
          <Link to="/app/send" className="inline-flex min-h-11 items-center text-sm font-medium text-gold-300 hover:underline">Open Mezo Pay</Link>
        </Card>
      )}

      {parsed.request && (
        <Card highlight className="space-y-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-gold-400">Requested</p>
            <p className="mt-1 text-3xl font-semibold text-mist-100">
              {parsed.request.amount || "Amount not set"} <span className="text-lg text-gold-300">{parsed.request.token}</span>
            </p>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-mist-500">Recipient</dt><dd className="break-all font-mono text-mist-200">{parsed.request.to}</dd></div>
            <div><dt className="text-xs text-mist-500">Network</dt><dd className="text-mist-200">{network.label} (chain {network.chainId})</dd></div>
          </dl>
          <p className="text-xs leading-relaxed text-mist-500">
            Confirm the recipient and amount carefully. A confirmed payment cannot be reversed. Network fees are added on the next screen.
          </p>

          {state.status !== "connected" ? (
            <p className="text-sm text-mist-400">Connect your wallet from the header to continue.</p>
          ) : !isSupportedNetwork ? (
            <p className="text-sm text-mist-400">Switch your wallet to {network.label} before paying this request.</p>
          ) : parsed.request.amount ? (
            <ButtonLink to={`/app/send?${buildSendQuery(parsed.request)}`} className="min-h-11 w-full">
              Review and authorize from {shortAddress(state.address ?? "0x")}
            </ButtonLink>
          ) : (
            <p className="text-sm text-mist-400">This request has no amount. Enter one on the Send page before paying.</p>
          )}
        </Card>
      )}
    </div>
  );
}
