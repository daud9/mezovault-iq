import { x402Client, x402HTTPClient } from "@x402/core/client";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import type { ClientEvmSigner } from "@x402/evm";
import { createPublicClient, custom, defineChain, type Hex } from "viem";
import { MEZO_NETWORKS } from "../config/chains";
import { assertWalletContext, type Eip1193Provider } from "./wallet";
import { MUSD_LINK_MAX_AMOUNT, MUSD_LINK_MIN_AMOUNT, X402_TESTNET_NETWORK } from "./x402PayLinks";

const TESTNET = MEZO_NETWORKS.testnet;
export const MUSD_TESTNET_ADDRESS = TESTNET.musd!.address;
const TOKEN_SCALE = 10n ** BigInt(TESTNET.musd!.decimals);
const MIN_TOKEN_UNITS = 10n ** 15n;
const MAX_TOKEN_UNITS = 1000n * TOKEN_SCALE;

export interface CheckedMUSDRequirements {
  required: ReturnType<typeof decodePaymentRequiredHeader>;
  accepted: ReturnType<typeof decodePaymentRequiredHeader>["accepts"][number];
  recipient: `0x${string}`;
  amount: string;
  atomicAmount: string;
}

function formatTokenUnits(value: bigint): string {
  const whole = value / TOKEN_SCALE;
  const fractional = (value % TOKEN_SCALE).toString().padStart(TESTNET.musd!.decimals, "0").replace(/0+$/, "");
  return fractional ? `${whole}.${fractional}` : whole.toString();
}

/** Reject any 402 response that is not the exact, bounded Mezo Testnet MUSD link the buyer requested. */
export function validateMUSDRequirements(
  required: ReturnType<typeof decodePaymentRequiredHeader>,
  expectedResourceUrl?: string,
): CheckedMUSDRequirements {
  if (required.x402Version !== 2 || !Array.isArray(required.accepts) || required.accepts.length !== 1) {
    throw new Error("This checkout did not return one supported x402 Testnet payment option.");
  }
  const accepted = required.accepts[0];
  if (accepted.scheme !== "exact" || accepted.network !== X402_TESTNET_NETWORK) {
    throw new Error("This payment link is not a Mezo Testnet MUSD checkout.");
  }
  if (typeof accepted.asset !== "string" || accepted.asset.toLowerCase() !== MUSD_TESTNET_ADDRESS.toLowerCase()) {
    throw new Error("The checkout requested an unexpected payment token. Do not sign it.");
  }
  if (accepted.extra?.assetTransferMethod !== "permit2") {
    throw new Error("The checkout did not use Mezo’s supported gas-sponsored MUSD payment method.");
  }
  if (!Number.isSafeInteger(accepted.maxTimeoutSeconds) || accepted.maxTimeoutSeconds <= 0 || accepted.maxTimeoutSeconds > 300) {
    throw new Error("The checkout authorization does not have a safe five-minute maximum lifetime. Do not sign it.");
  }
  if (typeof accepted.payTo !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(accepted.payTo) || /^0x0{40}$/i.test(accepted.payTo)) {
    throw new Error("The checkout recipient is invalid. Do not sign it.");
  }
  if (typeof accepted.amount !== "string" || !/^\d+$/.test(accepted.amount) || accepted.amount.length > MAX_TOKEN_UNITS.toString().length) {
    throw new Error("The checkout amount is invalid. Do not sign it.");
  }

  let amountUnits: bigint;
  try {
    amountUnits = BigInt(accepted.amount);
  } catch {
    throw new Error("The checkout amount is invalid. Do not sign it.");
  }
  if (amountUnits < MIN_TOKEN_UNITS || amountUnits > MAX_TOKEN_UNITS) {
    throw new Error(`The checkout amount is outside the supported ${MUSD_LINK_MIN_AMOUNT}–${MUSD_LINK_MAX_AMOUNT} MUSD range.`);
  }

  if (expectedResourceUrl) {
    const resourceUrl = required.resource?.url;
    if (typeof resourceUrl !== "string") throw new Error("The checkout did not identify the requested payment resource.");
    const actual = new URL(resourceUrl, expectedResourceUrl);
    const expected = new URL(expectedResourceUrl);
    if (actual.origin !== expected.origin || actual.pathname !== expected.pathname || actual.search !== expected.search) {
      throw new Error("The x402 response came from a different payment resource. Do not sign it.");
    }
  }

  return {
    required,
    accepted,
    recipient: accepted.payTo.toLowerCase() as `0x${string}`,
    amount: formatTokenUnits(amountUnits),
    atomicAmount: amountUnits.toString(),
  };
}

/** Build an injected-wallet signer with only EIP-712 signing and read-only contract calls. */
export function createInjectedMezoTestnetSigner(
  provider: Eip1193Provider,
  account: `0x${string}`,
): ClientEvmSigner {
  const expected = { account, chainId: TESTNET.chainId };
  const chain = defineChain({
    id: TESTNET.chainId,
    name: TESTNET.label,
    nativeCurrency: TESTNET.nativeCurrency,
    rpcUrls: { default: { http: [TESTNET.rpcUrl] } },
  });
  const publicClient = createPublicClient({ chain, transport: custom(provider as never) });

  return {
    address: account,
    async signTypedData(typedData) {
      await assertWalletContext(provider, expected);
      const serialized = JSON.stringify(typedData, (_key, value: unknown) => typeof value === "bigint" ? value.toString() : value);
      const signature = await provider.request({
        method: "eth_signTypedData_v4",
        params: [account, serialized],
      });
      if (typeof signature !== "string" || !/^0x(?:[0-9a-fA-F]{2}){64,}$/.test(signature)) {
        throw new Error("The wallet did not return a valid typed-data signature.");
      }
      await assertWalletContext(provider, expected);
      return signature as Hex;
    },
    async readContract(args) {
      await assertWalletContext(provider, expected);
      return publicClient.readContract(args as never);
    },
  };
}

/** Configure the client to accept only the documented Testnet MUSD asset and cap at the link creator's maximum. */
export function createMezoTestnetX402HttpClient(signer: ClientEvmSigner): x402HTTPClient {
  const client = new x402Client();
  client.setSpendControls({
    maxAmountPerPayment: `$${MUSD_LINK_MAX_AMOUNT}`,
    allowedAssets: [{
      network: X402_TESTNET_NETWORK,
      asset: MUSD_TESTNET_ADDRESS,
      maxAmountPerPayment: MAX_TOKEN_UNITS.toString(),
    }],
  });
  registerExactEvmScheme(client, { signer, networks: [X402_TESTNET_NETWORK] });
  return new x402HTTPClient(client);
}

export function decodeMUSDRequirementsHeader(value: string): ReturnType<typeof decodePaymentRequiredHeader> {
  try {
    return decodePaymentRequiredHeader(value);
  } catch {
    throw new Error("The x402 server returned an unreadable payment requirement. No authorization was signed.");
  }
}

export function validateMUSDSettlementReceipt(
  receipt: { success?: unknown; network?: unknown; amount?: unknown; transaction?: unknown; payer?: unknown },
  expectedAtomicAmount: string,
): asserts receipt is { success: true; network: typeof X402_TESTNET_NETWORK; amount?: string; transaction: `0x${string}`; payer?: string } {
  if (receipt.success !== true || receipt.network !== X402_TESTNET_NETWORK ||
      (receipt.amount !== undefined && receipt.amount !== expectedAtomicAmount) ||
      typeof receipt.transaction !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(receipt.transaction)) {
    throw new Error("The facilitator’s settlement receipt did not match the requested Testnet MUSD payment. Check wallet activity before retrying.");
  }
}
