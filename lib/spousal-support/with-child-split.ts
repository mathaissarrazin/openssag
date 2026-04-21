import {
  calculateChildSupport,
  lookupTableAmount,
} from "@/lib/child-support/calculator";
import { calculateSection7Shares, totalGuidelinesIncome } from "./section-7";
import { runWCFSolver, type WCFSolverOutput } from "./wcf-common";
import type { SpousalSupportProvince } from "@/lib/tax/net-income";
import type { SpouseOverrides } from "@/types/overrides";

/**
 * SSAG With-Child-Support Formula — Split Custody.
 *
 * Each parent has one or more children primarily. Actual CS is the split
 * set-off (each parent's table amount for the kids NOT in their care; net
 * off).
 *
 * For SSAG INDI, each parent subtracts their own table amount on their own
 * income for ALL children (the WCF-Basic convention). Actual set-off CS is
 * computed separately but does not flow through INDI — SSAG treats notional
 * contributions symmetrically.
 *
 * EDC: per ITA s.118(5), the net CS payor cannot claim the Eligible Dependant
 * Credit. The SS recipient (typically the net CS recipient in split) is the
 * sole EDC claimant.
 */

export interface WCFSplitInput {
  spouse1: {
    grossIncome: number;
    unionDues: number;
    ageAtSeparation: number;
    childrenUnder6InCare: number;
    children6to17InCare: number;
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
  spouse2: {
    grossIncome: number;
    unionDues: number;
    ageAtSeparation: number;
    childrenUnder6InCare: number;
    children6to17InCare: number;
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

export interface WCFSplitResult extends WCFSolverOutput {
  childSupportMonthly: number;
  section7PayorProportion: number;
  /** Which spouse pays spousal support (higher earner) */
  payorSpouse: 1 | 2;
  /** Which spouse pays child support (may differ from SS payor) */
  csPayorSpouse: 1 | 2;
}

export function calculateWCFSplit(input: WCFSplitInput): WCFSplitResult {
  const s1TotalKids = input.spouse1.childrenUnder6InCare + input.spouse1.children6to17InCare;
  const s2TotalKids = input.spouse2.childrenUnder6InCare + input.spouse2.children6to17InCare;
  const totalChildren = s1TotalKids + s2TotalKids;

  // CS and notional CS use Guidelines income (Federal CSG s.16 / Sch. III).
  const s1GuidelinesIncome = totalGuidelinesIncome(input.spouse1);
  const s2GuidelinesIncome = totalGuidelinesIncome(input.spouse2);

  // 1. Actual CS — split set-off
  const s1Obligation =
    s2TotalKids > 0
      ? calculateChildSupport({
          custodyType: "sole",
          numChildren: s2TotalKids,
          payorIncome: s1GuidelinesIncome,
          province: input.spouse1.province,
        }).monthlyAmount
      : 0;
  const s2Obligation =
    s1TotalKids > 0
      ? calculateChildSupport({
          custodyType: "sole",
          numChildren: s1TotalKids,
          payorIncome: s2GuidelinesIncome,
          province: input.spouse2.province,
        }).monthlyAmount
      : 0;
  const csMonthly = Math.abs(s1Obligation - s2Obligation);
  // CS payor = parent with the larger notional obligation (for kids
  // living with the OTHER parent). May or may not equal SS payor.
  const csPayorIs1 = s1Obligation >= s2Obligation;

  // 2. Notional CS for INDI — table amount on each parent's own Guidelines
  //    income for ALL children (WCF-Basic convention).
  const s1Notional =
    input.spouse1.overrides?.notionalChildSupport ??
    lookupTableAmount(s1GuidelinesIncome, totalChildren, input.spouse1.province) * 12;
  const s2Notional =
    input.spouse2.overrides?.notionalChildSupport ??
    lookupTableAmount(s2GuidelinesIncome, totalChildren, input.spouse2.province) * 12;

  // Higher earner pays SS
  const ssPayorIs1 = input.spouse1.grossIncome >= input.spouse2.grossIncome;
  const payorSpouse: 1 | 2 = ssPayorIs1 ? 1 : 2;

  const ssPayorData = ssPayorIs1 ? input.spouse1 : input.spouse2;
  const ssRecipientData = ssPayorIs1 ? input.spouse2 : input.spouse1;
  const ssPayorNotional = ssPayorIs1 ? s1Notional : s2Notional;
  const ssRecipientNotional = ssPayorIs1 ? s2Notional : s1Notional;

  // 3. Section 7 — apportioned DYNAMICALLY inside the solver (see basic/shared
  //    variants). Static shares are for display + override path only.
  const ssPayorGuidelinesIncome = totalGuidelinesIncome(ssPayorData);
  const ssRecipientGuidelinesIncome = totalGuidelinesIncome(ssRecipientData);
  const s7 = calculateSection7Shares(
    ssPayorGuidelinesIncome,
    ssRecipientGuidelinesIncome,
    input.section7MonthlyTotal,
  );
  const ssPayorS7Override = ssPayorData.overrides?.section7OwnShare;
  const ssRecipientS7Override = ssRecipientData.overrides?.section7OwnShare;

  const ssPayorProfile = {
    grossIncome: ssPayorData.grossIncome,
    unionDues: ssPayorData.unionDues,
    notionalChildSupport: ssPayorNotional,
    guidelinesIncome: ssPayorGuidelinesIncome,
    section7Share: ssPayorS7Override,
    childrenUnder6InCare: ssPayorData.childrenUnder6InCare,
    children6to17InCare: ssPayorData.children6to17InCare,
    claimEligibleDependant: false,
    province: ssPayorData.province,
    otherIncome: ssPayorData.otherIncome,
    rrspWithdrawals: ssPayorData.rrspWithdrawals,
    capitalGainsActual: ssPayorData.capitalGainsActual,
    selfEmploymentIncome: ssPayorData.selfEmploymentIncome,
    pensionIncome: ssPayorData.pensionIncome,
    eligibleDividends: ssPayorData.eligibleDividends,
    nonEligibleDividends: ssPayorData.nonEligibleDividends,
    nonTaxableIncome: ssPayorData.nonTaxableIncome,
    age: ssPayorData.ageAtSeparation,
    isCoupled: ssPayorData.isCoupled,
    newPartnerNetIncome: ssPayorData.newPartnerNetIncome,
    overrides: ssPayorData.overrides,
    priorChildSupportPaid: ssPayorData.priorChildSupportPaid,
    priorSpousalSupportPaid: ssPayorData.priorSpousalSupportPaid,
    priorSpousalSupportReceived: ssPayorData.priorSpousalSupportReceived,
  };
  const ssRecipientProfile = {
    grossIncome: ssRecipientData.grossIncome,
    unionDues: ssRecipientData.unionDues,
    notionalChildSupport: ssRecipientNotional,
    guidelinesIncome: ssRecipientGuidelinesIncome,
    section7Share: ssRecipientS7Override,
    childrenUnder6InCare: ssRecipientData.childrenUnder6InCare,
    children6to17InCare: ssRecipientData.children6to17InCare,
    claimEligibleDependant: true,
    province: ssRecipientData.province,
    otherIncome: ssRecipientData.otherIncome,
    rrspWithdrawals: ssRecipientData.rrspWithdrawals,
    capitalGainsActual: ssRecipientData.capitalGainsActual,
    selfEmploymentIncome: ssRecipientData.selfEmploymentIncome,
    pensionIncome: ssRecipientData.pensionIncome,
    eligibleDividends: ssRecipientData.eligibleDividends,
    nonEligibleDividends: ssRecipientData.nonEligibleDividends,
    nonTaxableIncome: ssRecipientData.nonTaxableIncome,
    age: ssRecipientData.ageAtSeparation,
    isCoupled: ssRecipientData.isCoupled,
    newPartnerNetIncome: ssRecipientData.newPartnerNetIncome,
    overrides: ssRecipientData.overrides,
    priorChildSupportPaid: ssRecipientData.priorChildSupportPaid,
    priorSpousalSupportPaid: ssRecipientData.priorSpousalSupportPaid,
    priorSpousalSupportReceived: ssRecipientData.priorSpousalSupportReceived,
  };

  const solved = runWCFSolver(
    ssPayorProfile,
    ssRecipientProfile,
    input.yearsOfRelationship,
    ssRecipientData.ageAtSeparation,
    input.youngestChildAge,
    undefined,
    undefined,
    input.manualSSAnnual,
    input.section7MonthlyTotal,
  );

  return {
    ...solved,
    childSupportMonthly: csMonthly,
    section7PayorProportion: s7.payorProportion,
    payorSpouse,
    csPayorSpouse: (csPayorIs1 ? 1 : 2) as 1 | 2,
  };
}
