import type { TaxJurisdiction } from "@/types/tax";

/**
 * Prince Edward Island personal income tax — 2026 tax year.
 *
 * Five-bracket structure. The Eligible Dependant Credit amount ($12,740)
 * differs from the BPA ($15,000) — a PE-specific distinction per TD1PE 2026.
 * Low-Income Tax Reduction (non-refundable): max $200, phases out at 5%
 * of net income above $23,000.
 *
 * Sources:
 *   Government of Prince Edward Island — Personal Income Tax
 *     https://www.princeedwardisland.ca/en/information/finance/tax-rates-personal-income-tax
 *   TD1PE 2026 — Prince Edward Island Personal Tax Credits Return (CRA)
 */

export const PE_2026 = {
  year: 2026,
  jurisdiction: "pe" as const,
  brackets: [
    { upTo:  33_928, rate: 0.095  },
    { upTo:  65_820, rate: 0.1347 },
    { upTo: 106_890, rate: 0.166  },
    { upTo: 142_250, rate: 0.1762 },
    { upTo: Infinity, rate: 0.19  },
  ],
  basicPersonalAmount: 15_000,
  creditRate: 0.095,
  /** EDC is lower than BPA per TD1PE 2026 */
  eligibleDependantAmount: 12_740,
} satisfies TaxJurisdiction & { eligibleDependantAmount: number };

export function calculatePELowIncomeTaxReduction(taxableIncome: number): number {
  const maxCredit = 200;
  const phaseOutThreshold = 23_000;
  const phaseOutRate = 0.05;
  return Math.max(0, maxCredit - phaseOutRate * Math.max(0, taxableIncome - phaseOutThreshold));
}
