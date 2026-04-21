import type { BracketLine, BracketTaxDetail } from "@/types/ssag-detail";
import type { TaxBracket } from "@/types/tax";

/**
 * Explain a bracket tax calculation line-by-line.
 */
export function explainBracketTax(
  taxableIncome: number,
  brackets: readonly TaxBracket[],
): { lines: BracketLine[]; total: number } {
  const lines: BracketLine[] = [];
  let total = 0;
  let previousUpper = 0;

  if (taxableIncome <= 0) {
    return { lines, total };
  }

  for (const { upTo, rate } of brackets) {
    if (taxableIncome <= previousUpper) break;

    const bracketTop = Math.min(taxableIncome, upTo);
    const taxableInBracket = bracketTop - previousUpper;
    const taxInBracket = taxableInBracket * rate;

    // Describe this bracket human-readably
    const rateStr = `${(rate * 100).toFixed(rate * 100 % 1 === 0 ? 0 : 2)}%`;
    let description: string;
    if (previousUpper === 0) {
      description = `${rateStr} × first $${bracketTop.toLocaleString("en-CA")}`;
    } else if (upTo === Infinity) {
      description = `${rateStr} × amount over $${previousUpper.toLocaleString("en-CA")}`;
    } else {
      description = `${rateStr} × $${previousUpper.toLocaleString("en-CA")}–$${bracketTop.toLocaleString("en-CA")}`;
    }

    lines.push({
      description,
      rate,
      taxableInBracket,
      taxInBracket,
    });

    total += taxInBracket;
    previousUpper = upTo;

    if (taxableIncome <= upTo) break;
  }

  return { lines, total };
}

/** Helper to build a complete BracketTaxDetail from computed inputs. */
export function buildBracketTaxDetail(params: {
  jurisdiction: "federal" | "bc" | "ab" | "on" | "sk" | "mb" | "nb" | "ns" | "pe" | "nl" | "yt" | "nt" | "nu";
  taxableIncome: number;
  brackets: readonly TaxBracket[];
  credits: Array<{ label: string; baseAmount: number; rate: number; note?: string }>;
}): BracketTaxDetail {
  const { lines, total: bracketTotal } = explainBracketTax(
    params.taxableIncome,
    params.brackets,
  );

  const creditLines = params.credits.map((c) => ({
    label: c.label,
    baseAmount: c.baseAmount,
    rate: c.rate,
    credit: c.baseAmount * c.rate,
    note: c.note,
  }));
  const creditTotal = creditLines.reduce((sum, c) => sum + c.credit, 0);

  return {
    jurisdiction: params.jurisdiction,
    taxableIncome: params.taxableIncome,
    brackets: lines,
    bracketTotal,
    credits: creditLines,
    creditTotal,
    taxOwed: Math.max(0, bracketTotal - creditTotal),
  };
}
