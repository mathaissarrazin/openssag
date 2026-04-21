/**
 * Alberta tax engine validation script.
 *
 * Prints our Alberta tax engine output for a set of reference scenarios.
 * Cross-check against:
 *
 *   TaxTips.ca Canadian Tax Calculator (select 2026, Alberta)
 *   https://www.taxtips.ca/calculators/canadian-tax/canadian-tax-calculator.htm
 *
 *   CRA PDOC (select Alberta)
 *   https://apps.cra-arc.gc.ca/ebci/rhpd/startLanguage.do
 *
 *   CRA Child and Family Benefits Calculator (ACFB appears as "provincial benefit")
 *   https://www.canada.ca/en/revenue-agency/services/child-family-benefits/child-family-benefits-calculator.html
 *
 * Run: npx tsx scripts/validate-alberta-tax.ts
 */

import { calculateNetIncome } from "../lib/tax/net-income";
import {
  calculateCPP,
  calculateEI,
  calculateEnhancedCPPDeduction,
  calculateBaseCPPContribution,
} from "../lib/tax/cpp-ei-2026";
import {
  calculateCCB,
  calculateGSTCredit,
  calculateCWB,
  calculateACFB,
  ACFB_2026_2027,
  CCB_2025_2026,
  GST_CREDIT_2025_2026,
} from "../lib/tax/benefits-2026";
import { calculateBracketTax } from "../lib/tax/brackets";
import { FEDERAL_2026, federalEffectiveBPA, CANADA_EMPLOYMENT_AMOUNT_2026 } from "../lib/tax/federal-2026";
import { AB_2026 } from "../lib/tax/alberta-2026";

interface Scenario {
  name: string;
  description: string;
  grossIncome: number;
  selfEmploymentIncome?: number;
  childrenUnder6: number;
  children6to17: number;
  claimEDC?: boolean;
}

