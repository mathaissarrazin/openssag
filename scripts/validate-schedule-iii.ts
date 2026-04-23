/**
 * Validation for FCSG Schedule III adjustments in totalGuidelinesIncome().
 *
 * Each test starts from the same baseline spouse shape and flips one field,
 * asserting that Guidelines income moves by exactly the expected amount in
 * the expected direction.
 *
 * Run: npx tsx scripts/validate-schedule-iii.ts
 */

import { totalGuidelinesIncome, NON_TAXABLE_GROSS_UP } from "../lib/spousal-support/section-7";

interface Spouse {
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
}

const BASE: Spouse = { grossIncome: 100_000 };
const BASE_GL = totalGuidelinesIncome(BASE);

interface Case {
  name: string;
  mutation: Partial<Spouse>;
  expectedDelta: number;
  citation: string;
}

const AMOUNT = 5_000;

const cases: Case[] = [
  // Additions already in engine
  { name: "otherIncome +5,000", mutation: { otherIncome: AMOUNT }, expectedDelta: +AMOUNT, citation: "FCSG s.16" },
  { name: "rrspWithdrawals +5,000", mutation: { rrspWithdrawals: AMOUNT }, expectedDelta: +AMOUNT, citation: "FCSG s.16" },
  { name: "capitalGainsActual +5,000", mutation: { capitalGainsActual: AMOUNT }, expectedDelta: +AMOUNT, citation: "FCSG Sch. III §6" },
  { name: "selfEmploymentIncome +5,000", mutation: { selfEmploymentIncome: AMOUNT }, expectedDelta: +AMOUNT, citation: "FCSG s.16" },
  { name: "pensionIncome +5,000", mutation: { pensionIncome: AMOUNT }, expectedDelta: +AMOUNT, citation: "FCSG s.16" },
  { name: "eligibleDividends +5,000 (actual, not grossed-up)", mutation: { eligibleDividends: AMOUNT }, expectedDelta: +AMOUNT, citation: "FCSG Sch. III §5" },
  { name: "nonEligibleDividends +5,000 (actual)", mutation: { nonEligibleDividends: AMOUNT }, expectedDelta: +AMOUNT, citation: "FCSG Sch. III §5" },
  { name: "nonTaxableIncome +5,000 × 1.25 gross-up", mutation: { nonTaxableIncome: AMOUNT }, expectedDelta: +AMOUNT * NON_TAXABLE_GROSS_UP, citation: "SSAG RUG 2016 §6.6 (practitioner convention)" },

  // Prior-support deductions + received add-back
  { name: "priorSpousalSupportReceived +5,000 (taxable income stays in GL)", mutation: { priorSpousalSupportReceived: AMOUNT }, expectedDelta: +AMOUNT, citation: "Sch. III §3 excludes only current-case SS" },
  { name: "priorChildSupportPaid −5,000", mutation: { priorChildSupportPaid: AMOUNT }, expectedDelta: -AMOUNT, citation: "FCSG practice (prior family)" },
  { name: "priorSpousalSupportPaid −5,000", mutation: { priorSpousalSupportPaid: AMOUNT }, expectedDelta: -AMOUNT, citation: "FCSG practice (prior family)" },

  // New Schedule III adjustments
  { name: "unionDues −5,000", mutation: { unionDues: AMOUNT }, expectedDelta: -AMOUNT, citation: "FCSG Sch. III §1 / ITA s.8(1)(i)" },
  { name: "employmentExpensesOther −5,000", mutation: { employmentExpensesOther: AMOUNT }, expectedDelta: -AMOUNT, citation: "FCSG Sch. III §1 / ITA s.8" },
  { name: "carryingCharges −5,000", mutation: { carryingCharges: AMOUNT }, expectedDelta: -AMOUNT, citation: "FCSG Sch. III §8 / ITA s.20(1)" },
  { name: "businessInvestmentLosses −5,000 (full; tax uses 50% ABIL)", mutation: { businessInvestmentLosses: AMOUNT }, expectedDelta: -AMOUNT, citation: "FCSG Sch. III §7 / ITA s.39(1)(c)" },
  { name: "priorPeriodSelfEmploymentAdjustment −5,000", mutation: { priorPeriodSelfEmploymentAdjustment: AMOUNT }, expectedDelta: -AMOUNT, citation: "FCSG Sch. III §9 / ITA s.34.1" },
  { name: "splitPensionAddBack +5,000 (transferor)", mutation: { splitPensionAddBack: AMOUNT }, expectedDelta: +AMOUNT, citation: "FCSG Sch. III §3.1 / ITA s.60.03" },
  { name: "splitPensionTransfereeDeduct −5,000 (transferee)", mutation: { splitPensionTransfereeDeduct: AMOUNT }, expectedDelta: -AMOUNT, citation: "FCSG Sch. III §3.1 / ITA s.60.03" },
  { name: "ccpcStockOptionBenefit +5,000 (same-year disposition)", mutation: { ccpcStockOptionBenefit: AMOUNT }, expectedDelta: +AMOUNT, citation: "FCSG Sch. III §11" },
  { name: "partnershipNonArmsLengthAddBack +5,000", mutation: { partnershipNonArmsLengthAddBack: AMOUNT }, expectedDelta: +AMOUNT, citation: "FCSG Sch. III §10" },
];

