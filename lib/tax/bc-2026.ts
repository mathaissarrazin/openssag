import type { TaxJurisdiction } from "../../types/tax";

/**
 * British Columbia personal income tax — 2026 tax year.
 *
 * The lowest-bracket rate is 5.60% (raised from 5.06% in BC Budget 2026,
 * effective January 1, 2026). This is also the rate used to value BC
 * non-refundable credits including the Basic Personal Amount.
 *
 * Sources:
 *   BC Gov — B.C. basic personal income tax credits
 *   CRA — Canadian income tax rates for individuals
 */

// BC Basic Personal Amount 2026: $13,216 (up from $12,932 in 2025, indexed 2.2%).
// BC Budget 2026 froze indexation for 2027-2030, so this amount stays fixed.
// Source: BC Gov — B.C. basic personal income tax credits (confirmed).
const BC_BASIC_PERSONAL_AMOUNT_2026 = 13_216;

// BC Budget 2026 raised the lowest-bracket rate from 5.06% to 5.60%
// effective January 1, 2026. Non-refundable credits (including BPA) are
// valued at this rate, so the BPA credit value increased from
// $13,216 × 5.06% = $668.73 to $13,216 × 5.60% = $740.10.
export const BC_2026 = {
  year: 2026,
  jurisdiction: "bc" as const,
  brackets: [
    { upTo: 50_363,   rate: 0.0560 },
    { upTo: 100_728,  rate: 0.077 },
    { upTo: 115_648,  rate: 0.105 },
    { upTo: 140_430,  rate: 0.1229 },
    { upTo: 190_405,  rate: 0.147 },
    { upTo: 265_545,  rate: 0.168 },
    { upTo: Infinity, rate: 0.205 },
  ],
  basicPersonalAmount: BC_BASIC_PERSONAL_AMOUNT_2026,
  creditRate: 0.0560,
  // BC equivalent-to-spouse amount (BC428 line 58160) ≠ BPA. 2025 was
  // $11,073; indexed 2.2% for 2026. Source: BC Gov — B.C. basic personal
  // income tax credits table (2026 and 2025 columns).
  eligibleDependantAmount: 11_317,
} satisfies TaxJurisdiction & { eligibleDependantAmount: number };
