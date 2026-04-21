import type { TaxJurisdiction } from "@/types/tax";

/**
 * Nunavut personal income tax — 2026 tax year.
 *
 * Four-bracket structure. No Low-Income Tax Reduction, no territorial
 * refundable benefits through CRA in scope.
 *
 * Sources:
 *   Government of Nunavut — Finance (Income Tax)
 *     https://www.gov.nu.ca/finance
 */

export const NU_2026 = {
  year: 2026,
  jurisdiction: "nu" as const,
  brackets: [
    { upTo:  55_801, rate: 0.04   },
    { upTo: 111_602, rate: 0.07   },
    { upTo: 181_439, rate: 0.09   },
    { upTo: Infinity, rate: 0.115 },
  ],
  basicPersonalAmount: 19_659,
  creditRate: 0.04,
  eligibleDependantAmount: 19_659,
  /** NU Cost of Living Tax Credit: $877.50 per person in family (NU428 line 61500) */
  coltcPerPerson: 877.5,
} satisfies TaxJurisdiction & { eligibleDependantAmount: number; coltcPerPerson: number };

/** NU Cost of Living Tax Credit (refundable). */
export function calculateNUCOLTC(
  isCoupled: boolean,
  totalKids: number,
): number {
  const familySize = 1 + (isCoupled ? 1 : 0) + totalKids;
  return familySize * NU_2026.coltcPerPerson;
}
