import { ExternalLink } from "lucide-react";
import { PROTOCOL_EVIDENCE, type EvidenceCheck, type EvidenceState } from "../../config/protocolEvidence";
import { MEZO_NETWORKS } from "../../config/chains";
import { explorerAddressUrl } from "../../lib/explorer";
import { shortAddress } from "../../lib/format";
import { Card } from "../ui/Card";

const STATE_LABEL: Record<EvidenceState, string> = {
  confirmed: "Confirmed",
  partial: "Partial evidence",
  "not-verified": "Not verified",
};
const STATE_STYLE: Record<EvidenceState, string> = {
  confirmed: "border-risk-low/40 bg-risk-low/10 text-risk-low",
  partial: "border-risk-medium/40 bg-risk-medium/10 text-risk-medium",
  "not-verified": "border-line bg-ink-800 text-mist-400",
};

function EvidenceStage({ label, check }: { label: string; check: EvidenceCheck }) {
  return (
    <div className="space-y-1.5 rounded-lg border border-line bg-ink-800/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-mist-300">{label}</p>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATE_STYLE[check.state]}`}>
          {STATE_LABEL[check.state]}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-mist-500">{check.detail}</p>
    </div>
  );
}

/** A source-linked evidence inventory, not a safety or profitability score. */
export function ProtocolEvidenceBoard() {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-mist-400">
        These are separate evidence questions, not a single verification badge. An official address can be documented without proving current deployment, source identity, or working operations. “Last check” states whether a repository record exists; it is not presented as a fresh live RPC check.
      </p>
      <div className="grid gap-4 xl:grid-cols-2">
        {PROTOCOL_EVIDENCE.map((record) => (
          <Card key={record.id} className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-mist-100">{record.name}</h3>
                <p className="mt-1 text-sm leading-relaxed text-mist-400">{record.purpose}</p>
              </div>
              {record.candidateOnly && <span className="rounded-full border border-risk-medium/40 bg-risk-medium/10 px-2.5 py-1 text-xs font-medium text-risk-medium">Candidate only</span>}
            </div>
            <div className="space-y-2 border-t border-line pt-3">
              <p className="text-xs font-medium uppercase tracking-wider text-mist-500">Address and source</p>
              {record.address ? (
                <a href={explorerAddressUrl(MEZO_NETWORKS.testnet, record.address)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 break-all text-sm font-medium text-gold-300 hover:underline">
                  {record.address} <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </a>
              ) : <p className="text-sm text-mist-400">No verified Testnet address recorded.</p>}
              {record.source ? (
                <p><a href={record.source} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-gold-300 hover:underline">Source record <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a></p>
              ) : <p className="text-xs text-mist-500">Source: not recorded.</p>}
              {record.address && <p className="text-xs text-mist-500">Short address: {shortAddress(record.address)}</p>}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <EvidenceStage label="Documented" check={record.documented} />
              <EvidenceStage label="Deployed" check={record.deployed} />
              <EvidenceStage label="Source verified" check={record.sourceVerified} />
              <EvidenceStage label="Operationally tested" check={record.operationallyTested} />
            </div>
            <p className="border-t border-line pt-3 text-xs leading-relaxed text-mist-500">
              <span className="font-medium text-mist-300">Last check:</span> {record.lastCheck ?? "Not checked; no source record on file."} {record.notes}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
