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
 * taxable-equivalent Guidelines-income figure (RUG §6.6 / FCSG Sch. III §19).
 * A 25% uplift approximates the blended federal+provincial marginal rate
 * most courts apply absent case-specific evidence.
 */
export const NON_TAXABLE_GROSS_UP = 1.25;

/**
 * Guidelines income (s. 16 / Sch. III) for s.7 apportionment. Sums every
 * income source a spouse may have — employment, pension, dividends (actual,
 * not grossed-up), interest/other, RRSP withdrawals, capital gains, and
 * self-employment. Non-taxable income is added at its grossed-up equivalent
 * per RUG §6.6. Union / professional dues entered by the user are deducted
 * per FCSG Sch. III §1 / ITA s.8(1)(i). Using only `grossIncome` would zero
 * out a party whose income is entirely pension/investment, which is wrong
 * under s. 7(2).
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
    (spouse.nonTaxableIncome || 0) * NON_TAXABLE_GROSS_UP -
    (spouse.unionDues || 0) -
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
