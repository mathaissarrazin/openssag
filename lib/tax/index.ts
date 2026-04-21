/**
 * Tax engine — public API.
 *
 * Each tax year is a self-contained set of modules (e.g. `federal-2026.ts`,
 * `bc-2026.ts`, `cpp-ei-2026.ts`, `benefits-2026.ts`). To add a new year,
 * create the modules and re-export here.
 */

// Bracket engine
export { calculateBracketTax } from "./brackets";

// Jurisdictions
export { FEDERAL_2026 } from "./federal-2026";
export { BC_2026 } from "./bc-2026";
export { AB_2026 } from "./alberta-2026";

// Payroll deductions
export {
  CPP_2026,
  EI_2026,
  calculateCPP,
  calculateEI,
} from "./cpp-ei-2026";

// Refundable benefits
export {
  CCB_2025_2026,
  GST_CREDIT_2025_2026,
  calculateCCB,
  calculateGSTCredit,
} from "./benefits-2026";

// Aggregate net income calculation
export { calculateNetIncome } from "./net-income";
export type { NetIncomeInput, NetIncomeBreakdown, SpousalSupportProvince } from "./net-income";

// Types
export type { TaxBracket, TaxJurisdiction } from "@/types/tax";
