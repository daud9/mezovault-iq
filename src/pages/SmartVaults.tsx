import { ExternalLink } from "lucide-react";
import { Card } from "../components/ui/Card";
import { SectionHeader } from "../components/ui/SectionHeader";
import { DataStatus } from "../components/ui/DataStatus";
import { OFFICIAL_SOURCES } from "../config/chains";

/**
 * Smart Vaults. No vault is listed because none has been verified on Mezo Testnet.
 * Each panel states what was checked and what would be needed to activate it.
 */
export function SmartVaults() {
  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Smart Vaults"
        title="Vaults on Mezo Testnet"
        description="Discovery and analysis only. No vault is verified on Mezo Testnet, so no deposit, withdrawal or yield is offered here."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-mist-100">MUSD vault</h2>
            <DataStatus state="unavailable" detail="no verified testnet vault" />
          </div>
          <p className="text-sm leading-relaxed text-mist-400">
            The official contracts reference lists the Morpho Alpha MUSD Core Vault (aMUSD) but states it is currently only
            available on Ethereum. No MUSD vault on Mezo Testnet was found in the official pages reviewed.
          </p>
          <div className="space-y-2 border-t border-line pt-4 text-sm text-mist-400">
            <p className="font-medium text-mist-300">Needed to activate deposits</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>A vault contract address on Mezo Testnet from an official source</li>
              <li>Its deposit asset (MUSD) and the share token it issues</li>
              <li>Readable deposit, withdraw or redeem functions, and whether redemption is immediate</li>
              <li>A rate source, shown with its origin and timestamp</li>
            </ul>
          </div>
          <p className="text-xs leading-relaxed text-mist-500">
            Deposits are not available in MezoVault IQ. The official Mezo vaults guide is documented for mainnet, so no vault link is shown for testnet.
          </p>
          <a href={OFFICIAL_SOURCES.contractsReference} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-gold-300 hover:underline">
            Contracts reference <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </Card>

        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-mist-100">MEZO rewards</h2>
            <DataStatus state="unavailable" detail="no verified reward contract" />
          </div>
          <p className="text-sm leading-relaxed text-mist-400">
            No MEZO staking or reward contract was verified on Mezo Testnet. The official testnet pools listed are MUSD pairs
            only, so no pool with MEZO was found. Holding MEZO does not by itself earn rewards.
          </p>
          <div className="space-y-2 border-t border-line pt-4 text-sm text-mist-400">
            <p className="font-medium text-mist-300">Needed to activate rewards</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>A verified staking or gauge contract that accepts MEZO on Mezo Testnet</li>
              <li>The reward token, reward rate source and lock-up or withdrawal rules</li>
              <li>A readable position and claimable balance for the connected wallet</li>
            </ul>
          </div>
          <a href={OFFICIAL_SOURCES.developerGuide} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-gold-300 hover:underline">
            Developer documentation <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </Card>
      </div>

      <Card className="space-y-3 text-sm leading-relaxed text-mist-400">
        <p className="font-medium text-mist-200">IQ Vault Intelligence</p>
        <p>
          Each vault will get an evidence panel covering yield source, liquidity, fees, contract risk, reward-token exposure and
          data age. The panel appears only when a vault is verified. It does not score or label vaults as safe or profitable.
        </p>
      </Card>
    </div>
  );
}
