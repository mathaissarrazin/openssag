import type { TaxJurisdiction } from "@/types/tax";

/**
 * Northwest Territories personal income tax — 2026 tax year.
 *
 * Four-bracket structure. No Low-Income Tax Reduction, no territorial
 * refundable benefits through CRA in scope.
 *
 * Sources:
 *   Government of Northwest Territories — Personal Income Tax
 *     https://www.fin.gov.nt.ca/en/services/personal-income-tax
 */

export const NT_2026 = {
  year: 2026,
  jurisdiction: "nt" as const,
  brackets: [
    { upTo:  53_003, rate: 0.059   },
    { upTo: 106_009, rate: 0.086   },
    { upTo: 172_346, rate: 0.122   },
    { upTo: Infinity, rate: 0.1405 },
  ],
  basicPersonalAmount: 18_198,
  creditRate: 0.059,
  eligibleDependantAmount: 18_198,
  /** NT Cost of Living Tax Credit: $471 per person in family (NT428 line 61500) */
  coltcPerPerson: 471,
} satisfies TaxJurisdiction & { eligibleDependantAmount: number; coltcPerPerson: number };

/** NT Cost of Living Tax Credit & Supplement (refundable). */
export function calculateNTCOLTC(
  isCoupled: boolean,
  totalKids: number,
): number {
  const familySize = 1 + (isCoupled ? 1 : 0) + totalKids;
  return familySize * NT_2026.coltcPerPerson;
}
