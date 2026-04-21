import type { SSAGRange } from "../../types/spousal-support";

/**
 * SSAG Without-Child-Support Formula (WOCF) — amount.
 *
 * Amount = (1.5%–2.0%) × gross income difference × years of relationship.
 *
 * Two distinct caps apply:
 *   - Universal 50% gross-income-difference cap (applied to all three levels).
 *   - Long-marriage (≥25 years) Net Income Equalization Cap (SSAG §7.4.1):
 *     the high end is further capped so the recipient does not receive more
 *     than 50% of combined net disposable income. RUG 2016 §7 describes the
 *     precise NDI-equalization cap as the correct implementation, with "48%
 *     of gross income difference" as a crude manual approximation. When a
 *     precise cap is supplied via `ndiEqualizationCapAnnual`, we use it;
 *     otherwise we fall back to the 48% approximation.
 *
 * Returns the MONTHLY amount range in CAD.
 */
export interface WOCFAmountOptions {
  /** Precomputed NDI-equalization cap (annual SS that leaves recipient with
   *  ≤50% combined NDI). Applied only to the high end, only for ≥25y. */
  ndiEqualizationCapAnnual?: number;
}

export function calculateWOCFAmount(
  grossIncomeDifference: number,
  yearsOfRelationship: number,
  options?: WOCFAmountOptions,
): SSAGRange {
  if (grossIncomeDifference <= 0 || yearsOfRelationship <= 0) {
    return { low: 0, mid: 0, high: 0 };
  }

  // SSAG caps years at 25 for the amount multiplier
  const effectiveYears = Math.min(yearsOfRelationship, 25);

  const lowMidCap = grossIncomeDifference * 0.5;
  const isLongMarriage = yearsOfRelationship >= 25;
  // Long-marriage high cap: use precise NDI-equalization cap if supplied,
  // else the 48%-of-GID approximation.
  const highCap = isLongMarriage
    ? (options?.ndiEqualizationCapAnnual ?? grossIncomeDifference * 0.48)
    : grossIncomeDifference * 0.5;

  const annualLow = Math.min(lowMidCap, grossIncomeDifference * 0.015 * effectiveYears);
  const annualMid = Math.min(lowMidCap, grossIncomeDifference * 0.0175 * effectiveYears);
  const annualHigh = Math.min(highCap, grossIncomeDifference * 0.02 * effectiveYears);

  return {
    low: annualLow / 12,
    mid: annualMid / 12,
    high: annualHigh / 12,
  };
}
