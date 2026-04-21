/**
 * Refundable benefits — currently in effect as of April 2026.
 *
 * Benefit years run July to June. As of April 2026 the active benefit
 * year is 2025–26 (July 1, 2025 – June 30, 2026). New amounts take
 * effect July 1, 2026. We retain 2025–26 values here until July 2026
 * per guidance not to pre-empt changes that haven't taken effect yet.
 *
 * Notes on upcoming changes (NOT applied yet):
 *   - CCB July 2026-27: per-child amounts rise to $8,157 / $6,883;
 *     thresholds rise to $38,237 / $82,847. Rates unchanged.
 *   - GST credit replaced by Canada Groceries and Essentials Benefit
 *     (CGEB) starting July 2026 — same eligibility/structure, +25%
 *     amounts for 5 years (2026-2031).
 *   - BC Family Benefit 2026-27 per-child amounts: not yet published
 *     by the province. Lower threshold announced as $30,176.
 *
 * Sources:
 *   CCB:   CRA — CCB calculation sheet, July 2025 – June 2026
 *     https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-child-benefit-overview.html
 *   BCFB:  BC Gov — B.C. family benefit
 *   GST:   CRA — GST/HST credit amounts
 *     https://www.canada.ca/en/revenue-agency/services/child-family-benefits/goods-services-tax-harmonized-sales-tax-gst-hst-credit.html
 *   BC STC: BC Gov — Sales tax credit (BC479)
 */

// ─── Canada Child Benefit (CCB) ──────────────────────────────────────────────

const CCB_REDUCTION_RATES: Record<1 | 2 | 3 | 4, { phase1: number; phase2: number }> = {
  1: { phase1: 0.07,  phase2: 0.032 },
  2: { phase1: 0.135, phase2: 0.057 },
  3: { phase1: 0.19,  phase2: 0.08 },
  4: { phase1: 0.23,  phase2: 0.095 }, // 4 or more children
};

export const CCB_2025_2026 = {
  benefitYear: "2025-07 to 2026-06",
  maxPerChildUnder6: 7_997,
  maxPerChild6to17: 6_748,
  phaseOutThreshold1: 37_487,
  phaseOutThreshold2: 81_222,
  reductionRates: CCB_REDUCTION_RATES,
} as const;

export function calculateCCB(
  afni: number,
  childrenUnder6: number,
  children6to17: number,
): number {
  const totalChildren = childrenUnder6 + children6to17;
  if (totalChildren <= 0) return 0;

  const maxBenefit =
    childrenUnder6 * CCB_2025_2026.maxPerChildUnder6 +
    children6to17 * CCB_2025_2026.maxPerChild6to17;

  // Round before clamping: age-weighted child counts may be summed as
  // floats and need to land on an integer rate-key.
  const rateKey = Math.min(Math.max(1, Math.round(totalChildren)), 4) as 1 | 2 | 3 | 4;
  const { phase1, phase2 } = CCB_2025_2026.reductionRates[rateKey];
  const { phaseOutThreshold1: t1, phaseOutThreshold2: t2 } = CCB_2025_2026;

  if (afni <= t1) return maxBenefit;

  if (afni <= t2) {
    return Math.max(0, maxBenefit - (afni - t1) * phase1);
  }

  // Phase 2 = cumulative Phase 1 reduction at t2 + additional percentage on excess above t2
  const phase1Reduction = (t2 - t1) * phase1;
  const phase2Reduction = (afni - t2) * phase2;
  return Math.max(0, maxBenefit - phase1Reduction - phase2Reduction);
}

// ─── BC Family Benefit (BCFB) ────────────────────────────────────────────────

/**
 * BC Family Benefit — 2025–26 benefit year (currently in effect). Tiered
 * per-child amounts, guaranteed minimums, two-tier phase-out, plus a
 * single-parent supplement.
 */
export const BC_FAMILY_BENEFIT_2025_2026 = {
  benefitYear: "2025-07 to 2026-06",
  firstChildAmount: 1_750,
  secondChildAmount: 1_100,
  additionalChildAmount: 900,
  minFirstChild: 775,
  minSecondChild: 750,
  minAdditionalChild: 725,
  singleParentSupplement: 500,
  lowerThreshold: 29_526,
  upperThreshold: 94_483,
  phaseOutRate: 0.04,
} as const;

