import type { TaxJurisdiction } from "@/types/tax";

/**
 * Federal personal income tax — 2026 tax year
 *
 * Source: Canada Revenue Agency — Canadian income tax rates for individuals
 * https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/canadian-income-tax-rates-individuals-current-previous-years.html
 *
 * The lowest-bracket rate of 14% (reduced from 15% in mid-2025) applies to
 * non-refundable tax credits, including the Basic Personal Amount.
 */

// 2026 Federal BPA maximum: $16,452. Confirmed against CRA TD1 2026.
// The BPA is clawed back for taxable incomes between $181,440 and $258,482,
// reaching a minimum of $14,829 at the top of the range.
// Source: CRA TD1 2026 — Personal Tax Credits Return.
const FEDERAL_BPA_MAX_2026 = 16_452;
const FEDERAL_BPA_MIN_2026 = 14_829;
const FEDERAL_BPA_CLAWBACK_START_2026 = 181_440;
const FEDERAL_BPA_CLAWBACK_END_2026 = 258_482;

// Canada Employment Amount — non-refundable credit for employment income.
// 2026 amount: $1,501 (up from $1,471 in 2025). Claimed on T1 line 31260.
// Source: CRA — Canada employment amount (T1 line 31260)
//   https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-31260-canada-employment-amount.html
export const CANADA_EMPLOYMENT_AMOUNT_2026 = 1_501;

export const FEDERAL_2026: TaxJurisdiction = {
  year: 2026,
  jurisdiction: "federal",
  brackets: [
    { upTo: 58_523,       rate: 0.14 },
    { upTo: 117_045,      rate: 0.205 },
    { upTo: 181_440,      rate: 0.26 },
    { upTo: 258_482,      rate: 0.29 },
    { upTo: Infinity,     rate: 0.33 },
  ],
  basicPersonalAmount: FEDERAL_BPA_MAX_2026,
  creditRate: 0.14,
};

/**
 * Compute the effective federal Basic Personal Amount for a given taxable
 * income, applying the clawback between $181,440 and $258,482.
 *
 * At or below $181,440: full $16,452.
 * At or above $258,482: minimum $14,829.
 * In between: linear interpolation.
 *
 * The Eligible Dependant Credit uses the same clawback schedule.
 */
export function federalEffectiveBPA(taxableIncome: number): number {
  if (taxableIncome <= FEDERAL_BPA_CLAWBACK_START_2026) return FEDERAL_BPA_MAX_2026;
  if (taxableIncome >= FEDERAL_BPA_CLAWBACK_END_2026) return FEDERAL_BPA_MIN_2026;
  const fraction =
    (taxableIncome - FEDERAL_BPA_CLAWBACK_START_2026) /
    (FEDERAL_BPA_CLAWBACK_END_2026 - FEDERAL_BPA_CLAWBACK_START_2026);
  return FEDERAL_BPA_MAX_2026 - (FEDERAL_BPA_MAX_2026 - FEDERAL_BPA_MIN_2026) * fraction;
}
