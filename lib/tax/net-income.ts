import { calculateBracketTax } from "./brackets";
import {
  FEDERAL_2026,
  CANADA_EMPLOYMENT_AMOUNT_2026,
  federalEffectiveBPA,
} from "./federal-2026";
import { BC_2026 } from "./bc-2026";
import { AB_2026 } from "./alberta-2026";
import { ON_2026 } from "./ontario-2026";
import { SK_2026 } from "./saskatchewan-2026";
import { MB_2026 } from "./manitoba-2026";
import { NB_2026, calculateNBLowIncomeTaxReduction } from "./new-brunswick-2026";
import { NS_2026, calculateNSLowIncomeTaxReduction } from "./nova-scotia-2026";
import { PE_2026, calculatePELowIncomeTaxReduction } from "./pei-2026";
import { NL_2026, calculateNLLowIncomeTaxReduction } from "./newfoundland-2026";
import { YT_2026 } from "./yukon-2026";
import { NT_2026, calculateNTCOLTC } from "./northwest-territories-2026";
import { NU_2026, calculateNUCOLTC } from "./nunavut-2026";
import {
  calculateCPP,
  calculateEI,
  calculateEnhancedCPPDeduction,
  calculateBaseCPPContribution,
  calculateSelfEmployedCPP,
} from "./cpp-ei-2026";
import type { SpouseOverrides } from "../../types/overrides";
import {
  calculateCCB,
  calculateGSTCredit,
  calculateBCFamilyBenefit,
  calculateBCSalesTaxCredit,
  calculateBCTaxReductionCredit,
  calculateCWB,
  calculateBCRentersTaxCredit,
  calculateACFB,
  calculateOCB,
  calculateOSTC,
  calculateSLITC,
  calculateMBRefundablePersonalCredit,
  MB_RATC_2026,
  calculateNSALTC,
  calculateNSCB,
  calculatePESalesTaxCredit,
  calculateNLIncomeSupplement,
  calculateNLSeniorsBenefit,
} from "./benefits-2026";

/** Provinces currently supported by the spousal support tax engine. */
export type SpousalSupportProvince = "BC" | "AB" | "ON" | "SK" | "MB" | "NB" | "NS" | "PE" | "NL" | "YT" | "NT" | "NU";

/** Provincial pension income credit and dividend tax credit rates for 2026. */
export const PROVINCIAL_PENSION_DTC_2026: Record<
  SpousalSupportProvince,
  { pensionMax: number; pensionRate: number; dtcEligibleRate: number; dtcNonEligibleRate: number }
> = {
  BC: { pensionMax: 1000,  pensionRate: 0.056,  dtcEligibleRate: 0.12,     dtcNonEligibleRate: 0.0196   },
  AB: { pensionMax: 1753,  pensionRate: 0.08,   dtcEligibleRate: 0.0812,   dtcNonEligibleRate: 0.0218   },
  SK: { pensionMax: 1000,  pensionRate: 0.105,  dtcEligibleRate: 0.11,     dtcNonEligibleRate: 0.02519  },
  MB: { pensionMax: 1000,  pensionRate: 0.108,  dtcEligibleRate: 0.08,     dtcNonEligibleRate: 0.007835 },
  ON: { pensionMax: 1796,  pensionRate: 0.0505, dtcEligibleRate: 0.10,     dtcNonEligibleRate: 0.029863 },
  NB: { pensionMax: 1000,  pensionRate: 0.094,  dtcEligibleRate: 0.14,     dtcNonEligibleRate: 0.0275   },
  NS: { pensionMax: 1173,  pensionRate: 0.0879, dtcEligibleRate: 0.0885,   dtcNonEligibleRate: 0.015    },
  PE: { pensionMax: 1000,  pensionRate: 0.095,  dtcEligibleRate: 0.105,    dtcNonEligibleRate: 0.013    },
  NL: { pensionMax: 1000,  pensionRate: 0.087,  dtcEligibleRate: 0.063,    dtcNonEligibleRate: 0.032    },
  YT: { pensionMax: 2000,  pensionRate: 0.064,  dtcEligibleRate: 0.1202,   dtcNonEligibleRate: 0.0067   },
  NT: { pensionMax: 1000,  pensionRate: 0.059,  dtcEligibleRate: 0.115,    dtcNonEligibleRate: 0.06     },
  NU: { pensionMax: 2000,  pensionRate: 0.04,   dtcEligibleRate: 0.0551,   dtcNonEligibleRate: 0.0261   },
};

export interface NetIncomeInput {
  /** Gross employment income (T4 line 14) */
  grossIncome: number;

  /** Union or professional dues (deductible from income) */
  unionDues?: number;

  /** Spousal support received (taxable) or paid (deductible). Signed. */
  spousalSupportReceived?: number;
  spousalSupportPaid?: number;