function bcfbMaxAmount(numChildren: number): number {
  if (numChildren <= 0) return 0;
  const b = BC_FAMILY_BENEFIT_2025_2026;
  let total = b.firstChildAmount;
  if (numChildren >= 2) total += b.secondChildAmount;
  if (numChildren >= 3) total += b.additionalChildAmount * (numChildren - 2);
  return total;
}

function bcfbMinAmount(numChildren: number): number {
  if (numChildren <= 0) return 0;
  const b = BC_FAMILY_BENEFIT_2025_2026;
  let total = b.minFirstChild;
  if (numChildren >= 2) total += b.minSecondChild;
  if (numChildren >= 3) total += b.minAdditionalChild * (numChildren - 2);
  return total;
}

export function calculateBCFamilyBenefit(
  afni: number,
  numChildrenUnder18: number,
  isSingleParent: boolean = true,
): number {
  if (numChildrenUnder18 <= 0) return 0;

  const b = BC_FAMILY_BENEFIT_2025_2026;
  const max =
    bcfbMaxAmount(numChildrenUnder18) +
    (isSingleParent ? b.singleParentSupplement : 0);
  const min = bcfbMinAmount(numChildrenUnder18);

  if (afni <= b.lowerThreshold) return max;
  if (afni <= b.upperThreshold) {
    return Math.max(min, max - (afni - b.lowerThreshold) * b.phaseOutRate);
  }
  return Math.max(0, min - (afni - b.upperThreshold) * b.phaseOutRate);
}

// ─── GST/HST Credit (2025–26 benefit year) ───────────────────────────────────

/**
 * GST/HST Credit — 2025–26 benefit year (currently in effect). Separate
 * single-adult supplement that phases in, then the overall credit phases
 * out above $45,521.
 *
 * A single adult's maximum credit is base $349 + supplement up to $184
 * (phases in at 2% of AFNI over $11,337 up to the $184 cap). For couples,
 * the $698 is a flat family base without a separate supplement.
 *
 * Replaced by CGEB in July 2026.
 */
export const GST_CREDIT_2025_2026 = {
  benefitYear: "2025-07 to 2026-06",
  baseSingleAdult: 349,
  maxSingleSupplement: 184,
  singleSupplementPhaseInThreshold: 11_337,
  singleSupplementPhaseInRate: 0.02,
  baseCouple: 698,
  perChild: 184,
  phaseOutThreshold: 45_521,
  phaseOutRate: 0.05,
  futureReplacement: "CGEB starting July 2026",
} as const;

export function calculateGSTCredit(
  afni: number,
  isCoupled: boolean,
  numChildren: number,
): number {
  const g = GST_CREDIT_2025_2026;

  let maxCredit: number;
  if (isCoupled) {
    maxCredit = g.baseCouple + numChildren * g.perChild;
  } else {
    // Single adult: base + supplement (phased in) + children
    const supplement = Math.min(
      g.maxSingleSupplement,
      Math.max(
        0,
        (afni - g.singleSupplementPhaseInThreshold) *
          g.singleSupplementPhaseInRate,
      ),
    );
    maxCredit = g.baseSingleAdult + supplement + numChildren * g.perChild;
  }

  const reduction = Math.max(0, (afni - g.phaseOutThreshold) * g.phaseOutRate);
  return Math.max(0, maxCredit - reduction);
}

// ─── BC Tax Reduction Credit (BCTRC) ─────────────────────────────────────────

/**
 * BC Tax Reduction Credit — non-refundable. Reduces BC provincial tax for
 * low-to-middle income BC residents. Maximum $690 for 2026-2030; phases out
 * at 3.56% of net income above $25,570, reaching zero at ~$44,952.
 *
 * This is a separate credit from the BC Basic Personal Amount. It was
 * enhanced in the 2026 BC Budget (from $575 to $690) to offset the lowest
 * bracket rate increase from 5.06% to 5.60%.
 */
export const BC_TAX_REDUCTION_CREDIT_2026 = {
  maxAmount: 690,
  fullCreditThreshold: 25_570,
  phaseOutRate: 0.0356,
} as const;

export function calculateBCTaxReductionCredit(netIncome: number): number {
  const c = BC_TAX_REDUCTION_CREDIT_2026;
  if (netIncome <= c.fullCreditThreshold) return c.maxAmount;
  const reduction = (netIncome - c.fullCreditThreshold) * c.phaseOutRate;
  return Math.max(0, c.maxAmount - reduction);
}

