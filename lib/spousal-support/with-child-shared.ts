import {
  calculateChildSupport,
  lookupTableAmount,
} from "@/lib/child-support/calculator";
import { calculateSection7Shares, totalGuidelinesIncome } from "./section-7";
import { runWCFSolver, type WCFSolverOutput } from "./wcf-common";
import { solveSpousalSupport } from "./solver";
import type { SpousalSupportProvince } from "@/lib/tax/net-income";
import type { SpouseOverrides } from "@/types/overrides";

/**
 * SSAG With-Child-Support Formula — Shared Custody.
 *
 * Each parent has ≥40% of parenting time. Actual CS flows as s.9 set-off
 * (higher earner pays difference). For INDI purposes, each parent's
 * notional CS is the table amount on their own income for all children.
 * CCB is split 50/50 (CRA rule for shared custody).
 */

export interface WCFSharedInput {
  higherEarner: { grossIncome: number; unionDues: number; ageAtSeparation: number; province?: SpousalSupportProvince; otherIncome?: number; rrspWithdrawals?: number; capitalGainsActual?: number; selfEmploymentIncome?: number; pensionIncome?: number; eligibleDividends?: number; nonEligibleDividends?: number; nonTaxableIncome?: number; isCoupled?: boolean; newPartnerNetIncome?: number; overrides?: SpouseOverrides; priorChildSupportPaid?: number; priorSpousalSupportPaid?: number; priorSpousalSupportReceived?: number };
  lowerEarner: { grossIncome: number; unionDues: number; ageAtSeparation: number; province?: SpousalSupportProvince; otherIncome?: number; rrspWithdrawals?: number; capitalGainsActual?: number; selfEmploymentIncome?: number; pensionIncome?: number; eligibleDividends?: number; nonEligibleDividends?: number; nonTaxableIncome?: number; isCoupled?: boolean; newPartnerNetIncome?: number; overrides?: SpouseOverrides; priorChildSupportPaid?: number; priorSpousalSupportPaid?: number; priorSpousalSupportReceived?: number };
  childrenUnder6: number;
  children6to17: number;
  yearsOfRelationship: number;
  section7MonthlyTotal: number;
  youngestChildAge: number | null;
  /** Solver bypass — when set, skip the solver and report INDI at this annual SS amount. */
  manualSSAnnual?: number;
}

export interface WCFSharedResult extends WCFSolverOutput {
  childSupportMonthly: number;
  section7PayorProportion: number;
  /** SSAG RUG §8(f) presumptive point: equal per-household NDI. */
  fiftyFiftyNDIPoint: {
    monthlySpousalSupport: number;
    atUpperBound: boolean;
  };
}