  /** Family composition for benefit calculations */
  isCoupled?: boolean;
  childrenUnder6InCare?: number;
  children6to17InCare?: number;
  /**
   * Multiplier applied to CCB — used for shared custody (0.5) where each
   * parent receives half of their full benefit under CRA rules.
   * Defaults to 1.0.
   */
  ccbMultiplier?: number;
  /**
   * When true, CCB is excluded from the returned net income. The SSAG
   * treats CCB as "children's money" (not part of the custodial parent's
   * adult INDI) when computing the spousal support target split. The
   * benefit is still received in the real world — it's just not counted
   * toward the parent's personal disposable income for SSAG purposes.
   */
  excludeCCB?: boolean;
  /**
   * When true, apply the Eligible Dependant Credit — a federal and provincial
   * non-refundable credit available to a single parent with a dependent
   * child. Typically claimed by the custodial parent.
   * Automatically suppressed when isCoupled=true (spousal amount takes precedence).
   */
  claimEligibleDependant?: boolean;

  /**
   * Net income of a new partner/spouse (for spousal amount credit, T1 Line 30300).
   * Only used when isCoupled=true. Spousal credit = max(0, BPA − partnerNetIncome) × creditRate.
   * Defaults to 0 (full spousal credit) when isCoupled=true and omitted.
   */
  newPartnerNetIncome?: number;

  /** Province for provincial tax and benefit calculations. Defaults to "BC". */
  province?: SpousalSupportProvince;

  // ── Additional income types ──────────────────────────────────────────────────
  /** Interest, rental, EI regular benefits, and other fully-taxable income (T1 lines 10400/11900/12000/13000) */
  otherIncome?: number;
  /** RRSP/RRIF/PRPP withdrawals — fully taxable (T1 lines 12900/12910) */
  rrspWithdrawals?: number;
  /**
   * Actual capital gain (not the taxable inclusion amount).
   * 50% inclusion rate applies: taxable gain = actualGain × 0.5.
   * Do not enter the already-halved amount.
   */
  capitalGainsActual?: number;
  /**
   * Net self-employment income after business expenses (T1 lines 13500/13700).
   * Self-employed individuals pay both employee and employer shares of CPP;
   * EI is not assessed on SE income.
   */
  selfEmploymentIncome?: number;
  /**
   * Pension income from registered plans (RPP, DPSP, annuities — T1 line 11500).
   * All entered pension income is treated as qualifying for the pension income credit.
   * Do not include CPP/QPP or OAS here; enter those in otherIncome.
   */
  pensionIncome?: number;
  /**
   * Actual eligible dividends received (T1 line 12000).
   * The 38% gross-up is applied automatically; do NOT enter the grossed-up amount.
   */
  eligibleDividends?: number;
  /**
   * Actual non-eligible dividends received (T1 line 12010).
   * The 15% gross-up is applied automatically; do NOT enter the grossed-up amount.
   */
  nonEligibleDividends?: number;

  /**
   * Age at separation. Currently used only for age-gated provincial benefits
   * (e.g. NL Seniors' Benefit, age 64+ by Dec 31).
   */
  age?: number;

  /**
   * Per-spouse overrides that replace engine-computed values. See
   * types/overrides.ts for field semantics. When a tax field is pinned, it is
   * interpreted as the value AT SS=0; the marginalRate (also in the override)
   * is applied to the actual SS delta to keep the solver workable.
   */
  overrides?: SpouseOverrides;

  // ── FCSG Schedule III / ITA deductions that reduce taxable income ────────
  /**
   * Employment expenses deductible under ITA s.8 other than union /
   * professional dues (e.g. motor vehicle, home office, tradesperson tools,
   * clergy residence). Reduces taxable income 1-for-1, same as union dues.
   */
  employmentExpensesOther?: number;
  /**
   * Carrying charges and interest expenses deductible under ITA
   * s.20(1)(c)/(d)/(e)/(e.1)/(e.2) — investment loan interest, safety deposit
   * box fees, investment counsel fees. Reduces taxable income 1-for-1.
   */
  carryingCharges?: number;
  /**
   * Actual business investment loss sustained in the year under ITA s.39(1)(c).
   * Deducted as an allowable business investment loss (ABIL) at 50% against
   * any income (ITA s.38(c)). The FCSG Sch. III §7 deduction for Guidelines
   * income uses the full (100%) amount; taxable income uses 50%.
   */
  businessInvestmentLosses?: number;
}

export interface NetIncomeBreakdown {
  grossIncome: number;
  taxableIncome: number;
  federalTax: number;
  provincialTax: number;
  cpp: number;
  ei: number;
  ccb: number;
  gstCredit: number;
  /** Provincial refundable benefits (BC Family Benefit + Sales Tax + Renters, etc.) */
  provincialBenefits: number;
  /** Federal + provincial spousal amount credit combined (Line 30300 equivalent) */
  spousalAmountCredit: number;
  /** Net disposable income = gross − tax − CPP − EI − union dues + SS adjustments + refundable benefits */
  netIncome: number;
  /**
   * Which fields were replaced by caller overrides during this calculation.
   * Populated only when overrides were applied. Used by the detailed report
   * to flag overridden values.
   */
  usedOverrides?: ReadonlyArray<string>;
}