// ─── Canada Workers Benefit (CWB) ────────────────────────────────────────────

/**
 * Canada Workers Benefit — refundable benefit for low-income working
 * Canadians. Single-parent-with-child classifies as "family" for CWB
 * purposes.
 *
 * 2026 tax year amounts (CRA 2% indexation from 2025). These are the
 * amounts used on the 2026 T1 Schedule 6, consistent with all other
 * 2026-indexed parameters in our engine (brackets, BPA, CPP/EI).
 *
 * Formula (Budget 2023 enhancement):
 *   Phase-in: 27% of working income above $3,000, up to max
 *   Phase-out: 15% of AFNI above threshold
 *   Max: $1,633 single, $2,813 family
 *   Phase-out threshold: $26,855 single, $30,639 family
 *
 * Values are the CRA-published 2026 amounts; no further indexation is
 * applied on top.
 */
export const CWB_2026 = {
  taxYear: 2026,
  phaseInFloor: 3_000,
  phaseInRate: 0.27,
  maxSingle: 1_633,
  maxFamily: 2_813,
  phaseOutThresholdSingle: 26_855,
  phaseOutThresholdFamily: 30_639,
  phaseOutRate: 0.15,
} as const;

export function calculateCWB(
  workingIncome: number,
  afni: number,
  hasChildren: boolean,
  isCoupled: boolean,
): number {
  const c = CWB_2026;
  // Per CRA: single parents with children are "family" status for CWB
  const isFamily = isCoupled || hasChildren;
  const max = isFamily ? c.maxFamily : c.maxSingle;
  const threshold = isFamily
    ? c.phaseOutThresholdFamily
    : c.phaseOutThresholdSingle;

  const phasedIn = Math.min(
    max,
    Math.max(0, (workingIncome - c.phaseInFloor) * c.phaseInRate),
  );
  const reduction = Math.max(0, (afni - threshold) * c.phaseOutRate);
  return Math.max(0, phasedIn - reduction);
}

// ─── BC Renter's Tax Credit ──────────────────────────────────────────────────

/**
 * BC Refundable Renter's Tax Credit (2024+). Up to $400 per year for a
 * BC resident who rented their principal residence for at least 6
 * months. For 2026, phases out above $66,189 AFNI at 2%, fully phased
 * out at $86,189 (thresholds indexed annually by BC).
 *
 * Per BC Gov — B.C. renter's tax credit. The calculator assumes the party
 * is a renter; callers should not include this credit for owner-occupiers,
 * who are not eligible.
 */
export const BC_RENTERS_TAX_CREDIT_2026 = {
  maxAmount: 400,
  phaseOutThreshold: 66_189,
  phaseOutRate: 0.02,
  fullPhaseOut: 86_189,
} as const;

export function calculateBCRentersTaxCredit(afni: number): number {
  const c = BC_RENTERS_TAX_CREDIT_2026;
  if (afni <= c.phaseOutThreshold) return c.maxAmount;
  if (afni >= c.fullPhaseOut) return 0;
  return Math.max(0, c.maxAmount - (afni - c.phaseOutThreshold) * c.phaseOutRate);
}

// ─── BC Sales Tax Credit (BC STC) ────────────────────────────────────────────

/**
 * BC Sales Tax Credit — small refundable credit claimed on Form BC479.
 * $75 per adult, no per-child amount. Phases out above a low threshold.
 *
 * Values are not indexed annually in published sources — retain $75 until
 * BC updates.
 */
export const BC_SALES_TAX_CREDIT_2026 = {
  perAdult: 75,
  singlePhaseOutThreshold: 15_000,
  familyPhaseOutThreshold: 18_000,
  phaseOutRate: 0.02,
} as const;

export function calculateBCSalesTaxCredit(
  afni: number,
  isCoupled: boolean,
): number {
  const c = BC_SALES_TAX_CREDIT_2026;
  const maxCredit = isCoupled ? c.perAdult * 2 : c.perAdult;
  const threshold = isCoupled
    ? c.familyPhaseOutThreshold
    : c.singlePhaseOutThreshold;
  const reduction = Math.max(0, (afni - threshold) * c.phaseOutRate);
  return Math.max(0, maxCredit - reduction);
}

// ─── Alberta Child and Family Benefit (ACFB) ─────────────────────────────────

