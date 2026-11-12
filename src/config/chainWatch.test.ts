import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CHAIN_WATCH_NETWORKS, CHAIN_WATCH_SOURCES } from "./chainWatch";

describe("Chain Watch network and token configuration", () => {
  it("includes only the five documented EVM networks with the expected chain IDs", () => {
    assert.deepEqual(
      CHAIN_WATCH_NETWORKS.map(({ key, chainId }) => [key, chainId]),
      [
        ["mezo-mainnet", 31612],
        ["ethereum", 1],
        ["base", 8453],
        ["bnb", 56],
        ["mezo-testnet", 31611],
      ],
    );
  });

  it("uses the exact official token addresses and leaves unsupported pairs unconfigured", () => {
    const byKey = Object.fromEntries(CHAIN_WATCH_NETWORKS.map((network) => [network.key, network]));
    const mainnetMusd = "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186";
    const mezoNativeMezo = "0x7B7c000000000000000000000000000000000001";
    const bridgedMezo = "0x8e4cbBcc33dB6c0a18561fDE1F6bA35906d4848b";
    const testnetMusd = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503";

    for (const key of ["mezo-mainnet", "ethereum", "base"] as const) {
      assert.equal(byKey[key].tokens.MUSD?.address, mainnetMusd);
      assert.equal(byKey[key].tokens.MUSD?.source, CHAIN_WATCH_SOURCES.contracts);
      assert.equal(byKey[key].tokens.MEZO?.address, key === "mezo-mainnet" ? mezoNativeMezo : bridgedMezo);
    }
    assert.equal(byKey.bnb.tokens.MEZO?.address, bridgedMezo);
    assert.equal(byKey.bnb.tokens.MUSD, undefined);
    assert.equal(byKey["mezo-testnet"].tokens.MUSD?.address, testnetMusd);
    assert.equal(byKey["mezo-testnet"].tokens.MEZO?.address, mezoNativeMezo);
    assert.ok(CHAIN_WATCH_NETWORKS.every((network) =>
      Object.values(network.tokens).every((token) => !token || token.decimals === 18)
    ));
  });
});
