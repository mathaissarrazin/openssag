import { calculateWOCFAmount } from "./without-child";
import { calculateWOCFDuration } from "./duration";
import { calculateWCFBasic } from "./with-child-basic";
import { calculateWCFShared } from "./with-child-shared";
import { calculateWCFSplit } from "./with-child-split";
import { calculateWCFCustodialPayor } from "./with-child-custodial-payor";
import { yearsBetween } from "./dates";
import { SELF_SUPPORT_RESERVE_BC_2026 } from "./floor";
import { totalGuidelinesIncome } from "./section-7";
import { solveSpousalSupport } from "./solver";
import type { SolverParty } from "./indi";
import type { SpouseInput } from "@/types/spousal-support";
import {
  filterDependent,
  bucketByAge,
  deriveCustodialArrangement,
  splitBucketsByParent,
  getYoungestAge,
} from "./children-derivation";
import type { SSAGInput, SSAGResult } from "@/types/spousal-support";

const SSAG_INCOME_CEILING = 350_000;

const ceilingWarning = (income: number) =>
  `Payor income ($${income.toLocaleString("en-CA")}) exceeds SSAG's general ceiling of $${SSAG_INCOME_CEILING.toLocaleString("en-CA")}. Above this level the formulas may not apply and courts exercise more discretion. Consult a family law professional.`;

/**
 * Push SSAG-floor warnings for either party if their gross income is below
 * the $20,000 self-support reserve or inside the $20,000–$30,000
 * discretionary zone. The floor is a payor concept in the SSAG but a
 * symmetric warning is still useful: (a) a payor below $20k signals support
 * is "not generally payable" per SSAG §11; (b) a recipient below $20k
 * affects ability-to-pay, self-sufficiency, and entitlement analysis that
 * courts apply even when the payor is far above the floor.
 */
function pushFloorWarnings(
  warnings: string[],
  payorIncome: number,
  recipientIncome: number,
): void {
  if (payorIncome < SELF_SUPPORT_RESERVE_BC_2026) {
    warnings.push(
      `Payor income ($${payorIncome.toLocaleString("en-CA")}) is below SSAG's $${SELF_SUPPORT_RESERVE_BC_2026.toLocaleString("en-CA")} self-support reserve. Under the SSAG, spousal support is generally not payable at this income level, though exceptions exist. Treat the range below as discretionary.`,
    );
  } else if (payorIncome < 30_000) {
    warnings.push(
      `Payor income is in the SSAG's $20,000–$30,000 range where ability-to-pay and work-incentive concerns may justify going below the formula ranges.`,
    );
  }
  if (recipientIncome < SELF_SUPPORT_RESERVE_BC_2026) {
    warnings.push(
      `Recipient income ($${recipientIncome.toLocaleString("en-CA")}) is below the $${SELF_SUPPORT_RESERVE_BC_2026.toLocaleString("en-CA")} self-support reserve. Entitlement and need analysis may dominate the formula output at this income level; treat the range as a starting point and consult a family law professional.`,
    );
  }
}

/**
 * Build a minimal WOCF SolverParty — no kids, no notional CS, no s.7.
 * Used to solve the precise NDI-equalization cap for ≥25y marriages.
 */
function wocfSolverParty(spouse: SpouseInput): SolverParty {
  return {
    grossIncome: spouse.grossIncome,
    unionDues: spouse.unionDues ?? 0,
    notionalChildSupport: 0,
    guidelinesIncome: totalGuidelinesIncome(spouse),
    section7Share: 0,
    childrenUnder6InCare: 0,
    children6to17InCare: 0,
    claimEligibleDependant: false,
    isCoupled: spouse.isCoupled,
    newPartnerNetIncome: spouse.newPartnerNetIncome,
    province: spouse.province,
    otherIncome: spouse.otherIncome,
    rrspWithdrawals: spouse.rrspWithdrawals,
    capitalGainsActual: spouse.capitalGainsActual,
    selfEmploymentIncome: spouse.selfEmploymentIncome,
    pensionIncome: spouse.pensionIncome,
    eligibleDividends: spouse.eligibleDividends,
    nonEligibleDividends: spouse.nonEligibleDividends,
    nonTaxableIncome: spouse.nonTaxableIncome,
    age: spouse.ageAtSeparation,
    priorChildSupportPaid: spouse.priorChildSupportPaid,
    priorSpousalSupportPaid: spouse.priorSpousalSupportPaid,
    priorSpousalSupportReceived: spouse.priorSpousalSupportReceived,
  };
}

