import type { TaxJurisdiction } from "@/types/tax";

/**
 * Saskatchewan personal income tax — 2026 tax year.
 *
 * Three-bracket structure. BPA raised to $20,381 under the Saskatchewan
 * Affordability Act (scheduled annual increases). Credit rate is the
 * lowest bracket rate (10.5%).
 *
 * Sources:
 *   Government of Saskatchewan — Income Tax
 *     https://www.saskatchewan.ca/residents/taxes-and-investments/income-tax
 *   Saskatchewan Affordability Act — BPA schedule 2025–2028
 */

const SK_BASIC_PERSONAL_AMOUNT_2026 = 20_381;

export const SK_2026 = {
  year: 2026,
  jurisdiction: "sk" as const,
  brackets: [
    { upTo:  54_532, rate: 0.105 },
    { upTo: 155_805, rate: 0.125 },
    { upTo: Infinity, rate: 0.145 },
  ],
  basicPersonalAmount: SK_BASIC_PERSONAL_AMOUNT_2026,
  creditRate: 0.105,
  eligibleDependantAmount: SK_BASIC_PERSONAL_AMOUNT_2026,
} satisfies TaxJurisdiction & { eligibleDependantAmount: number };
