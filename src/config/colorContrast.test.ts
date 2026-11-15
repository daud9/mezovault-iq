import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const theme = readFileSync(new URL("../index.css", import.meta.url), "utf8");

function token(name: string): string {
  const match = theme.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  assert.ok(match, `Missing theme color token ${name}`);
  return match[1];
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(first: string, second: string): number {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe("dark theme text contrast", () => {
  it("keeps muted text at WCAG AA contrast on every base surface", () => {
    const mutedText = token("mist-500");
    for (const surface of ["ink-950", "ink-900", "ink-800", "ink-700"]) {
      const ratio = contrastRatio(mutedText, token(surface));
      assert.ok(ratio >= 4.5, `mist-500 on ${surface} is ${ratio.toFixed(2)}:1; expected at least 4.5:1`);
    }
  });
});
