import type { TaxJurisdiction } from "@/types/tax";

/**
 * Nova Scotia personal income tax — 2026 tax year.
 *
 * Five-bracket structure. Low-Income Tax Reduction (non-refundable):
 * max $300, phases out at 5% of net income above $15,000.
 *
 * Sources:
 *   Government of Nova Scotia — Personal Income Tax
 *     https://novascotia.ca/finance/en/home/taxation/tax101/personalincometax.html
 */

export const NS_2026 = {
  year: 2026,
  jurisdiction: "ns" as const,
  brackets: [
    { upTo:  30_995, rate: 0.0879 },
    { upTo:  61_991, rate: 0.1495 },
    { upTo:  97_417, rate: 0.1667 },
    { upTo: 157_124, rate: 0.175  },
    { upTo: Infinity, rate: 0.21  },
  ],
  basicPersonalAmount: 11_932,
  creditRate: 0.0879,
  eligibleDependantAmount: 11_932,
} satisfies TaxJurisdiction & { eligibleDependantAmount: number };

export function calculateNSLowIncomeTaxReduction(taxableIncome: number): number {
  const maxCredit = 300;
  const phaseOutThreshold = 15_000;
  const phaseOutRate = 0.05;
  return Math.max(0, maxCredit - phaseOutRate * Math.max(0, taxableIncome - phaseOutThreshold));
}
