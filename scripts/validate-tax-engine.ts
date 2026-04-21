/**
 * Tax engine validation script.
 *
 * Prints our tax engine output for a set of reference scenarios in a format
 * that's easy to cross-check against:
 *
 *   - CRA Payroll Deductions Online Calculator (PDOC)
 *     https://apps.cra-arc.gc.ca/ebci/rhpd/startLanguage.do
 *     → verifies: federal tax, BC tax, CPP, EI
 *
 *   - TaxTips.ca Canadian Tax Calculator
 *     https://www.taxtips.ca/calculators/canadian-tax/canadian-tax-calculator.htm
 *     → verifies: credit-by-credit federal + BC tax, net income
 *
 *   - CRA Child and Family Benefits Calculator
 *     https://www.canada.ca/en/revenue-agency/services/child-family-benefits/child-family-benefits-calculator.html
 *     → verifies: CCB, GST credit, BC Family Benefit
 *
 * Run: npx tsx scripts/validate-tax-engine.ts
 */

import { calculateNetIncome } from "../lib/tax/net-income";
import {
  calculateCPP,
  calculateEI,
  calculateEnhancedCPPDeduction,
} from "../lib/tax/cpp-ei-2026";
import {
  calculateCCB,
  calculateBCFamilyBenefit,
  calculateGSTCredit,
  calculateBCSalesTaxCredit,
  calculateBCTaxReductionCredit,
  calculateCWB,
} from "../lib/tax/benefits-2026";
import { calculateBracketTax } from "../lib/tax/brackets";
import { FEDERAL_2026, federalEffectiveBPA, CANADA_EMPLOYMENT_AMOUNT_2026 } from "../lib/tax/federal-2026";
import { BC_2026 } from "../lib/tax/bc-2026";

interface Scenario {
  name: string;
  description: string;
  grossIncome: number;
  childrenUnder6: number;
  children6to17: number;
  isCoupled?: boolean;
}

const SCENARIOS: Scenario[] = [
  {
    name: "S1",
    description: "$30,000 BC resident — single, no kids (tests BCTRC and low-bracket)",
    grossIncome: 30_000,
    childrenUnder6: 0,
    children6to17: 0,
  },
  {
    name: "S2",
    description: "$50,000 BC resident — single, 1 child aged 8 (tests EDC, CCB, BCFB, possibly CWB)",
    grossIncome: 50_000,
    childrenUnder6: 0,
    children6to17: 1,
  },
  {
    name: "S3",
    description: "$80,000 BC resident — single, no kids (tests first bracket boundary)",
    grossIncome: 80_000,
    childrenUnder6: 0,
    children6to17: 0,
  },
  {
    name: "S4",
    description: "$100,000 BC resident — single parent, 2 kids (1 under 6, 1 aged 10)",
    grossIncome: 100_000,
    childrenUnder6: 1,
    children6to17: 1,
  },
  {
    name: "S5",
    description: "$150,000 BC resident — single, no kids (tests 26% federal bracket)",
    grossIncome: 150_000,
    childrenUnder6: 0,
    children6to17: 0,
  },
  {
    name: "S6",
    description: "$220,000 BC resident — single, no kids (tests BPA clawback at 29% federal)",
    grossIncome: 220_000,
    childrenUnder6: 0,
    children6to17: 0,
  },
];

