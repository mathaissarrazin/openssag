import {
  calculateChildSupport,
  lookupTableAmount,
} from "../child-support/calculator";
import { calculateSection7Shares, totalGuidelinesIncome } from "./section-7";
// CS table lookups and notional CS use Guidelines income (Federal CSG s.16 /
// Sch. III), not T4 alone. The spouse objects' `grossIncome` field is T4
// only; the tax engine sums all sources itself, so solver profiles still
// receive T4 + breakout fields unchanged.
import { runWCFSolver, type WCFSolverOutput } from "./wcf-common";
import type { SpousalSupportProvince } from "../tax/net-income";
import type { SpouseOverrides } from "../../types/overrides";

/**
 * SSAG With-Child-Support Formula — Basic (single primary custodian).
 *
 * Each parent's INDI subtracts their own NOTIONAL child support contribution
 * (table amount on their income for the number of children). Payor's
 * notional equals actual CS paid; recipient's notional is typically smaller
 * (their table amount at their income).
 */

export interface WCFBasicInput {
  payor: {
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
  recipient: {
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
  yearsOfRelationship: number;
  section7MonthlyTotal: number;
  youngestChildAge: number | null;
  /** Solver bypass — when set, skip the solver and report INDI at this annual SS amount. */
  manualSSAnnual?: number;
}

export interface WCFBasicResult extends WCFSolverOutput {
  childSupportMonthly: number;
  section7PayorProportion: number;
}

export function calculateWCFBasic(input: WCFBasicInput): WCFBasicResult {
  const totalChildren =
    input.recipient.childrenUnder6 + input.recipient.children6to17;

  const payorGuidelinesIncome = totalGuidelinesIncome(input.payor);
  const recipientGuidelinesIncome = totalGuidelinesIncome(input.recipient);

  // 1. Actual CS (payor → recipient) — informational
  const cs = calculateChildSupport({
    custodyType: "sole",
    numChildren: totalChildren,
    payorIncome: payorGuidelinesIncome,
    province: input.payor.province,
  });
  const csAnnual = cs.monthlyAmount * 12;

  // 2. Notional CS for each party — table amount on their own Guidelines
  //    income, unless the caller has pinned a value via override.
  const payorNotionalAnnual =
    input.payor.overrides?.notionalChildSupport ??
    lookupTableAmount(payorGuidelinesIncome, totalChildren, input.payor.province) * 12;
  const recipientNotionalAnnual =
    input.recipient.overrides?.notionalChildSupport ??
    lookupTableAmount(recipientGuidelinesIncome, totalChildren, input.recipient.province) * 12;

  // 3. Section 7 apportionment — overrideable per party. When no override,
  //    s.7 is apportioned DYNAMICALLY inside the solver on post-transfer
  //    Guidelines income per FCSG §7(2) / SSAG §8(b), avoiding the circularity
  //    of pre-transfer apportionment. The static shares here are used only for
  //    (a) display (section7PayorProportion) and (b) the override path.
  const s7 = calculateSection7Shares(
    payorGuidelinesIncome,
    recipientGuidelinesIncome,
    input.section7MonthlyTotal,
  );
  const payorS7Override = input.payor.overrides?.section7OwnShare;
  const recipientS7Override = input.recipient.overrides?.section7OwnShare;

  // 4. Solver profiles
  const ssPayor = {
    grossIncome: input.payor.grossIncome,
    unionDues: input.payor.unionDues,
    notionalChildSupport: payorNotionalAnnual,
    guidelinesIncome: payorGuidelinesIncome,
    section7Share: payorS7Override,
    childrenUnder6InCare: 0,
    children6to17InCare: 0,
    province: input.payor.province,
    otherIncome: input.payor.otherIncome,
    rrspWithdrawals: input.payor.rrspWithdrawals,
    capitalGainsActual: input.payor.capitalGainsActual,
    selfEmploymentIncome: input.payor.selfEmploymentIncome,
    pensionIncome: input.payor.pensionIncome,
    eligibleDividends: input.payor.eligibleDividends,
    nonEligibleDividends: input.payor.nonEligibleDividends,
    nonTaxableIncome: input.payor.nonTaxableIncome,
    age: input.payor.ageAtSeparation,
    isCoupled: input.payor.isCoupled,
    newPartnerNetIncome: input.payor.newPartnerNetIncome,
    overrides: input.payor.overrides,
    priorChildSupportPaid: input.payor.priorChildSupportPaid,
    priorSpousalSupportPaid: input.payor.priorSpousalSupportPaid,
    priorSpousalSupportReceived: input.payor.priorSpousalSupportReceived,
  };
  const ssRecipient = {
    grossIncome: input.recipient.grossIncome,
    unionDues: input.recipient.unionDues,
    notionalChildSupport: recipientNotionalAnnual,
    guidelinesIncome: recipientGuidelinesIncome,
    section7Share: recipientS7Override,
    childrenUnder6InCare: input.recipient.childrenUnder6,
    children6to17InCare: input.recipient.children6to17,
    province: input.recipient.province,
    otherIncome: input.recipient.otherIncome,
    rrspWithdrawals: input.recipient.rrspWithdrawals,
    capitalGainsActual: input.recipient.capitalGainsActual,
    selfEmploymentIncome: input.recipient.selfEmploymentIncome,
    pensionIncome: input.recipient.pensionIncome,
    eligibleDividends: input.recipient.eligibleDividends,
    nonEligibleDividends: input.recipient.nonEligibleDividends,
    nonTaxableIncome: input.recipient.nonTaxableIncome,
    age: input.recipient.ageAtSeparation,
    isCoupled: input.recipient.isCoupled,
    newPartnerNetIncome: input.recipient.newPartnerNetIncome,
    overrides: input.recipient.overrides,
    priorChildSupportPaid: input.recipient.priorChildSupportPaid,
    priorSpousalSupportPaid: input.recipient.priorSpousalSupportPaid,
    priorSpousalSupportReceived: input.recipient.priorSpousalSupportReceived,
  };

  const solved = runWCFSolver(
    ssPayor,
    ssRecipient,
    input.yearsOfRelationship,
    input.recipient.ageAtSeparation,
    input.youngestChildAge,
    undefined,
    undefined,
    input.manualSSAnnual,
    input.section7MonthlyTotal,
  );

  return {
    ...solved,
    childSupportMonthly: cs.monthlyAmount,
    section7PayorProportion: s7.payorProportion,
  };
}
