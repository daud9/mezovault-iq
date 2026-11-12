import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ClientEvmSigner } from "@x402/evm";
import { decodeMUSDRequirementsHeader, createInjectedMezoTestnetSigner, createMezoTestnetX402HttpClient, MUSD_TESTNET_ADDRESS, validateMUSDRequirements, validateMUSDSettlementReceipt } from "./x402Buyer";
import { X402_TESTNET_NETWORK } from "./x402PayLinks";
import type { Eip1193Provider } from "./wallet";

const BUYER = "0x2222222222222222222222222222222222222222" as const;
const SELLER = "0x1111111111111111111111111111111111111111" as const;
const SIGNATURE = `0x${"ab".repeat(65)}` as const;
const TRANSACTION = `0x${"cd".repeat(32)}` as const;
const RESOURCE_URL = "https://merchant.example/api/x402/pay";

function makeRequired(overrides: {
  x402Version?: number;
  network?: string;
  asset?: string;
  amount?: string;
  payTo?: string;
  resourceUrl?: string;
  assetTransferMethod?: string;
  maxTimeoutSeconds?: number;
} = {}) {
  const data = {
    x402Version: overrides.x402Version ?? 2,
    resource: { url: overrides.resourceUrl ?? RESOURCE_URL, description: "MUSD payment link", mimeType: "application/json" },
    accepts: [{
      scheme: "exact",
      network: overrides.network ?? X402_TESTNET_NETWORK,
      asset: overrides.asset ?? MUSD_TESTNET_ADDRESS,
      amount: overrides.amount ?? "3250000000000000000",
      payTo: overrides.payTo ?? SELLER,
      maxTimeoutSeconds: overrides.maxTimeoutSeconds ?? 300,
      extra: { name: "Mezo USD", version: "1", assetTransferMethod: overrides.assetTransferMethod ?? "permit2" },
    }],
  };
  return decodeMUSDRequirementsHeader(Buffer.from(JSON.stringify(data), "utf8").toString("base64"));
}

describe("x402 buyer validation", () => {
  it("accepts the exact bounded Mezo Testnet MUSD resource and formats atomic amounts without floats", () => {
    const checked = validateMUSDRequirements(makeRequired(), RESOURCE_URL);
    assert.equal(checked.recipient, SELLER);
    assert.equal(checked.amount, "3.25");
    assert.equal(checked.atomicAmount, "3250000000000000000");
  });

  it("rejects unsupported network, token, amount, payTo, method, and resource URL before a wallet prompt", () => {
    for (const required of [
      makeRequired({ network: "eip155:31612" }),
      makeRequired({ asset: "0x4444444444444444444444444444444444444444" }),
      makeRequired({ amount: "1000000000000000000001" }),
      makeRequired({ amount: "not-an-integer" }),
      makeRequired({ amount: "9".repeat(1000) }),
      makeRequired({ payTo: "0x0000000000000000000000000000000000000000" }),
      makeRequired({ assetTransferMethod: "eip3009" }),
      makeRequired({ maxTimeoutSeconds: 301 }),
      makeRequired({ maxTimeoutSeconds: 0 }),
    ]) {
      assert.throws(() => validateMUSDRequirements(required, RESOURCE_URL));
    }
    assert.throws(() => validateMUSDRequirements(makeRequired({ resourceUrl: "https://attacker.example/api/x402/pay" }), RESOURCE_URL), /different payment resource/);
    assert.throws(() => validateMUSDRequirements(makeRequired({ resourceUrl: "https://merchant.example/api/other" }), RESOURCE_URL), /different payment resource/);
  });

  it("validates facilitator success, network, amount when supplied, and transaction hash", () => {
    assert.doesNotThrow(() => validateMUSDSettlementReceipt({
      success: true, network: X402_TESTNET_NETWORK, amount: "3250000000000000000", transaction: TRANSACTION,
    }, "3250000000000000000"));
    assert.throws(() => validateMUSDSettlementReceipt({
      success: false, network: X402_TESTNET_NETWORK, transaction: TRANSACTION,
    }, "3250000000000000000"));
    assert.throws(() => validateMUSDSettlementReceipt({
      success: true, network: "eip155:31612", transaction: TRANSACTION,
    }, "3250000000000000000"));
    assert.throws(() => validateMUSDSettlementReceipt({
      success: true, network: X402_TESTNET_NETWORK, amount: "1", transaction: TRANSACTION,
    }, "3250000000000000000"));
    assert.throws(() => validateMUSDSettlementReceipt({
      success: true, network: X402_TESTNET_NETWORK, transaction: "0x1234",
    }, "3250000000000000000"));
  });

  it("builds a Permit2 x402 payment with the exact server amount using only a mocked signer", async () => {
    let signed = 0;
    const signer: ClientEvmSigner = {
      address: BUYER,
      async signTypedData() {
        signed += 1;
        return SIGNATURE;
      },
      async readContract() {
        return 0n;
      },
    };
    const client = createMezoTestnetX402HttpClient(signer);
    const required = makeRequired();
    const payment = await client.createPaymentPayload(required);
    assert.equal(signed, 1);
    const headers = client.encodePaymentSignatureHeader(payment);
    const encoded = Object.entries(headers).find(([name]) => name.toLowerCase() === "payment-signature")?.[1];
    assert.ok(encoded);
    const payload = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as {
      x402Version: number;
      accepted: { network: string; amount: string; asset: string; payTo: string };
      payload: { signature: string };
    };
    assert.equal(payload.x402Version, 2);
    assert.equal(payload.accepted.network, X402_TESTNET_NETWORK);
    assert.equal(payload.accepted.amount, "3250000000000000000");
    assert.equal(payload.accepted.asset.toLowerCase(), MUSD_TESTNET_ADDRESS.toLowerCase());
    assert.equal(payload.accepted.payTo, SELLER);
    assert.equal(payload.payload.signature, SIGNATURE);
  });

  it("rechecks the injected wallet account and Testnet before and after EIP-712 signing; exposes no transaction send method", async () => {
    const calls: Array<{ method: string; params?: unknown }> = [];
    const provider = {
      async request({ method, params }: { method: string; params?: unknown }) {
        calls.push({ method, params });
        if (method === "eth_accounts") return [BUYER];
        if (method === "eth_chainId") return "0x7b7b";
        if (method === "eth_signTypedData_v4") return SIGNATURE;
        throw new Error(`Unexpected wallet method ${method}`);
      },
    } as Eip1193Provider;
    const signer = createInjectedMezoTestnetSigner(provider, BUYER);
    assert.equal("signTransaction" in signer, false);
    assert.equal("sendTransaction" in signer, false);
    assert.equal("request" in signer, false);
    const signature = await signer.signTypedData({
      domain: { chainId: 31611 },
      types: { Permit: [] },
      primaryType: "Permit",
      message: { value: 3n },
    } as never);
    assert.equal(signature, SIGNATURE);
    assert.equal(calls.filter((call) => call.method === "eth_accounts").length, 2);
    assert.equal(calls.filter((call) => call.method === "eth_chainId").length, 2);
    const typedData = calls.find((call) => call.method === "eth_signTypedData_v4")?.params as unknown[];
    assert.equal(typedData[0], BUYER);
    assert.match(String(typedData[1]), /"value":"3"/);
    assert.deepEqual(calls.filter((call) => call.method === "eth_signTypedData_v4").map((call) => call.method), ["eth_signTypedData_v4"]);
  });
});