/** Provincial BPA and credit rate — used to compute the spousal amount credit (Line 30300 equivalent). */
const PROVINCIAL_SPOUSAL_2026: Record<SpousalSupportProvince, { bpa: number; creditRate: number }> = {
  BC: { bpa: BC_2026.basicPersonalAmount, creditRate: BC_2026.creditRate },
  AB: { bpa: AB_2026.basicPersonalAmount, creditRate: AB_2026.creditRate },
  ON: { bpa: ON_2026.basicPersonalAmount, creditRate: ON_2026.creditRate },
  SK: { bpa: SK_2026.basicPersonalAmount, creditRate: SK_2026.creditRate },
  MB: { bpa: MB_2026.basicPersonalAmount, creditRate: MB_2026.creditRate },
  NB: { bpa: NB_2026.basicPersonalAmount, creditRate: NB_2026.creditRate },
  NS: { bpa: NS_2026.basicPersonalAmount, creditRate: NS_2026.creditRate },
  PE: { bpa: PE_2026.basicPersonalAmount, creditRate: PE_2026.creditRate },
  NL: { bpa: NL_2026.basicPersonalAmount, creditRate: NL_2026.creditRate },
  YT: { bpa: YT_2026.basicPersonalAmount, creditRate: YT_2026.creditRate },
  NT: { bpa: NT_2026.basicPersonalAmount, creditRate: NT_2026.creditRate },
  NU: { bpa: NU_2026.basicPersonalAmount, creditRate: NU_2026.creditRate },
};

// ── Provincial helpers ───────────────────────────────────────────────────────

interface ProvincialCalc {
  tax: number;
  /** Sum of provincial refundable benefits only (not federal CWB/CCB/GST). */
  benefits: number;
}

function calcBCProvincial(
  taxableIncome: number,
  baseCPPContribution: number,
  ei: number,
  afni: number,
  totalKids: number,
  ccbMultiplier: number,
  isCoupled: boolean,
  claimEligibleDependant: boolean,
): ProvincialCalc {
  const bracket = calculateBracketTax(taxableIncome, BC_2026.brackets);
  const bpaCredit = BC_2026.basicPersonalAmount * BC_2026.creditRate;
  const edcCredit = claimEligibleDependant
    ? BC_2026.eligibleDependantAmount * BC_2026.creditRate
    : 0;
  const cppCredit = baseCPPContribution * BC_2026.creditRate;
  const eiCredit = ei * BC_2026.creditRate;
  const taxReductionCredit = calculateBCTaxReductionCredit(taxableIncome);
  const tax = Math.max(
    0,
    bracket - bpaCredit - edcCredit - cppCredit - eiCredit - taxReductionCredit,
  );

  const bcFamilyBenefit = calculateBCFamilyBenefit(afni, totalKids) * ccbMultiplier;
  const bcSalesTaxCredit = calculateBCSalesTaxCredit(afni, isCoupled);
  const bcRentersCredit = calculateBCRentersTaxCredit(afni);
  const benefits = bcFamilyBenefit + bcSalesTaxCredit + bcRentersCredit;

  return { tax, benefits };
}

function calculateOntarioHealthPremium(taxableIncome: number): number {
  for (const tier of ON_2026.ohp.tiers) {
    if (taxableIncome <= tier.toTI) {
      return tier.base + tier.phaseInRate * (taxableIncome - tier.fromTI);
    }
  }
  return ON_2026.ohp.maxPremium;
}

function calcONProvincial(
  taxableIncome: number,
  baseCPPContribution: number,
  ei: number,
  afni: number,
  totalKids: number,
  ccbMultiplier: number,
  isCoupled: boolean,
  claimEligibleDependant: boolean,
): ProvincialCalc {
  const bracket = calculateBracketTax(taxableIncome, ON_2026.brackets);
  const bpaCredit = ON_2026.basicPersonalAmount * ON_2026.creditRate;
  const edcCredit = claimEligibleDependant
    ? ON_2026.eligibleDependantAmount * ON_2026.creditRate
    : 0;
  const cppCredit = baseCPPContribution * ON_2026.creditRate;
  const eiCredit = ei * ON_2026.creditRate;
  const basicOntTax = Math.max(
    0,
    bracket - bpaCredit - edcCredit - cppCredit - eiCredit,
  );

  // Surtax (Schedule ON-A)
  const s = ON_2026.surtax;
  const surtax =
    0.20 * Math.max(0, basicOntTax - s.threshold1) +
    0.36 * Math.max(0, basicOntTax - s.threshold2);
  const ontTaxBeforeLIFT = basicOntTax + surtax;

  // LIFT credit — non-refundable, capped at Ontario tax owing
  const l = ON_2026.lift;
  const liftMax = Math.max(
    0,
    l.maxCredit - l.phaseOutRate * Math.max(0, taxableIncome - l.phaseOutThreshold),
  );
  const liftCredit = Math.min(ontTaxBeforeLIFT, liftMax);

  // Ontario Health Premium (ON428 line 42) — added after LIFT
  const ohp = calculateOntarioHealthPremium(taxableIncome);
  const tax = Math.max(0, ontTaxBeforeLIFT - liftCredit) + ohp;

  // Provincial benefits
  const ocb = calculateOCB(afni, totalKids) * ccbMultiplier;
  const ostc = calculateOSTC(afni, isCoupled, totalKids);
  const benefits = ocb + ostc;

  return { tax, benefits };
}

