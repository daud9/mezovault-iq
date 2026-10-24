/**
 * Verified strategy catalogue.
 *
 * No strategy is listed. Every entry must be backed by a verified protocol contract on
 * Mezo Testnet, with a source and a last-updated time. The illustrative concepts that used
 * to live here are in testFixtures.ts and are used only by tests.
 */
import type { StrategyProfile } from "./types";

export const VERIFIED_STRATEGY_PROFILES: StrategyProfile[] = [];

export function getProfile(id: string): StrategyProfile | undefined {
  return VERIFIED_STRATEGY_PROFILES.find((p) => p.id === id);
}