/**
 * Compute the precise WOCF net-income-equalization cap: the annual SS
 * amount that leaves the recipient with exactly 50% of combined NDI.
 * Implements RUG 2016 §7.4.1. Returns undefined if the cap can't be
 * reached (solver hit upper bound) — callers fall back to the 48%
 * approximation in that case.
 */
function solveWOCFNDIEqualizationCap(
  payor: SpouseInput,
  recipient: SpouseInput,
): number | undefined {
  const result = solveSpousalSupport(
    wocfSolverParty(payor),
    wocfSolverParty(recipient),
    0.5,
  );
  return result.atUpperBound ? undefined : result.spousalSupportAnnual;
}

function buildWOCFResult(input: SSAGInput): SSAGResult {
  const yearsOfRelationship = yearsBetween(
    input.cohabitationStartDate,
    input.separationDate,
  );
  // SSAG §3.2: the WOCF operates on income "for the Guidelines" (s.16 / Sch.
  // III) — all taxable sources, not T4 alone.
  const incomes = [
    totalGuidelinesIncome(input.spouse1),
    totalGuidelinesIncome(input.spouse2),
  ] as const;
  const ages = [input.spouse1.ageAtSeparation, input.spouse2.ageAtSeparation] as const;

  const payorIndex = incomes[0] >= incomes[1] ? 0 : 1;
  const recipientIndex = (1 - payorIndex) as 0 | 1;
  const payorIncome = incomes[payorIndex];
  const gid = payorIncome - incomes[recipientIndex];

  const warnings: string[] = [];
  if (payorIncome > SSAG_INCOME_CEILING) warnings.push(ceilingWarning(payorIncome));
  pushFloorWarnings(warnings, payorIncome, incomes[recipientIndex]);

  const manualMonthly = input.overrides?.manualSpousalSupport?.monthly;
  // For ≥25y WOCF, compute the precise NDI-equalization cap (RUG §7.4.1).
  // Falls back to the 48%-of-GID approximation inside calculateWOCFAmount
  // if the solver hits its upper bound.
  const ndiCapAnnual =
    yearsOfRelationship >= 25
      ? solveWOCFNDIEqualizationCap(
          input[payorIndex === 0 ? "spouse1" : "spouse2"],
          input[recipientIndex === 0 ? "spouse1" : "spouse2"],
        )
      : undefined;
  const monthlyAmount = manualMonthly !== undefined
    ? { low: manualMonthly, mid: manualMonthly, high: manualMonthly }
    : calculateWOCFAmount(gid, yearsOfRelationship, {
        ndiEqualizationCapAnnual: ndiCapAnnual,
      });

  return {
    formula: "without-child",
    mode: manualMonthly !== undefined ? "manual" : "solver",
    payor: (payorIndex + 1) as 1 | 2,
    recipient: (recipientIndex + 1) as 1 | 2,
    grossIncomeDifference: gid,
    yearsOfRelationship,
    monthlyAmount,
    duration: calculateWOCFDuration(yearsOfRelationship, ages[recipientIndex]),
    warnings,
  };
}

/**
 * Public SSAG calculator entry point.
 */