/**
 * Alberta Child and Family Benefit — 2026-27 benefit year (CRA-administered).
 * Two components:
 *   Base — income-tested, phases out above $28,116 adjusted family net income
 *   Working — phases in at 15% of employment income over $2,760, then phases
 *             out above $47,115 adjusted family net income
 *
 * Phase-out rates: base 4%, working 15% (CRA ACFB calculation worksheet).
 * Sources:
 *   CRA — Alberta child and family benefit
 *     https://www.canada.ca/en/revenue-agency/services/child-family-benefits/provincial-territorial-programs/alberta.html
 *   Government of Alberta — Alberta Child and Family Benefit
 */
export const ACFB_2026_2027 = {
  benefitYear: "2026-07 to 2027-06",
  baseMax:    [0, 1_529, 2_293, 3_057, 3_821] as const, // index 1-4 children
  workingMax: [0,   782, 1_494, 1_920, 2_061] as const,
  basePhaseOutThreshold: 28_116,
  basePhaseOutRate: 0.04,
  workingPhaseOutThreshold: 47_115,
  workingPhaseOutRate: 0.15,
  workingPhaseInFloor: 2_760,
  workingPhaseInRate: 0.15,
} as const;

export function calculateACFB(
  afni: number,
  workingIncome: number,
  numChildren: number,
): number {
  if (numChildren <= 0) return 0;
  const a = ACFB_2026_2027;
  const idx = Math.min(numChildren, 4) as 1 | 2 | 3 | 4;

  const baseMax = a.baseMax[idx];
  const baseReduction = Math.max(0, (afni - a.basePhaseOutThreshold) * a.basePhaseOutRate);
  const base = Math.max(0, baseMax - baseReduction);

  const workingMax = a.workingMax[idx];
  const workingPhasedIn = Math.min(
    workingMax,
    Math.max(0, (workingIncome - a.workingPhaseInFloor) * a.workingPhaseInRate),
  );
  const workingReduction = Math.max(0, (afni - a.workingPhaseOutThreshold) * a.workingPhaseOutRate);
  const working = Math.max(0, workingPhasedIn - workingReduction);

  return base + working;
}

// ─── Ontario Child Benefit (OCB) ──────────────────────────────────────────────

/**
 * Ontario Child Benefit — 2025–26 benefit year (CRA-administered via CCB).
 * Provides up to $1,726.92/child/year (= $143.91/month).
 *
 * Phase-out starts at $26,364 AFNI:
 *   1 child: 3.2% reduction per dollar above threshold
 *   2+ children: 5.7% reduction per dollar above threshold
 *
 * Sources:
 *   Ontario.ca — Ontario Child Benefit
 *   CRA — Provincial and territorial programs, Province of Ontario
 */
export const OCB_2025_2026 = {
  benefitYear: "2025-07 to 2026-06",
  maxPerChild: 1_727,
  phaseOutThreshold: 26_364,
  phaseOutRateOneChild: 0.032,
  phaseOutRateTwoPlus: 0.057,
} as const;

export function calculateOCB(afni: number, numChildren: number): number {
  if (numChildren <= 0) return 0;
  const o = OCB_2025_2026;
  const maxBenefit = o.maxPerChild * numChildren;
  if (afni <= o.phaseOutThreshold) return maxBenefit;
  const rate = numChildren === 1 ? o.phaseOutRateOneChild : o.phaseOutRateTwoPlus;
  return Math.max(0, maxBenefit - (afni - o.phaseOutThreshold) * rate);
}

// ─── Ontario Sales Tax Credit (OSTC) ─────────────────────────────────────────

/**
 * Ontario Sales Tax Credit — 2025–26 benefit year, part of Ontario Trillium
 * Benefit (OTB). $371 per adult and per eligible dependent under 19.
 * Phase-out: 4% of AFNI above $28,506 (single / single parent).
 *
 * Note: The Ontario Energy and Property Tax Credit (OEPTC) component of OTB
 * is excluded here — it depends on rent paid and property tax, which are not
 * collected. OSTC is the income-testable component that does not require
 * rental/property data.
 *
 * Sources:
 *   Ontario.ca — Ontario Trillium Benefit
 *   CRA ON-BEN — Application for the 2025 Ontario Trillium Benefit
 */
export const OSTC_2025_2026 = {
  benefitYear: "2025-07 to 2026-06",
  perPerson: 371,
  phaseOutThreshold: 28_506,
  phaseOutRate: 0.04,
} as const;

