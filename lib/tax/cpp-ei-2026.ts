/**
 * CPP and EI contribution rates — 2026
 *
 * Sources:
 *   CPP 2026: CRA announcement via Penad / CPB Canada
 *   EI 2026:  Canada.ca official announcement
 *
 * CPP structure has two tiers since the 2024 enhancement:
 *   CPP1 — earnings between YBE and YMPE, at the base rate
 *   CPP2 — earnings between YMPE and YAMPE, at the second additional rate
 */

export const CPP_2026 = {
  year: 2026,

  /** Year's Basic Exemption — no CPP on earnings below this */
  yearlyBasicExemption: 3_500,

  /** Year's Maximum Pensionable Earnings — top of CPP1 band */
  yearlyMaxPensionableEarnings: 74_600,

  /** Year's Additional Maximum Pensionable Earnings — top of CPP2 band */
  yearlyAdditionalMaxPensionableEarnings: 85_000,

  /** CPP1 rate on earnings between YBE and YMPE (employee portion) */
  baseRate: 0.0595,

  /** CPP2 rate on earnings between YMPE and YAMPE (employee portion) */
  enhancedRate: 0.04,

  /** Maximum employee contributions (reference — also computed by calculator) */
  maxCPP1Contribution: 4_230.45,
  maxCPP2Contribution: 416.0,
  maxCombinedContribution: 4_646.45,
} as const;

export const EI_2026 = {
  year: 2026,

  /** Maximum Insurable Earnings */
  maxInsurableEarnings: 68_900,

  /** Employee premium rate (per dollar of insurable earnings) */
  employeeRate: 0.0163,

  /** Maximum employee premium for the year (reference) */
  maxEmployeePremium: 1_123.07,
} as const;

/** Employee CPP1 + CPP2 on employment income only. */
export function calculateCPP(employmentIncome: number): number {
  if (employmentIncome <= CPP_2026.yearlyBasicExemption) return 0;

  const cpp1Pensionable =
    Math.min(employmentIncome, CPP_2026.yearlyMaxPensionableEarnings) -
    CPP_2026.yearlyBasicExemption;
  const cpp1 = cpp1Pensionable * CPP_2026.baseRate;

  if (employmentIncome <= CPP_2026.yearlyMaxPensionableEarnings) {
    return cpp1;
  }

  const cpp2Pensionable =
    Math.min(employmentIncome, CPP_2026.yearlyAdditionalMaxPensionableEarnings) -
    CPP_2026.yearlyMaxPensionableEarnings;
  const cpp2 = cpp2Pensionable * CPP_2026.enhancedRate;

  return cpp1 + cpp2;
}

/**
 * Compute employee EI premium for a given employment income.
 * Returns premium in CAD. Input is gross insurable earnings.
 */
export function calculateEI(insurableEarnings: number): number {
  if (insurableEarnings <= 0) return 0;
  const insurable = Math.min(insurableEarnings, EI_2026.maxInsurableEarnings);
  return insurable * EI_2026.employeeRate;
}

/**
 * Enhanced CPP contributions are deductible from taxable income on T1
 * Line 22215. The "enhanced" portion is:
 *   - For CPP1: 1% of pensionable earnings (the increase from 4.95% base
 *     pre-2019 to 5.95% current)
 *   - All of CPP2 (entirely enhanced, introduced 2024)
 *
 * Pre-2019 CPP "base" rate — used to separate the enhanced portion from
 * the base (which is not deductible).
 */
const CPP_PRE_2019_BASE_RATE = 0.0495;

/**
 * Compute the BASE CPP1 contribution (pre-2019 4.95% rate), which is
 * claimed as a non-refundable tax credit on T1 Line 30800. The
 * ENHANCED portion (1% above 4.95%) is the Line 22215 deduction.
 */
export function calculateBaseCPPContribution(employmentIncome: number): number {
  if (employmentIncome <= CPP_2026.yearlyBasicExemption) return 0;
  const pensionable =
    Math.min(employmentIncome, CPP_2026.yearlyMaxPensionableEarnings) -
    CPP_2026.yearlyBasicExemption;
  return pensionable * CPP_PRE_2019_BASE_RATE;
}

