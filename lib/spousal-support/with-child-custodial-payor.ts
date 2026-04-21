import {
  calculateChildSupport,
  lookupTableAmount,
} from "@/lib/child-support/calculator";
import { calculateSection7Shares, totalGuidelinesIncome } from "./section-7";
import { calculateBothINDIs, type SolverParty } from "./indi";
import { solveSpousalSupport } from "./solver";
import { calculateWCFDuration } from "./duration";
import { calculateWOCFAmount } from "./without-child";
import type { SSAGRange, SSAGDuration } from "@/types/spousal-support";
import type { SpousalSupportProvince } from "@/lib/tax/net-income";
import type { SpouseOverrides } from "@/types/overrides";

/**
 * SSAG With-Child-Support Formula — Custodial Payor.
 *
 * Custodial parent is the higher earner. Non-custodial pays CS to custodial
 * on their income. Custodial (higher earner) may owe SS to non-custodial.
 *
 * Per SSAG Revised User's Guide Ch. 14, the Custodial Payor formula uses
 * the WITHOUT-child-support formula structure, but with each party's gross
 * income first reduced by the notional table amount of child support on
 * their own income. The standard WCF INDI-target formula (40–46%) does
 * NOT apply here — it would produce amounts materially higher than what
 * courts and practitioners accept.
 *
 * Amount: (1.5%–2.0%) × adjusted gross income difference × years (capped 25)
 * Duration: WOCF-style (length of marriage only; no age-of-children test
 *           because the recipient is not the caregiver).
 */

export interface WCFCustodialPayorInput {
  custodialParent: {
    grossIncome: number;
    unionDues: number;
    ageAtSeparation: number;
    childrenUnder6: number;
    children6to17: number;
    province?: SpousalSupportProvince;
    otherIncome?: number;
    rrspWithdrawals?: number;
    capitalGainsActual?: number;
    selfEmploymentIncome?: number;
    pensionIncome?: number;
    eligibleDividends?: number;
    nonEligibleDividends?: number;
    nonTaxableIncome?: number;
    isCoupled?: boolean;
    newPartnerNetIncome?: number;
    overrides?: SpouseOverrides;
    priorChildSupportPaid?: number;
    priorSpousalSupportPaid?: number;
    priorSpousalSupportReceived?: number;
  };
  nonCustodialParent: {
    grossIncome: number;
    unionDues: number;
    ageAtSeparation: number;
    province?: SpousalSupportProvince;
    otherIncome?: number;
    rrspWithdrawals?: number;
    capitalGainsActual?: number;
    selfEmploymentIncome?: number;
    pensionIncome?: number;
    eligibleDividends?: number;
    nonEligibleDividends?: number;
    nonTaxableIncome?: number;
    isCoupled?: boolean;
    newPartnerNetIncome?: number;
    overrides?: SpouseOverrides;
    priorChildSupportPaid?: number;
    priorSpousalSupportPaid?: number;
    priorSpousalSupportReceived?: number;
  };
  yearsOfRelationship: number;
  section7MonthlyTotal: number;
  youngestChildAge: number | null;
  /** Solver bypass — when set, override the WOCF amount and report INDI at this annual SS value. */
  manualSSAnnual?: number;
}

export interface WCFCustodialPayorResult {
  monthlyAmount: SSAGRange;
  duration: SSAGDuration;
  ssPayorINDIMonthly: SSAGRange;
  ssRecipientINDIMonthly: SSAGRange;
  recipientSharePercent: SSAGRange;
  anyAtUpperBound: boolean;
  childSupportMonthly: number;
  section7PayorProportion: number;
}

