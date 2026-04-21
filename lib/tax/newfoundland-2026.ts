import type { TaxJurisdiction } from "../../types/tax";

/**
 * Newfoundland and Labrador personal income tax — 2026 tax year.
 *
 * Eight-bracket structure. Low-Income Tax Reduction (non-refundable):
 * max $1,008, phases out at 16% of net income above $24,191.
 *
 * Sources:
 *   Government of Newfoundland and Labrador — Personal Income Tax
 *     https://www.gov.nl.ca/fin/tax-programs-incentives/personal/
 */

export const NL_2026 = {
  year: 2026,
  jurisdiction: "nl" as const,
  brackets: [
    { upTo:   44_678, rate: 0.087  },
    { upTo:   89_354, rate: 0.145  },
    { upTo:  159_528, rate: 0.158  },
    { upTo:  223_340, rate: 0.178  },
    { upTo:  285_319, rate: 0.198  },
    { upTo:  570_638, rate: 0.208  },
    { upTo: 1_141_275, rate: 0.213 },
    { upTo: Infinity,  rate: 0.218 },
  ],
  basicPersonalAmount: 11_188,
  creditRate: 0.087,
  eligibleDependantAmount: 9_142, // NL equivalent-to-spouse amount (NL428 line 58120) ≠ BPA
} satisfies TaxJurisdiction & { eligibleDependantAmount: number };

export function calculateNLLowIncomeTaxReduction(taxableIncome: number): number {
  const maxCredit = 1_008;
  const phaseOutThreshold = 24_191;
  const phaseOutRate = 0.16;
  return Math.max(0, maxCredit - phaseOutRate * Math.max(0, taxableIncome - phaseOutThreshold));
}