export function calculateSpousalSupport(input: SSAGInput): SSAGResult {
  const yearsOfRelationship = yearsBetween(
    input.cohabitationStartDate,
    input.separationDate,
  );
  const incomes = [input.spouse1.grossIncome, input.spouse2.grossIncome] as const;
  // Guidelines income (s.16 / Sch. III) — all taxable sources. Used for the
  // displayed income-difference figure; the WCF solver runs on full net
  // income inside the INDI engine, so this is display-only in WCF paths.
  const guidelinesIncomes = [
    totalGuidelinesIncome(input.spouse1),
    totalGuidelinesIncome(input.spouse2),
  ] as const;
  const ages = [input.spouse1.ageAtSeparation, input.spouse2.ageAtSeparation] as const;
  const dues = [input.spouse1.unionDues ?? 0, input.spouse2.unionDues ?? 0] as const;
  const provinces = [input.spouse1.province ?? "BC", input.spouse2.province ?? "BC"] as const;
  const otherIncomes = [input.spouse1.otherIncome ?? 0, input.spouse2.otherIncome ?? 0] as const;
  const rrspWithdrawals = [input.spouse1.rrspWithdrawals ?? 0, input.spouse2.rrspWithdrawals ?? 0] as const;
  const capitalGains = [input.spouse1.capitalGainsActual ?? 0, input.spouse2.capitalGainsActual ?? 0] as const;
  const selfEmployments = [input.spouse1.selfEmploymentIncome ?? 0, input.spouse2.selfEmploymentIncome ?? 0] as const;
  const pensionIncomes = [input.spouse1.pensionIncome ?? 0, input.spouse2.pensionIncome ?? 0] as const;
  const eligibleDividendsArr = [input.spouse1.eligibleDividends ?? 0, input.spouse2.eligibleDividends ?? 0] as const;
  const nonEligibleDividendsArr = [input.spouse1.nonEligibleDividends ?? 0, input.spouse2.nonEligibleDividends ?? 0] as const;
  const nonTaxableIncomes = [input.spouse1.nonTaxableIncome ?? 0, input.spouse2.nonTaxableIncome ?? 0] as const;
  const priorCSPaidArr = [input.spouse1.priorChildSupportPaid ?? 0, input.spouse2.priorChildSupportPaid ?? 0] as const;
  const priorSSPaidArr = [input.spouse1.priorSpousalSupportPaid ?? 0, input.spouse2.priorSpousalSupportPaid ?? 0] as const;
  const priorSSReceivedArr = [input.spouse1.priorSpousalSupportReceived ?? 0, input.spouse2.priorSpousalSupportReceived ?? 0] as const;
  const isCoupledArr = [input.spouse1.isCoupled, input.spouse2.isCoupled] as const;
  const newPartnerNetIncomeArr = [input.spouse1.newPartnerNetIncome, input.spouse2.newPartnerNetIncome] as const;
  const overridesArr = [input.overrides?.spouse1, input.overrides?.spouse2] as const;
  const manualSSMonthly = input.overrides?.manualSpousalSupport?.monthly;
  const manualSSAnnual = manualSSMonthly !== undefined ? manualSSMonthly * 12 : undefined;
  const mode: "solver" | "manual" = manualSSAnnual !== undefined ? "manual" : "solver";

  if (!input.hasChildren) {
    return buildWOCFResult(input);
  }

  if (!input.children) {
    throw new Error("hasChildren=true requires children input object.");
  }

  const today = new Date();
  const dependentKids = filterDependent(input.children.children, today);

  // If no dependent kids (e.g. all 18+), gracefully fall back to WOCF
  if (dependentKids.length === 0) {
    return buildWOCFResult(input);
  }

  const { arrangement, error } = deriveCustodialArrangement(dependentKids);
  if (error || !arrangement) {
    throw new Error(error ?? "Unable to determine custodial arrangement.");
  }

  const { childrenUnder6, children6to17 } = bucketByAge(dependentKids, today);
  const youngestChildAge = getYoungestAge(dependentKids, today);
  const section7MonthlyTotal = input.children.section7MonthlyTotal;

  // ── Shared custody ─────────────────────────────────────────────────────
  if (arrangement === "shared") {
    const higherIdx = incomes[0] >= incomes[1] ? 0 : 1;
    const lowerIdx = (1 - higherIdx) as 0 | 1;

    const warnings: string[] = [];
    if (incomes[higherIdx] > SSAG_INCOME_CEILING)
      warnings.push(ceilingWarning(incomes[higherIdx]));
    pushFloorWarnings(warnings, incomes[higherIdx], incomes[lowerIdx]);

    const wcf = calculateWCFShared({
      higherEarner: {
        grossIncome: incomes[higherIdx],
        unionDues: dues[higherIdx],
        ageAtSeparation: ages[higherIdx],
        province: provinces[higherIdx],
        otherIncome: otherIncomes[higherIdx],
        rrspWithdrawals: rrspWithdrawals[higherIdx],
        capitalGainsActual: capitalGains[higherIdx],
        selfEmploymentIncome: selfEmployments[higherIdx],
        pensionIncome: pensionIncomes[higherIdx],
        eligibleDividends: eligibleDividendsArr[higherIdx],
        nonEligibleDividends: nonEligibleDividendsArr[higherIdx],
        nonTaxableIncome: nonTaxableIncomes[higherIdx],
        isCoupled: isCoupledArr[higherIdx],
        newPartnerNetIncome: newPartnerNetIncomeArr[higherIdx],
        overrides: overridesArr[higherIdx],
        priorChildSupportPaid: priorCSPaidArr[higherIdx],
        priorSpousalSupportPaid: priorSSPaidArr[higherIdx],
        priorSpousalSupportReceived: priorSSReceivedArr[higherIdx],
      },
      lowerEarner: {
        grossIncome: incomes[lowerIdx],
        unionDues: dues[lowerIdx],
        ageAtSeparation: ages[lowerIdx],
        province: provinces[lowerIdx],
        otherIncome: otherIncomes[lowerIdx],
        rrspWithdrawals: rrspWithdrawals[lowerIdx],
        capitalGainsActual: capitalGains[lowerIdx],
        selfEmploymentIncome: selfEmployments[lowerIdx],
        pensionIncome: pensionIncomes[lowerIdx],
        eligibleDividends: eligibleDividendsArr[lowerIdx],
        nonEligibleDividends: nonEligibleDividendsArr[lowerIdx],
        nonTaxableIncome: nonTaxableIncomes[lowerIdx],
        isCoupled: isCoupledArr[lowerIdx],
        newPartnerNetIncome: newPartnerNetIncomeArr[lowerIdx],
        overrides: overridesArr[lowerIdx],
        priorChildSupportPaid: priorCSPaidArr[lowerIdx],
        priorSpousalSupportPaid: priorSSPaidArr[lowerIdx],
        priorSpousalSupportReceived: priorSSReceivedArr[lowerIdx],
      },
      childrenUnder6,
      children6to17,
      yearsOfRelationship,
      section7MonthlyTotal,
      youngestChildAge,
      manualSSAnnual,
    });

    if (wcf.anyAtUpperBound)
      warnings.push(
        "The calculation reached its upper bound without achieving the target INDI split at one or more levels.",
      );

    return {
      formula: "with-child-shared",
      mode,
      payor: (higherIdx + 1) as 1 | 2,
      recipient: (lowerIdx + 1) as 1 | 2,
      grossIncomeDifference: guidelinesIncomes[higherIdx] - guidelinesIncomes[lowerIdx],
      yearsOfRelationship,
      monthlyAmount: wcf.monthlyAmount,
      duration: wcf.duration,
      warnings,
      childSupportMonthly: wcf.childSupportMonthly,
      // In shared custody, the higher earner pays the s.9 set-off CS
      childSupportPayor: (higherIdx + 1) as 1 | 2,
      section7PayorProportion: wcf.section7PayorProportion,
      indi: {
        payorMonthly: wcf.ssPayorINDIMonthly,
        recipientMonthly: wcf.ssRecipientINDIMonthly,
        recipientSharePercent: wcf.recipientSharePercent,
      },
      sharedCustody50_50NDIPoint: wcf.fiftyFiftyNDIPoint,
    };
  }

  // ── Split custody ──────────────────────────────────────────────────────
  if (arrangement === "split") {
    const { spouse1, spouse2 } = splitBucketsByParent(dependentKids, today);

    const wcf = calculateWCFSplit({
      spouse1: {
        grossIncome: incomes[0],
        unionDues: dues[0],
        ageAtSeparation: ages[0],
        childrenUnder6InCare: spouse1.childrenUnder6,
        children6to17InCare: spouse1.children6to17,
        province: provinces[0],
        otherIncome: otherIncomes[0],
        rrspWithdrawals: rrspWithdrawals[0],
        capitalGainsActual: capitalGains[0],
        selfEmploymentIncome: selfEmployments[0],
        pensionIncome: pensionIncomes[0],
        eligibleDividends: eligibleDividendsArr[0],
        nonEligibleDividends: nonEligibleDividendsArr[0],
        nonTaxableIncome: nonTaxableIncomes[0],
        isCoupled: isCoupledArr[0],
        newPartnerNetIncome: newPartnerNetIncomeArr[0],
        overrides: overridesArr[0],
        priorChildSupportPaid: priorCSPaidArr[0],
        priorSpousalSupportPaid: priorSSPaidArr[0],
        priorSpousalSupportReceived: priorSSReceivedArr[0],
      },
      spouse2: {
        grossIncome: incomes[1],
        unionDues: dues[1],
        ageAtSeparation: ages[1],
        childrenUnder6InCare: spouse2.childrenUnder6,
        children6to17InCare: spouse2.children6to17,
        province: provinces[1],
        otherIncome: otherIncomes[1],
        rrspWithdrawals: rrspWithdrawals[1],
        capitalGainsActual: capitalGains[1],
        selfEmploymentIncome: selfEmployments[1],
        pensionIncome: pensionIncomes[1],
        eligibleDividends: eligibleDividendsArr[1],
        nonEligibleDividends: nonEligibleDividendsArr[1],
        nonTaxableIncome: nonTaxableIncomes[1],
        isCoupled: isCoupledArr[1],
        newPartnerNetIncome: newPartnerNetIncomeArr[1],
        overrides: overridesArr[1],
        priorChildSupportPaid: priorCSPaidArr[1],
        priorSpousalSupportPaid: priorSSPaidArr[1],
        priorSpousalSupportReceived: priorSSReceivedArr[1],
      },
      yearsOfRelationship,
      section7MonthlyTotal,
      youngestChildAge,
      manualSSAnnual,
    });

    const warnings: string[] = [];
    const payorIncome = incomes[wcf.payorSpouse - 1];
    const recipientIncome = incomes[wcf.payorSpouse === 1 ? 1 : 0];
    if (payorIncome > SSAG_INCOME_CEILING) warnings.push(ceilingWarning(payorIncome));
    pushFloorWarnings(warnings, payorIncome, recipientIncome);
    if (wcf.anyAtUpperBound)
      warnings.push(
        "The calculation reached its upper bound without achieving the target INDI split at one or more levels.",
      );

    const recipientSpouse = (wcf.payorSpouse === 1 ? 2 : 1) as 1 | 2;

    return {
      formula: "with-child-split",
      mode,
      payor: wcf.payorSpouse,
      recipient: recipientSpouse,
      grossIncomeDifference: Math.abs(guidelinesIncomes[0] - guidelinesIncomes[1]),
      yearsOfRelationship,
      monthlyAmount: wcf.monthlyAmount,
      duration: wcf.duration,
      warnings,
      childSupportMonthly: wcf.childSupportMonthly,
      childSupportPayor: wcf.csPayorSpouse,
      section7PayorProportion: wcf.section7PayorProportion,
      indi: {
        payorMonthly: wcf.ssPayorINDIMonthly,
        recipientMonthly: wcf.ssRecipientINDIMonthly,
        recipientSharePercent: wcf.recipientSharePercent,
      },
    };
  }

  // ── Primary custody → Basic or Custodial-Payor ─────────────────────────
  const custodialIdx = arrangement === "spouse1-primary" ? 0 : 1;
  const nonCustodialIdx = (1 - custodialIdx) as 0 | 1;
  const custodialHigherEarner = incomes[custodialIdx] > incomes[nonCustodialIdx];

  const warnings: string[] = [];

  if (custodialHigherEarner) {
    if (incomes[custodialIdx] > SSAG_INCOME_CEILING)
      warnings.push(ceilingWarning(incomes[custodialIdx]));
    pushFloorWarnings(warnings, incomes[custodialIdx], incomes[nonCustodialIdx]);

    warnings.push(
      "Custodial payor is the rarest and most discretionary SSAG variant. The Users Guide (Ch. 8.5) notes that the standard 40–46% target range does not straightforwardly apply, and different calculators handle the INDI calculation in different ways. Treat the output as a starting point; consult a family lawyer for any decision.",
    );

    const wcf = calculateWCFCustodialPayor({
      custodialParent: {
        grossIncome: incomes[custodialIdx],
        unionDues: dues[custodialIdx],
        ageAtSeparation: ages[custodialIdx],
        childrenUnder6,
        children6to17,
        province: provinces[custodialIdx],
        otherIncome: otherIncomes[custodialIdx],
        rrspWithdrawals: rrspWithdrawals[custodialIdx],
        capitalGainsActual: capitalGains[custodialIdx],
        selfEmploymentIncome: selfEmployments[custodialIdx],
        pensionIncome: pensionIncomes[custodialIdx],
        eligibleDividends: eligibleDividendsArr[custodialIdx],
        nonEligibleDividends: nonEligibleDividendsArr[custodialIdx],
        nonTaxableIncome: nonTaxableIncomes[custodialIdx],
        isCoupled: isCoupledArr[custodialIdx],
        newPartnerNetIncome: newPartnerNetIncomeArr[custodialIdx],
        overrides: overridesArr[custodialIdx],
        priorChildSupportPaid: priorCSPaidArr[custodialIdx],
        priorSpousalSupportPaid: priorSSPaidArr[custodialIdx],
        priorSpousalSupportReceived: priorSSReceivedArr[custodialIdx],
      },
      nonCustodialParent: {
        grossIncome: incomes[nonCustodialIdx],
        unionDues: dues[nonCustodialIdx],
        ageAtSeparation: ages[nonCustodialIdx],
        province: provinces[nonCustodialIdx],
        otherIncome: otherIncomes[nonCustodialIdx],
        rrspWithdrawals: rrspWithdrawals[nonCustodialIdx],
        capitalGainsActual: capitalGains[nonCustodialIdx],
        selfEmploymentIncome: selfEmployments[nonCustodialIdx],
        pensionIncome: pensionIncomes[nonCustodialIdx],
        eligibleDividends: eligibleDividendsArr[nonCustodialIdx],
        nonEligibleDividends: nonEligibleDividendsArr[nonCustodialIdx],
        nonTaxableIncome: nonTaxableIncomes[nonCustodialIdx],
        isCoupled: isCoupledArr[nonCustodialIdx],
        newPartnerNetIncome: newPartnerNetIncomeArr[nonCustodialIdx],
        overrides: overridesArr[nonCustodialIdx],
        priorChildSupportPaid: priorCSPaidArr[nonCustodialIdx],
        priorSpousalSupportPaid: priorSSPaidArr[nonCustodialIdx],
        priorSpousalSupportReceived: priorSSReceivedArr[nonCustodialIdx],
      },
      yearsOfRelationship,
      section7MonthlyTotal,
      youngestChildAge,
      manualSSAnnual,
    });

    if (wcf.anyAtUpperBound)
      warnings.push(
        "The calculation reached its upper bound without achieving the target INDI split at one or more levels.",
      );

    return {
      formula: "with-child-custodial-payor",
      mode,
      payor: (custodialIdx + 1) as 1 | 2,
      recipient: (nonCustodialIdx + 1) as 1 | 2,
      grossIncomeDifference: guidelinesIncomes[custodialIdx] - guidelinesIncomes[nonCustodialIdx],
      yearsOfRelationship,
      monthlyAmount: wcf.monthlyAmount,
      duration: wcf.duration,
      warnings,
      childSupportMonthly: wcf.childSupportMonthly,
      // CS flows OPPOSITE to SS: non-custodial pays CS to custodial
      childSupportPayor: (nonCustodialIdx + 1) as 1 | 2,
      section7PayorProportion: wcf.section7PayorProportion,
      indi: {
        payorMonthly: wcf.ssPayorINDIMonthly,
        recipientMonthly: wcf.ssRecipientINDIMonthly,
        recipientSharePercent: wcf.recipientSharePercent,
      },
    };
  }

  // WCF Basic
  if (incomes[nonCustodialIdx] > SSAG_INCOME_CEILING)
    warnings.push(ceilingWarning(incomes[nonCustodialIdx]));
  pushFloorWarnings(warnings, incomes[nonCustodialIdx], incomes[custodialIdx]);

  const wcf = calculateWCFBasic({
    payor: {
      grossIncome: incomes[nonCustodialIdx],
      unionDues: dues[nonCustodialIdx],
      ageAtSeparation: ages[nonCustodialIdx],
      province: provinces[nonCustodialIdx],
      otherIncome: otherIncomes[nonCustodialIdx],
      rrspWithdrawals: rrspWithdrawals[nonCustodialIdx],
      capitalGainsActual: capitalGains[nonCustodialIdx],
      selfEmploymentIncome: selfEmployments[nonCustodialIdx],
      pensionIncome: pensionIncomes[nonCustodialIdx],
      eligibleDividends: eligibleDividendsArr[nonCustodialIdx],
      nonEligibleDividends: nonEligibleDividendsArr[nonCustodialIdx],
      nonTaxableIncome: nonTaxableIncomes[nonCustodialIdx],
      isCoupled: isCoupledArr[nonCustodialIdx],
      newPartnerNetIncome: newPartnerNetIncomeArr[nonCustodialIdx],
      overrides: overridesArr[nonCustodialIdx],
      priorChildSupportPaid: priorCSPaidArr[nonCustodialIdx],
      priorSpousalSupportPaid: priorSSPaidArr[nonCustodialIdx],
      priorSpousalSupportReceived: priorSSReceivedArr[nonCustodialIdx],
    },
    recipient: {
      grossIncome: incomes[custodialIdx],
      unionDues: dues[custodialIdx],
      ageAtSeparation: ages[custodialIdx],
      childrenUnder6,
      children6to17,
      province: provinces[custodialIdx],
      otherIncome: otherIncomes[custodialIdx],
      rrspWithdrawals: rrspWithdrawals[custodialIdx],
      capitalGainsActual: capitalGains[custodialIdx],
      selfEmploymentIncome: selfEmployments[custodialIdx],
      pensionIncome: pensionIncomes[custodialIdx],
      eligibleDividends: eligibleDividendsArr[custodialIdx],
      nonEligibleDividends: nonEligibleDividendsArr[custodialIdx],
      nonTaxableIncome: nonTaxableIncomes[custodialIdx],
      isCoupled: isCoupledArr[custodialIdx],
      newPartnerNetIncome: newPartnerNetIncomeArr[custodialIdx],
      overrides: overridesArr[custodialIdx],
      priorChildSupportPaid: priorCSPaidArr[custodialIdx],
      priorSpousalSupportPaid: priorSSPaidArr[custodialIdx],
      priorSpousalSupportReceived: priorSSReceivedArr[custodialIdx],
    },
    yearsOfRelationship,
    section7MonthlyTotal,
    youngestChildAge,
    manualSSAnnual,
  });

  if (wcf.anyAtUpperBound)
    warnings.push(
      "The solver reached its upper bound without achieving the target INDI split at one or more levels.",
    );

  return {
    formula: "with-child-basic",
    mode,
    payor: (nonCustodialIdx + 1) as 1 | 2,
    recipient: (custodialIdx + 1) as 1 | 2,
    grossIncomeDifference: guidelinesIncomes[nonCustodialIdx] - guidelinesIncomes[custodialIdx],
    yearsOfRelationship,
    monthlyAmount: wcf.monthlyAmount,
    duration: wcf.duration,
    warnings,
    childSupportMonthly: wcf.childSupportMonthly,
    // In Basic, non-custodial pays CS to custodial (same payor as SS)
    childSupportPayor: (nonCustodialIdx + 1) as 1 | 2,
    section7PayorProportion: wcf.section7PayorProportion,
    indi: {
      payorMonthly: wcf.ssPayorINDIMonthly,
      recipientMonthly: wcf.ssRecipientINDIMonthly,
      recipientSharePercent: wcf.recipientSharePercent,
    },
  };
}