function calcABProvincial(
  taxableIncome: number,
  baseCPPContribution: number,
  ei: number,
  workingIncome: number,
  afni: number,
  totalKids: number,
  ccbMultiplier: number,
  claimEligibleDependant: boolean,
): ProvincialCalc {
  const bracket = calculateBracketTax(taxableIncome, AB_2026.brackets);
  const bpaCredit = AB_2026.basicPersonalAmount * AB_2026.creditRate;
  const edcCredit = claimEligibleDependant
    ? AB_2026.eligibleDependantAmount * AB_2026.creditRate
    : 0;
  const cppCredit = baseCPPContribution * AB_2026.creditRate;
  const eiCredit = ei * AB_2026.creditRate;
  const tax = Math.max(0, bracket - bpaCredit - edcCredit - cppCredit - eiCredit);

  // ACFB working component phases in on employment + net self-employment
  // income (Alberta Treasury Board definition of "working income"), matching
  // CRA's line-by-line CWB definition.
  const acfb = calculateACFB(afni, workingIncome, totalKids) * ccbMultiplier;
  const benefits = acfb;

  return { tax, benefits };
}

function calcSKProvincial(
  taxableIncome: number,
  baseCPPContribution: number,
  ei: number,
  afni: number,
  totalKids: number,
  ccbMultiplier: number,
  isCoupled: boolean,
  claimEligibleDependant: boolean,
): ProvincialCalc {
  const bracket = calculateBracketTax(taxableIncome, SK_2026.brackets);
  const bpaCredit = SK_2026.basicPersonalAmount * SK_2026.creditRate;
  const edcCredit = claimEligibleDependant
    ? SK_2026.eligibleDependantAmount * SK_2026.creditRate
    : 0;
  const cppCredit = baseCPPContribution * SK_2026.creditRate;
  const eiCredit = ei * SK_2026.creditRate;
  const tax = Math.max(0, bracket - bpaCredit - edcCredit - cppCredit - eiCredit);

  const slitc = calculateSLITC(afni, isCoupled, totalKids) * ccbMultiplier;
  return { tax, benefits: slitc };
}

function calcMBProvincial(
  taxableIncome: number,
  baseCPPContribution: number,
  ei: number,
  afni: number,
  totalKids: number,
  ccbMultiplier: number,
  isCoupled: boolean,
  claimEligibleDependant: boolean,
): ProvincialCalc {
  const bracket = calculateBracketTax(taxableIncome, MB_2026.brackets);
  const bpaCredit = MB_2026.basicPersonalAmount * MB_2026.creditRate;
  const edcCredit = claimEligibleDependant
    ? MB_2026.eligibleDependantAmount * MB_2026.creditRate
    : 0;
  const cppCredit = baseCPPContribution * MB_2026.creditRate;
  const eiCredit = ei * MB_2026.creditRate;
  // MB Family Tax Benefit (Schedule MB428-A) — non-refundable, phases out quickly
  const ftbBase = Math.max(0, MB_2026.familyTaxBenefit.baseAmount - MB_2026.familyTaxBenefit.phaseOutRate * taxableIncome);
  const ftbCredit = ftbBase * MB_2026.creditRate;
  const tax = Math.max(0, bracket - bpaCredit - edcCredit - cppCredit - eiCredit - ftbCredit);

  // Refundable benefits — MB has no provincial child benefit through CRA
  const mbPersonalCredit = calculateMBRefundablePersonalCredit(afni);
  const mbRatc = MB_RATC_2026.maxAmount; // assume tenant
  const benefits = mbPersonalCredit + mbRatc;

  return { tax, benefits };
}

function calcNBProvincial(
  taxableIncome: number,
  baseCPPContribution: number,
  ei: number,
  claimEligibleDependant: boolean,
): ProvincialCalc {
  const bracket = calculateBracketTax(taxableIncome, NB_2026.brackets);
  const bpaCredit = NB_2026.basicPersonalAmount * NB_2026.creditRate;
  const edcCredit = claimEligibleDependant ? NB_2026.eligibleDependantAmount * NB_2026.creditRate : 0;
  const cppCredit = baseCPPContribution * NB_2026.creditRate;
  const eiCredit = ei * NB_2026.creditRate;
  const litrCredit = calculateNBLowIncomeTaxReduction(taxableIncome);
  const tax = Math.max(0, bracket - bpaCredit - edcCredit - cppCredit - eiCredit - litrCredit);
  return { tax, benefits: 0 };
}

function calcNSProvincial(
  taxableIncome: number,
  baseCPPContribution: number,
  ei: number,
  afni: number,
  totalKids: number,
  ccbMultiplier: number,
  claimEligibleDependant: boolean,
): ProvincialCalc {
  const bracket = calculateBracketTax(taxableIncome, NS_2026.brackets);
  const bpaCredit = NS_2026.basicPersonalAmount * NS_2026.creditRate;
  const edcCredit = claimEligibleDependant ? NS_2026.eligibleDependantAmount * NS_2026.creditRate : 0;
  const cppCredit = baseCPPContribution * NS_2026.creditRate;
  const eiCredit = ei * NS_2026.creditRate;
  const litrCredit = calculateNSLowIncomeTaxReduction(taxableIncome);
  const tax = Math.max(0, bracket - bpaCredit - edcCredit - cppCredit - eiCredit - litrCredit);
  const nsaltc = calculateNSALTC(afni, totalKids);
  const nscb = calculateNSCB(afni, totalKids) * ccbMultiplier;
  return { tax, benefits: nsaltc + nscb };
}

