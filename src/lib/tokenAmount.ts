/**
 * Token amount formatting with BigInt. No floating-point arithmetic is used, so
 * balances are never rounded up. Display values are truncated, and the exact value
 * is always available alongside them.
 */

export function groupThousands(whole: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Formats raw base units as a decimal string.
 *   formatTokenUnits(1500000000000000000n, 18)     -> "1.5"
 *   formatTokenUnits(1n, 18, 6)                    -> "<0.000001"
 * maxFractionDigits defaults to 6 for display. Pass `decimals` for the exact value.
 */
export function formatTokenUnits(raw: bigint, decimals: number, maxFractionDigits = 6): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 78) {
    throw new Error(`Invalid decimals: ${decimals}`);
  }
  if (!Number.isInteger(maxFractionDigits) || maxFractionDigits < 0 || maxFractionDigits > decimals) {
    throw new Error(`maxFractionDigits must be between 0 and ${decimals}`);
  }
  if (raw < 0n) throw new Error("Negative balances are not valid");

  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const fraction = raw % base;

  const fractionText = decimals === 0
    ? ""
    : fraction.toString().padStart(decimals, "0").slice(0, maxFractionDigits).replace(/0+$/, "");

  const wholeText = groupThousands(whole.toString());

  if (raw > 0n && whole === 0n && fractionText.length === 0 && maxFractionDigits < decimals) {
    return maxFractionDigits === 0 ? "<1" : `<0.${"0".repeat(maxFractionDigits - 1)}1`;
  }

  return fractionText.length > 0 ? `${wholeText}.${fractionText}` : wholeText;
}