export function calculateOSTC(
  afni: number,
  isCoupled: boolean,
  numChildren: number,
): number {
  const o = OSTC_2025_2026;
  const adults = isCoupled ? 2 : 1;
  const maxCredit = o.perPerson * (adults + numChildren);
  if (maxCredit <= 0) return 0;
  const reduction = Math.max(0, (afni - o.phaseOutThreshold) * o.phaseOutRate);
  return Math.max(0, maxCredit - reduction);
}

// ── Manitoba refundable credits ──────────────────────────────────────────────

/**
 * Manitoba Refundable Personal Tax Credit (MB479, line 62000).
 * Single filer base $195; reduced by 1% of net income.
 * Phases to $0 above ~$19,500 AFNI.
 *
 * Source:
 *   Province of Manitoba — Finance, Personal Tax Credits
 *     https://www.gov.mb.ca/finance/personal/pcredits.html
 */
export const MB_REFUNDABLE_PERSONAL_CREDIT_2026 = {
  baseAmount: 195,
  phaseOutRate: 0.01,
} as const;

export function calculateMBRefundablePersonalCredit(afni: number): number {
  const c = MB_REFUNDABLE_PERSONAL_CREDIT_2026;
  return Math.max(0, c.baseAmount - c.phaseOutRate * afni);
}

/**
 * Manitoba Renters Affordability Tax Credit (RATC).
 * Flat $625 for residential renters; no income-based phase-out.
 * Increased from $575 in 2024 per Manitoba Budget 2025.
 *
 * Sources:
 *   Province of Manitoba Budget 2025 — Taxation Changes
 *   Province of Manitoba — Finance, Personal Tax Credits
 */
export const MB_RATC_2026 = {
  maxAmount: 625,
} as const;

// ── Saskatchewan Low Income Tax Credit (SLITC) ───────────────────────────────

/**
 * SLITC 2025-07 to 2026-06 benefit year.
 * Max 2 children eligible for the child component.
 *
 * Sources:
 *   Government of Saskatchewan — Low-Income Tax Credit
 *   Saskatchewan Affordability Act — 5% annual SLITC increases 2025–2028
 */
export const SLITC_2025_2026 = {
  benefitYear: "2025-07 to 2026-06",
  perAdult: 429,
  perChild: 169,
  maxChildren: 2,
  phaseOutThreshold: 38_590,
  phaseOutRate: 0.0288,
} as const;

export function calculateSLITC(
  afni: number,
  isCoupled: boolean,
  numChildren: number,
): number {
  const s = SLITC_2025_2026;
  const adults = isCoupled ? 2 : 1;
  const childCount = Math.min(numChildren, s.maxChildren);
  const maxBenefit = s.perAdult * adults + s.perChild * childCount;
  if (afni <= s.phaseOutThreshold) return maxBenefit;
  const reduction = (afni - s.phaseOutThreshold) * s.phaseOutRate;
  return Math.max(0, maxBenefit - reduction);
}

// ── NS Affordable Living Tax Credit (NSALTC) ─────────────────────────────────

/**
 * Nova Scotia Affordable Living Tax Credit — 2025–26 benefit year.
 * $255/single adult + $60/child; phases out at 5% above $30,000 AFNI.
 *
 * Sources:
 *   Nova Scotia Department of Finance — NSALTC
 *   CRA — Provincial and territorial programs, Province of Nova Scotia
 */
export const NSALTC_2025_2026 = {
  benefitYear: "2025-07 to 2026-06",
  perAdult: 255,
  perChild: 60,
  phaseOutThreshold: 30_000,
  phaseOutRate: 0.05,
} as const;

export function calculateNSALTC(afni: number, numChildren: number): number {
  const max = NSALTC_2025_2026.perAdult + NSALTC_2025_2026.perChild * numChildren;
  return Math.max(0, max - NSALTC_2025_2026.phaseOutRate * Math.max(0, afni - NSALTC_2025_2026.phaseOutThreshold));
}

// ── Nova Scotia Child Benefit (NSCB) ─────────────────────────────────────────

