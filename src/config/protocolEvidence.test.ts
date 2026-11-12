import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PROTOCOL_EVIDENCE } from "./protocolEvidence";

const isAddress = (value: string) => /^0x[0-9a-fA-F]{40}$/.test(value);

describe("protocol evidence board", () => {
  it("keeps each evidence stage explicit and every listed address source-linked", () => {
    for (const record of PROTOCOL_EVIDENCE) {
      assert.ok(record.documented.detail.length > 0, `${record.id} documentation evidence`);
      assert.ok(record.deployed.detail.length > 0, `${record.id} deployment evidence`);
      assert.ok(record.sourceVerified.detail.length > 0, `${record.id} source evidence`);
      assert.ok(record.operationallyTested.detail.length > 0, `${record.id} operational evidence`);
      if (record.address) {
        assert.ok(isAddress(record.address), `${record.id} address format`);
        assert.ok(record.source?.startsWith("https://"), `${record.id} address source`);
      }
    }
  });

  it("keeps OpturaFi Range candidate-only until implementation, assets, and operation are validated", () => {
    const candidate = PROTOCOL_EVIDENCE.find((record) => record.id === "opturafi-range");
    assert.ok(candidate);
    assert.equal(candidate.candidateOnly, true);
    assert.equal(candidate.address, null);
    assert.equal(candidate.source, null);
    assert.equal(candidate.deployed.state, "not-verified");
    assert.equal(candidate.sourceVerified.state, "not-verified");
    assert.equal(candidate.operationallyTested.state, "not-verified");
  });

  it("does not describe unverified pool fee, liquidity, or yield as measured", () => {
    const pools = PROTOCOL_EVIDENCE.filter((record) => record.id.startsWith("pool-"));
    assert.equal(pools.length, 3);
    for (const pool of pools) {
      assert.equal(pool.sourceVerified.state, "not-verified");
      assert.match(pool.notes, /Fee tier and USD liquidity are not verified/);
      assert.doesNotMatch(pool.notes, /APY\s*[:=]\s*\d/i);
    }
  });
});
