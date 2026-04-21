import type { TaxJurisdiction } from "../../types/tax";

/**
 * New Brunswick personal income tax — 2026 tax year.
 *
 * Four-bracket structure. Low-Income Tax Reduction (non-refundable):
 * max $817, phases out at 3% of net income above $22,358.
 *
 * Sources:
 *   Government of New Brunswick — Personal Income Tax
 *     https://www2.gnb.ca/content/gnb/en/departments/finance/taxes/personal-income.html
 */

export const NB_2026 = {
  year: 2026,
  jurisdiction: "nb" as const,
  brackets: [
    { upTo:  52_333, rate: 0.094  },
    { upTo: 104_666, rate: 0.14   },
    { upTo: 193_861, rate: 0.16   },
    { upTo: Infinity, rate: 0.195 },
  ],
  basicPersonalAmount: 13_664,
  creditRate: 0.094,
  eligibleDependantAmount: 10_709, // NB equivalent-to-spouse amount (NB428 line 58120) ≠ BPA
} satisfies TaxJurisdiction & { eligibleDependantAmount: number };

export function calculateNBLowIncomeTaxReduction(taxableIncome: number): number {
  const maxCredit = 817;
  const phaseOutThreshold = 22_358;
  const phaseOutRate = 0.03;
  return Math.max(0, maxCredit - phaseOutRate * Math.max(0, taxableIncome - phaseOutThreshold));
}
