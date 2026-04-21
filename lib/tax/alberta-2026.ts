import type { TaxJurisdiction } from "@/types/tax";

/**
 * Alberta personal income tax — 2026 tax year.
 *
 * Alberta re-introduced an 8% lowest bracket in Budget 2022, applying to
 * income up to ~$60,000 (indexed annually). The 8% rate is the credit rate
 * for all provincial non-refundable credits including the BPA.
 *
 * Sources:
 *   Government of Alberta — Personal income tax
 *     https://www.alberta.ca/personal-income-tax
 */

const AB_BASIC_PERSONAL_AMOUNT_2026 = 22_769;

export const AB_2026 = {
  year: 2026,
  jurisdiction: "ab" as const,
  brackets: [
    { upTo: 61_200,   rate: 0.08 },
    { upTo: 154_259,  rate: 0.10 },
    { upTo: 185_111,  rate: 0.12 },
    { upTo: 246_813,  rate: 0.13 },
    { upTo: 370_220,  rate: 0.14 },
    { upTo: Infinity, rate: 0.15 },
  ],
  basicPersonalAmount: AB_BASIC_PERSONAL_AMOUNT_2026,
  creditRate: 0.08,
  eligibleDependantAmount: AB_BASIC_PERSONAL_AMOUNT_2026,
} satisfies TaxJurisdiction & { eligibleDependantAmount: number };