function fmt(n: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function printScenario(s: Scenario) {
  console.log("═════════════════════════════════════════════════════════════════");
  console.log(`  ${s.name}: ${s.description}`);
  console.log("═════════════════════════════════════════════════════════════════\n");

  const totalKids = s.childrenUnder6 + s.children6to17;

  // Taxable income = gross − enhanced CPP deduction (T1 Line 22215)
  const enhancedCPPDeduction = calculateEnhancedCPPDeduction(s.grossIncome);
  const taxableIncome = Math.max(0, s.grossIncome - enhancedCPPDeduction);

  console.log("TAXABLE INCOME");
  console.log(`  Gross income:                 ${fmt(s.grossIncome)}`);
  console.log(`  − Enhanced CPP deduction (L. 22215): ${fmt(-enhancedCPPDeduction)}`);
  console.log(`  = Taxable income:             ${fmt(taxableIncome)}`);
  console.log();

  // ── Federal tax breakdown ──
  const effectiveBPA = federalEffectiveBPA(taxableIncome);
  const fedBracket = calculateBracketTax(taxableIncome, FEDERAL_2026.brackets);
  const fedBPACredit = effectiveBPA * FEDERAL_2026.creditRate;
  const fedEDCCredit = totalKids > 0 ? effectiveBPA * FEDERAL_2026.creditRate : 0;
  const fedCEACredit = s.grossIncome > 0
    ? Math.min(CANADA_EMPLOYMENT_AMOUNT_2026, s.grossIncome) * FEDERAL_2026.creditRate
    : 0;
  const fedTax = Math.max(0, fedBracket - fedBPACredit - fedEDCCredit - fedCEACredit);

  console.log("FEDERAL TAX");
  console.log(`  Taxable income:              ${fmt(taxableIncome)}`);
  console.log(`  Bracket tax (before credits): ${fmt(fedBracket)}`);
  console.log(`  BPA credit:                   ${fmt(-fedBPACredit)}  (${effectiveBPA < FEDERAL_2026.basicPersonalAmount ? "clawback applied, eff. $" + Math.round(effectiveBPA).toLocaleString() : "$" + FEDERAL_2026.basicPersonalAmount.toLocaleString() + " × 14%"})`);
  if (fedEDCCredit > 0) console.log(`  Eligible Dependant Credit:    ${fmt(-fedEDCCredit)}`);
  console.log(`  Canada Employment Amount:     ${fmt(-fedCEACredit)}  ($${CANADA_EMPLOYMENT_AMOUNT_2026} × 14%)`);
  console.log(`  Federal tax owing:            ${fmt(fedTax)}`);
  console.log();

  // ── BC tax breakdown ──
  const bcBracket = calculateBracketTax(taxableIncome, BC_2026.brackets);
  const bcBPACredit = BC_2026.basicPersonalAmount * BC_2026.creditRate;
  const bcEDCCredit = totalKids > 0 ? BC_2026.eligibleDependantAmount * BC_2026.creditRate : 0;
  const bcTaxReduction = calculateBCTaxReductionCredit(taxableIncome);
  const bcTax = Math.max(0, bcBracket - bcBPACredit - bcEDCCredit - bcTaxReduction);

  console.log("BC TAX");
  console.log(`  Bracket tax (before credits): ${fmt(bcBracket)}`);
  console.log(`  BPA credit:                   ${fmt(-bcBPACredit)}  ($${BC_2026.basicPersonalAmount.toLocaleString()} × 5.60%)`);
  if (bcEDCCredit > 0) console.log(`  Eligible Dependant Credit:    ${fmt(-bcEDCCredit)}`);
  if (bcTaxReduction > 0) console.log(`  BC Tax Reduction Credit:      ${fmt(-bcTaxReduction)}`);
  console.log(`  BC tax owing:                 ${fmt(bcTax)}`);
  console.log();

  // ── Payroll ──
  const cpp = calculateCPP(s.grossIncome);
  const ei = calculateEI(s.grossIncome);
  console.log("PAYROLL DEDUCTIONS");
  console.log(`  CPP (CPP1 + CPP2):            ${fmt(cpp)}`);
  console.log(`  EI:                           ${fmt(ei)}`);
  console.log();

  // ── Refundable benefits ──
  const ccb = calculateCCB(s.grossIncome, s.childrenUnder6, s.children6to17);
  const bcfb = calculateBCFamilyBenefit(s.grossIncome, totalKids, true);
  const gst = calculateGSTCredit(s.grossIncome, s.isCoupled ?? false, totalKids);
  const bcStc = calculateBCSalesTaxCredit(s.grossIncome, s.isCoupled ?? false);
  const cwb = calculateCWB(s.grossIncome, s.grossIncome, totalKids > 0, s.isCoupled ?? false);

  console.log("REFUNDABLE BENEFITS");
  if (totalKids > 0) console.log(`  CCB (${s.childrenUnder6} under 6 + ${s.children6to17} aged 6-17): ${fmt(ccb)}`);
  if (totalKids > 0) console.log(`  BC Family Benefit:            ${fmt(bcfb)}  (includes $500 single-parent supp)`);
  console.log(`  GST/HST Credit:               ${fmt(gst)}`);
  console.log(`  BC Sales Tax Credit:          ${fmt(bcStc)}`);
  console.log(`  Canada Workers Benefit:       ${fmt(cwb)}  (${totalKids > 0 ? "family status" : "single status"})`);
  console.log();

  // ── Net income from integrated calc ──
  const net = calculateNetIncome({
    grossIncome: s.grossIncome,
    isCoupled: s.isCoupled ?? false,
    childrenUnder6InCare: s.childrenUnder6,
    children6to17InCare: s.children6to17,
    claimEligibleDependant: totalKids > 0,
  });
  console.log("SUMMARY (from calculateNetIncome)");
  console.log(`  Gross income:                 ${fmt(s.grossIncome)}`);
  console.log(`  − Federal tax:                ${fmt(-net.federalTax)}`);
  console.log(`  − Provincial tax:             ${fmt(-net.provincialTax)}`);
  console.log(`  − CPP:                        ${fmt(-net.cpp)}`);
  console.log(`  − EI:                         ${fmt(-net.ei)}`);
  console.log(`  + Benefits:                   ${fmt(net.netIncome - s.grossIncome + net.federalTax + net.provincialTax + net.cpp + net.ei)}`);
  console.log(`  = Net disposable income:      ${fmt(net.netIncome)}`);
  console.log();

  console.log("CROSS-CHECK AGAINST");
  console.log("  CRA PDOC   → https://apps.cra-arc.gc.ca/ebci/rhpd/startLanguage.do");
  console.log("  TaxTips.ca → https://www.taxtips.ca/calculators/canadian-tax/canadian-tax-calculator.htm");
  if (totalKids > 0) {
    console.log("  CCB / BCFB → https://www.canada.ca/en/revenue-agency/services/child-family-benefits/child-family-benefits-calculator.html");
  }
  console.log();
  console.log("  Enter the same income (+ kids if applicable, BC resident) and compare:");
  console.log("    ☐ Federal tax    ours = " + fmt(fedTax).padStart(12));
  console.log("    ☐ BC tax         ours = " + fmt(bcTax).padStart(12));
  console.log("    ☐ CPP            ours = " + fmt(cpp).padStart(12));
  console.log("    ☐ EI             ours = " + fmt(ei).padStart(12));
  if (totalKids > 0) {
    console.log("    ☐ CCB            ours = " + fmt(ccb).padStart(12));
    console.log("    ☐ BCFB           ours = " + fmt(bcfb).padStart(12));
  }
  console.log("    ☐ GST credit     ours = " + fmt(gst).padStart(12));
  console.log();
}

console.log("\n╔═══════════════════════════════════════════════════════════════════╗");
console.log("║                   TAX ENGINE VALIDATION                            ║");
console.log("║   Cross-check against CRA PDOC and TaxTips.ca                     ║");
console.log("╚═══════════════════════════════════════════════════════════════════╝\n");

for (const s of SCENARIOS) {
  printScenario(s);
}

console.log("═════════════════════════════════════════════════════════════════");
console.log("  Instructions");
console.log("═════════════════════════════════════════════════════════════════");
console.log(`
  1. Open CRA PDOC in a browser (link above).
     - Set province: British Columbia
     - Pay period: Annual
     - Enter gross income for the scenario
     - Read federal tax, BC tax, CPP, EI

  2. Open TaxTips.ca tax calculator (link above).
     - Select 2026 tax year, British Columbia
     - Enter gross income
     - Read each credit line + net

  3. For scenarios with children, open the CRA benefits calculator.
     - Enter AFNI = the gross income
     - Enter children + ages
     - Read CCB, GST credit, BC Family Benefit

  4. Compare each line to the output above. Any mismatch indicates a
     drift between the engine and the primary source and should be
     investigated.
`);