export function calculateEnhancedCPPDeduction(employmentIncome: number): number {
  if (employmentIncome <= CPP_2026.yearlyBasicExemption) return 0;

  // CPP1 enhanced portion: 1% × pensionable earnings
  const cpp1Pensionable =
    Math.min(employmentIncome, CPP_2026.yearlyMaxPensionableEarnings) -
    CPP_2026.yearlyBasicExemption;
  const cpp1Enhanced =
    cpp1Pensionable * (CPP_2026.baseRate - CPP_PRE_2019_BASE_RATE);

  if (employmentIncome <= CPP_2026.yearlyMaxPensionableEarnings) {
    return cpp1Enhanced;
  }

  // CPP2 is entirely enhanced
  const cpp2Pensionable =
    Math.min(
      employmentIncome,
      CPP_2026.yearlyAdditionalMaxPensionableEarnings,
    ) - CPP_2026.yearlyMaxPensionableEarnings;
  const cpp2 = cpp2Pensionable * CPP_2026.enhancedRate;

  return cpp1Enhanced + cpp2;
}

/**
 * CPP breakdown for a self-employed individual.
 *
 * Self-employed pay BOTH the employee and employer shares of CPP1 and CPP2.
 * Contributions already made on T4 employment income (at the employee rate)
 * count toward the annual cap — SE CPP fills the remaining pensionable room.
 *
 * Returns the components needed for T1 lines 30800, 22200, 22215 and net income.
 */
export interface SECPPBreakdown {
  /** Total out-of-pocket CPP on SE income (employee + employer shares) */
  totalContribution: number;
  /** Line 30800 addition — employee base CPP on SE income (4.95% × SE CPP1 pensionable) */
  employeeBaseForCredit: number;
  /** Line 22200 deduction — employer base CPP on SE income (4.95% × SE CPP1 pensionable) */
  employerBaseDeduction: number;
  /** Line 22215 addition — enhanced portions: (employee + employer) × 1% CPP1 + (employee + employer) CPP2 */
  enhancedDeduction: number;
}

export function calculateSelfEmployedCPP(
  selfEmploymentIncome: number,
  priorEmploymentIncome: number = 0,
): SECPPBreakdown {
  if (selfEmploymentIncome <= 0) {
    return { totalContribution: 0, employeeBaseForCredit: 0, employerBaseDeduction: 0, enhancedDeduction: 0 };
  }

  const { yearlyBasicExemption: yb, yearlyMaxPensionableEarnings: ympe, yearlyAdditionalMaxPensionableEarnings: yampe } = CPP_2026;

  // CPP1 room remaining after employment income
  const empCPP1Pen = Math.max(0, Math.min(priorEmploymentIncome, ympe) - yb);
  const totalCPP1Pen = Math.max(0, Math.min(priorEmploymentIncome + selfEmploymentIncome, ympe) - yb);
  const seCPP1Pen = Math.max(0, totalCPP1Pen - empCPP1Pen);

  // CPP2 room remaining after employment income
  const empCPP2Pen = Math.max(0, Math.min(priorEmploymentIncome, yampe) - ympe);
  const totalCPP2Pen = Math.max(0, Math.min(priorEmploymentIncome + selfEmploymentIncome, yampe) - ympe);
  const seCPP2Pen = Math.max(0, totalCPP2Pen - empCPP2Pen);

  // CPP1 on SE: each share = baseRate (4.95% base + 1% enhanced)
  const seCPP1EachShare = seCPP1Pen * CPP_2026.baseRate;
  const seCPP1EachBase = seCPP1Pen * CPP_PRE_2019_BASE_RATE;
  const seCPP1EachEnhanced = seCPP1Pen * (CPP_2026.baseRate - CPP_PRE_2019_BASE_RATE);

  // CPP2 on SE: each share = enhancedRate (entirely enhanced)
  const seCPP2EachShare = seCPP2Pen * CPP_2026.enhancedRate;

  return {
    totalContribution: 2 * seCPP1EachShare + 2 * seCPP2EachShare,
    employeeBaseForCredit: seCPP1EachBase,
    employerBaseDeduction: seCPP1EachBase,
    enhancedDeduction: 2 * seCPP1EachEnhanced + 2 * seCPP2EachShare,
  };
}
