import PROVINCE_TABLES from "./province-tables";
import type { FederalProvince } from "./province-tables";
import type {
  ChildSupportInput,
  ChildSupportResult,
} from "../../types/child-support";

/**
 * Look up the monthly guideline amount for a single payor income.
 * Defaults to BC if no province is supplied (preserves existing callers).
 */
export function lookupTableAmount(
  annualIncome: number,
  numChildren: number,
  province: FederalProvince = "BC",
): number {
  if (annualIncome < 16_000) return 0;

  const children = Math.min(Math.max(1, Math.round(numChildren)), 6);
  const table = PROVINCE_TABLES[province][children];

  let row = table[table.length - 1];
  for (let i = 0; i < table.length - 1; i++) {
    const nextFrom = table[i + 1][0];
    if (annualIncome < nextFrom) {
      row = table[i];
      break;
    }
  }

  const [from, basicAmount, plusPercent] = row;
  return basicAmount + (plusPercent / 100) * (annualIncome - from);
}

function applySection7(
  result: ChildSupportResult,
  section7: number,
  parent1Income: number,
  parent2Income: number,
): void {
  const total = parent1Income + parent2Income;
  if (total <= 0) return;
  const p1Prop = parent1Income / total;
  result.section7Monthly = section7;
  result.parent1Section7Proportion = p1Prop;
  result.parent1Section7Monthly = Math.round(p1Prop * section7 * 100) / 100;
  result.parent2Section7Monthly =
    Math.round((1 - p1Prop) * section7 * 100) / 100;
}

/**
 * Calculate the child support guideline amount for the given province.
 *
 * Sole custody: table lookup on the payor's income.
 * Shared custody (s. 9 set-off): both table amounts calculated independently;
 * the parent with the higher amount pays the difference.
 * Section 7: apportioned proportionally to each parent's income (s. 7(2) FCSG).
 */
export function calculateChildSupport(
  input: ChildSupportInput,
): ChildSupportResult {
  const { custodyType, numChildren } = input;
  const province = input.province ?? "BC";

  if (custodyType === "sole") {
    const monthly = lookupTableAmount(input.payorIncome, numChildren, province);
    const result: ChildSupportResult = {
      custodyType,
      numChildren,
      monthlyAmount: Math.round(monthly * 100) / 100,
      annualAmount: Math.round(monthly * 12 * 100) / 100,
    };

    const s7 = input.section7Monthly ?? 0;
    if (s7 > 0 && input.recipientIncome !== undefined) {
      applySection7(result, s7, input.payorIncome, input.recipientIncome);
    } else if (s7 > 0) {
      result.section7Monthly = s7;
    }

    return result;
  }

  // Shared custody — set-off approach; each parent's table uses their own province
  const prov1 = input.parent1Province ?? province;
  const prov2 = input.parent2Province ?? province;
  const amount1 = lookupTableAmount(input.parent1Income, numChildren, prov1);
  const amount2 = lookupTableAmount(input.parent2Income, numChildren, prov2);
  const netMonthly = Math.abs(amount1 - amount2);
  const payorParent: 1 | 2 = amount1 >= amount2 ? 1 : 2;

  const result: ChildSupportResult = {
    custodyType,
    numChildren,
    monthlyAmount: Math.round(netMonthly * 100) / 100,
    annualAmount: Math.round(netMonthly * 12 * 100) / 100,
    payorParent,
    parent1TableAmount: Math.round(amount1 * 100) / 100,
    parent2TableAmount: Math.round(amount2 * 100) / 100,
  };

  const s7 = input.section7Monthly ?? 0;
  if (s7 > 0) {
    applySection7(result, s7, input.parent1Income, input.parent2Income);
  }

  return result;
}
