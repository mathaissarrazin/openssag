import { calculateNetIncome, type SpousalSupportProvince } from "../tax/net-income";
import type { SpouseOverrides } from "../../types/overrides";
import { calculateSection7Shares } from "./section-7";

/**
 * Individual Net Disposable Income (INDI) — the SSAG building block.
 *
 * Per SSAG, INDI represents each parent's "adult personal" disposable
 * income after accounting for their share of raising the children. The
 * formula:
 *
 *   INDI = (tax-engine net income after SS adjustments + CCB + GST credit)
 *        − notional child support contribution
 *        − own share of Section 7 expenses
 *
 * Crucially, the SSAG does NOT add child support received to the recipient's
 * INDI (it flows through to the kids) and does NOT subtract actual child
 * support paid by the payor (it IS their notional contribution). Instead,
 * both parents subtract their NOTIONAL contribution — the amount each
 * would owe per the Federal Guidelines table on their own income for the
 * number of children, regardless of who the children live with.
 *
 * For the Basic WCF: payor's notional = actual CS paid (table on payor
 * income). Recipient's notional = table on recipient's income (typically
 * smaller).
 */

export interface INDIInputs {
  grossIncome: number;
  unionDues: number;
  spousalSupportPaid: number;
  spousalSupportReceived: number;
  /** Annual notional child support = table amount on this party's income for the number of children */
  notionalChildSupport: number;
  /** Own proportional share of Section 7 expenses, annual */
  section7OwnShare: number;
  childrenUnder6InCare: number;
  children6to17InCare: number;
  /** CCB multiplier — 1.0 (default) for sole custody, 0.5 for shared */
  ccbMultiplier?: number;
  /**
   * Eligible Dependant Credit override. If unset, defaults to
   * `totalKidsInCare > 0` (correct for Basic, Split, Custodial Payor).
   * Shared custody explicitly passes `false` for the payor so the lower-
   * earning recipient is the sole EDC claimant — practitioner convention.
   */
  claimEligibleDependant?: boolean;
  /** True if this party is living with a new partner (enables spousal credit, suppresses EDC) */
  isCoupled?: boolean;
  /** New partner's net income for spousal amount credit. Defaults to 0. */
  newPartnerNetIncome?: number;
  /** Province for tax/benefit calculation. Defaults to "BC". */
  province?: SpousalSupportProvince;
  otherIncome?: number;
  rrspWithdrawals?: number;
  capitalGainsActual?: number;
  selfEmploymentIncome?: number;
  pensionIncome?: number;
  eligibleDividends?: number;
  nonEligibleDividends?: number;
  /**
   * Non-taxable income (WCB, on-reserve, LTD). Added at raw value to net
   * income in WCF INDI — it's cash-in-hand and should not be taxed.
   */
  nonTaxableIncome?: number;
  /** Age at separation — for age-gated benefits (NL Seniors' Benefit). */
  age?: number;
  /** Per-spouse overrides threaded to the tax layer. */
  overrides?: SpouseOverrides;
  /** Prior CS paid — deducted from INDI (cash out); not tax-deductible. */
  priorChildSupportPaid?: number;
  /** Prior SS paid — stacked onto tax-deductible SS paid. */
  priorSpousalSupportPaid?: number;
  /** Prior SS received — stacked onto taxable SS received. */
  priorSpousalSupportReceived?: number;
  /** FCSG Sch. III §1 — other ITA s.8 employment expenses (tax-deductible). */
  employmentExpensesOther?: number;
  /** FCSG Sch. III §8 — carrying charges / investment interest (tax-deductible). */
  carryingCharges?: number;
  /** FCSG Sch. III §7 — actual BIL; 50% ABIL deducted for tax. */
  businessInvestmentLosses?: number;
}