export function calculateWCFCustodialPayor(
  input: WCFCustodialPayorInput,
): WCFCustodialPayorResult {
  const totalChildren =
    input.custodialParent.childrenUnder6 + input.custodialParent.children6to17;

  // CS and notional CS use Guidelines income (Federal CSG s.16 / Sch. III).
  const custodialGuidelinesIncome = totalGuidelinesIncome(input.custodialParent);
  const nonCustodialGuidelinesIncome = totalGuidelinesIncome(input.nonCustodialParent);

  // Actual CS — non-custodial pays to custodial (informational)
  const cs = calculateChildSupport({
    custodyType: "sole",
    numChildren: totalChildren,
    payorIncome: nonCustodialGuidelinesIncome,
    province: input.nonCustodialParent.province,
  });

  // Notional CS on each parent's own Guidelines income (overrideable per party)
  const custodialNotionalAnnual =
    input.custodialParent.overrides?.notionalChildSupport ??
    lookupTableAmount(custodialGuidelinesIncome, totalChildren, input.custodialParent.province) * 12;
  const nonCustodialNotionalAnnual =
    input.nonCustodialParent.overrides?.notionalChildSupport ??
    lookupTableAmount(nonCustodialGuidelinesIncome, totalChildren, input.nonCustodialParent.province) * 12;

  // WOCF amount on INCOME-ADJUSTED Guidelines-income difference (Ch. 14 convention)
  const custodialAdjusted =
    custodialGuidelinesIncome - custodialNotionalAnnual;
  const nonCustodialAdjusted =
    nonCustodialGuidelinesIncome - nonCustodialNotionalAnnual;
  const adjustedGID = Math.max(0, custodialAdjusted - nonCustodialAdjusted);

  // ComputedAmount is finalized after building solver profiles so the
  //  precise NDI-equalization cap (RUG §7.4.1) can be solved for ≥25y
  //  relationships.
  const monthlyAmountManual = input.manualSSAnnual !== undefined
    ? {
        low: input.manualSSAnnual / 12,
        mid: input.manualSSAnnual / 12,
        high: input.manualSSAnnual / 12,
      }
    : undefined;

  // Section 7 — apportion on Guidelines income (all sources, per s. 7(2)),
  // on unadjusted incomes (no notional-CS offset, per SSAG practice).
  const s7 = calculateSection7Shares(
    totalGuidelinesIncome(input.custodialParent),
    totalGuidelinesIncome(input.nonCustodialParent),
    input.section7MonthlyTotal,
  );
  // s.7 shares apportion DYNAMICALLY inside calculateBothINDIs from post-
  //  transfer Guidelines income. Overrides win per-party; static `s7` is used
  //  only for display (section7PayorProportion).
  const custodialS7Override = input.custodialParent.overrides?.section7OwnShare;
  const nonCustodialS7Override = input.nonCustodialParent.overrides?.section7OwnShare;

  // INDI at each level for detailed-report display (not used to solve).
  const ssPayorProfile: SolverParty = {
    grossIncome: input.custodialParent.grossIncome,
    unionDues: input.custodialParent.unionDues,
    notionalChildSupport: custodialNotionalAnnual,
    guidelinesIncome: custodialGuidelinesIncome,
    section7Share: custodialS7Override,
    childrenUnder6InCare: input.custodialParent.childrenUnder6,
    children6to17InCare: input.custodialParent.children6to17,
    province: input.custodialParent.province,
    otherIncome: input.custodialParent.otherIncome,
    rrspWithdrawals: input.custodialParent.rrspWithdrawals,
    capitalGainsActual: input.custodialParent.capitalGainsActual,
    selfEmploymentIncome: input.custodialParent.selfEmploymentIncome,
    pensionIncome: input.custodialParent.pensionIncome,
    eligibleDividends: input.custodialParent.eligibleDividends,
    nonEligibleDividends: input.custodialParent.nonEligibleDividends,
    nonTaxableIncome: input.custodialParent.nonTaxableIncome,
    age: input.custodialParent.ageAtSeparation,
    isCoupled: input.custodialParent.isCoupled,
    newPartnerNetIncome: input.custodialParent.newPartnerNetIncome,
    overrides: input.custodialParent.overrides,
    priorChildSupportPaid: input.custodialParent.priorChildSupportPaid,
    priorSpousalSupportPaid: input.custodialParent.priorSpousalSupportPaid,
    priorSpousalSupportReceived: input.custodialParent.priorSpousalSupportReceived,
  };
  const ssRecipientProfile: SolverParty = {
    grossIncome: input.nonCustodialParent.grossIncome,
    unionDues: input.nonCustodialParent.unionDues,
    notionalChildSupport: nonCustodialNotionalAnnual,
    guidelinesIncome: nonCustodialGuidelinesIncome,
    section7Share: nonCustodialS7Override,
    childrenUnder6InCare: 0,
    children6to17InCare: 0,
    claimEligibleDependant: false,
    province: input.nonCustodialParent.province,
    otherIncome: input.nonCustodialParent.otherIncome,
    rrspWithdrawals: input.nonCustodialParent.rrspWithdrawals,
    capitalGainsActual: input.nonCustodialParent.capitalGainsActual,
    selfEmploymentIncome: input.nonCustodialParent.selfEmploymentIncome,
    pensionIncome: input.nonCustodialParent.pensionIncome,
    eligibleDividends: input.nonCustodialParent.eligibleDividends,
    nonEligibleDividends: input.nonCustodialParent.nonEligibleDividends,
    nonTaxableIncome: input.nonCustodialParent.nonTaxableIncome,
    age: input.nonCustodialParent.ageAtSeparation,
    isCoupled: input.nonCustodialParent.isCoupled,
    newPartnerNetIncome: input.nonCustodialParent.newPartnerNetIncome,
    overrides: input.nonCustodialParent.overrides,
    priorChildSupportPaid: input.nonCustodialParent.priorChildSupportPaid,
    priorSpousalSupportPaid: input.nonCustodialParent.priorSpousalSupportPaid,
    priorSpousalSupportReceived: input.nonCustodialParent.priorSpousalSupportReceived,
  };

  // Precise NDI-equalization cap for ≥25y, using the full CP profiles
  //  (with notional CS and dynamic s.7). Falls back to 48%-GID shortcut
  //  inside calculateWOCFAmount on upper-bound hits.
  let ndiCapAnnual: number | undefined;
  if (input.yearsOfRelationship >= 25) {
    const solved = solveSpousalSupport(
      ssPayorProfile,
      ssRecipientProfile,
      0.5,
      undefined,
      input.section7MonthlyTotal,
    );
    ndiCapAnnual = solved.atUpperBound ? undefined : solved.spousalSupportAnnual;
  }

  const computedAmount = calculateWOCFAmount(adjustedGID, input.yearsOfRelationship, {
    ndiEqualizationCapAnnual: ndiCapAnnual,
  });
  const monthlyAmount = monthlyAmountManual ?? computedAmount;

  const lowBD = calculateBothINDIs(ssPayorProfile, ssRecipientProfile, monthlyAmount.low * 12, input.section7MonthlyTotal);
  const midBD = calculateBothINDIs(ssPayorProfile, ssRecipientProfile, monthlyAmount.mid * 12, input.section7MonthlyTotal);
  const highBD = calculateBothINDIs(ssPayorProfile, ssRecipientProfile, monthlyAmount.high * 12, input.section7MonthlyTotal);

  // Custodial-payor duration = WOCF (length of marriage only)
  const duration = calculateWCFDuration(
    input.yearsOfRelationship,
    input.nonCustodialParent.ageAtSeparation,
    null,
  );

  return {
    monthlyAmount,
    duration,
    ssPayorINDIMonthly: {
      low: lowBD.ssPayorINDI / 12,
      mid: midBD.ssPayorINDI / 12,
      high: highBD.ssPayorINDI / 12,
    },
    ssRecipientINDIMonthly: {
      low: lowBD.ssRecipientINDI / 12,
      mid: midBD.ssRecipientINDI / 12,
      high: highBD.ssRecipientINDI / 12,
    },
    recipientSharePercent: {
      low: lowBD.recipientShare * 100,
      mid: midBD.recipientShare * 100,
      high: highBD.recipientShare * 100,
    },
    anyAtUpperBound: false,
    childSupportMonthly: cs.monthlyAmount,
    section7PayorProportion: s7.payorProportion,
  };
}