function calcPEProvincial(
  taxableIncome: number,
  baseCPPContribution: number,
  ei: number,
  afni: number,
  childrenUnder6: number,
  claimEligibleDependant: boolean,
): ProvincialCalc {
  const bracket = calculateBracketTax(taxableIncome, PE_2026.brackets);
  const bpaCredit = PE_2026.basicPersonalAmount * PE_2026.creditRate;
  const edcCredit = claimEligibleDependant ? PE_2026.eligibleDependantAmount * PE_2026.creditRate : 0;
  // PE428 line 58230: $100 per child under 6 (non-refundable)
  const childUnder6Credit = childrenUnder6 * 100 * PE_2026.creditRate;
  const cppCredit = baseCPPContribution * PE_2026.creditRate;
  const eiCredit = ei * PE_2026.creditRate;
  const litrCredit = calculatePELowIncomeTaxReduction(taxableIncome);
  const tax = Math.max(0, bracket - bpaCredit - edcCredit - childUnder6Credit - cppCredit - eiCredit - litrCredit);
  const peSTC = calculatePESalesTaxCredit(afni, claimEligibleDependant);
  return { tax, benefits: peSTC };
}

function calcNLProvincial(
  taxableIncome: number,
  baseCPPContribution: number,
  ei: number,
  afni: number,
  claimEligibleDependant: boolean,
  age: number | undefined,
): ProvincialCalc {
  const bracket = calculateBracketTax(taxableIncome, NL_2026.brackets);
  const bpaCredit = NL_2026.basicPersonalAmount * NL_2026.creditRate;
  const edcCredit = claimEligibleDependant ? NL_2026.eligibleDependantAmount * NL_2026.creditRate : 0;
  const cppCredit = baseCPPContribution * NL_2026.creditRate;
  const eiCredit = ei * NL_2026.creditRate;
  const litrCredit = calculateNLLowIncomeTaxReduction(taxableIncome);
  const tax = Math.max(0, bracket - bpaCredit - edcCredit - cppCredit - eiCredit - litrCredit);
  const nlIS = calculateNLIncomeSupplement(afni);
  const nlSB = age !== undefined ? calculateNLSeniorsBenefit(afni, age) : 0;
  return { tax, benefits: nlIS + nlSB };
}

function calcNUProvincial(
  taxableIncome: number,
  baseCPPContribution: number,
  ei: number,
  isCoupled: boolean,
  totalKids: number,
  claimEligibleDependant: boolean,
): ProvincialCalc {
  const bracket = calculateBracketTax(taxableIncome, NU_2026.brackets);
  const bpaCredit = NU_2026.basicPersonalAmount * NU_2026.creditRate;
  const edcCredit = claimEligibleDependant ? NU_2026.eligibleDependantAmount * NU_2026.creditRate : 0;
  const cppCredit = baseCPPContribution * NU_2026.creditRate;
  const eiCredit = ei * NU_2026.creditRate;
  const rawTax = Math.max(0, bracket - bpaCredit - edcCredit - cppCredit - eiCredit);
  const coltc = calculateNUCOLTC(isCoupled, totalKids);
  const tax = Math.max(0, rawTax - coltc);
  const refundedCOLTC = Math.max(0, coltc - rawTax);
  return { tax, benefits: refundedCOLTC };
}

function calcNTProvincial(
  taxableIncome: number,
  baseCPPContribution: number,
  ei: number,
  isCoupled: boolean,
  totalKids: number,
  claimEligibleDependant: boolean,
): ProvincialCalc {
  const bracket = calculateBracketTax(taxableIncome, NT_2026.brackets);
  const bpaCredit = NT_2026.basicPersonalAmount * NT_2026.creditRate;
  const edcCredit = claimEligibleDependant ? NT_2026.eligibleDependantAmount * NT_2026.creditRate : 0;
  const cppCredit = baseCPPContribution * NT_2026.creditRate;
  const eiCredit = ei * NT_2026.creditRate;
  const rawTax = Math.max(0, bracket - bpaCredit - edcCredit - cppCredit - eiCredit);
  const coltc = calculateNTCOLTC(isCoupled, totalKids);
  const tax = Math.max(0, rawTax - coltc);
  const refundedCOLTC = Math.max(0, coltc - rawTax);
  return { tax, benefits: refundedCOLTC };
}

function calcSimpleProvincial(
  data: { brackets: readonly { upTo: number; rate: number }[]; basicPersonalAmount: number; creditRate: number; eligibleDependantAmount: number; canadaEmploymentAmount?: number },
  taxableIncome: number,
  baseCPPContribution: number,
  ei: number,
  claimEligibleDependant: boolean,
): ProvincialCalc {
  const bracket = calculateBracketTax(taxableIncome, data.brackets);
  const bpaCredit = data.basicPersonalAmount * data.creditRate;
  const edcCredit = claimEligibleDependant ? data.eligibleDependantAmount * data.creditRate : 0;
  const cecCredit = (data.canadaEmploymentAmount ?? 0) * data.creditRate;
  const cppCredit = baseCPPContribution * data.creditRate;
  const eiCredit = ei * data.creditRate;
  const tax = Math.max(0, bracket - bpaCredit - edcCredit - cecCredit - cppCredit - eiCredit);
  return { tax, benefits: 0 };
}