export function calculateINDI(inputs: INDIInputs): number {
  const totalKidsInCare =
    inputs.childrenUnder6InCare + inputs.children6to17InCare;

  const netIncomeBreakdown = calculateNetIncome({
    grossIncome: inputs.grossIncome,
    unionDues: inputs.unionDues,
    spousalSupportPaid: inputs.spousalSupportPaid + (inputs.priorSpousalSupportPaid ?? 0),
    spousalSupportReceived: inputs.spousalSupportReceived + (inputs.priorSpousalSupportReceived ?? 0),
    isCoupled: inputs.isCoupled ?? false,
    newPartnerNetIncome: inputs.newPartnerNetIncome,
    childrenUnder6InCare: inputs.childrenUnder6InCare,
    children6to17InCare: inputs.children6to17InCare,
    ccbMultiplier: inputs.ccbMultiplier ?? 1,
    // CCB is INCLUDED in INDI per current SSAG practice.
    excludeCCB: false,
    claimEligibleDependant:
      inputs.claimEligibleDependant ?? (totalKidsInCare > 0),
    province: inputs.province,
    otherIncome: inputs.otherIncome,
    rrspWithdrawals: inputs.rrspWithdrawals,
    capitalGainsActual: inputs.capitalGainsActual,
    selfEmploymentIncome: inputs.selfEmploymentIncome,
    pensionIncome: inputs.pensionIncome,
    eligibleDividends: inputs.eligibleDividends,
    nonEligibleDividends: inputs.nonEligibleDividends,
    age: inputs.age,
    overrides: inputs.overrides,
    employmentExpensesOther: inputs.employmentExpensesOther,
    carryingCharges: inputs.carryingCharges,
    businessInvestmentLosses: inputs.businessInvestmentLosses,
  });

  return (
    netIncomeBreakdown.netIncome
    + (inputs.nonTaxableIncome ?? 0)
    - inputs.notionalChildSupport
    - inputs.section7OwnShare
    - (inputs.priorChildSupportPaid ?? 0)
  );
}

/**
 * A party profile for the solver — everything that's FIXED while the
 * solver iterates on the spousal support amount.
 */
export interface SolverParty {
  grossIncome: number;
  unionDues: number;
  /** Annual notional CS obligation (table on own income for the number of kids) */
  notionalChildSupport: number;
  /**
   * Pre-transfer Guidelines income (FCSG s.16 / Sch. III) for this party.
   * Used to apportion s.7 dynamically from POST-transfer Guidelines income
   * at each solver step — preserving the §8(b) "post-SS sharing" convention
   * without a stale shares snapshot.
   */
  guidelinesIncome: number;
  /**
   * Optional override: pin this party's s.7 share to a fixed annual amount.
   * When undefined, s.7 is apportioned dynamically from post-transfer
   * Guidelines income using `section7TotalMonthly` passed to
   * `calculateBothINDIs`.
   */
  section7Share?: number;
  /** Children in this party's care — used for CCB and GST credit */
  childrenUnder6InCare: number;
  children6to17InCare: number;
  /** CCB multiplier (shared custody = 0.5) */
  ccbMultiplier?: number;
  /** See INDIInputs.claimEligibleDependant */
  claimEligibleDependant?: boolean;
  /** True if this party is living with a new partner (enables spousal credit, suppresses EDC) */
  isCoupled?: boolean;
  /** New partner's net income for spousal amount credit. Defaults to 0. */
  newPartnerNetIncome?: number;
  /** Province of residence for this party. Defaults to "BC". */
  province?: SpousalSupportProvince;
  otherIncome?: number;
  rrspWithdrawals?: number;
  capitalGainsActual?: number;
  selfEmploymentIncome?: number;
  pensionIncome?: number;
  eligibleDividends?: number;
  nonEligibleDividends?: number;
  /** Non-taxable income (WCB, on-reserve, LTD) — added raw to INDI net income. */
  nonTaxableIncome?: number;
  /** Age at separation — for age-gated benefits (NL Seniors' Benefit). */
  age?: number;
  /** Per-spouse engine overrides. */
  overrides?: SpouseOverrides;
  /** Prior CS paid — deducted from INDI (cash out); not tax-deductible. */
  priorChildSupportPaid?: number;
  /** Prior SS paid — stacked onto tax-deductible SS paid. */
  priorSpousalSupportPaid?: number;
  /** Prior SS received — stacked onto taxable SS received. */
  priorSpousalSupportReceived?: number;
  /** FCSG Sch. III §1 — other ITA s.8 employment expenses (tax-deductible). */
  employmentExpensesOther?: number;
  /** FCSG Sch. III §8 — carrying charges / investment interest (tax-deductible). */
  carryingCharges?: number;
  /** FCSG Sch. III §7 — actual BIL; 50% ABIL deducted for tax. */
  businessInvestmentLosses?: number;
}

export interface INDIBreakdown {
  ssPayorINDI: number;
  ssRecipientINDI: number;
  combined: number;
  recipientShare: number;
}

