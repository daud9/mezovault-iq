import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MEZO_NETWORKS } from "./chains";
import { CHAIN_WATCH_NETWORKS } from "./chainWatch";

const isAddr = (v: string) => /^0x[0-9a-fA-F]{40}$/.test(v);

describe("network configuration", () => {
  it("testnet matches the official Mezo parameters", () => {
    const t = MEZO_NETWORKS.testnet;
    assert.equal(t.chainId, 31611);
    assert.equal(t.rpcUrl, "https://rpc.test.mezo.org");
    assert.equal(t.explorerUrl, "https://explorer.test.mezo.org/");
    assert.equal(t.faucetUrl, "https://faucet.test.mezo.org/");
    assert.equal(t.musd?.address, "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503");
    assert.equal(t.musd?.decimals, 18);
  });

  it("mainnet uses the HTTPS RPC endpoint listed in Mezo's developer guide", () => {
    assert.equal(MEZO_NETWORKS.mainnet.rpcUrl, "https://mezo-mainnet.boar.network");
    assert.equal(MEZO_NETWORKS.mainnet.chainId, 31612);
    assert.equal(CHAIN_WATCH_NETWORKS.find((network) => network.key === "mezo-mainnet")?.rpcUrl, MEZO_NETWORKS.mainnet.rpcUrl);
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
