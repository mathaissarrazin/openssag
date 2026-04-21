/**
 * Shared tax calculation types. Consumed by the tax engine and by any
 * calculator that needs net income figures (e.g. the SSAG calculator).
 */

/**
 * A single tax bracket.
 * `upTo` is the upper bound of this bracket in dollars (use Infinity for the
 * top bracket). `rate` is the marginal rate applied to the portion of income
 * that falls within this bracket, expressed as a decimal (e.g. 0.14 = 14%).
 */
export interface TaxBracket {
  readonly upTo: number;
  readonly rate: number;
}

/**
 * A per-year snapshot of a single jurisdiction's income tax rules.
 * Each tax year gets its own module (e.g. lib/tax/federal-2026.ts).
 */
export interface TaxJurisdiction {
  readonly year: number;
  readonly jurisdiction: "federal" | "bc" | "ab" | "on" | "sk" | "mb" | "nb" | "ns" | "pe" | "nl" | "yt" | "nt" | "nu";
  readonly brackets: readonly TaxBracket[];
  /** Basic personal amount (federal maximum or provincial amount) */
  readonly basicPersonalAmount: number;
  /** Rate applied to non-refundable credits (typically lowest bracket rate) */
  readonly creditRate: number;
}
