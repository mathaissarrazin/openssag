import type { TaxJurisdiction } from "@/types/tax";

/**
 * Manitoba personal income tax — 2026 tax year.
 *
 * Three-bracket structure. Brackets and BPA are frozen (not indexed) as of
 * the 2025 Manitoba Budget; thresholds carry forward from 2024 levels.
 * The Eligible Dependant Credit ($9,134) is lower than the BPA — unlike
 * every other province we support.
 *
 * Sources:
 *   Province of Manitoba — Finance, Personal Income Tax
 *     https://www.gov.mb.ca/finance/personal/pcredits.html
 *   TD1MB 2026 — Manitoba Personal Tax Credits Return (CRA)
 *     https://www.canada.ca/en/revenue-agency/services/forms-publications/td1-personal-tax-credits-returns/td1-forms-pay-received-on-january-1-later/td1mb.html
 */

export const MB_2026 = {
  year: 2026,
  jurisdiction: "mb" as const,
  brackets: [
    { upTo:  47_000, rate: 0.108  },
    { upTo: 100_000, rate: 0.1275 },
    { upTo: Infinity, rate: 0.174  },
  ],
  basicPersonalAmount: 15_780,
  creditRate: 0.108,
  /** Lower than BPA — Manitoba's eligible dependant amount per TD1MB 2026 */
  eligibleDependantAmount: 9_134,
  /**
   * Manitoba Family Tax Benefit (Schedule MB428-A).
   * Non-refundable credit: max(0, baseAmount − phaseOutRate × netIncome) × creditRate.
   * Phases to zero above ~$22,944 net income.
   */
  familyTaxBenefit: {
    baseAmount: 2_065,
    phaseOutRate: 0.09,
  },
} satisfies TaxJurisdiction & {
  eligibleDependantAmount: number;
  familyTaxBenefit: { baseAmount: number; phaseOutRate: number };
};
