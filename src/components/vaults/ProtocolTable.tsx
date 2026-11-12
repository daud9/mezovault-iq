import { Card } from "../ui/Card";
import { DataStatus } from "../ui/DataStatus";
import { PROTOCOL_CANDIDATES, type CapabilityStatus, type ProtocolCandidate } from "../../config/protocols";
import { DEFAULT_NETWORK } from "../../config/env";
import { explorerAddressUrl } from "../../lib/explorer";
import { shortAddress } from "../../lib/format";

const CAPABILITY_LABEL: Record<CapabilityStatus, string> = {
  verified: "Verified",
  "not-verified": "Not verified",
  "not-applicable": "n/a",
};

const EVIDENCE_TEXT: Record<ProtocolCandidate["evidence"], string> = {
  "official-address": "Official address",
  "official-docs-no-testnet-address": "Official docs, no testnet address",
  "third-party-only": "Third-party only",
  "mainnet-only": "Mainnet only",
};

const CAPABILITIES = ["deposit", "withdraw", "lend", "borrow", "yield"] as const;

/** What was found for each candidate and which narrow capability the app uses. */
export function ProtocolTable() {
  const anyVerified = PROTOCOL_CANDIDATES.some((p) =>
    Object.values(p.capabilities).some((c) => c === "verified"),
  );

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-mist-100">Protocol availability on Mezo Testnet</h2>
        <DataStatus state="unverified" detail={anyVerified ? "open-Trove borrowing only; runtime preflight required" : "no capability verified"} />
      </div>
      <p className="text-sm leading-relaxed text-mist-400">
        A candidate is listed as verified only when an official Mezo source supports the capability. Borrowing here
        means only opening a new Trove on Testnet after live preflight and wallet approval. Other borrowing/management,
        deposits, withdrawals and yield remain unavailable; this board itself does not submit transactions.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs text-mist-500">
            <tr>
              <th className="py-2 pr-3 font-medium">Candidate</th>
              <th className="py-2 pr-3 font-medium">Evidence</th>
              {CAPABILITIES.map((c) => (
                <th key={c} className="py-2 pr-3 font-medium capitalize">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PROTOCOL_CANDIDATES.map((p) => (
              <tr key={p.id} className="border-t border-line align-top">
                <td className="py-3 pr-3">
                  <p className="font-medium text-mist-100">{p.name}</p>
                  {p.testnetAddress && (
                    <a href={explorerAddressUrl(DEFAULT_NETWORK, p.testnetAddress)} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-block text-xs text-gold-300 hover:underline">
                      {shortAddress(p.testnetAddress)} on explorer
                    </a>
                  )}
                  <p className="mt-0.5 text-xs text-mist-500">{p.notes}</p>
                </td>
                <td className="py-3 pr-3 text-xs text-mist-400">{EVIDENCE_TEXT[p.evidence]}</td>
                {CAPABILITIES.map((c) => (
                  <td key={c} className="py-3 pr-3 text-xs text-mist-400">{CAPABILITY_LABEL[p.capabilities[c]]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