/**
 * Nova Scotia Child Benefit — N.S. Reg. 62/1998 under Income Tax Act (NS) s.80.
 * CRA-administered alongside CCB. $1,525 per qualified dependant per year,
 * reduced monthly based on AFNI:
 *   AFNI < $26,000: full benefit
 *   AFNI $26,000–$33,999: first child full; subsequent children at 50%
 *   AFNI ≥ $34,000: only first child's $1,525 remains
 *
 * Shared custody: 50/50 split per ITA s.122.61(3) via NSCB Regs s.5(2).
 *
 * Sources:
 *   N.S. Reg. 62/1998 — Nova Scotia Child Benefit Regulations
 *   CRA — Provincial and territorial programs, Province of Nova Scotia
 */
export const NSCB_2025_2026 = {
  benefitYear: "2025-07 to 2026-06",
  perChild: 1_525,
  lowerThreshold: 26_000,
  upperThreshold: 34_000,
} as const;

export function calculateNSCB(afni: number, numChildren: number): number {
  if (numChildren <= 0) return 0;
  const n = NSCB_2025_2026;
  if (afni < n.lowerThreshold) {
    return n.perChild * numChildren;
  }
  if (afni < n.upperThreshold) {
    // First child full; additional children at 50%.
    return n.perChild + n.perChild * 0.5 * (numChildren - 1);
  }
  // AFNI ≥ $34,000: only first child's amount.
  return n.perChild;
}

// ── PEI Sales Tax Credit ──────────────────────────────────────────────────────

/**
 * Prince Edward Island Sales Tax Credit — 2026.
 * $110/individual + $55/eligible dependant; phases out at 0.5% above $30,000 AFNI.
 *
 * Sources:
 *   Government of PEI — Sales Tax Credit
 *   CRA — Provincial and territorial programs, Province of PEI
 */
export const PE_SALES_TAX_CREDIT_2026 = {
  perAdult: 110,
  perDependant: 55,
  phaseOutThreshold: 30_000,
  phaseOutRate: 0.005,
} as const;

export function calculatePESalesTaxCredit(afni: number, hasEligibleDependant: boolean): number {
  const max = PE_SALES_TAX_CREDIT_2026.perAdult + (hasEligibleDependant ? PE_SALES_TAX_CREDIT_2026.perDependant : 0);
  return Math.max(0, max - PE_SALES_TAX_CREDIT_2026.phaseOutRate * Math.max(0, afni - PE_SALES_TAX_CREDIT_2026.phaseOutThreshold));
}

// ── NL Income Supplement ──────────────────────────────────────────────────────

/**
 * Newfoundland and Labrador Income Supplement — 2026.
 * Max $520; phases out at 9% above $40,000 AFNI. No age requirement.
 *
 * Source: Government of NL — Income Supplement
 *   https://www.gov.nl.ca/fin/tax-programs-incentives/personal/income-supplement/
 */
export const NL_INCOME_SUPPLEMENT_2026 = {
  maxAmount: 520,
  phaseOutThreshold: 40_000,
  phaseOutRate: 0.09,
} as const;

export function calculateNLIncomeSupplement(afni: number): number {
  const s = NL_INCOME_SUPPLEMENT_2026;
  return Math.max(0, s.maxAmount - s.phaseOutRate * Math.max(0, afni - s.phaseOutThreshold));
}

// ── NL Seniors' Benefit ───────────────────────────────────────────────────────

/**
 * Newfoundland and Labrador Seniors' Benefit — 2026.
 * Administered jointly with the NL Income Supplement via CRA but is a
 * separate benefit with its own parameters.
 *
 * Eligibility: age 64 or over by December 31 of the taxation year.
 * Max: $1,551 (indexed to CPI effective July 2025, per NL Budget 2025).
 * Phase-out: 11.66% of family net income above $30,078, fully phased out
 * at $43,380.
 *
 * Source: Government of NL — Seniors' Benefit (same page as Income Supplement)
 *   https://www.gov.nl.ca/fin/tax-programs-incentives/personal/income-supplement/
 */
export const NL_SENIORS_BENEFIT_2026 = {
  maxAmount: 1_551,
  phaseOutThreshold: 30_078,
  phaseOutEnd: 43_380,
  phaseOutRate: 0.1166,
  eligibleAge: 64,
} as const;

export function calculateNLSeniorsBenefit(afni: number, age: number): number {
  const s = NL_SENIORS_BENEFIT_2026;
  if (age < s.eligibleAge) return 0;
  if (afni <= s.phaseOutThreshold) return s.maxAmount;
  if (afni >= s.phaseOutEnd) return 0;
  return Math.max(0, s.maxAmount - s.phaseOutRate * (afni - s.phaseOutThreshold));
}
