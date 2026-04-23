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
  /**
   * Gross EMPLOYMENT income (T4 Box 14), annual, CAD. Must NOT include:
   * (a) prior spousal / child support received (enter separately as
   *     `priorSpousalSupportReceived` / `priorChildSupportReceived`);
   * (b) a deferred CCPC stock-option benefit not yet disposed — enter that
   *     separately as `ccpcStockOptionBenefit` so it is added for Guidelines
   *     only and not double-counted in tax;
   * (c) non-T4 amounts — enter self-employment, pension, dividends, etc.
   *     via their dedicated fields so the tax engine applies the correct
   *     CPP / EI / credit treatment.
   */
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
  /**
   * Interest, rental income, EI regular benefits, and other fully-taxable
   * income. Must NOT include prior-partner spousal support received — enter
   * that via `priorSpousalSupportReceived` so Guidelines-income reporting
   * keeps it distinct.
   */
  otherIncome?: number;
  /** RRSP/RRIF/PRPP withdrawals */
  rrspWithdrawals?: number;
  /** Actual capital gain (before 50% inclusion); the calculator applies 50% automatically */
  capitalGainsActual?: number;
  /**
   * Net self-employment income after business expenses (T1 lines 13500/13700).
   * Enter the amount AS IT APPEARS ON T1 — i.e., already net of any
   * non-arm's-length wages the partnership / sole-prop deducted, and already
   * including any s.34.1 current-year income inclusion. Use
   * `partnershipNonArmsLengthAddBack` to add back non-arm's-length wages for
   * Guidelines purposes and `priorPeriodSelfEmploymentAdjustment` to
   * subtract prior-period earnings from Guidelines per Sch. III §9.
   */
  selfEmploymentIncome?: number;
  /**
   * Pension income taxed in this spouse's hands, qualifying for the pension
   * income credit. Enter the COMBINED amount of T1 line 11500 (own
   * registered pension, annuities, etc., net of any s.60.03 transfer OUT)
   * AND T1 line 11600 (split-pension income received under s.60.03). The tax
   * engine applies the pension income credit to the full amount, matching
   * line 31400.
   *
   * For Guidelines purposes under FCSG Sch. III §3.1 the pension stays with
   * the original earner regardless of the election:
   *   - Transferor (who elected to transfer pension OUT): populate
   *     `splitPensionAddBack` with the transferred amount so it is added
   *     back to Guidelines income.
   *   - Transferee (who received pension IN via the election): populate
   *     `splitPensionTransfereeDeduct` with the received amount so it is
   *     removed from Guidelines income.
   */
  pensionIncome?: number;
  /** Actual eligible dividends received — 38% gross-up applied automatically (T1 line 12000) */
  eligibleDividends?: number;
  /** Actual non-eligible dividends received — 15% gross-up applied automatically (T1 line 12010) */
  nonEligibleDividends?: number;
  /**
   * Non-taxable income (workers' compensation, on-reserve employment income,
   * long-term disability benefits, etc.). Grossed up by 25% (SSAG Revised
   * User's Guide 2016 §6.6 — practitioner convention) into Guidelines
   * income for WOCF / Custodial Payor GID and s.7 apportionment. Added at
   * its raw value to INDI net income in WCF paths since it is already
   * cash-in-hand. NOT added to taxable income.
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

  // ── FCSG Schedule III adjustments ────────────────────────────────────────
  /**
   * Employment expenses deductible under ITA s.8 other than union /
   * professional dues (e.g. motor vehicle, home office, tradesperson tools,
   * clergy residence). Deducted from Guidelines income per FCSG Sch. III §1.
   * Union dues are entered separately in `unionDues`.
   *
   * ITA caps are the user's responsibility — e.g., artists' employment
   * expenses under s.8(1)(q) are limited to the lesser of 20% of employment
   * income or $1,000; motor-vehicle expenses under s.8(1)(h.1) must be
   * reasonable. Enter only the amount a T1 would deduct at line 22900.
   */
  employmentExpensesOther?: number;
  /**
   * Carrying charges and interest expenses deductible under ITA
   * s.20(1)(c)/(d)/(e)/(e.1)/(e.2) — investment loan interest, safety deposit
   * box fees, investment counsel fees, etc. Deducted from Guidelines income
   * per FCSG Sch. III §8.
   */
  carryingCharges?: number;
  /**
   * Actual business investment loss (BIL) sustained in the year under ITA
   * s.39(1)(c) — enter the FULL 100% loss, not the 50% ABIL. Deducted from
   * Guidelines income at the full amount per FCSG Sch. III §7; the tax
   * engine halves it automatically to produce the allowable BIL (ABIL) under
   * ITA s.38(c).
   */
  businessInvestmentLosses?: number;
  /**
   * Prior-period self-employment earnings included in the current year's
   * income under ITA s.34.1. Deducted from Guidelines income per FCSG Sch.
   * III §9 (the actual current-year earnings should be added via
   * `selfEmploymentIncome`).
   */
  priorPeriodSelfEmploymentAdjustment?: number;
  /**
   * TRANSFEROR side of pension splitting. Amount of eligible pension income
   * transferred OUT to a spouse under ITA s.60.03 — i.e., amount deducted at
   * T1 line 21000. Added back to this spouse's Guidelines income per FCSG
   * Sch. III §3.1: for Guidelines purposes the pension stays with the actual
   * earner regardless of the tax election. Use only if you are the original
   * pensioner who made the election.
   */
  splitPensionAddBack?: number;
  /**
   * TRANSFEREE side of pension splitting. Amount of split-pension income
   * INCLUDED in this spouse's income at T1 line 11600 under ITA s.60.03.
   * Deducted from Guidelines income per FCSG Sch. III §3.1 — the transferred
   * pension belongs to the original earner for Guidelines purposes.
   * `pensionIncome` should still be entered at its post-split T1 line 11500
   * value; this field captures line 11600 separately.
   */
  splitPensionTransfereeDeduct?: number;
  /**
   * CCPC stock-option benefit whose tax inclusion is DEFERRED under ITA
   * s.7(1.1) — shares were acquired by exercising an option but NOT sold
   * before year-end, so the benefit is not on the current-year T1 (it moves
   * to the year of disposition). FCSG Sch. III §11 adds it back to
   * Guidelines income in the YEAR OF ACQUISITION regardless of the deferral.
   *
   * Enter (FMV at exercise − exercise price) × number of shares.
   *
   * DO NOT enter if the shares were also disposed of in the same year — in
   * that case s.7(1.1) does not defer and the benefit is already in T4 Box
   * 38 / employment income, so `grossIncome` already contains it. Entering
   * it here as well would double-count Guidelines income.
   */
  ccpcStockOptionBenefit?: number;
  /**
   * Salaries, benefits, wages, or management fees deducted by a partnership
   * or sole proprietorship in respect of persons not at arm's length with
   * the spouse, to the extent not justifiable. Added back to Guidelines
   * income per FCSG Sch. III §10.
   */
  partnershipNonArmsLengthAddBack?: number;
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
