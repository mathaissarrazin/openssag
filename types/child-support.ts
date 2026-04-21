/**
 * Shared types for child support calculations.
 */

import type { FederalProvince } from "../lib/child-support/province-tables";

export type { FederalProvince };

/** Quebec uses its own provincial guidelines — not the federal Schedule I. */
export type ProvinceOrQC = FederalProvince | "QC";

export type CustodyType = "sole" | "shared";

export interface SoleCustodyInput {
  custodyType: "sole";
  numChildren: number;
  payorIncome: number;
  /** Custodial parent's income — required for Section 7 proportional apportionment */
  recipientIncome?: number;
  /** Total monthly Section 7 special/extraordinary expenses */
  section7Monthly?: number;
  /** Province/territory whose Schedule I table to use. Defaults to "BC". */
  province?: FederalProvince;
}

export interface SharedCustodyInput {
  custodyType: "shared";
  numChildren: number;
  parent1Income: number;
  parent2Income: number;
  /** Total monthly Section 7 special/extraordinary expenses */
  section7Monthly?: number;
  /** Parent 1's province for their Schedule I table lookup. Falls back to `province`. */
  parent1Province?: FederalProvince;
  /** Parent 2's province for their Schedule I table lookup. Falls back to `province`. */
  parent2Province?: FederalProvince;
  /** Shared province fallback when per-parent provinces are not provided. Defaults to "BC". */
  province?: FederalProvince;
}

export type ChildSupportInput = SoleCustodyInput | SharedCustodyInput;

export interface ChildSupportResult {
  /** Monthly guideline amount in CAD */
  monthlyAmount: number;
  /** Annual guideline amount (monthlyAmount × 12) */
  annualAmount: number;
  custodyType: CustodyType;
  numChildren: number;
  /**
   * Shared custody: which parent is the net payor (higher table amount).
   * Sole custody: undefined (payor is known from the input).
   */
  payorParent?: 1 | 2;
  /** Shared custody: each parent's individual table amount before set-off */
  parent1TableAmount?: number;
  parent2TableAmount?: number;
  // ── Section 7 (populated when section7Monthly was provided with enough income data) ──
  /** Total Section 7 entered */
  section7Monthly?: number;
  /**
   * Parent 1's income proportion (0–1).
   * Sole custody: parent 1 = payor (non-custodial).
   * Shared custody: parent 1 = parent 1 from input.
   */
  parent1Section7Proportion?: number;
  /** Parent 1's monthly Section 7 obligation */
  parent1Section7Monthly?: number;
  /** Parent 2's monthly Section 7 obligation */
  parent2Section7Monthly?: number;
}