// Combined case: every deduction AND every addition at once.
const combined: Spouse = {
  ...BASE,
  otherIncome: 1_000,
  rrspWithdrawals: 2_000,
  capitalGainsActual: 3_000,
  selfEmploymentIncome: 4_000,
  pensionIncome: 5_000,
  eligibleDividends: 6_000,
  nonEligibleDividends: 7_000,
  nonTaxableIncome: 8_000,
  priorSpousalSupportReceived: 9_000,
  splitPensionAddBack: 10_000,
  ccpcStockOptionBenefit: 11_000,
  partnershipNonArmsLengthAddBack: 12_000,
  splitPensionTransfereeDeduct: 500,
  unionDues: 1_100,
  employmentExpensesOther: 2_200,
  carryingCharges: 3_300,
  businessInvestmentLosses: 4_400,
  priorPeriodSelfEmploymentAdjustment: 5_500,
  priorChildSupportPaid: 6_600,
  priorSpousalSupportPaid: 7_700,
};
const expectedCombined =
  100_000
  + 1_000 + 2_000 + 3_000 + 4_000 + 5_000 + 6_000 + 7_000
  + 8_000 * NON_TAXABLE_GROSS_UP
  + 9_000 + 10_000 + 11_000 + 12_000
  - 500
  - 1_100 - 2_200 - 3_300 - 4_400 - 5_500 - 6_600 - 7_700;

let pass = 0;
let fail = 0;

console.log(`Baseline Guidelines income: $${BASE_GL.toLocaleString()}\n`);

for (const c of cases) {
  const actual = totalGuidelinesIncome({ ...BASE, ...c.mutation });
  const actualDelta = actual - BASE_GL;
  const ok = Math.abs(actualDelta - c.expectedDelta) < 0.5;
  const tag = ok ? "✓" : "✗";
  if (ok) pass++; else fail++;
  console.log(
    `${tag} ${c.name}\n    expected Δ ${c.expectedDelta >= 0 ? "+" : ""}$${c.expectedDelta.toLocaleString()}, got Δ ${actualDelta >= 0 ? "+" : ""}$${actualDelta.toLocaleString()}  [${c.citation}]`,
  );
}

const combinedActual = totalGuidelinesIncome(combined);
const combinedOK = Math.abs(combinedActual - expectedCombined) < 0.5;
console.log(
  `\n${combinedOK ? "✓" : "✗"} Combined case\n    expected $${expectedCombined.toLocaleString()}, got $${combinedActual.toLocaleString()}`,
);
if (combinedOK) pass++; else fail++;

console.log(`\n═══════════════════════════════════════════════════════════════`);
console.log(`  RESULT: ${pass}/${pass + fail} checks passed`);
console.log(`═══════════════════════════════════════════════════════════════`);

if (fail > 0) process.exit(1);
