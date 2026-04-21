/**
 * Spousal Support Advisory Guidelines (SSAG) — shared types.
 *
 * Based on the Revised User's Guide (2016), Department of Justice Canada.
 */

import type { Overrides } from "./overrides";

/** Provinces supported by the spousal support tax engine. */
export type SpousalSupportProvince = "BC" | "AB" | "ON" | "SK" | "MB" | "NB" | "NS" | "PE" | "NL" | "YT" | "NT" | "NU";

/** A low / mid / high range, standard SSAG output shape */
export interface SSAGRange {
  readonly low: number;
  readonly mid: number;
  readonly high: number;
}

/** Input for one spouse */
export interface SpouseInput {
  /** Display label for this party, e.g. "Spouse A". */
  label: string;
  /** Gross annual income in CAD (taxable, before deductions) */
  grossIncome: number;
  /** Age at date of separation */
  ageAtSeparation: number;
  /**
   * Union or professional dues paid (annual) — deductible from taxable
   * income (T1 Line 21200; T4 Box 44). Does not affect Guidelines income
   * for child support table lookups or Section 7 apportionment.
   */
  unionDues?: number;
  /** Province of residence — determines provincial tax rates and benefits. Defaults to "BC". */
  province?: SpousalSupportProvince;

  // ── Additional income types ──────────────────────────────────────────────────
  /** Interest, rental income, EI regular benefits, and other fully-taxable income */
  otherIncome?: number;
  /** RRSP/RRIF/PRPP withdrawals */
  rrspWithdrawals?: number;
  /** Actual capital gain (before 50% inclusion); the calculator applies 50% automatically */
  capitalGainsActual?: number;
  /** Net self-employment income after business expenses (T1 lines 13500/13700) */
  selfEmploymentIncome?: number;
  /** Pension income from registered plans qualifying for the pension income credit (T1 line 11500) */
  pensionIncome?: number;
  /** Actual eligible dividends received — 38% gross-up applied automatically (T1 line 12000) */
  eligibleDividends?: number;
  /** Actual non-eligible dividends received — 15% gross-up applied automatically (T1 line 12010) */
  nonEligibleDividends?: number;
  /**
   * Non-taxable income (workers' compensation, on-reserve employment income,
   * long-term disability benefits, etc.). Grossed up by 25% (RUG §6.6 / FCSG
   * Sch. III §19 default) into Guidelines income for WOCF / Custodial Payor
   * GID and s.7 apportionment. Added at its raw value to INDI net income in
   * WCF paths since it is already cash-in-hand. NOT added to taxable income.
   */
  nonTaxableIncome?: number;
  /** True if this spouse is living with a new partner after separation (enables spousal credit, suppresses EDC) */
  isCoupled?: boolean;
  /** New partner's net income for the spousal amount credit. Defaults to 0 when isCoupled=true. */
  newPartnerNetIncome?: number;
  /** True if the grossIncome value is an imputed amount rather than the actual reported income */
  isImputed?: boolean;
  /**
   * Actual reported income before any s.19 imputation (or s.18 corporate-
   * income attribution). When set, `grossIncome` is treated as the imputed /
   * attributed figure used for all math and the report shows both numbers
   * for transparency. Display-only — does not affect calculation.
   */
  reportedIncome?: number;
  // ── Prior support obligations (FCSG s.18 / SSAG blended-family) ──────────
  /**
   * Annual child support this spouse PAYS to a prior family. Deducted from
   * Guidelines income (FCSG convention) and from INDI net income (cash out-
   * of-pocket). Not tax-deductible.
   */
  priorChildSupportPaid?: number;
  /**
   * Annual spousal support this spouse PAYS to a prior family. Deducted
   * from Guidelines income and stacked onto tax-deductible SS paid.
   */
  priorSpousalSupportPaid?: number;
  /**
   * Annual spousal support this spouse RECEIVES from a prior relationship.
   * Added to taxable income (stacked onto current-case SS received).
   */
  priorSpousalSupportReceived?: number;
  /**
   * Annual child support this spouse RECEIVES from a prior relationship.
   * EXCLUDED from Guidelines income and from INDI by default — earmarked
   * for the prior kids (practitioner norm). Surfaced in the report for
   * transparency only.
   */
  priorChildSupportReceived?: number;
}

