import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MEZO_NETWORKS } from "./chains";
import { PROTOCOL_CANDIDATES, verifiedCapabilityCount } from "./protocols";

const isAddr = (v: string) => /^0x[0-9a-fA-F]{40}$/.test(v);

describe("network configuration", () => {
  it("testnet matches the official Mezo parameters", () => {
    const t = MEZO_NETWORKS.testnet;
    assert.equal(t.chainId, 31611);
    assert.equal(t.rpcUrl, "https://rpc.test.mezo.org");
    assert.equal(t.explorerUrl, "https://explorer.test.mezo.org");
    assert.equal(t.musd?.address, "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503");
    assert.equal(t.musd?.decimals, 18);
  });

  it("mainnet uses the official RPC, not a third-party endpoint", () => {
    assert.equal(MEZO_NETWORKS.mainnet.rpcUrl, "https://rpc-http.mezo.boar.network");
    assert.equal(MEZO_NETWORKS.mainnet.chainId, 31612);
  });

  it("every recorded address is well formed and has a source", () => {
    for (const net of Object.values(MEZO_NETWORKS)) {
      if (net.musd) {
        assert.ok(isAddr(net.musd.address), `${net.key} MUSD address`);
        assert.ok(net.musd.source.length > 0);
      }
      if (net.borrowerOperations) {
        assert.ok(isAddr(net.borrowerOperations.address));
        assert.ok(net.borrowerOperations.source.startsWith("https://"));
      }
    }
  });

  it("chain ids and their hex forms agree", () => {
    for (const net of Object.values(MEZO_NETWORKS)) {
      assert.equal(parseInt(net.chainIdHex, 16), net.chainId);
    }
  });
});

describe("protocol investigation", () => {
  it("does not mark any deposit, lending, borrowing or yield capability as verified", () => {
    assert.equal(verifiedCapabilityCount(), 0);
  });

  it("never uses a protocol in this stage", () => {
    for (const p of PROTOCOL_CANDIDATES) assert.equal(p.usedByApp, false);
  });

  it("records a testnet address only where an official source is named", () => {
    for (const p of PROTOCOL_CANDIDATES) {
      if (p.testnetAddress !== null) {
        assert.ok(isAddr(p.testnetAddress), `${p.id} address format`);
        assert.ok(p.addressSource, `${p.id} must name its source`);
        assert.equal(p.evidence, "official-address", `${p.id} must be officially sourced`);
      }
    }
  });

  it("does not give a third-party-only protocol a testnet address", () => {
    for (const p of PROTOCOL_CANDIDATES.filter((x) => x.evidence === "third-party-only")) {
      assert.equal(p.testnetAddress, null, `${p.id} must not carry an address`);
    }
  });
});
