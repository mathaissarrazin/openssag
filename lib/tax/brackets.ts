import type { TaxBracket } from "@/types/tax";

/**
 * Calculate gross income tax owing at a given jurisdiction's marginal brackets,
 * before any non-refundable credits are applied.
 *
 * @param taxableIncome - Taxable income in CAD (after any deductions)
 * @param brackets      - Ordered array of brackets, ascending by upTo
 * @returns Tax in CAD (may have fractional cents; caller can round)
 */
export function calculateBracketTax(
  taxableIncome: number,
  brackets: readonly TaxBracket[],
): number {
  if (taxableIncome <= 0) return 0;

  let tax = 0;
  let previousUpper = 0;

  for (const { upTo, rate } of brackets) {
    const bracketTop = Math.min(taxableIncome, upTo);
    if (taxableIncome > previousUpper) {
      tax += (bracketTop - previousUpper) * rate;
    }
    previousUpper = upTo;
    if (taxableIncome <= upTo) break;
  }

  return tax;
}