const SCENARIOS: Scenario[] = [
  {
    name: "AB-S1",
    description: "$30,000 AB resident — single, no kids (low bracket, basic credits only)",
    grossIncome: 30_000,
    childrenUnder6: 0,
    children6to17: 0,
  },
  {
    name: "AB-S2",
    description: "$60,000 AB resident — single, no kids (straddles 8%/10% bracket boundary at $61,200)",
    grossIncome: 60_000,
    childrenUnder6: 0,
    children6to17: 0,
  },
  {
    name: "AB-S3",
    description: "$80,000 AB resident — single parent, 1 child aged 8 (tests ACFB base + working)",
    grossIncome: 80_000,
    childrenUnder6: 0,
    children6to17: 1,
    claimEDC: true,
  },
  {
    name: "AB-S4",
    description: "$100,000 AB resident — single parent, 2 kids (1 under 6, 1 aged 10)",
    grossIncome: 100_000,
    childrenUnder6: 1,
    children6to17: 1,
    claimEDC: true,
  },
  {
    name: "AB-S5",
    description: "$150,000 AB resident — single, no kids (10% AB bracket, 26% federal)",
    grossIncome: 150_000,
    childrenUnder6: 0,
    children6to17: 0,
  },
  {
    name: "AB-S6",
    description: "$200,000 AB resident — single, no kids (straddles AB 12%/13% bracket)",
    grossIncome: 200_000,
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
  const totalKids = s.childrenUnder6 + s.children6to17;
  const claimEDC = s.claimEDC ?? totalKids > 0;

  console.log("═════════════════════════════════════════════════════════════════");
  console.log(`  ${s.name}: ${s.description}`);
  console.log("═════════════════════════════════════════════════════════════════\n");

  const enhancedCPPDeduction = calculateEnhancedCPPDeduction(s.grossIncome);
  const taxableIncome = Math.max(0, s.grossIncome - enhancedCPPDeduction);
  const baseCPPContribution = calculateBaseCPPContribution(s.grossIncome);
  const cpp = calculateCPP(s.grossIncome);
  const ei = calculateEI(s.grossIncome);

  console.log("TAXABLE INCOME");
  console.log(`  Gross income:                    ${fmt(s.grossIncome)}`);
  console.log(`  − Enhanced CPP deduction (L.22215): ${fmt(-enhancedCPPDeduction)}`);
  console.log(`  = Taxable income:                ${fmt(taxableIncome)}`);
  console.log();

  // Federal tax
  const effectiveBPA = federalEffectiveBPA(taxableIncome);
  const fedBracket = calculateBracketTax(taxableIncome, FEDERAL_2026.brackets);
  const fedBPACredit = effectiveBPA * FEDERAL_2026.creditRate;
  const fedEDCCredit = claimEDC ? effectiveBPA * FEDERAL_2026.creditRate : 0;
  const fedCEACredit = s.grossIncome > 0
    ? Math.min(CANADA_EMPLOYMENT_AMOUNT_2026, s.grossIncome) * FEDERAL_2026.creditRate
    : 0;
  const fedCPPCredit = baseCPPContribution * FEDERAL_2026.creditRate;
  const fedEICredit = ei * FEDERAL_2026.creditRate;
  const fedTax = Math.max(0, fedBracket - fedBPACredit - fedEDCCredit - fedCEACredit - fedCPPCredit - fedEICredit);

  console.log("FEDERAL TAX");
  console.log(`  Bracket tax:                     ${fmt(fedBracket)}`);
  console.log(`  − BPA credit ($${effectiveBPA < FEDERAL_2026.basicPersonalAmount ? "clawback" : FEDERAL_2026.basicPersonalAmount.toLocaleString()} × 15%): ${fmt(-fedBPACredit)}`);
  if (fedEDCCredit > 0) console.log(`  − Eligible Dependant Credit:     ${fmt(-fedEDCCredit)}`);
  console.log(`  − Canada Employment Amount:      ${fmt(-fedCEACredit)}`);
  console.log(`  − CPP credit:                    ${fmt(-fedCPPCredit)}`);
  console.log(`  − EI credit:                     ${fmt(-fedEICredit)}`);
  console.log(`  = Federal tax owing:             ${fmt(fedTax)}`);
  console.log();

  // Alberta provincial tax
  const abBracket = calculateBracketTax(taxableIncome, AB_2026.brackets);
  const abBPACredit = AB_2026.basicPersonalAmount * AB_2026.creditRate;
  const abEDCCredit = claimEDC ? AB_2026.eligibleDependantAmount * AB_2026.creditRate : 0;
  const abCPPCredit = baseCPPContribution * AB_2026.creditRate;
  const abEICredit = ei * AB_2026.creditRate;
  const abTax = Math.max(0, abBracket - abBPACredit - abEDCCredit - abCPPCredit - abEICredit);

  console.log("ALBERTA TAX");
  console.log(`  Bracket tax:                     ${fmt(abBracket)}`);
  console.log(`  − BPA credit ($${AB_2026.basicPersonalAmount.toLocaleString()} × 8%):  ${fmt(-abBPACredit)}`);
  if (abEDCCredit > 0) console.log(`  − Eligible Dependant Credit:     ${fmt(-abEDCCredit)}`);
  console.log(`  − CPP credit:                    ${fmt(-abCPPCredit)}`);
  console.log(`  − EI credit:                     ${fmt(-abEICredit)}`);
  console.log(`  = Alberta tax owing:             ${fmt(abTax)}`);
  console.log();

  // Payroll
  console.log("PAYROLL DEDUCTIONS");
  console.log(`  CPP (CPP1 + CPP2):               ${fmt(cpp)}`);
  console.log(`  EI:                              ${fmt(ei)}`);
  console.log();

  // Refundable benefits
  const afni = taxableIncome;
  const ccb = calculateCCB(afni, s.childrenUnder6, s.children6to17);
  const gst = calculateGSTCredit(afni, false, totalKids);
  const workingIncome = s.grossIncome + (s.selfEmploymentIncome ?? 0);
  const cwb = calculateCWB(workingIncome, afni, totalKids > 0, false);
  const acfb = totalKids > 0 ? calculateACFB(afni, workingIncome, totalKids) : 0;

  console.log("REFUNDABLE BENEFITS");
  if (totalKids > 0) {
    const ccbMax = s.childrenUnder6 * CCB_2025_2026.maxPerChildUnder6 + s.children6to17 * CCB_2025_2026.maxPerChild6to17;
    console.log(`  CCB (${s.childrenUnder6} under-6, ${s.children6to17} aged 6-17):     ${fmt(ccb)}  (max $${ccbMax.toLocaleString()})`);
    const idx = Math.min(totalKids, 4) as 1|2|3|4;
    const acfbBaseMax = ACFB_2026_2027.baseMax[idx];
    const acfbWorkMax = ACFB_2026_2027.workingMax[idx];
    console.log(`  ACFB (base + working):           ${fmt(acfb)}  (max base $${acfbBaseMax.toLocaleString()} + working $${acfbWorkMax.toLocaleString()})`);
  }
  console.log(`  GST/HST Credit:                  ${fmt(gst)}`);
  console.log(`  Canada Workers Benefit:          ${fmt(cwb)}  (${totalKids > 0 ? "family status" : "single status"})`);
  console.log();

  // Net income from engine
  const net = calculateNetIncome({
    grossIncome: s.grossIncome,
    childrenUnder6InCare: s.childrenUnder6,
    children6to17InCare: s.children6to17,
    claimEligibleDependant: claimEDC,
    province: "AB",
  });

  const totalBenefits = net.netIncome - s.grossIncome + net.federalTax + net.provincialTax + net.cpp + net.ei;

  console.log("SUMMARY (from calculateNetIncome, province=AB)");
  console.log(`  Gross income:                    ${fmt(s.grossIncome)}`);
  console.log(`  − Federal tax:                   ${fmt(-net.federalTax)}`);
  console.log(`  − Alberta tax:                   ${fmt(-net.provincialTax)}`);
  console.log(`  − CPP:                           ${fmt(-net.cpp)}`);
  console.log(`  − EI:                            ${fmt(-net.ei)}`);
  console.log(`  + Benefits (CCB/GST/CWB/ACFB):  ${fmt(totalBenefits)}`);
  console.log(`  = Net disposable income:         ${fmt(net.netIncome)}`);
  console.log();

  console.log("CROSS-CHECK ─── enter same income + Alberta in these tools:");
  console.log("  TaxTips.ca  → https://www.taxtips.ca/calculators/canadian-tax/canadian-tax-calculator.htm");
  console.log("  CRA PDOC    → https://apps.cra-arc.gc.ca/ebci/rhpd/startLanguage.do");
  if (totalKids > 0) {
    console.log("  CRA Benefits→ https://www.canada.ca/en/revenue-agency/services/child-family-benefits/child-family-benefits-calculator.html");
  }
  console.log();
  console.log("    ☐ Federal tax     ours = " + fmt(fedTax).padStart(12));
  console.log("    ☐ Alberta tax     ours = " + fmt(abTax).padStart(12));
  console.log("    ☐ CPP             ours = " + fmt(cpp).padStart(12));
  console.log("    ☐ EI              ours = " + fmt(ei).padStart(12));
  if (totalKids > 0) {
    console.log("    ☐ CCB             ours = " + fmt(ccb).padStart(12));
    console.log("    ☐ ACFB            ours = " + fmt(acfb).padStart(12));
  }
  console.log("    ☐ GST credit      ours = " + fmt(gst).padStart(12));
  console.log("    ☐ Net income      ours = " + fmt(net.netIncome).padStart(12));
  console.log();
}

console.log("\n╔══════════════════════════════════════════════════════════════════╗");
console.log("║               ALBERTA TAX ENGINE VALIDATION                      ║");
console.log("║  Cross-check against TaxTips.ca (Alberta) + CRA PDOC             ║");
console.log("╚══════════════════════════════════════════════════════════════════╝\n");

for (const s of SCENARIOS) {
  printScenario(s);
}

console.log("═════════════════════════════════════════════════════════════════");
console.log("  What to enter in TaxTips.ca:");
console.log("═════════════════════════════════════════════════════════════════");
console.log(`
  - Tax year: 2026
  - Province: Alberta
  - Employment income: [gross income for scenario]
  - Other credits to check: BPA, EDC (if kids), CPP/EI credits
  - For ACFB: use the CRA benefits calculator (set Alberta as province)

  Notes:
  - TaxTips.ca may not have 2026 AB rates yet; 2025 will be close
    (AB indexed brackets ~2% for 2026)
  - CPP/EI credits in TaxTips are sometimes shown at the combined
    federal+provincial level — check the AB-only row
  - ACFB phase-out rates (4% base / 15% working) are from CRA worksheet;
    flag any discrepancy with TaxTips
`);
