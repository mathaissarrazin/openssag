import type { TaxJurisdiction } from "@/types/tax";

/**
 * Yukon personal income tax — 2026 tax year.
 *
 * Five-bracket structure. BPA mirrors the federal BPA ($16,452).
 * No surtax, no Low-Income Tax Reduction, no territorial refundable
 * benefits through CRA in scope.
 *
 * Sources:
 *   Government of Yukon — Income tax
 *     https://yukon.ca/en/doing-business/tax-and-accounting/income-tax-yukoners
 */

export const YT_2026 = {
  year: 2026,
  jurisdiction: "yt" as const,
  brackets: [
    { upTo:  58_523, rate: 0.064  },
    { upTo: 117_045, rate: 0.09   },
    { upTo: 181_440, rate: 0.109  },
    { upTo: 500_000, rate: 0.128  },
    { upTo: Infinity, rate: 0.15  },
  ],
  basicPersonalAmount: 16_452,
  creditRate: 0.064,
  eligibleDependantAmount: 16_452,
  canadaEmploymentAmount: 1_501, // YT428 line 58360 mirrors federal Canada employment credit
} satisfies TaxJurisdiction & { eligibleDependantAmount: number; canadaEmploymentAmount: number };