/**
 * Compute the taxpayer's net disposable income for the 2026 tax year.
 *
 * Supports BC and Alberta provincial tax and benefits. Province defaults to BC.
 * Federal tax (including CWB) and federal benefits (CCB, GST) are the same
 * regardless of province.
 */
export function calculateNetIncome(input: NetIncomeInput): NetIncomeBreakdown {
  const {
    grossIncome,
    unionDues = 0,
    spousalSupportReceived = 0,
    spousalSupportPaid = 0,
    isCoupled = false,
    childrenUnder6InCare = 0,
    children6to17InCare = 0,
    ccbMultiplier = 1,
    excludeCCB = false,
    claimEligibleDependant = false,
    newPartnerNetIncome,
    province = "BC",
    otherIncome = 0,
    rrspWithdrawals = 0,
    capitalGainsActual = 0,
    selfEmploymentIncome = 0,
    pensionIncome = 0,
    eligibleDividends = 0,
    nonEligibleDividends = 0,
    employmentExpensesOther = 0,
    carryingCharges = 0,
    businessInvestmentLosses = 0,
  } = input;

  // ABIL — 50% of actual business investment loss is deductible against any
  // income (ITA s.38(c) / s.39(1)(c)).
  const abil = businessInvestmentLosses * 0.5;

  // EDC (Line 30400) and spousal amount (Line 30300) are mutually exclusive.
  // When living with a new partner, suppress EDC and apply spousal credit instead.
  const effectiveClaimEDC = claimEligibleDependant && !isCoupled;

  const capitalGainsTaxable = capitalGainsActual * 0.5;
  const eligibleDividendsGrossedUp = eligibleDividends * 1.38;
  const nonEligibleDividendsGrossedUp = nonEligibleDividends * 1.15;

  const employeeCPP = calculateCPP(grossIncome);
  const ei = calculateEI(grossIncome);
  const employeeEnhancedCPPDeduction = calculateEnhancedCPPDeduction(grossIncome);

  const seCPP = calculateSelfEmployedCPP(selfEmploymentIncome, grossIncome);
  const cpp = employeeCPP + seCPP.totalContribution;
  const enhancedCPPDeduction = employeeEnhancedCPPDeduction + seCPP.enhancedDeduction;
  const employerBaseCPPDeduction = seCPP.employerBaseDeduction;

  const taxableIncome = Math.max(
    0,
    grossIncome +
      selfEmploymentIncome +
      pensionIncome +
      otherIncome +
      rrspWithdrawals +
      capitalGainsTaxable +
      eligibleDividendsGrossedUp +
      nonEligibleDividendsGrossedUp +
      spousalSupportReceived -
      spousalSupportPaid -
      unionDues -
      employmentExpensesOther -
      carryingCharges -
      abil -
      enhancedCPPDeduction -
      employerBaseCPPDeduction,
  );

  const baseCPPContribution = calculateBaseCPPContribution(grossIncome) + seCPP.employeeBaseForCredit;

  // Federal tax
  const federalBracket = calculateBracketTax(taxableIncome, FEDERAL_2026.brackets);
  const effectiveBPA = federalEffectiveBPA(taxableIncome);
  const federalBPACredit = effectiveBPA * FEDERAL_2026.creditRate;
  const federalEDCCredit = effectiveClaimEDC
    ? effectiveBPA * FEDERAL_2026.creditRate
    : 0;
  const federalSpousalCredit = isCoupled
    ? Math.max(0, effectiveBPA - (newPartnerNetIncome ?? 0)) * FEDERAL_2026.creditRate
    : 0;
  const federalCEACredit =
    grossIncome > 0
      ? Math.min(CANADA_EMPLOYMENT_AMOUNT_2026, grossIncome) * FEDERAL_2026.creditRate
      : 0;
  const federalCPPCredit = baseCPPContribution * FEDERAL_2026.creditRate;
  const federalEICredit = ei * FEDERAL_2026.creditRate;
  const federalPensionCredit = Math.min(pensionIncome, 2000) * FEDERAL_2026.creditRate;
  const federalDTCEligible = eligibleDividendsGrossedUp * 0.150198;
  const federalDTCNonEligible = nonEligibleDividendsGrossedUp * 0.090301;

  const federalTax = Math.max(
    0,
    federalBracket -
      federalBPACredit -
      federalEDCCredit -
      federalSpousalCredit -
      federalCEACredit -
      federalCPPCredit -
      federalEICredit -
      federalPensionCredit -
      federalDTCEligible -
      federalDTCNonEligible,
  );

  // Provincial tax and benefits (province-specific).
  //
  // `afni`/`isCoupled` passed to provincial calcs drive the benefit side of
  // those functions (provincial tax itself runs off taxableIncome). They are
  // also the AFNI/coupled inputs for the federal refundable benefits below.
  // For re-partnered parties, the benefits convention toggle swaps these:
  //   - default (Option 2): coupled base + claimant-only AFNI
  //   - "coupled-household-afni" (Option 1): coupled base + (claimant + partner) AFNI
  //   - "unattached" (Option 3): single base + claimant-only AFNI
  const benefitsConvention = input.overrides?.benefitsConvention;
  const benefitsIsCoupled = benefitsConvention === "unattached" ? false : isCoupled;
  const benefitsAFNI =
    benefitsConvention === "coupled-household-afni" && isCoupled
      ? taxableIncome + (newPartnerNetIncome ?? 0)
      : taxableIncome;
  const afni = benefitsAFNI;
  const totalKids = childrenUnder6InCare + children6to17InCare;

  const rawProvincial =
    province === "AB"
      ? calcABProvincial(taxableIncome, baseCPPContribution, ei, grossIncome + selfEmploymentIncome, afni, totalKids, ccbMultiplier, effectiveClaimEDC)
    : province === "ON"
      ? calcONProvincial(taxableIncome, baseCPPContribution, ei, afni, totalKids, ccbMultiplier, benefitsIsCoupled, effectiveClaimEDC)
    : province === "SK"
      ? calcSKProvincial(taxableIncome, baseCPPContribution, ei, afni, totalKids, ccbMultiplier, benefitsIsCoupled, effectiveClaimEDC)
    : province === "MB"
      ? calcMBProvincial(taxableIncome, baseCPPContribution, ei, afni, totalKids, ccbMultiplier, benefitsIsCoupled, effectiveClaimEDC)
    : province === "NB"
      ? calcNBProvincial(taxableIncome, baseCPPContribution, ei, effectiveClaimEDC)
    : province === "NS"
      ? calcNSProvincial(taxableIncome, baseCPPContribution, ei, afni, totalKids, ccbMultiplier, effectiveClaimEDC)
    : province === "PE"
      ? calcPEProvincial(taxableIncome, baseCPPContribution, ei, afni, childrenUnder6InCare, effectiveClaimEDC)
    : province === "NL"
      ? calcNLProvincial(taxableIncome, baseCPPContribution, ei, afni, effectiveClaimEDC, input.age)
    : province === "YT"
      ? calcSimpleProvincial(YT_2026, taxableIncome, baseCPPContribution, ei, effectiveClaimEDC)
    : province === "NT"
      ? calcNTProvincial(taxableIncome, baseCPPContribution, ei, benefitsIsCoupled, totalKids, effectiveClaimEDC)
    : province === "NU"
      ? calcNUProvincial(taxableIncome, baseCPPContribution, ei, benefitsIsCoupled, totalKids, effectiveClaimEDC)
    : calcBCProvincial(taxableIncome, baseCPPContribution, ei, afni, totalKids, ccbMultiplier, benefitsIsCoupled, effectiveClaimEDC);

  // Provincial pension credit + dividend tax credits (applied after the base call)
  const pdc = PROVINCIAL_PENSION_DTC_2026[province];
  const psc = PROVINCIAL_SPOUSAL_2026[province];
  const provincialSpousalCredit = isCoupled
    ? Math.max(0, psc.bpa - (newPartnerNetIncome ?? 0)) * psc.creditRate
    : 0;
  const provincialExtraCredits =
    Math.min(pensionIncome, pdc.pensionMax) * pdc.pensionRate +
    eligibleDividendsGrossedUp * pdc.dtcEligibleRate +
    nonEligibleDividendsGrossedUp * pdc.dtcNonEligibleRate +
    provincialSpousalCredit;
  const provincial: ProvincialCalc = {
    tax: Math.max(0, rawProvincial.tax - provincialExtraCredits),
    benefits: rawProvincial.benefits,
  };

  // Federal refundable benefits (same in all provinces). AFNI and coupled
  // flag follow the benefits convention; see comment above.
  const ccb =
    calculateCCB(afni, childrenUnder6InCare, children6to17InCare) * ccbMultiplier;
  // GSTC child component is split 50/50 in shared custody per ITA s.122.5(3.1)
  // (parallel to the s.122.61(1.1) CCB rule). The adult base is not split.
  const gstCreditAdultOnly = calculateGSTCredit(afni, benefitsIsCoupled, 0);
  const gstCreditFull = calculateGSTCredit(afni, benefitsIsCoupled, totalKids);
  const gstCreditChildPortion = Math.max(0, gstCreditFull - gstCreditAdultOnly);
  const gstCredit = gstCreditAdultOnly + gstCreditChildPortion * ccbMultiplier;
  // CWB "working income" per ITA s.122.7 = net employment + net self-employment.
  const cwb = calculateCWB(grossIncome + selfEmploymentIncome, afni, totalKids > 0, benefitsIsCoupled);

  const netIncome =
    grossIncome
    + selfEmploymentIncome
    + pensionIncome
    + otherIncome
    + rrspWithdrawals
    + capitalGainsActual
    + eligibleDividends
    + nonEligibleDividends
    - federalTax
    - provincial.tax
    - cpp
    - ei
    - unionDues
    - employmentExpensesOther
    - carryingCharges
    - abil
    + spousalSupportReceived
    - spousalSupportPaid
    + (excludeCCB ? 0 : ccb)
    + gstCredit
    + cwb
    + provincial.benefits;

  const breakdown: NetIncomeBreakdown = {
    grossIncome,
    taxableIncome,
    federalTax,
    provincialTax: provincial.tax,
    cpp,
    ei,
    ccb,
    gstCredit,
    provincialBenefits: provincial.benefits,
    spousalAmountCredit: federalSpousalCredit + provincialSpousalCredit,
    netIncome,
  };

  if (input.overrides) {
    return applyOverrides(breakdown, input, input.overrides);
  }
  return breakdown;
}

