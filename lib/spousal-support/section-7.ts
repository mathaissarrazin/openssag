/**
 * Section 7 special/extraordinary expenses apportionment.
 *
 * Per Federal Child Support Guidelines s. 7, special expenses are shared
 * between parents in proportion to their incomes. Each parent's share of
 * their proportion reduces their INDI for SSAG purposes.
 */

export interface Section7Shares {
  /** Payor's proportional share of annual Section 7 expenses */
  payorAnnualShare: number;
  /** Recipient's proportional share of annual Section 7 expenses */
  recipientAnnualShare: number;
  /** Payor's proportion of combined income (0–1) */
  payorProportion: number;
}

/**
 * Default gross-up factor for non-taxable income when converting to a
 * taxable-equivalent Guidelines-income figure (SSAG Revised User's Guide
 * 2016 §6.6 — practitioner convention; not codified in FCSG Sch. III).
 * A 25% uplift approximates the blended federal+provincial marginal rate
 * most courts apply absent case-specific evidence.
 */
export const NON_TAXABLE_GROSS_UP = 1.25;

/**
 * Guidelines income (FCSG s.16 / Schedule III) for s.7 apportionment and CS
 * table lookups. Sums every income source and applies every Schedule III
 * adjustment that the engine models:
 *
 *   Additions:
 *     + grossIncome (employment)
 *     + otherIncome (interest, rental, EI regular, etc.)
 *     + rrspWithdrawals
 *     + capitalGainsActual (actual, not taxable portion — Sch. III §6)
 *     + selfEmploymentIncome (net of business expenses)
 *     + pensionIncome
 *     + eligibleDividends (actual, not grossed up — Sch. III §5)
 *     + nonEligibleDividends (actual, not grossed up — Sch. III §5)
 *     + nonTaxableIncome × 1.25 (SSAG RUG 2016 §6.6)
 *     + priorSpousalSupportReceived (from a prior relationship — taxable,
 *       Sch. III §3 only excludes current-case SS)
 *     + splitPensionAddBack (Sch. III §3.1 — transferor side)
 *     + ccpcStockOptionBenefit (Sch. III §11 — deferred s.7(1.1) case only)
 *     + partnershipNonArmsLengthAddBack (Sch. III §10)
 *
 *   Deductions:
 *     − unionDues (Sch. III §1, ITA s.8(1)(i))
 *     − employmentExpensesOther (Sch. III §1, remaining ITA s.8 deductions)
 *     − carryingCharges (Sch. III §8, ITA s.20(1)(c)–(e.2))
 *     − businessInvestmentLosses (Sch. III §7, ITA s.39(1)(c); full 100%)
 *     − splitPensionTransfereeDeduct (Sch. III §3.1 — transferee side)
 *     − priorPeriodSelfEmploymentAdjustment (Sch. III §9, ITA s.34.1)
 *     − priorChildSupportPaid (prior-family obligation, FCSG practice)
 *     − priorSpousalSupportPaid (prior-family obligation, FCSG practice)
 *
 *   Deliberately excluded (not added):
 *     priorChildSupportReceived — earmarked for prior kids (practitioner
 *     norm); surfaced in the report for transparency only.
 *
 *   Not modeled (user must pre-adjust):
 *     Sch. III §2 pre-1997 CS received (essentially extinct), Sch. III §3
 *     current-case SS received (handled naturally by pre-transfer modelling).
 */
export function totalGuidelinesIncome(spouse: {
  grossIncome: number;
  otherIncome?: number;
  rrspWithdrawals?: number;
  capitalGainsActual?: number;
  selfEmploymentIncome?: number;
  pensionIncome?: number;
  eligibleDividends?: number;
  nonEligibleDividends?: number;
  nonTaxableIncome?: number;
  unionDues?: number;
  priorChildSupportPaid?: number;
  priorSpousalSupportPaid?: number;
  priorSpousalSupportReceived?: number;
  employmentExpensesOther?: number;
  carryingCharges?: number;
  businessInvestmentLosses?: number;
  priorPeriodSelfEmploymentAdjustment?: number;
  splitPensionAddBack?: number;
  splitPensionTransfereeDeduct?: number;
  ccpcStockOptionBenefit?: number;
  partnershipNonArmsLengthAddBack?: number;
}): number {
  return (
    (spouse.grossIncome || 0) +
    (spouse.otherIncome || 0) +
    (spouse.rrspWithdrawals || 0) +
    (spouse.capitalGainsActual || 0) +
    (spouse.selfEmploymentIncome || 0) +
    (spouse.pensionIncome || 0) +
    (spouse.eligibleDividends || 0) +
    (spouse.nonEligibleDividends || 0) +
    (spouse.nonTaxableIncome || 0) * NON_TAXABLE_GROSS_UP +
    (spouse.priorSpousalSupportReceived || 0) +
    (spouse.splitPensionAddBack || 0) +
    (spouse.ccpcStockOptionBenefit || 0) +
    (spouse.partnershipNonArmsLengthAddBack || 0) -
    (spouse.splitPensionTransfereeDeduct || 0) -
    (spouse.unionDues || 0) -
    (spouse.employmentExpensesOther || 0) -
    (spouse.carryingCharges || 0) -
    (spouse.businessInvestmentLosses || 0) -
    (spouse.priorPeriodSelfEmploymentAdjustment || 0) -
    (spouse.priorChildSupportPaid || 0) -
    (spouse.priorSpousalSupportPaid || 0)
  );
}

export function calculateSection7Shares(
  payorAnnualIncome: number,
  recipientAnnualIncome: number,
  totalMonthly: number,
): Section7Shares {
  const combined = payorAnnualIncome + recipientAnnualIncome;
  if (combined <= 0) {
    return { payorAnnualShare: 0, recipientAnnualShare: 0, payorProportion: 0 };
  }
  const payorProportion = payorAnnualIncome / combined;
  if (totalMonthly <= 0) {
    return { payorAnnualShare: 0, recipientAnnualShare: 0, payorProportion };
  }
  const totalAnnual = totalMonthly * 12;
  return {
    payorAnnualShare: totalAnnual * payorProportion,
    recipientAnnualShare: totalAnnual * (1 - payorProportion),
    payorProportion,
  };
}