/** Which parent has primary custody — derived from child entries internally. */
export type CustodialArrangement =
  | "spouse1-primary"
  | "spouse2-primary"
  | "shared" // all children 40%+ with each parent
  | "split"; // some children primarily with each parent

/** A single child entry. */
export interface ChildEntry {
  /** Stable per-child identifier (not used in calculations). */
  id: string;
  /** ISO birthdate YYYY-MM-DD */
  birthdate: string;
  /** Which spouse this child primarily resides with, or shared (≥40% each) */
  residence: "spouse1" | "spouse2" | "shared";
}

/** Dependent children info — only required when hasChildren=true. */
export interface ChildrenInput {
  /** Per-child entries — age bands and custodial arrangement derived internally. */
  children: ChildEntry[];
  /** Total monthly Section 7 special/extraordinary expenses (can be 0) */
  section7MonthlyTotal: number;
}

/** Inputs common to all SSAG calculations */
export interface SSAGInput {
  spouse1: SpouseInput;
  spouse2: SpouseInput;
  /** ISO date (YYYY-MM-DD) — start of cohabitation OR marriage, whichever is earlier */
  cohabitationStartDate: string;
  /** ISO date — separation date */
  separationDate: string;
  /** Does the relationship involve dependent children? */
  hasChildren: boolean;
  /** Required when hasChildren is true */
  children?: ChildrenInput;
  /**
   * Caller-supplied overrides — when present, they pin values that normally
   * come from the engine. See `types/overrides.ts` for semantics.
   */
  overrides?: Overrides;
}

/** Duration output — either a fixed range in years, or indefinite with reason */
export type SSAGDuration =
  | { type: "fixed"; range: SSAGRange /* in years */ }
  | { type: "indefinite"; reason: string };

/** Which SSAG formula variant was applied */
export type SSAGFormula =
  | "without-child"
  | "with-child-basic"
  | "with-child-shared"
  | "with-child-split"
  | "with-child-custodial-payor";

/** INDI breakdown shown alongside WCF results for transparency */
export interface INDIDisplay {
  payorMonthly: SSAGRange;
  recipientMonthly: SSAGRange;
  /** Recipient's share of combined INDI, as a percent (e.g. 43.0) */
  recipientSharePercent: SSAGRange;
}

/**
 * Whether the result came from the INDI solver (normal path) or was forced
 * by a caller-supplied spousal support amount via the solver-bypass override.
 */
export type SSAGMode = "solver" | "manual";

/** SSAG calculation output */
export interface SSAGResult {
  formula: SSAGFormula;
  /** How the spousal support amount was determined. Defaults to "solver". */
  mode?: SSAGMode;
  /** 1 or 2 — which spouse pays spousal support */
  payor: 1 | 2;
  /** 1 or 2 — which spouse receives spousal support */
  recipient: 1 | 2;
  /** Gross income difference (payor income − recipient income) */
  grossIncomeDifference: number;
  /** Computed years of cohabitation + marriage */
  yearsOfRelationship: number;
  /** Monthly spousal support range in CAD */
  monthlyAmount: SSAGRange;
  /** Duration in years, or indefinite */
  duration: SSAGDuration;
  /** User-facing warnings (income above ceiling, solver at upper bound, etc.) */
  warnings: string[];
  // ── With-Child-Support additions ───────────────────────────────────────
  /** Child support computed internally (WCF only) */
  childSupportMonthly?: number;
  /**
   * 1 or 2 — which spouse pays CHILD support (may differ from SS payor).
   * In custodial-payor scenarios, CS flows from non-custodial to custodial
   * while SS flows the opposite direction.
   */
  childSupportPayor?: 1 | 2;
  /** INDI breakdown at each SSAG range point (WCF only) */
  indi?: INDIDisplay;
  /** Payor's proportional share of Section 7 (WCF only, 0–1) */
  section7PayorProportion?: number;
  /**
   * Shared-custody "50/50 NDI point" — the monthly SS amount that leaves
   * each parent's household with equal net disposable income. Per SSAG RUG
   * 2016 §8(f), this is the presumptive location within the range for
   * shared custody absent re-partnering, new children, or other factors.
   * Included in the Low–High band in the vast majority of shared-custody
   * cases. Present only on shared-custody results.
   */
  sharedCustody50_50NDIPoint?: {
    monthlySpousalSupport: number;
    /** True if the solver hit its upper bound without reaching 50/50 (rare). */
    atUpperBound: boolean;
  };
}