export function calculateWCFShared(input: WCFSharedInput): WCFSharedResult {
  const totalChildren = input.childrenUnder6 + input.children6to17;

  // CS and notional CS use Guidelines income (Federal CSG s.16 / Sch. III).
  const higherGuidelinesIncome = totalGuidelinesIncome(input.higherEarner);
  const lowerGuidelinesIncome = totalGuidelinesIncome(input.lowerEarner);

  // 1. Actual CS — s.9 set-off (informational)
  const cs = calculateChildSupport({
    custodyType: "shared",
    numChildren: totalChildren,
    parent1Income: higherGuidelinesIncome,
    parent2Income: lowerGuidelinesIncome,
    parent1Province: input.higherEarner.province,
    parent2Province: input.lowerEarner.province,
    province: input.higherEarner.province,
  });
  const csAnnual = cs.monthlyAmount * 12;

  // 2. Notional CS for each parent = table amount on their Guidelines income for all kids
  const higherNotional =
    input.higherEarner.overrides?.notionalChildSupport ??
    lookupTableAmount(higherGuidelinesIncome, totalChildren, input.higherEarner.province) * 12;
  const lowerNotional =
    input.lowerEarner.overrides?.notionalChildSupport ??
    lookupTableAmount(lowerGuidelinesIncome, totalChildren, input.lowerEarner.province) * 12;

  // 3. Section 7 — apportioned DYNAMICALLY inside the solver on post-transfer
  //    Guidelines income (FCSG §7(2) / SSAG §8(b)). Static shares are kept for
  //    display (section7PayorProportion) and for the per-party override path.
  const s7 = calculateSection7Shares(
    higherGuidelinesIncome,
    lowerGuidelinesIncome,
    input.section7MonthlyTotal,
  );
  const higherS7Override = input.higherEarner.overrides?.section7OwnShare;
  const lowerS7Override = input.lowerEarner.overrides?.section7OwnShare;

  const ssPayor = {
    grossIncome: input.higherEarner.grossIncome,
    unionDues: input.higherEarner.unionDues,
    notionalChildSupport: higherNotional,
    guidelinesIncome: higherGuidelinesIncome,
    section7Share: higherS7Override,
    childrenUnder6InCare: input.childrenUnder6,
    children6to17InCare: input.children6to17,
    ccbMultiplier: 0.5,
    claimEligibleDependant: false,
    province: input.higherEarner.province,
    otherIncome: input.higherEarner.otherIncome,
    rrspWithdrawals: input.higherEarner.rrspWithdrawals,
    capitalGainsActual: input.higherEarner.capitalGainsActual,
    selfEmploymentIncome: input.higherEarner.selfEmploymentIncome,
    pensionIncome: input.higherEarner.pensionIncome,
    eligibleDividends: input.higherEarner.eligibleDividends,
    nonEligibleDividends: input.higherEarner.nonEligibleDividends,
    nonTaxableIncome: input.higherEarner.nonTaxableIncome,
    age: input.higherEarner.ageAtSeparation,
    isCoupled: input.higherEarner.isCoupled,
    newPartnerNetIncome: input.higherEarner.newPartnerNetIncome,
    overrides: input.higherEarner.overrides,
    priorChildSupportPaid: input.higherEarner.priorChildSupportPaid,
    priorSpousalSupportPaid: input.higherEarner.priorSpousalSupportPaid,
    priorSpousalSupportReceived: input.higherEarner.priorSpousalSupportReceived,
  };
  const ssRecipient = {
    grossIncome: input.lowerEarner.grossIncome,
    unionDues: input.lowerEarner.unionDues,
    notionalChildSupport: lowerNotional,
    guidelinesIncome: lowerGuidelinesIncome,
    section7Share: lowerS7Override,
    childrenUnder6InCare: input.childrenUnder6,
    children6to17InCare: input.children6to17,
    ccbMultiplier: 0.5,
    claimEligibleDependant: true,
    province: input.lowerEarner.province,
    otherIncome: input.lowerEarner.otherIncome,
    rrspWithdrawals: input.lowerEarner.rrspWithdrawals,
    capitalGainsActual: input.lowerEarner.capitalGainsActual,
    selfEmploymentIncome: input.lowerEarner.selfEmploymentIncome,
    pensionIncome: input.lowerEarner.pensionIncome,
    eligibleDividends: input.lowerEarner.eligibleDividends,
    nonEligibleDividends: input.lowerEarner.nonEligibleDividends,
    nonTaxableIncome: input.lowerEarner.nonTaxableIncome,
    age: input.lowerEarner.ageAtSeparation,
    isCoupled: input.lowerEarner.isCoupled,
    newPartnerNetIncome: input.lowerEarner.newPartnerNetIncome,
    overrides: input.lowerEarner.overrides,
    priorChildSupportPaid: input.lowerEarner.priorChildSupportPaid,
    priorSpousalSupportPaid: input.lowerEarner.priorSpousalSupportPaid,
    priorSpousalSupportReceived: input.lowerEarner.priorSpousalSupportReceived,
  };

  const solved = runWCFSolver(
    ssPayor,
    ssRecipient,
    input.yearsOfRelationship,
    input.lowerEarner.ageAtSeparation,
    input.youngestChildAge,
    undefined,
    undefined,
    input.manualSSAnnual,
    input.section7MonthlyTotal,
  );

  // 50/50 NDI point — RUG §8(f) presumptive location. Solve for the SS that
  //  yields recipientShare = 0.5 (i.e., equal post-transfer NDI).
  const fiftyFifty = solveSpousalSupport(
    ssPayor,
    ssRecipient,
    0.5,
    undefined,
    input.section7MonthlyTotal,
  );

  return {
    ...solved,
    childSupportMonthly: cs.monthlyAmount,
    section7PayorProportion: s7.payorProportion,
    fiftyFiftyNDIPoint: {
      monthlySpousalSupport: fiftyFifty.spousalSupportAnnual / 12,
      atUpperBound: fiftyFifty.atUpperBound,
    },
  };
}