/**
 * Overlay caller-supplied overrides on a computed breakdown. Each pinned tax
 * value represents the amount at SS=0; the combined marginal rate is applied
 * to the actual SS delta so the solver still works.
 *
 * Semantics per field:
 *   - netIncomeAtZeroSS: escape hatch — bypasses everything else; netIncome
 *     becomes netAtZero + ssDelta × (1 − marginalRate).
 *   - federalTaxAtZeroSS / provincialTaxAtZeroSS: pinned base; their displayed
 *     value stays at the pinned number but netIncome reflects the delta.
 *   - cpp / ei: flat replacement (not SS-sensitive).
 *   - ccb / gstCredit / provincialBenefits / spousalAmountCredit: flat
 *     replacement. Any engine SS-sensitivity is ignored — error is small at
 *     the benefit layer and the user explicitly chose to pin.
 */
function applyOverrides(
  breakdown: NetIncomeBreakdown,
  input: NetIncomeInput,
  overrides: SpouseOverrides,
): NetIncomeBreakdown {
  const ssDelta = (input.spousalSupportReceived ?? 0) - (input.spousalSupportPaid ?? 0);
  const marginalRate = overrides.marginalRate ?? 0;
  const used: string[] = [];

  if (overrides.netIncomeAtZeroSS !== undefined) {
    used.push("netIncomeAtZeroSS");
    if (overrides.marginalRate !== undefined) used.push("marginalRate");
    return {
      ...breakdown,
      netIncome: overrides.netIncomeAtZeroSS + ssDelta * (1 - marginalRate),
      usedOverrides: used,
    };
  }

  const federalTax = overrides.federalTaxAtZeroSS ?? breakdown.federalTax;
  const provincialTax = overrides.provincialTaxAtZeroSS ?? breakdown.provincialTax;
  const cpp = overrides.cpp ?? breakdown.cpp;
  const ei = overrides.ei ?? breakdown.ei;
  const ccb = overrides.ccb ?? breakdown.ccb;
  const gstCredit = overrides.gstCredit ?? breakdown.gstCredit;
  const provincialBenefits =
    overrides.provincialBenefits ?? breakdown.provincialBenefits;
  const spousalAmountCredit =
    overrides.spousalAmountCredit ?? breakdown.spousalAmountCredit;

  if (overrides.federalTaxAtZeroSS !== undefined) used.push("federalTax");
  if (overrides.provincialTaxAtZeroSS !== undefined) used.push("provincialTax");
  if (overrides.cpp !== undefined) used.push("cpp");
  if (overrides.ei !== undefined) used.push("ei");
  if (overrides.ccb !== undefined) used.push("ccb");
  if (overrides.gstCredit !== undefined) used.push("gstCredit");
  if (overrides.provincialBenefits !== undefined) used.push("provincialBenefits");
  if (overrides.spousalAmountCredit !== undefined) used.push("spousalAmountCredit");
  if (overrides.marginalRate !== undefined) used.push("marginalRate");

  // If the user pinned any tax value, apply the marginal rate to the SS delta
  // so the solver can still iterate meaningfully. If they didn't pin tax, the
  // engine-computed values already reflect SS; no delta adjustment needed.
  const taxPinned =
    overrides.federalTaxAtZeroSS !== undefined ||
    overrides.provincialTaxAtZeroSS !== undefined;
  const taxDeltaAdjustment = taxPinned ? marginalRate * ssDelta : 0;

  // Reconstruct netIncome from the overlaid components relative to the engine
  // breakdown: each field swap changes netIncome by +old − new (or inverse for
  // benefits). Using a delta approach keeps this correct regardless of which
  // subset of fields was overridden.
  const taxComponentDelta =
    (federalTax - breakdown.federalTax) +
    (provincialTax - breakdown.provincialTax) +
    (cpp - breakdown.cpp) +
    (ei - breakdown.ei) +
    taxDeltaAdjustment;
  const benefitComponentDelta =
    (ccb - breakdown.ccb) +
    (gstCredit - breakdown.gstCredit) +
    (provincialBenefits - breakdown.provincialBenefits);
  // Spousal amount credit reduces tax, so an override to a larger value means
  // less tax paid (more net). But the engine already baked the credit into
  // breakdown.federalTax / provincialTax. If user overrode tax directly, the
  // credit override is redundant; if user only overrode the credit, we adjust
  // tax implicitly.
  const spousalCreditDelta = taxPinned
    ? 0
    : breakdown.spousalAmountCredit - spousalAmountCredit;

  const overlaidNetIncome =
    breakdown.netIncome - taxComponentDelta + benefitComponentDelta - spousalCreditDelta;

  return {
    ...breakdown,
    federalTax,
    provincialTax,
    cpp,
    ei,
    ccb,
    gstCredit,
    provincialBenefits,
    spousalAmountCredit,
    netIncome: overlaidNetIncome,
    usedOverrides: used,
  };
}