export function calculateBothINDIs(
  ssPayor: SolverParty,
  ssRecipient: SolverParty,
  ssAnnual: number,
  section7TotalMonthly: number = 0,
): INDIBreakdown {
  // Dynamically apportion s.7 on POST-transfer Guidelines income per
  // FCSG §7(2) / SSAG §8(b). When either party has overridden their s.7
  // share, we still compute dynamic shares as a fallback, but the
  // override wins per-party.
  const payorGLPost = ssPayor.guidelinesIncome - ssAnnual;
  const recipientGLPost = ssRecipient.guidelinesIncome + ssAnnual;
  const dynamic = calculateSection7Shares(
    payorGLPost,
    recipientGLPost,
    section7TotalMonthly,
  );
  const payorS7 = ssPayor.section7Share ?? dynamic.payorAnnualShare;
  const recipientS7 = ssRecipient.section7Share ?? dynamic.recipientAnnualShare;

  const ssPayorINDI = calculateINDI({
    grossIncome: ssPayor.grossIncome,
    unionDues: ssPayor.unionDues,
    spousalSupportPaid: ssAnnual,
    spousalSupportReceived: 0,
    notionalChildSupport: ssPayor.notionalChildSupport,
    section7OwnShare: payorS7,
    childrenUnder6InCare: ssPayor.childrenUnder6InCare,
    children6to17InCare: ssPayor.children6to17InCare,
    ccbMultiplier: ssPayor.ccbMultiplier,
    claimEligibleDependant: ssPayor.claimEligibleDependant,
    isCoupled: ssPayor.isCoupled,
    newPartnerNetIncome: ssPayor.newPartnerNetIncome,
    province: ssPayor.province,
    otherIncome: ssPayor.otherIncome,
    rrspWithdrawals: ssPayor.rrspWithdrawals,
    capitalGainsActual: ssPayor.capitalGainsActual,
    selfEmploymentIncome: ssPayor.selfEmploymentIncome,
    pensionIncome: ssPayor.pensionIncome,
    eligibleDividends: ssPayor.eligibleDividends,
    nonEligibleDividends: ssPayor.nonEligibleDividends,
    nonTaxableIncome: ssPayor.nonTaxableIncome,
    age: ssPayor.age,
    overrides: ssPayor.overrides,
    priorChildSupportPaid: ssPayor.priorChildSupportPaid,
    priorSpousalSupportPaid: ssPayor.priorSpousalSupportPaid,
    priorSpousalSupportReceived: ssPayor.priorSpousalSupportReceived,
    employmentExpensesOther: ssPayor.employmentExpensesOther,
    carryingCharges: ssPayor.carryingCharges,
    businessInvestmentLosses: ssPayor.businessInvestmentLosses,
  });

  const ssRecipientINDI = calculateINDI({
    grossIncome: ssRecipient.grossIncome,
    unionDues: ssRecipient.unionDues,
    spousalSupportPaid: 0,
    spousalSupportReceived: ssAnnual,
    notionalChildSupport: ssRecipient.notionalChildSupport,
    section7OwnShare: recipientS7,
    childrenUnder6InCare: ssRecipient.childrenUnder6InCare,
    children6to17InCare: ssRecipient.children6to17InCare,
    ccbMultiplier: ssRecipient.ccbMultiplier,
    claimEligibleDependant: ssRecipient.claimEligibleDependant,
    isCoupled: ssRecipient.isCoupled,
    newPartnerNetIncome: ssRecipient.newPartnerNetIncome,
    province: ssRecipient.province,
    otherIncome: ssRecipient.otherIncome,
    rrspWithdrawals: ssRecipient.rrspWithdrawals,
    capitalGainsActual: ssRecipient.capitalGainsActual,
    selfEmploymentIncome: ssRecipient.selfEmploymentIncome,
    pensionIncome: ssRecipient.pensionIncome,
    eligibleDividends: ssRecipient.eligibleDividends,
    nonEligibleDividends: ssRecipient.nonEligibleDividends,
    nonTaxableIncome: ssRecipient.nonTaxableIncome,
    age: ssRecipient.age,
    overrides: ssRecipient.overrides,
    priorChildSupportPaid: ssRecipient.priorChildSupportPaid,
    priorSpousalSupportPaid: ssRecipient.priorSpousalSupportPaid,
    priorSpousalSupportReceived: ssRecipient.priorSpousalSupportReceived,
    employmentExpensesOther: ssRecipient.employmentExpensesOther,
    carryingCharges: ssRecipient.carryingCharges,
    businessInvestmentLosses: ssRecipient.businessInvestmentLosses,
  });

  const combined = ssPayorINDI + ssRecipientINDI;
  return {
    ssPayorINDI,
    ssRecipientINDI,
    combined,
    recipientShare: combined > 0 ? ssRecipientINDI / combined : 0,
  };
}
