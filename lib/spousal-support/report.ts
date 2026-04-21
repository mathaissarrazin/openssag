/**
 * Generate a DetailedReport from the same inputs that produced an SSAGResult.
 *
 * This reconstructs the calculation step-by-step for transparency. It calls
 * the same underlying tax and benefit functions used by the main calculator,
 * so numbers here always match the displayed result.
 */

import type {
  DetailedReport,
  SpouseFinancialDetail,
  BenefitDetail,
  DurationDetail,
  ChildSupportDetail,
  SolverLevelDetail,
  DataSource,
  MethodologyNote,
  CustodialPayorBreakdown,
} from "@/types/ssag-detail";
import type { SSAGInput, SSAGResult } from "@/types/spousal-support";
import { yearsBetween } from "./dates";
import {
  filterDependent,
  bucketByAge,
  deriveCustodialArrangement,
  splitBucketsByParent,
  getYoungestAge,
  computeAge,
} from "./children-derivation";
import { lookupTableAmount } from "@/lib/child-support/calculator";
import { calculateSection7Shares, totalGuidelinesIncome } from "./section-7";
import {
  FEDERAL_2026,
  CANADA_EMPLOYMENT_AMOUNT_2026,
  federalEffectiveBPA,
} from "@/lib/tax/federal-2026";
import { BC_2026 } from "@/lib/tax/bc-2026";
import { AB_2026 } from "@/lib/tax/alberta-2026";
import { ON_2026 } from "@/lib/tax/ontario-2026";
import { SK_2026 } from "@/lib/tax/saskatchewan-2026";
import { MB_2026 } from "@/lib/tax/manitoba-2026";
import { NB_2026, calculateNBLowIncomeTaxReduction } from "@/lib/tax/new-brunswick-2026";
import { NS_2026, calculateNSLowIncomeTaxReduction } from "@/lib/tax/nova-scotia-2026";
import { PE_2026, calculatePELowIncomeTaxReduction } from "@/lib/tax/pei-2026";
import { NL_2026, calculateNLLowIncomeTaxReduction } from "@/lib/tax/newfoundland-2026";
import { YT_2026 } from "@/lib/tax/yukon-2026";
import { NT_2026 } from "@/lib/tax/northwest-territories-2026";
import { NU_2026 } from "@/lib/tax/nunavut-2026";
import {
  CPP_2026,
  EI_2026,
  calculateCPP,
  calculateEI,
  calculateEnhancedCPPDeduction,
  calculateBaseCPPContribution,
  calculateSelfEmployedCPP,
} from "@/lib/tax/cpp-ei-2026";
import { calculateNetIncome, PROVINCIAL_PENSION_DTC_2026, type SpousalSupportProvince } from "@/lib/tax/net-income";
import {
  CCB_2025_2026,
  BC_FAMILY_BENEFIT_2025_2026,
  GST_CREDIT_2025_2026,
  BC_SALES_TAX_CREDIT_2026,
  BC_TAX_REDUCTION_CREDIT_2026,
  CWB_2026,
  ACFB_2026_2027,
  calculateCCB,
  calculateBCFamilyBenefit,
  calculateGSTCredit,
  calculateBCSalesTaxCredit,
  calculateBCTaxReductionCredit,
  calculateCWB,
  BC_RENTERS_TAX_CREDIT_2026,
  calculateBCRentersTaxCredit,
  calculateACFB,
  OCB_2025_2026,
  calculateOCB,
  NSCB_2025_2026,
  calculateNSCB,
  OSTC_2025_2026,
  calculateOSTC,
  SLITC_2025_2026,
  calculateSLITC,
  calculateMBRefundablePersonalCredit,
  MB_RATC_2026,
  MB_REFUNDABLE_PERSONAL_CREDIT_2026,
  NSALTC_2025_2026, calculateNSALTC,
  PE_SALES_TAX_CREDIT_2026, calculatePESalesTaxCredit,
  NL_INCOME_SUPPLEMENT_2026, calculateNLIncomeSupplement,
  NL_SENIORS_BENEFIT_2026, calculateNLSeniorsBenefit,
} from "@/lib/tax/benefits-2026";
import { buildBracketTaxDetail, explainBracketTax } from "@/lib/tax/bracket-detail";

const FORMULA_LABELS: Record<SSAGResult["formula"], string> = {
  "without-child": "Without Child Support Formula (WOCF)",
  "with-child-basic": "With Child Support Formula — Basic (single primary custodian)",
  "with-child-shared": "With Child Support Formula — Shared custody (≥40% each parent)",
  "with-child-split": "With Child Support Formula — Split custody (at least one child with each parent)",
  "with-child-custodial-payor":
    "With Child Support Formula — Custodial Payor (higher earner has primary custody)",
};

const FORMULA_RATIONALE: Record<SSAGResult["formula"], string> = {
  "without-child":
    "No dependent children of the relationship. The WOCF amount is 1.5–2.0% of the Guidelines income difference (SSAG \"gross income\" per §6 = FCSG s.16 / Sch. III income) for each year of the relationship (up to 25), with a 48% net-income-equalization cap at the high end for long marriages.",
  "with-child-basic":
    "All children primarily reside with one parent, who is the lower earner. The Basic With-Child-Support Formula solves for the spousal support amount that gives the recipient a 40–46% share of the combined Individual Net Disposable Income (INDI).",
  "with-child-shared":
    "All children are in a shared-custody arrangement (each parent has at least 40% of parenting time). The Shared-Custody variant uses the same 40–46% INDI target as Basic, with child support flowing as a s.9 set-off and the Canada Child Benefit split 50/50 per CRA rules.",
  "with-child-split":
    "At least one child primarily resides with each parent. The Split-Custody variant uses the 40–46% INDI target with child support computed via split set-off (each parent's table amount for the children in the OTHER parent's care, netted).",
  "with-child-custodial-payor":
    "The primary custodial parent is also the higher earner and therefore the potential spousal support payor. The SSAG direct the practitioner to the WOCF formula applied to each party's Guidelines income (FCSG s.16 / Sch. III) reduced by their own notional child support (table amount on own income). The 40–46% INDI target of the standard With-Child-Support Formula does NOT apply here.",
};

const FORMULA_CITATION: Record<SSAGResult["formula"], string> = {
  "without-child": "SSAG Revised User's Guide 2016 §7; Final Version 2008 Ch. 7",
  "with-child-basic": "SSAG Revised User's Guide 2016 §8.3; Final Version 2008 Ch. 8",
  "with-child-shared": "SSAG Revised User's Guide 2016 §8.6; Final Version 2008 Ch. 8.5",
  "with-child-split": "SSAG Revised User's Guide 2016 §8.7; Final Version 2008 Ch. 8.6",
  "with-child-custodial-payor":
    "SSAG Final Version 2008 §8.9; Revised User's Guide 2016 §8(j)",
};

function provincialAct(p: SpousalSupportProvince): string {
  return p === "AB" ? "Alberta Personal Income Tax Act" :
         p === "ON" ? "Taxation Act, 2007 (Ontario)" :
         p === "SK" ? "The Income Tax Act, 2000 (Saskatchewan)" :
         p === "MB" ? "The Income Tax Act (Manitoba)" :
         p === "NB" ? "Income Tax Act (New Brunswick)" :
         p === "NS" ? "Income Tax Act (Nova Scotia)" :
         p === "PE" ? "Income Tax Act (Prince Edward Island)" :
         p === "NL" ? "Income Tax Act, 2000 (Newfoundland and Labrador)" :
         p === "YT" ? "Income Tax (Yukon) Act" :
         p === "NT" ? "Income Tax Act (Northwest Territories)" :
         p === "NU" ? "Income Tax Act (Nunavut)" :
         "BC Income Tax Act";
}
function provincialAuthority(p: SpousalSupportProvince): string {
  return p === "AB" ? "Alberta Treasury Board and Finance" :
         p === "ON" ? "Ontario Ministry of Finance" :
         p === "SK" ? "Saskatchewan Ministry of Finance" :
         p === "MB" ? "Manitoba Finance" :
         p === "NB" ? "New Brunswick Department of Finance" :
         p === "NS" ? "Nova Scotia Department of Finance" :
         p === "PE" ? "Prince Edward Island Department of Finance" :
         p === "NL" ? "Newfoundland and Labrador Department of Finance" :
         p === "YT" ? "Yukon Department of Finance" :
         p === "NT" ? "Government of Northwest Territories — Finance" :
         p === "NU" ? "Government of Nunavut — Finance" :
         "BC Ministry of Finance";
}
function provincialBenefitsList(p: SpousalSupportProvince): string {
  return p === "ON" ? "Ontario Child Benefit, Ontario Sales Tax Credit" :
         p === "AB" ? "Alberta Child and Family Benefit" :
         p === "SK" ? "Saskatchewan Low Income Tax Credit (SLITC)" :
         p === "MB" ? "Manitoba Renters Affordability Tax Credit, Manitoba Refundable Personal Tax Credit" :
         p === "NS" ? "NS Affordable Living Tax Credit (NSALTC)" :
         p === "PE" ? "PEI Sales Tax Credit" :
         p === "NL" ? "NL Income Supplement" :
         (p === "NB" || p === "YT" || p === "NT" || p === "NU") ? "federal CCB, GST/HST, CWB (no provincial benefits in scope)" :
         "BC Family Benefit, BC Sales Tax Credit, BC Renter's Tax Credit";
}

function buildComplianceStatement(p1: SpousalSupportProvince, p2: SpousalSupportProvince): string {
  const crossProvince = p1 !== p2;
  const taxLaw = crossProvince
    ? `the Federal Income Tax Act and each party's provincial tax act (${provincialAct(p1)} for Spouse A; ${provincialAct(p2)} for Spouse B)`
    : `the Federal Income Tax Act and ${provincialAct(p1)}`;
  const authority = crossProvince
    ? `CRA and ${provincialAuthority(p1)} / ${provincialAuthority(p2)}`
    : `CRA and ${provincialAuthority(p1)}`;
  const benefits = crossProvince
    ? `Spouse A: ${provincialBenefitsList(p1)}; Spouse B: ${provincialBenefitsList(p2)}`
    : provincialBenefitsList(p1);
  return (
    "This calculation follows the Spousal Support Advisory Guidelines (SSAG) as " +
    "published by the Department of Justice Canada — the 2008 Final Version together " +
    "with the 2016 Revised User's Guide, which are the current authorities for SSAG " +
    `calculations in Canada. Income tax is computed under ${taxLaw} for the 2026 tax ` +
    `year (brackets, non-refundable credits, and payroll deductions as published by ${authority}). ` +
    `Refundable benefits are computed for the benefit year in effect at the calculation date ` +
    `(federal: CCB, GST/HST credit, CWB; provincial: ${benefits}). ` +
    "Every numerical input, rate, and threshold is cited in the Data Sources section " +
    "below. Every SSAG methodology choice (notional child support, INDI composition, " +
    "Eligible Dependant Credit assignment, Section 7 apportionment, duration tests) " +
    "is cited in the Methodology & Citations section."
  );
}

interface AssumptionsContext {
  hasChildren: boolean;
  isShared: boolean;
  anyCoupled: boolean;
}

function buildAssumptions(
  p1: SpousalSupportProvince,
  p2: SpousalSupportProvince,
  ctx: AssumptionsContext,
): string[] {
  const base = [
    "Income types supported: T4 employment, self-employment (CPP both shares), pension income (qualifying for pension income credit), eligible dividends (38% gross-up, federal and provincial DTC applied), non-eligible dividends (15% gross-up, DTC applied), other taxable income (interest/rental/EI regular), RRSP/RRIF withdrawals, and capital gains (50% inclusion). CPP, EI, and Canada Employment Amount applied on T4 income.",
    "Social assistance (Ontario Works, ODSP, AISH, BC Income/Disability Assistance, and any similarly-named provincial or territorial assistance) must NOT be entered as income. SSAG excludes these per the 2016 Revised User's Guide, Ch. 2(d) — including social assistance in a recipient's income understates spousal support. If your situation includes such income, exclude it from every income field before running the calculation.",
    "Union / professional dues are deducted only when entered by the user.",
  ];
  if (ctx.anyCoupled) {
    base.push(
      "Re-partnering: if a party is living with a new partner, the spousal amount credit (T1 Line 30300) is applied and the Eligible Dependant Credit (Line 30400) is suppressed — the two are mutually exclusive. Partner net income reduces the claimable spousal amount dollar-for-dollar from the partner's first dollar, zeroing out when partner income reaches the Basic Personal Amount. If the toggle is off, each party is computed as unattached.",
      "Refundable benefits for re-partnered parties: coupled base rates (e.g. GST/HST $698 vs $349, CCB family base) are applied, but adjusted family net income is approximated by the claimant's own taxable income rather than the couple's combined AFNI. This avoids circularity with the new partner's income and reflects the industry standard. See Methodology & Citations for the full discussion, including the three options and the `benefitsConvention` override that selects between them.",
    );
  }
  if (ctx.hasChildren) {
    base.push(
      "Section 7 expenses are entered as a single household-level monthly total and apportioned proportionally to each party's Guidelines income (all taxable sources per Federal Child Support Guidelines s.7(2) and Schedule III, not gross employment income alone).",
      "\"Notional child support\" = the Federal Child Support Guidelines table amount computed on each party's own income for the total number of children. It is a hypothetical number SSAG uses as an input to the INDI (Individual Net Disposable Income) calculation — distinct from the actual child support amount that flows between the parties (if any).",
    );
  }
  if (ctx.hasChildren && ctx.isShared) {
    base.push(
      "Canada Child Benefit is split 50/50 in shared custody per CRA rules; each parent's share is computed on their own adjusted family net income.",
    );
  }
  const uniqueProvinces = [...new Set([p1, p2])];
  const renterProvinces = uniqueProvinces.filter((p) => p === "BC" || p === "MB");
  if (renterProvinces.length > 0) {
    const creditNames = renterProvinces
      .map((p) => (p === "BC" ? "BC Renter's Tax Credit" : "Manitoba Renters Affordability Tax Credit"))
      .join(" and ");
    base.push(
      `Tenant assumption: each party is treated as a renter for applicable provincial rent credits (${creditNames}). Owner-occupiers would not receive these credits.`,
    );
  }
  for (const p of uniqueProvinces) {
    if (p === "BC" && ctx.hasChildren && ctx.isShared) {
      base.push(
        "BC Family Benefit is split 50/50 in shared custody per BC Gov rules.",
      );
    } else if (p === "AB" && ctx.hasChildren) {
      base.push(
        "Alberta Child and Family Benefit (ACFB) is awarded to the custodial parent only (no CRA shared-custody split rule for ACFB).",
      );
    } else if (p === "SK") {
      base.push(
        "The Saskatchewan Low Income Tax Credit (SLITC) is a quarterly refundable provincial benefit computed on AFNI.",
      );
    } else if (p === "MB" && ctx.hasChildren) {
      base.push(
        "Manitoba has no provincial child benefit administered through the CRA tax return (the Manitoba Child Benefit is administered directly by Manitoba Family Services).",
      );
    } else if (p === "NB" && ctx.hasChildren) {
      base.push("New Brunswick has no provincial child benefit administered through the CRA tax return.");
    } else if (p === "NS") {
      base.push("The Nova Scotia Affordable Living Tax Credit (NSALTC) is included; it phases out above $30,000 AFNI.");
    } else if (p === "PE") {
      base.push("The PEI Sales Tax Credit is included; it phases out above $30,000 AFNI.");
    } else if (p === "NL") {
      base.push("The NL Income Supplement is included; it phases out above $40,000 AFNI.");
    } else if (p === "YT" || p === "NT" || p === "NU") {
      base.push(`${provincialAuthority(p)} administers territory-specific benefits; only the federal CCB, GST/HST credit, and CWB are computed here.`);
    } else if (p === "ON") {
      if (ctx.hasChildren && ctx.isShared) {
        base.push(
          "Ontario Child Benefit (OCB) is split 50/50 in shared custody per CRA rules.",
        );
      }
      base.push(
        "Ontario Energy and Property Tax Credit (OEPTC) is excluded — it depends on rent paid and property tax values that are not collected by this calculator. Ontario Sales Tax Credit (OSTC) is included.",
      );
    }
  }
  return base;
}

function buildMethodologyNotes(
  formula: SSAGResult["formula"],
  arrangement: "sole" | "shared" | "split" | null,
  p1: SpousalSupportProvince,
  p2: SpousalSupportProvince,
): MethodologyNote[] {
  const notes: MethodologyNote[] = [];
  const crossProvince = p1 !== p2;

  // Core INDI composition — universal to all WCF variants
  if (formula !== "without-child") {
    const benefitsLabel = (p: SpousalSupportProvince) =>
      p === "AB" ? "CCB, ACFB, GST/HST, CWB" :
      p === "ON" ? "CCB, OCB, GST/HST, CWB, OSTC" :
      p === "SK" ? "CCB, SLITC, GST/HST, CWB" :
      p === "MB" ? "CCB, GST/HST, CWB, MB RATC, MB Refundable Personal Credit" :
      p === "NS" ? "CCB, NSALTC, GST/HST, CWB" :
      p === "PE" ? "CCB, PEI STC, GST/HST, CWB" :
      p === "NL" ? "CCB, NL Income Supplement, GST/HST, CWB" :
      (p === "NB" || p === "YT" || p === "NT" || p === "NU") ? "CCB, GST/HST, CWB" :
      "CCB, BCFB, GST/HST, CWB, BC Sales Tax Credit, BC Renter's Tax Credit";
    const taxLabel = (p: SpousalSupportProvince) =>
      p === "AB" ? "Alberta" : p === "ON" ? "Ontario" : p === "SK" ? "Saskatchewan" :
      p === "MB" ? "Manitoba" : p === "NB" ? "New Brunswick" : p === "NS" ? "Nova Scotia" :
      p === "PE" ? "Prince Edward Island" : p === "NL" ? "Newfoundland and Labrador" :
      p === "YT" ? "Yukon" : p === "NT" ? "Northwest Territories" : p === "NU" ? "Nunavut" : "BC";
    const indiBody = crossProvince
      ? `Each party's INDI is: federal + respective provincial after-tax income (after CPP/EI and all ` +
        `non-refundable credits) + refundable benefits received (Spouse A: ${benefitsLabel(p1)}; ` +
        `Spouse B: ${benefitsLabel(p2)}) ` +
        "− their notional child support contribution − their own proportional share of Section 7 expenses."
      : `Each party's INDI is: federal + ${taxLabel(p1)} after-tax income (after CPP/EI and all ` +
        `non-refundable credits) + refundable benefits received (${benefitsLabel(p1)}) ` +
        "− their notional child support contribution − their own proportional share of Section 7 expenses.";
    notes.push({
      title: "Individual Net Disposable Income (INDI)",
      body: indiBody,
      citation: "SSAG Final Version 2008 §8.3.1; Revised User's Guide 2016 §8.3",
    });

    notes.push({
      title: "Notional child support in INDI",
      body:
        "Each party subtracts the Federal Child Support Guidelines Schedule I table " +
        "amount on THEIR OWN income for all children of the relationship — not the " +
        "actual child support flowing between the parties. This is the SSAG 'Basic " +
        "WCF' convention and applies uniformly to Basic, Shared, Split, and " +
        "Custodial-Payor variants when computing INDI.",
      citation: "SSAG Final Version 2008 §8.3.1; Revised User's Guide 2016 §8.3 & §8.6",
    });

    notes.push({
      title: "Refundable benefits for re-partnered parties",
      body:
        "When a party is living with a new partner, their refundable federal and " +
        "provincial benefits (CCB, GST/HST credit, CWB, provincial child and sales " +
        "tax credits) are computed using COUPLED base rates and phase-out thresholds " +
        "but the claimant's OWN taxable income as the adjusted family net income " +
        "(AFNI) input — not the combined household AFNI that CRA would actually use. " +
        "Three options exist: (1) full CRA reality (couple base + combined AFNI), " +
        "(2) coupled base + claimant-only AFNI (this calculator's default), (3) full " +
        "unattached (single base + claimant AFNI). Option 2 is the industry " +
        "standard because it avoids circularity with the new partner's income " +
        "(which may itself be affected by the SS flow) while still honouring that " +
        "CRA pays benefits at coupled rates. The SSAG text is silent on this " +
        "sub-mechanic. CCB is by far the largest-dollar benefit affected: a " +
        "re-partnering with a high-income new partner can reduce CCB by thousands " +
        "of dollars annually under Option 1 but would not be reflected here. Option " +
        "1 or 3 can be selected per spouse via the `benefitsConvention` override " +
        "when warranted.",
      citation:
        "SSAG silent on sub-mechanic; industry-standard convention. " +
        "ITA s.122.6 (CCB definition of adjusted income).",
    });

    // CCB treatment
    if (arrangement === "shared") {
      const sharedCCBBody = crossProvince
        ? "In shared-custody arrangements each parent is treated by CRA as receiving " +
          "50% of the CCB that would be payable if they were the sole custodian, " +
          "computed on their own adjusted family net income. Provincial child benefits " +
          "follow each party's province of residence rules."
        : p1 === "AB"
          ? "In shared-custody arrangements each parent is treated by CRA as receiving " +
            "50% of the CCB that would be payable if they were the sole custodian, " +
            "computed on their own adjusted family net income. The Alberta Child and " +
            "Family Benefit (ACFB) does not have a CRA shared-custody split rule; " +
            "ACFB is awarded to the primary caregiver only."
          : p1 === "ON"
            ? "In shared-custody arrangements each parent is treated by CRA as receiving " +
              "50% of the CCB and Ontario Child Benefit (OCB) that would be payable if " +
              "they were the sole custodian, computed on their own adjusted family net income."
            : p1 === "SK"
              ? "In shared-custody arrangements each parent is treated by CRA as receiving " +
                "50% of the CCB that would be payable if they were the sole custodian, " +
                "computed on their own adjusted family net income. The SLITC is a quarterly " +
                "refundable benefit and is computed on the parent's AFNI."
              : p1 === "MB"
                ? "In shared-custody arrangements each parent is treated by CRA as receiving " +
                  "50% of the CCB that would be payable if they were the sole custodian, " +
                  "computed on their own adjusted family net income. Manitoba has no provincial " +
                  "child benefit through CRA; the RATC and Refundable Personal Credit are " +
                  "individual (not child-based) benefits."
                : (p1 === "NB" || p1 === "NS" || p1 === "PE" || p1 === "NL" || p1 === "YT" || p1 === "NT" || p1 === "NU")
                  ? `In shared-custody arrangements each parent is treated by CRA as receiving ` +
                    `50% of the CCB that would be payable if they were the sole custodian, ` +
                    `computed on their own adjusted family net income. ${provincialBenefitsList(p1)} ` +
                    `are computed on the individual parent's income.`
                  : "In shared-custody arrangements each parent is treated by CRA as receiving " +
                    "50% of the CCB that would be payable if they were the sole custodian, " +
                    "computed on their own adjusted family net income. The BC Family Benefit " +
                    "follows the same 50/50 rule. Both amounts are included in each parent's " +
                    "net income for SSAG INDI purposes.";
      notes.push({
        title: "Canada Child Benefit in shared custody",
        body: sharedCCBBody,
        citation: "Income Tax Act s.122.61(1.1); CRA — CCB shared custody rule",
      });
    }

    // EDC convention
    if (arrangement === "sole") {
      notes.push({
        title: "Eligible Dependant Credit (Line 30400)",
        body:
          "The custodial parent is entitled to claim the Eligible Dependant Credit " +
          "for one of the children. Federal and BC ED amounts are applied as " +
          "non-refundable credits at the lowest bracket rate.",
        citation: "Income Tax Act s.118(1)(b); CRA Line 30400",
      });
    } else if (arrangement === "shared") {
      notes.push({
        title: "Eligible Dependant Credit in shared custody",
        body:
          "In shared custody, ITA s.118(5) bars the net child-support payer from " +
          "claiming the Eligible Dependant Credit in respect of a child for whom " +
          "they pay a support amount. Where spouses elect to treat the s.9 set-off " +
          "such that neither is the 'net payer' (a valid tax-planning approach " +
          "under s.118(5.1)), either parent may claim the EDC for one of the " +
          "children, provided only one party claims per child per year. This " +
          "calculator defaults to assigning the EDC claim to the spousal-support " +
          "recipient (the lower earner) for deterministic output — a calculator " +
          "convention, not an SSAG or ITA rule. Rotating the claim year-to-year " +
          "or assigning differently by agreement is a valid alternative not " +
          "captured here.",
        citation: "Income Tax Act s.118(5) and s.118(5.1); CRA Line 30400",
      });
    } else if (arrangement === "split") {
      notes.push({
        title: "Eligible Dependant Credit in split custody",
        body:
          "In split custody the net child-support payor is statutorily barred from " +
          "claiming the Eligible Dependant Credit for the year. The SS recipient " +
          "(who is also the net CS recipient here) is therefore the sole EDC " +
          "claimant.",
        citation: "Income Tax Act s.118(5); CRA Line 30400",
      });
    } else if (formula === "with-child-custodial-payor") {
      notes.push({
        title: "Eligible Dependant Credit — custodial payor variant",
        body:
          "The spousal support recipient here is the non-custodial parent and " +
          "cannot claim the Eligible Dependant Credit. The custodial SS payor " +
          "claims EDC as the sole custodian.",
        citation: "Income Tax Act s.118(1)(b); CRA Line 30400",
      });
    }

    // Section 7
    notes.push({
      title: "Section 7 (special/extraordinary) apportionment",
      body:
        "Section 7 expenses are apportioned proportionally to each party's " +
        "Guidelines income (all taxable sources per Federal Child Support " +
        "Guidelines s.7(2) and Schedule III — not gross employment income " +
        "alone). Each party's share is deducted from their INDI. Net-of-tax " +
        "apportionment (rather than Guidelines-income proportion) is " +
        "occasionally argued by counsel; that variation is out of scope here.",
      citation: "Federal Child Support Guidelines s.7(1)–(2) & Schedule III; SSAG 2016 §8.4",
    });

    // Solver targets
    if (formula !== "with-child-custodial-payor") {
      notes.push({
        title: "SSAG target: 40 / 43 / 46% of combined INDI",
        body:
          "The With-Child-Support Formula finds the spousal support amount " +
          "that gives the recipient 40% (low), 43% (mid), and 46% (high) of the " +
          "parties' combined INDI. The target band is stated in the SSAG itself.",
        citation: "SSAG Final Version 2008 §8.3; Revised User's Guide 2016 §8.3",
      });
    } else {
      notes.push({
        title: "Custodial Payor amount: hybrid formula built on WOCF",
        body:
          "The Custodial-Payor variant is a hybrid: it uses the Without-Child-" +
          "Support Formula (1.5–2.0% × adjusted Guidelines income difference × " +
          "years) but applied to each party's Guidelines income (FCSG s.16 / " +
          "Sch. III; SSAG terms this \"gross income\") reduced by their own " +
          "notional child support — i.e., WOCF mechanics on a child-support-" +
          "adjusted gross. The standard 40–46% INDI target does NOT apply to " +
          "this variant; the INDI figures displayed for this variant are " +
          "informational.",
        citation: "SSAG Final Version 2008 §8.9; Revised User's Guide 2016 §8(j)",
      });
      notes.push({
        title: "Assumption: spousal support recipient pays child support",
        body:
          "This calculation assumes the spousal support recipient is paying the " +
          "stated child support amount to the custodial payor. Per SSAG 2016 " +
          "RUG Chapter 2(i), if the custodial payor has chosen not to claim " +
          "child support from the recipient, the Custodial Payor formula must " +
          "be adjusted — the grossed-up deduction of CS on the recipient's " +
          "side should be removed. Without this adjustment the SSAG range " +
          "overstates the appropriate amount. Consult a family lawyer if this " +
          "applies.",
        citation: "SSAG Revised User's Guide 2016 Ch. 2(i)",
      });
    }

    if (formula === "with-child-split") {
      notes.push({
        title: "Assumption: higher-income parent claims split-set-off child support",
        body:
          "This calculation assumes the higher-income parent is claiming child " +
          "support from the lower-income parent (the split set-off amount). " +
          "Per SSAG 2016 RUG §8(g), if the higher-income spouse is not claiming " +
          "child support, an adjustment must be made to avoid overstating the " +
          "SSAG range. Consult a family lawyer if this applies.",
        citation: "SSAG Revised User's Guide 2016 §8(g)",
      });
    }
  }

  // Duration rules — universal
  notes.push({
    title: "Duration — length-of-marriage test",
    body:
      "Duration under the SSAG is expressed as a range: 0.5 to 1.0 years per year " +
      "of relationship (cohabitation + marriage combined). Support is indefinite " +
      "where the relationship is 20 years or longer, or where the Rule of 65 is " +
      "met (years of relationship + recipient's age at separation ≥ 65 and the " +
      "relationship was ≥ 5 years).",
    citation: "SSAG Final Version 2008 §7.5.2 and §8.5; Revised User's Guide 2016 §7",
  });

  if (formula !== "without-child" && formula !== "with-child-custodial-payor") {
    notes.push({
      title: "Duration — age-of-children test (WCF only)",
      body:
        "For the With-Child-Support Formula where the recipient is the caregiver, " +
        "duration low-end equals years until the youngest child is 5 (start of " +
        "full-time school) and high-end equals years until the youngest child is " +
        "18. The longer of this test and the length-of-marriage test applies at " +
        "each end.",
      citation: "SSAG Final Version 2008 §8.5; Revised User's Guide 2016 §8.5",
    });
  }

  notes.push({
    title: "Duration marks the end of entitlement, not a timer",
    body:
      "Duration under the SSAG expresses the point at which spousal support " +
      "stops, even if an income disparity remains between the spouses. Duration " +
      "ranges are subject to variation, review, restructuring, and the " +
      "exceptions framework — they are not a fixed countdown that resets with " +
      "income changes.",
    citation: "SSAG Revised User's Guide 2016 Chapter 3(e)",
  });

  notes.push({
    title: "Entitlement",
    body:
      "The SSAG calculates amount and duration assuming entitlement to spousal " +
      "support already exists. Entitlement must be established first, on a " +
      "compensatory, non-compensatory, or contractual basis. Income disparity " +
      "alone does not establish entitlement. A non-zero SSAG range does NOT " +
      "mean entitlement exists. Discuss with a family lawyer before relying on " +
      "these numbers.",
    citation: "SSAG Revised User's Guide 2016 Chapter 2(b)",
  });

  notes.push({
    title: "The mid-point is not the default",
    body:
      "The SSAG generates a range for amount (low / mid / high). The mid-point " +
      "is NOT the default or 'correct' answer — RUG 2016 Chapter 9 specifically " +
      "warns against treating it as such, particularly under the With-Child- " +
      "Support Formula. The range is a negotiation starting point; location " +
      "within the range must be justified on the facts.",
    citation: "SSAG Revised User's Guide 2016 Chapter 9",
  });

  notes.push({
    title: "Location within the range — factors to consider",
    body:
      "RUG 2016 Chapter 9 lists non-exclusive factors for choosing where to " +
      "locate within the SSAG range: (1) strength of any compensatory claim; " +
      "(2) recipient's needs; (3) age, number, needs, and standard of living " +
      "of children; (4) needs and ability to pay of the payor; (5) work " +
      "incentives for the payor; (6) property division and debts; (7) self- " +
      "sufficiency incentives. This calculator cannot determine location " +
      "automatically — use this list as a checklist when negotiating or " +
      "advocating for a specific amount in the range.",
    citation: "SSAG Revised User's Guide 2016 Chapter 9",
  });

  notes.push({
    title: "Restructuring: trading amount against duration",
    body:
      "The SSAG explicitly permit restructuring — trading amount against " +
      "duration within a global range (amount × duration). A higher monthly " +
      "amount for a shorter period, or a lower monthly amount for a longer " +
      "period, may be globally equivalent and better suit a case's " +
      "circumstances. This calculator presents the formula output only; " +
      "restructuring is a negotiation tool applied on top of these numbers.",
    citation: "SSAG Revised User's Guide 2016 Chapter 10",
  });

  notes.push({
    title: "Non-taxable income — grossed up at 25% into Guidelines income",
    body:
      "Non-taxable income entered for either party (workers' compensation, " +
      "on-reserve employment income, long-term disability benefits, and " +
      "similar sources) is multiplied by 1.25 and added to Guidelines " +
      "income for WOCF / Custodial-Payor GID, Section 7 apportionment, and " +
      "child-support table lookups. The 25% default follows SSAG RUG §6.6 / " +
      "FCSG Sch. III §19 as an approximation of the party's marginal rate. " +
      "For WCF INDI, the raw (un-grossed) amount is added to net disposable " +
      "income, since it is already cash-in-hand. Social assistance remains " +
      "excluded per RUG Ch. 2(d) and must NOT be entered here. Where a " +
      "party's marginal rate differs materially from 25%, adjust the " +
      "entered amount or consult a family lawyer or accountant.",
    citation: "SSAG Revised User's Guide 2016 §6.6; FCSG Schedule III §19",
  });

  if (formula !== "without-child") {
    notes.push({
      title: "Government child benefits are treated as income for SSAG",
      body:
        "Under the With-Child-Support Formula, child-related government " +
        "benefits (Canada Child Benefit, provincial child benefits, GST/HST " +
        "credit child supplements) are included as income when computing INDI " +
        "for SSAG — even though these benefits are not treated as income for " +
        "Federal Child Support Guidelines table-amount purposes. The " +
        "Refundable Benefits block in this report flows into each party's " +
        "INDI accordingly.",
      citation: "SSAG Final Version 2008 §6.3–§6.4; Revised User's Guide 2016 §8(a)",
    });
  }

  notes.push({
    title: "Single Guidelines income used for both CS and SS",
    body:
      "This calculator uses one Guidelines income per party for both child " +
      "support and spousal support. SSAG §6 recognizes that in some cases the " +
      "correct income for spousal support can differ from the income used for " +
      "child support (post-separation income increases, income above the " +
      "$350,000 ceiling, different rationales for imputed income). Those " +
      "distinctions require case-specific analysis not captured here.",
    citation: "SSAG Revised User's Guide 2016 §6(g)",
  });

  notes.push({
    title: "Periodic amounts only — lump sums must be tax-discounted",
    body:
      "Amounts shown are MONTHLY PERIODIC spousal support, which is tax- " +
      "deductible for the payor and taxable for the recipient under ITA " +
      "s.56.1 / s.60.1. Lump-sum spousal support is neither deductible nor " +
      "taxable, so any lump-sum equivalent must be discounted to reflect that " +
      "tax difference. This calculator does not compute lump-sum or net " +
      "present value equivalents.",
    citation: "SSAG Revised User's Guide 2016 Chapter 2(l)",
  });

  notes.push({
    title: "Interim, variation, and review",
    body:
      "The SSAG apply to interim orders as well as initial/final orders, and " +
      "orders made under the Guidelines are subject to variation and review " +
      "on a material change in circumstances (income change, retirement, " +
      "repartnering, self-sufficiency, etc.). Any period of interim support " +
      "should be counted within the total duration. This calculator produces " +
      "a snapshot on current inputs — re-run it if circumstances change.",
    citation: "SSAG Revised User's Guide 2016 Chapter 5 and Chapter 13",
  });

  return notes;
}

/**
 * Build a spouse's financial detail using the same functions as the main calculator.
 * Mirrors calculateNetIncome + INDI logic, but captures each intermediate step.
 */
function buildSpouseDetail(params: {
  label: string;
  grossIncome: number;
  actualIncome?: number;
  isImputed: boolean;
  unionDues: number;
  spousalSupportPaid: number;
  spousalSupportReceived: number;
  otherIncome: number;
  rrspWithdrawals: number;
  capitalGainsActual: number;
  selfEmploymentIncome: number;
  pensionIncome: number;
  eligibleDividends: number;
  nonEligibleDividends: number;
  /** Raw non-taxable income; added straight to net income (no tax applied). */
  nonTaxableIncome?: number;
  childrenUnder6InCare: number;
  children6to17InCare: number;
  ccbMultiplier: number;
  isSingleParent: boolean;
  notionalChildSupportMonthly: number;
  notionalChildSupportDescription: string;
  section7Share: number;
  section7SharePercent: number;
  /** Override EDC claim. Defaults to `totalKidsInCare > 0`. */
  claimEligibleDependant?: boolean;
  edcRationale: string;
  province?: SpousalSupportProvince;
  /** Age at separation. Used for age-gated benefits (e.g. NL Seniors' Benefit). */
  age?: number;
  isCoupled?: boolean;
  newPartnerNetIncome?: number;
  overrides?: import("@/types/overrides").SpouseOverrides;
  /**
   * WOCF path: skip the notional-CS / Section 7 / INDI adjustments block
   * since INDI is not a target for the Without-Child-Support Formula.
   */
  omitNotionalAndINDI?: boolean;
  priorChildSupportPaid?: number;
  priorSpousalSupportPaid?: number;
  priorSpousalSupportReceived?: number;
  priorChildSupportReceived?: number;
}): SpouseFinancialDetail {
  const {
    label,
    grossIncome,
    actualIncome,
    isImputed,
    unionDues,
    spousalSupportPaid,
    spousalSupportReceived,
    otherIncome,
    rrspWithdrawals,
    capitalGainsActual,
    selfEmploymentIncome,
    pensionIncome,
    eligibleDividends,
    nonEligibleDividends,
    childrenUnder6InCare,
    children6to17InCare,
    ccbMultiplier,
    isSingleParent,
    notionalChildSupportMonthly,
    notionalChildSupportDescription,
    section7Share,
    section7SharePercent,
  } = params;
  const province = params.province ?? "BC";
  const age = params.age;
  const isCoupled = params.isCoupled ?? false;
  const newPartnerNetIncome = params.newPartnerNetIncome ?? 0;

  const totalKidsInCare = childrenUnder6InCare + children6to17InCare;
  const claimsEDC = params.claimEligibleDependant ?? (totalKidsInCare > 0);
  // EDC (Line 30400) and spousal amount (Line 30300) are mutually exclusive.
  // When re-partnered, the engine suppresses EDC and applies the spousal
  // credit — the displayed credit stack must mirror that.
  const effectiveClaimsEDC = claimsEDC && !isCoupled;

  // ── Taxable income composition ──
  const taxableIncomeComponents: Array<{ label: string; amount: number }> = [
    { label: "Gross income", amount: grossIncome },
  ];
  if (selfEmploymentIncome > 0)
    taxableIncomeComponents.push({
      label: "+ Self-employment income (T1 Line 13500/13700)",
      amount: selfEmploymentIncome,
    });
  if (pensionIncome > 0)
    taxableIncomeComponents.push({
      label: "+ Pension income (T1 Line 11500)",
      amount: pensionIncome,
    });
  if (otherIncome > 0)
    taxableIncomeComponents.push({
      label: "+ Other income (interest / rental / EI regular)",
      amount: otherIncome,
    });
  if (rrspWithdrawals > 0)
    taxableIncomeComponents.push({
      label: "+ RRSP / RRIF withdrawals (T1 Line 12900)",
      amount: rrspWithdrawals,
    });
  const capitalGainsTaxable = capitalGainsActual * 0.5;
  if (capitalGainsActual > 0)
    taxableIncomeComponents.push({
      label: `+ Capital gains — taxable 50% (actual $${capitalGainsActual.toLocaleString("en-CA")})`,
      amount: capitalGainsTaxable,
    });
  const eligibleDividendsGrossedUp = eligibleDividends * 1.38;
  const nonEligibleDividendsGrossedUp = nonEligibleDividends * 1.15;
  if (eligibleDividends > 0)
    taxableIncomeComponents.push({
      label: `+ Eligible dividends — grossed up 38% (actual $${eligibleDividends.toLocaleString("en-CA")})`,
      amount: eligibleDividendsGrossedUp,
    });
  if (nonEligibleDividends > 0)
    taxableIncomeComponents.push({
      label: `+ Non-eligible dividends — grossed up 15% (actual $${nonEligibleDividends.toLocaleString("en-CA")})`,
      amount: nonEligibleDividendsGrossedUp,
    });
  if (spousalSupportReceived > 0)
    taxableIncomeComponents.push({
      label: "+ Spousal support received (taxable)",
      amount: spousalSupportReceived,
    });
  if (spousalSupportPaid > 0)
    taxableIncomeComponents.push({
      label: "− Spousal support paid (deductible)",
      amount: -spousalSupportPaid,
    });
  if (unionDues > 0)
    taxableIncomeComponents.push({
      label: "− Union / professional dues",
      amount: -unionDues,
    });
  const employeeEnhancedCPP = calculateEnhancedCPPDeduction(grossIncome);
  const seCPP = calculateSelfEmployedCPP(selfEmploymentIncome, grossIncome);
  const enhancedCPPDeduction = employeeEnhancedCPP + seCPP.enhancedDeduction;
  if (enhancedCPPDeduction > 0)
    taxableIncomeComponents.push({
      label: "− Enhanced CPP deduction (T1 Line 22215)",
      amount: -enhancedCPPDeduction,
    });
  if (seCPP.employerBaseDeduction > 0)
    taxableIncomeComponents.push({
      label: "− SE CPP employer share — base (T1 Line 22200)",
      amount: -seCPP.employerBaseDeduction,
    });
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
      enhancedCPPDeduction -
      seCPP.employerBaseDeduction,
  );
  taxableIncomeComponents.push({ label: "Taxable income", amount: taxableIncome });

  // ── Payroll (computed early — base CPP and EI are non-refundable credits) ──
  const cppTotal = calculateCPP(grossIncome) + seCPP.totalContribution;
  const employmentBaseCPP = calculateBaseCPPContribution(grossIncome);
  const selfEmploymentBaseCPP = seCPP.employeeBaseForCredit;
  const baseCPPContribution = employmentBaseCPP + selfEmploymentBaseCPP;
  // CRA: Line 30800 = base CPP through employment; Line 31000 = base CPP on
  // self-employment. A party with both earnings sources claims both lines.
  const baseCPPLineLabel =
    employmentBaseCPP > 0 && selfEmploymentBaseCPP > 0
      ? "CPP contributions (base, Lines 30800 + 31000)"
      : selfEmploymentBaseCPP > 0
        ? "CPP contributions (base, Line 31000)"
        : "CPP contributions (base, Line 30800)";
  const cpp1Pensionable = Math.max(
    0,
    Math.min(grossIncome, CPP_2026.yearlyMaxPensionableEarnings) -
      CPP_2026.yearlyBasicExemption,
  );
  const cpp1 = cpp1Pensionable * CPP_2026.baseRate;
  const cpp2Earnings =
    grossIncome > CPP_2026.yearlyMaxPensionableEarnings
      ? Math.min(
          grossIncome,
          CPP_2026.yearlyAdditionalMaxPensionableEarnings,
        ) - CPP_2026.yearlyMaxPensionableEarnings
      : 0;
  const cpp2 = cpp2Earnings * CPP_2026.enhancedRate;
  // SE CPP — both employee + employer shares, base + enhanced combined.
  // Reported as a single line because CRA lines 22200/22215/31000 all stem
  // from the same SE pensionable earnings; the payroll block reconciles the
  // jump from the T4-only CPP1/CPP2 figures to the `cppTotal`.
  const selfEmploymentCPP = seCPP.totalContribution;
  const empCPP1Pen = Math.max(
    0,
    Math.min(grossIncome, CPP_2026.yearlyMaxPensionableEarnings) -
      CPP_2026.yearlyBasicExemption,
  );
  const empCPP2Pen = Math.max(
    0,
    Math.min(grossIncome, CPP_2026.yearlyAdditionalMaxPensionableEarnings) -
      CPP_2026.yearlyMaxPensionableEarnings,
  );
  const totalCPP1Pen = Math.max(
    0,
    Math.min(
      grossIncome + selfEmploymentIncome,
      CPP_2026.yearlyMaxPensionableEarnings,
    ) - CPP_2026.yearlyBasicExemption,
  );
  const totalCPP2Pen = Math.max(
    0,
    Math.min(
      grossIncome + selfEmploymentIncome,
      CPP_2026.yearlyAdditionalMaxPensionableEarnings,
    ) - CPP_2026.yearlyMaxPensionableEarnings,
  );
  const selfEmploymentCPPPensionable =
    Math.max(0, totalCPP1Pen - empCPP1Pen) + Math.max(0, totalCPP2Pen - empCPP2Pen);
  const ei = calculateEI(grossIncome);

  // ── Federal tax ──
  const effectiveBPA = federalEffectiveBPA(taxableIncome);
  const fedCredits: Array<{ label: string; baseAmount: number; rate: number; note?: string }> = [
    {
      label: "Basic Personal Amount",
      baseAmount: effectiveBPA,
      rate: FEDERAL_2026.creditRate,
      note:
        effectiveBPA < FEDERAL_2026.basicPersonalAmount
          ? taxableIncome >= 258_482
            ? `BPA clawback fully applied — taxable income $${Math.round(taxableIncome).toLocaleString()} exceeds $258,482 upper bound; enhanced portion ($${(FEDERAL_2026.basicPersonalAmount - 14_829).toLocaleString()}) fully phased out; base BPA $14,829 retained`
            : `BPA clawback applied — taxable income $${Math.round(taxableIncome).toLocaleString()} falls in the $181,440–$258,482 phase-out range; effective BPA reduced from $${FEDERAL_2026.basicPersonalAmount.toLocaleString()} to $${Math.round(effectiveBPA).toLocaleString()}`
          : undefined,
    },
  ];
  if (effectiveClaimsEDC) {
    fedCredits.push({
      label: "Eligible Dependant Credit",
      baseAmount: effectiveBPA,
      rate: FEDERAL_2026.creditRate,
      note: params.edcRationale,
    });
  }
  if (isCoupled) {
    const spousalBase = Math.max(0, effectiveBPA - newPartnerNetIncome);
    fedCredits.push({
      label: "Spousal Amount (Line 30300)",
      baseAmount: spousalBase,
      rate: FEDERAL_2026.creditRate,
      note:
        newPartnerNetIncome > 0
          ? `BPA $${Math.round(effectiveBPA).toLocaleString()} − partner net income $${newPartnerNetIncome.toLocaleString()}`
          : "BPA × credit rate (partner has no net income)",
    });
  }
  if (grossIncome > 0) {
    fedCredits.push({
      label: "Canada Employment Amount",
      baseAmount: Math.min(CANADA_EMPLOYMENT_AMOUNT_2026, grossIncome),
      rate: FEDERAL_2026.creditRate,
    });
  }
  if (baseCPPContribution > 0) {
    fedCredits.push({
      label: baseCPPLineLabel,
      baseAmount: baseCPPContribution,
      rate: FEDERAL_2026.creditRate,
    });
  }
  if (ei > 0) {
    fedCredits.push({
      label: "EI premiums (Line 31200)",
      baseAmount: ei,
      rate: FEDERAL_2026.creditRate,
    });
  }
  if (pensionIncome > 0) {
    fedCredits.push({
      label: "Pension Income Amount (Line 31400)",
      baseAmount: Math.min(pensionIncome, 2000),
      rate: FEDERAL_2026.creditRate,
      note: pensionIncome > 2000 ? `pension income $${pensionIncome.toLocaleString("en-CA")} exceeds $2,000 cap` : undefined,
    });
  }
  if (eligibleDividends > 0) {
    fedCredits.push({
      label: "Eligible Dividend Tax Credit (Line 40425)",
      baseAmount: eligibleDividendsGrossedUp,
      rate: 0.150198,
      note: `15.0198% of grossed-up eligible dividends ($${eligibleDividendsGrossedUp.toLocaleString("en-CA", { maximumFractionDigits: 0 })})`,
    });
  }
  if (nonEligibleDividends > 0) {
    fedCredits.push({
      label: "Non-Eligible Dividend Tax Credit (Line 40427)",
      baseAmount: nonEligibleDividendsGrossedUp,
      rate: 0.090301,
      note: `9.0301% of grossed-up non-eligible dividends ($${nonEligibleDividendsGrossedUp.toLocaleString("en-CA", { maximumFractionDigits: 0 })})`,
    });
  }

  const federalTax = buildBracketTaxDetail({
    jurisdiction: "federal",
    taxableIncome,
    brackets: FEDERAL_2026.brackets,
    credits: fedCredits,
  });

  // ── Provincial tax ──
  let provincialTax;

  if (province === "ON") {
    const onCredits: Array<{ label: string; baseAmount: number; rate: number; note?: string }> = [
      { label: "Basic Personal Amount", baseAmount: ON_2026.basicPersonalAmount, rate: ON_2026.creditRate },
    ];
    if (effectiveClaimsEDC) onCredits.push({ label: "Eligible Dependant Credit", baseAmount: ON_2026.eligibleDependantAmount, rate: ON_2026.creditRate });
    if (isCoupled) {
      onCredits.push({
        label: "Eligible Dependant Credit (Ontario ON428)",
        baseAmount: 0,
        rate: 0,
        note: "Not claimed — re-partnered; ITA s.118(1)(b) bars the EDC federally and provincially when cohabiting. Provincial spousal amount applies instead.",
      });
      const spousalBase = Math.max(0, ON_2026.basicPersonalAmount - newPartnerNetIncome);
      onCredits.push({
        label: "Spousal Amount (Ontario ON428)",
        baseAmount: spousalBase,
        rate: ON_2026.creditRate,
        note: newPartnerNetIncome > 0
          ? `BPA $${ON_2026.basicPersonalAmount.toLocaleString()} − partner net income $${newPartnerNetIncome.toLocaleString()}`
          : "BPA × credit rate (partner has no net income)",
      });
    }
    if (baseCPPContribution > 0) onCredits.push({ label: baseCPPLineLabel, baseAmount: baseCPPContribution, rate: ON_2026.creditRate });
    if (ei > 0) onCredits.push({ label: "EI premiums (Line 31200)", baseAmount: ei, rate: ON_2026.creditRate });
    const onPDC = PROVINCIAL_PENSION_DTC_2026.ON;
    if (pensionIncome > 0) onCredits.push({ label: "Pension Income Amount (Ontario)", baseAmount: Math.min(pensionIncome, onPDC.pensionMax), rate: onPDC.pensionRate });
    if (eligibleDividends > 0) onCredits.push({ label: "Eligible DTC (Ontario)", baseAmount: eligibleDividendsGrossedUp, rate: onPDC.dtcEligibleRate, note: `${(onPDC.dtcEligibleRate * 100).toFixed(4)}% of grossed-up amount` });
    if (nonEligibleDividends > 0) onCredits.push({ label: "Non-Eligible DTC (Ontario)", baseAmount: nonEligibleDividendsGrossedUp, rate: onPDC.dtcNonEligibleRate, note: `${(onPDC.dtcNonEligibleRate * 100).toFixed(4)}% of grossed-up amount` });

    const { lines: onBracketLines, total: onBracketTotal } = explainBracketTax(taxableIncome, ON_2026.brackets);
    const onCreditLines = onCredits.map((c) => ({ label: c.label, baseAmount: c.baseAmount, rate: c.rate, credit: c.baseAmount * c.rate, note: c.note }));
    const onCreditTotal = onCreditLines.reduce((s, c) => s + c.credit, 0);
    const onBasicTax = Math.max(0, onBracketTotal - onCreditTotal);

    const s = ON_2026.surtax;
    const onSurtax = 0.20 * Math.max(0, onBasicTax - s.threshold1) + 0.36 * Math.max(0, onBasicTax - s.threshold2);
    const onTaxBeforeLIFT = onBasicTax + onSurtax;

    const l = ON_2026.lift;
    const liftMax = Math.max(0, l.maxCredit - l.phaseOutRate * Math.max(0, taxableIncome - l.phaseOutThreshold));
    const onLIFT = Math.min(onTaxBeforeLIFT, liftMax);
    const onTaxAfterLIFT = Math.max(0, onTaxBeforeLIFT - onLIFT);

    // Ontario Health Premium (ON428 line 42) — added after LIFT
    let onOHP = 0;
    for (const tier of ON_2026.ohp.tiers) {
      if (taxableIncome <= tier.toTI) {
        onOHP = tier.base + tier.phaseInRate * (taxableIncome - tier.fromTI);
        break;
      }
    }
    if (onOHP === 0 && taxableIncome > ON_2026.ohp.tiers[ON_2026.ohp.tiers.length - 1].fromTI) {
      onOHP = ON_2026.ohp.maxPremium;
    }

    provincialTax = {
      jurisdiction: "on" as const,
      taxableIncome,
      brackets: onBracketLines,
      bracketTotal: onBracketTotal,
      credits: onCreditLines,
      creditTotal: onCreditTotal,
      taxOwed: onTaxAfterLIFT + onOHP,
      surtax: onSurtax,
      liftCredit: onLIFT,
      healthPremium: onOHP,
    };
  } else {
    const provData =
      province === "AB" ? AB_2026 :
      province === "SK" ? SK_2026 :
      province === "MB" ? MB_2026 :
      province === "NB" ? NB_2026 :
      province === "NS" ? NS_2026 :
      province === "PE" ? PE_2026 :
      province === "NL" ? NL_2026 :
      province === "YT" ? YT_2026 :
      province === "NT" ? NT_2026 :
      province === "NU" ? NU_2026 :
      BC_2026;
    const provCredits: Array<{ label: string; baseAmount: number; rate: number; note?: string }> = [
      { label: "Basic Personal Amount", baseAmount: provData.basicPersonalAmount, rate: provData.creditRate },
    ];
    if (effectiveClaimsEDC) provCredits.push({ label: "Eligible Dependant Credit", baseAmount: provData.eligibleDependantAmount, rate: provData.creditRate });
    if (isCoupled) {
      provCredits.push({
        label: `Eligible Dependant Credit (${province})`,
        baseAmount: 0,
        rate: 0,
        note: "Not claimed — re-partnered; ITA s.118(1)(b) bars the EDC federally and provincially when cohabiting. Provincial spousal amount applies instead.",
      });
      const spousalBase = Math.max(0, provData.basicPersonalAmount - newPartnerNetIncome);
      provCredits.push({
        label: `Spousal Amount (${province})`,
        baseAmount: spousalBase,
        rate: provData.creditRate,
        note: newPartnerNetIncome > 0
          ? `BPA $${provData.basicPersonalAmount.toLocaleString()} − partner net income $${newPartnerNetIncome.toLocaleString()}`
          : "BPA × credit rate (partner has no net income)",
      });
    }
    if (baseCPPContribution > 0) provCredits.push({ label: baseCPPLineLabel, baseAmount: baseCPPContribution, rate: provData.creditRate });
    if (ei > 0) provCredits.push({ label: "EI premiums (Line 31200)", baseAmount: ei, rate: provData.creditRate });
    const provPDC = PROVINCIAL_PENSION_DTC_2026[province];
    if (pensionIncome > 0) provCredits.push({ label: `Pension Income Amount (${province})`, baseAmount: Math.min(pensionIncome, provPDC.pensionMax), rate: provPDC.pensionRate });
    if (eligibleDividends > 0) provCredits.push({ label: `Eligible DTC (${province})`, baseAmount: eligibleDividendsGrossedUp, rate: provPDC.dtcEligibleRate, note: `${(provPDC.dtcEligibleRate * 100).toFixed(4)}% of grossed-up amount` });
    if (nonEligibleDividends > 0) provCredits.push({ label: `Non-Eligible DTC (${province})`, baseAmount: nonEligibleDividendsGrossedUp, rate: provPDC.dtcNonEligibleRate, note: `${(provPDC.dtcNonEligibleRate * 100).toFixed(4)}% of grossed-up amount` });
    if (province === "BC") {
      const bcTaxReduction = calculateBCTaxReductionCredit(taxableIncome);
      if (bcTaxReduction > 0) {
        provCredits.push({
          label: "BC Tax Reduction Credit",
          baseAmount: bcTaxReduction,
          rate: 1,
          note: `phases out from $${BC_TAX_REDUCTION_CREDIT_2026.fullCreditThreshold.toLocaleString()} at ${(BC_TAX_REDUCTION_CREDIT_2026.phaseOutRate * 100).toFixed(2)}%`,
        });
      }
    } else if (province === "MB") {
      const ftbBase = Math.max(0, MB_2026.familyTaxBenefit.baseAmount - MB_2026.familyTaxBenefit.phaseOutRate * taxableIncome);
      if (ftbBase > 0) {
        provCredits.push({
          label: "Manitoba Family Tax Benefit (MB428-A)",
          baseAmount: ftbBase,
          rate: MB_2026.creditRate,
          note: `$${MB_2026.familyTaxBenefit.baseAmount} base − ${(MB_2026.familyTaxBenefit.phaseOutRate * 100).toFixed(0)}% × net income; phases to $0 above ~$${Math.round(MB_2026.familyTaxBenefit.baseAmount / MB_2026.familyTaxBenefit.phaseOutRate).toLocaleString()}`,
        });
      }
    } else if (province === "NB") {
      const litr = calculateNBLowIncomeTaxReduction(taxableIncome);
      if (litr > 0) provCredits.push({ label: "NB Low-Income Tax Reduction", baseAmount: litr, rate: 1, note: `max $817; phases out 3% above $22,358` });
    } else if (province === "NS") {
      const litr = calculateNSLowIncomeTaxReduction(taxableIncome);
      if (litr > 0) provCredits.push({ label: "NS Low-Income Tax Reduction", baseAmount: litr, rate: 1, note: `max $300; phases out 5% above $15,000` });
    } else if (province === "PE") {
      const litr = calculatePELowIncomeTaxReduction(taxableIncome);
      if (litr > 0) provCredits.push({ label: "PE Low-Income Tax Reduction", baseAmount: litr, rate: 1, note: `max $200; phases out 5% above $23,000` });
    } else if (province === "NL") {
      const litr = calculateNLLowIncomeTaxReduction(taxableIncome);
      if (litr > 0) provCredits.push({ label: "NL Low-Income Tax Reduction", baseAmount: litr, rate: 1, note: `max $1,008; phases out 16% above $24,191` });
    }
    provincialTax = buildBracketTaxDetail({
      jurisdiction:
        province === "AB" ? "ab" :
        province === "SK" ? "sk" :
        province === "MB" ? "mb" :
        province === "NB" ? "nb" :
        province === "NS" ? "ns" :
        province === "PE" ? "pe" :
        province === "NL" ? "nl" :
        province === "YT" ? "yt" :
        province === "NT" ? "nt" :
        province === "NU" ? "nu" :
        "bc",
      taxableIncome,
      brackets: provData.brackets,
      credits: provCredits,
    });
  }

  // ── Benefits ──
  // AFNI and "coupled for benefits" follow the per-spouse benefitsConvention
  // override (if any). Defaults to the industry-standard "coupled base rates
  // + claimant-only AFNI" when re-partnered. Mirrors the engine logic in
  // calculateNetIncome so the detailed report matches the INDI computation.
  const benefitsConvention = params.overrides?.benefitsConvention;
  const benefitsIsCoupled = benefitsConvention === "unattached" ? false : isCoupled;
  const afni =
    benefitsConvention === "coupled-household-afni" && isCoupled
      ? taxableIncome + (newPartnerNetIncome ?? 0)
      : taxableIncome;
  const benefits: BenefitDetail[] = [];
  const benefitsConsidered: Array<{ benefitName: string; reason: string }> = [];
  const afniStr = `$${Math.round(afni).toLocaleString()}`;

  if (totalKidsInCare > 0) {
    const ccbRaw = calculateCCB(afni, childrenUnder6InCare, children6to17InCare);
    const ccbMax =
      childrenUnder6InCare * CCB_2025_2026.maxPerChildUnder6 +
      children6to17InCare * CCB_2025_2026.maxPerChild6to17;
    const ccbFinal = ccbRaw * ccbMultiplier;
    const ccbDetail: BenefitDetail = {
      benefitName: "Canada Child Benefit (CCB)",
      benefitYear: CCB_2025_2026.benefitYear,
      maxAmount: ccbMax,
      finalAmount: ccbFinal,
      multiplier: ccbMultiplier,
      notes: [
        `${childrenUnder6InCare} under 6 × $${CCB_2025_2026.maxPerChildUnder6.toLocaleString()} + ${children6to17InCare} aged 6–17 × $${CCB_2025_2026.maxPerChild6to17.toLocaleString()}`,
        ccbMultiplier === 0.5
          ? "× 0.5 multiplier (shared custody — CRA rule)"
          : "",
        ccbMax !== ccbRaw
          ? `phased down from $${ccbMax.toLocaleString()} to $${Math.round(ccbRaw).toLocaleString()} based on AFNI`
          : "",
      ].filter(Boolean),
    };
    benefits.push(ccbDetail);

    if (province === "BC") {
      const bcfbRaw = calculateBCFamilyBenefit(afni, totalKidsInCare, isSingleParent);
      const bcfbFinal = bcfbRaw * ccbMultiplier;
      const b = BC_FAMILY_BENEFIT_2025_2026;
      const bcfbMaxFull =
        (totalKidsInCare >= 1 ? b.firstChildAmount : 0) +
        (totalKidsInCare >= 2 ? b.secondChildAmount : 0) +
        (totalKidsInCare >= 3 ? b.additionalChildAmount * (totalKidsInCare - 2) : 0) +
        (isSingleParent ? b.singleParentSupplement : 0);
      const bcfbMinFull =
        (totalKidsInCare >= 1 ? b.minFirstChild : 0) +
        (totalKidsInCare >= 2 ? b.minSecondChild : 0) +
        (totalKidsInCare >= 3 ? b.minAdditionalChild * (totalKidsInCare - 2) : 0);
      benefits.push({
        benefitName: "BC Family Benefit",
        benefitYear: BC_FAMILY_BENEFIT_2025_2026.benefitYear,
        maxAmount: bcfbRaw,
        finalAmount: bcfbFinal,
        multiplier: ccbMultiplier,
        notes: [
          `tiered per-child ($${b.firstChildAmount}/$${b.secondChildAmount}/$${b.additionalChildAmount}) with guaranteed minimums`,
          isSingleParent ? "single-parent supplement included" : "",
          bcfbMaxFull !== bcfbRaw
            ? `phased down from $${bcfbMaxFull.toLocaleString()} → $${Math.round(bcfbRaw).toLocaleString()}. Schedule: (1) base $${bcfbMaxFull.toLocaleString()} at AFNI ≤ $${b.lowerThreshold.toLocaleString()}; (2) AFNI $${b.lowerThreshold.toLocaleString()}–$${b.upperThreshold.toLocaleString()}: ${(b.phaseOutRate * 100).toFixed(0)}% phase-out toward floor of $${bcfbMinFull.toLocaleString()}; (3) AFNI > $${b.upperThreshold.toLocaleString()}: ${(b.phaseOutRate * 100).toFixed(0)}% on excess from the floor`
            : `max at AFNI ≤ $${b.lowerThreshold.toLocaleString()} (phase-out begins thereafter at ${(b.phaseOutRate * 100).toFixed(0)}%)`,
          ccbMultiplier === 0.5 ? "× 0.5 shared custody" : "",
        ].filter(Boolean),
      });
    } else if (province === "AB") {
      const acfbAmount = calculateACFB(afni, grossIncome + selfEmploymentIncome, totalKidsInCare);
      if (acfbAmount > 0) {
        const totalKidsCapped = Math.min(totalKidsInCare, 4) as 1 | 2 | 3 | 4;
        benefits.push({
          benefitName: "Alberta Child and Family Benefit (ACFB)",
          benefitYear: ACFB_2026_2027.benefitYear,
          maxAmount: ACFB_2026_2027.baseMax[totalKidsCapped] + ACFB_2026_2027.workingMax[totalKidsCapped],
          finalAmount: acfbAmount,
          notes: [
            `${totalKidsInCare} child${totalKidsInCare === 1 ? "" : "ren"}; base max $${ACFB_2026_2027.baseMax[totalKidsCapped]}, working max $${ACFB_2026_2027.workingMax[totalKidsCapped]}`,
            `base phases out above $${ACFB_2026_2027.basePhaseOutThreshold.toLocaleString()} AFNI at ${(ACFB_2026_2027.basePhaseOutRate * 100).toFixed(0)}%`,
            `working phases in at ${(ACFB_2026_2027.workingPhaseInRate * 100).toFixed(0)}% over $${ACFB_2026_2027.workingPhaseInFloor.toLocaleString()} employment + self-employment income`,
          ],
        });
      } else {
        benefitsConsidered.push({
          benefitName: "Alberta Child and Family Benefit (ACFB)",
          reason: `$0 — fully phased out (base phase-out ${(ACFB_2026_2027.basePhaseOutRate * 100).toFixed(0)}% above $${ACFB_2026_2027.basePhaseOutThreshold.toLocaleString()} AFNI; working component requires employment income above $${ACFB_2026_2027.workingPhaseInFloor.toLocaleString()}) at AFNI ${afniStr}`,
        });
      }
    } else if (province === "ON") {
      // OCB — Ontario-resident claimants only (Taxation Act, 2007 Sched. A s. 104).
      const ocbRaw = calculateOCB(afni, totalKidsInCare);
      const ocbFinal = ocbRaw * ccbMultiplier;
      if (ocbFinal > 0) {
        const phaseOutRate = totalKidsInCare === 1 ? OCB_2025_2026.phaseOutRateOneChild : OCB_2025_2026.phaseOutRateTwoPlus;
        benefits.push({
          benefitName: "Ontario Child Benefit (OCB)",
          benefitYear: OCB_2025_2026.benefitYear,
          maxAmount: OCB_2025_2026.maxPerChild * totalKidsInCare,
          finalAmount: ocbFinal,
          multiplier: ccbMultiplier,
          notes: [
            `$${OCB_2025_2026.maxPerChild.toLocaleString()} × ${totalKidsInCare} child${totalKidsInCare === 1 ? "" : "ren"} = $${(OCB_2025_2026.maxPerChild * totalKidsInCare).toLocaleString()} max`,
            `phases out at ${(phaseOutRate * 100).toFixed(1)}% above $${OCB_2025_2026.phaseOutThreshold.toLocaleString()} AFNI`,
            ccbMultiplier === 0.5 ? "× 0.5 (shared custody — CRA rule)" : "",
          ].filter(Boolean),
        });
      } else {
        const phaseOutRate = totalKidsInCare === 1 ? OCB_2025_2026.phaseOutRateOneChild : OCB_2025_2026.phaseOutRateTwoPlus;
        benefitsConsidered.push({
          benefitName: "Ontario Child Benefit (OCB)",
          reason: `$0 — fully phased out (${(phaseOutRate * 100).toFixed(1)}% above $${OCB_2025_2026.phaseOutThreshold.toLocaleString()} AFNI) at AFNI ${afniStr}`,
        });
      }
    } else if (province === "NS") {
      // NSCB — N.S. Reg. 62/1998 under NS Income Tax Act s.80.
      const nscbRaw = calculateNSCB(afni, totalKidsInCare);
      const nscbFinal = nscbRaw * ccbMultiplier;
      if (nscbFinal > 0) {
        benefits.push({
          benefitName: "Nova Scotia Child Benefit (NSCB)",
          benefitYear: NSCB_2025_2026.benefitYear,
          maxAmount: NSCB_2025_2026.perChild * totalKidsInCare,
          finalAmount: nscbFinal,
          multiplier: ccbMultiplier,
          notes: [
            `$${NSCB_2025_2026.perChild.toLocaleString()} × ${totalKidsInCare} child${totalKidsInCare === 1 ? "" : "ren"} = $${(NSCB_2025_2026.perChild * totalKidsInCare).toLocaleString()} max`,
            `AFNI < $${NSCB_2025_2026.lowerThreshold.toLocaleString()}: full; $${NSCB_2025_2026.lowerThreshold.toLocaleString()}–$${NSCB_2025_2026.upperThreshold.toLocaleString()}: first child full + 50% each additional; ≥ $${NSCB_2025_2026.upperThreshold.toLocaleString()}: first child only`,
            ccbMultiplier === 0.5 ? "× 0.5 (shared custody — ITA s.122.61(3))" : "",
          ].filter(Boolean),
        });
      } else {
        benefitsConsidered.push({
          benefitName: "Nova Scotia Child Benefit (NSCB)",
          reason: `$0 — no qualified dependants in care`,
        });
      }
    }
  }

  // Refundable-benefits convention (see Methodology & Citations). For
  // re-partnered parties the default is coupled base rates + claimant-only
  // AFNI. The per-spouse `benefitsConvention` override swaps either side.
  // GSTC child component split 50/50 in shared custody per ITA s.122.5(3.1);
  // adult base is not split.
  const gstAdultOnly = calculateGSTCredit(afni, benefitsIsCoupled, 0);
  const gstFull = calculateGSTCredit(afni, benefitsIsCoupled, totalKidsInCare);
  const gstChildPortion = Math.max(0, gstFull - gstAdultOnly);
  const gstAmount = gstAdultOnly + gstChildPortion * ccbMultiplier;
  if (gstAmount > 0) {
    benefits.push({
      benefitName: "GST/HST Credit",
      benefitYear: GST_CREDIT_2025_2026.benefitYear,
      maxAmount: gstFull,
      finalAmount: gstAmount,
      multiplier: ccbMultiplier === 0.5 && gstChildPortion > 0 ? ccbMultiplier : undefined,
      notes: [
        benefitsIsCoupled
          ? `coupled base $${GST_CREDIT_2025_2026.baseCouple} + $${GST_CREDIT_2025_2026.perChild} per child; overall phase-out at ${(GST_CREDIT_2025_2026.phaseOutRate * 100).toFixed(0)}% over $${GST_CREDIT_2025_2026.phaseOutThreshold.toLocaleString()} (${benefitsConvention === "coupled-household-afni" ? "AFNI includes new partner net income" : "AFNI = claimant's own taxable income, per industry-standard convention"})`
          : `single adult base + supplement (phases in at ${(GST_CREDIT_2025_2026.singleSupplementPhaseInRate * 100).toFixed(0)}% over $${GST_CREDIT_2025_2026.singleSupplementPhaseInThreshold.toLocaleString()}) + $${GST_CREDIT_2025_2026.perChild} per child; overall phase-out at ${(GST_CREDIT_2025_2026.phaseOutRate * 100).toFixed(0)}% over $${GST_CREDIT_2025_2026.phaseOutThreshold.toLocaleString()}${isCoupled ? " (benefits convention override: unattached)" : ""}`,
        ccbMultiplier === 0.5 && gstChildPortion > 0
          ? `child component × 0.5 (shared custody — ITA s.122.5(3.1)); adult base not split`
          : "",
      ].filter(Boolean),
    });
  } else {
    benefitsConsidered.push({
      benefitName: "GST/HST Credit",
      reason: `$0 — fully phased out (${(GST_CREDIT_2025_2026.phaseOutRate * 100).toFixed(0)}% above $${GST_CREDIT_2025_2026.phaseOutThreshold.toLocaleString()} AFNI) at AFNI ${afniStr}`,
    });
  }

  if (province === "BC") {
    const bcStcAmount = calculateBCSalesTaxCredit(afni, benefitsIsCoupled);
    if (bcStcAmount > 0) {
      benefits.push({
        benefitName: "BC Sales Tax Credit",
        benefitYear: "2026",
        maxAmount: benefitsIsCoupled
          ? BC_SALES_TAX_CREDIT_2026.perAdult * 2
          : BC_SALES_TAX_CREDIT_2026.perAdult,
        finalAmount: bcStcAmount,
      });
    } else {
      benefitsConsidered.push({
        benefitName: "BC Sales Tax Credit",
        reason: `$0 — fully phased out at AFNI ${afniStr}`,
      });
    }
  } else if (province === "ON") {
    const ostcAmount = calculateOSTC(afni, benefitsIsCoupled, totalKidsInCare);
    if (ostcAmount > 0) {
      const maxOSTC = OSTC_2025_2026.perPerson * (1 + totalKidsInCare);
      benefits.push({
        benefitName: "Ontario Sales Tax Credit (OSTC)",
        benefitYear: OSTC_2025_2026.benefitYear,
        maxAmount: maxOSTC,
        finalAmount: ostcAmount,
        notes: [
          `$${OSTC_2025_2026.perPerson} × ${1 + totalKidsInCare} person${totalKidsInCare > 0 ? "s" : ""} = $${maxOSTC} max`,
          `phases out at ${(OSTC_2025_2026.phaseOutRate * 100).toFixed(0)}% above $${OSTC_2025_2026.phaseOutThreshold.toLocaleString()} AFNI`,
        ],
      });
    } else {
      benefitsConsidered.push({
        benefitName: "Ontario Sales Tax Credit (OSTC)",
        reason: `$0 — fully phased out (${(OSTC_2025_2026.phaseOutRate * 100).toFixed(0)}% above $${OSTC_2025_2026.phaseOutThreshold.toLocaleString()} AFNI) at AFNI ${afniStr}`,
      });
    }
  } else if (province === "SK") {
    const slitcAmount = calculateSLITC(afni, benefitsIsCoupled, totalKidsInCare);
    if (slitcAmount > 0) {
      const maxSLITC = SLITC_2025_2026.perAdult + SLITC_2025_2026.perChild * Math.min(totalKidsInCare, SLITC_2025_2026.maxChildren);
      benefits.push({
        benefitName: "Saskatchewan Low Income Tax Credit (SLITC)",
        benefitYear: SLITC_2025_2026.benefitYear,
        maxAmount: maxSLITC,
        finalAmount: slitcAmount,
        notes: [
          `$${SLITC_2025_2026.perAdult}/adult + $${SLITC_2025_2026.perChild} × ${Math.min(totalKidsInCare, SLITC_2025_2026.maxChildren)} child${totalKidsInCare !== 1 ? "ren" : ""} (max ${SLITC_2025_2026.maxChildren})`,
          `phases out at ${(SLITC_2025_2026.phaseOutRate * 100).toFixed(2)}% above $${SLITC_2025_2026.phaseOutThreshold.toLocaleString()} AFNI`,
        ],
      });
    } else {
      benefitsConsidered.push({
        benefitName: "Saskatchewan Low Income Tax Credit (SLITC)",
        reason: `$0 — fully phased out (${(SLITC_2025_2026.phaseOutRate * 100).toFixed(2)}% above $${SLITC_2025_2026.phaseOutThreshold.toLocaleString()} AFNI) at AFNI ${afniStr}`,
      });
    }
    // Active Families Benefit and Seniors Income Plan: not modelled because
    // eligibility turns on facts the engine does not capture (actual
    // spending on eligible child activities; OAS/GIS recipient status).
    // Surfaced here so the transparency claim is complete — practitioners
    // see every SK benefit the engine considered, not only SLITC.
    benefitsConsidered.push({
      benefitName: "Saskatchewan Active Families Benefit (SAFB)",
      reason:
        "Not modelled — refundable credit ($150/child, $200 with disability; family income ≤ $60,000) requires actual receipted spending on eligible sport, cultural, or recreational activities, which the engine does not capture. Add manually if applicable.",
    });
    benefitsConsidered.push({
      benefitName: "Saskatchewan Seniors Income Plan (SIP)",
      reason:
        "Not modelled — monthly supplement for SK residents 65+ receiving OAS/GIS below the provincial income threshold. Delivered through the Ministry of Social Services, not the tax return. Add manually if the party is a GIS recipient.",
    });
  } else if (province === "MB") {
    benefits.push({
      benefitName: "Manitoba Renters Affordability Tax Credit (RATC)",
      benefitYear: "2026",
      maxAmount: MB_RATC_2026.maxAmount,
      finalAmount: MB_RATC_2026.maxAmount,
      notes: ["Flat $625 for residential renters (tenant assumed)"],
    });
    const mbPersonalCredit = calculateMBRefundablePersonalCredit(afni);
    if (mbPersonalCredit > 0) {
      benefits.push({
        benefitName: "Manitoba Refundable Personal Tax Credit",
        benefitYear: "2026",
        maxAmount: MB_REFUNDABLE_PERSONAL_CREDIT_2026.baseAmount,
        finalAmount: mbPersonalCredit,
        notes: [
          `$${MB_REFUNDABLE_PERSONAL_CREDIT_2026.baseAmount} − ${(MB_REFUNDABLE_PERSONAL_CREDIT_2026.phaseOutRate * 100).toFixed(0)}% × AFNI`,
        ],
      });
    } else {
      benefitsConsidered.push({
        benefitName: "Manitoba Refundable Personal Tax Credit",
        reason: `$0 — fully phased out (base $${MB_REFUNDABLE_PERSONAL_CREDIT_2026.baseAmount} offset by ${(MB_REFUNDABLE_PERSONAL_CREDIT_2026.phaseOutRate * 100).toFixed(0)}% × AFNI) at AFNI ${afniStr}`,
      });
    }
  } else if (province === "NS") {
    const nsaltcAmount = calculateNSALTC(afni, totalKidsInCare);
    if (nsaltcAmount > 0) {
      benefits.push({
        benefitName: "NS Affordable Living Tax Credit (NSALTC)",
        benefitYear: NSALTC_2025_2026.benefitYear,
        maxAmount: NSALTC_2025_2026.perAdult + NSALTC_2025_2026.perChild * totalKidsInCare,
        finalAmount: nsaltcAmount,
        notes: [
          `$${NSALTC_2025_2026.perAdult} (individual) + $${NSALTC_2025_2026.perChild} × ${totalKidsInCare} child${totalKidsInCare !== 1 ? "ren" : ""}`,
          `phases out at ${(NSALTC_2025_2026.phaseOutRate * 100).toFixed(0)}% above $${NSALTC_2025_2026.phaseOutThreshold.toLocaleString()} AFNI`,
        ],
      });
    } else {
      benefitsConsidered.push({
        benefitName: "NS Affordable Living Tax Credit (NSALTC)",
        reason: `$0 — fully phased out (${(NSALTC_2025_2026.phaseOutRate * 100).toFixed(0)}% above $${NSALTC_2025_2026.phaseOutThreshold.toLocaleString()} AFNI) at AFNI ${afniStr}`,
      });
    }
  } else if (province === "PE") {
    const peSTCAmount = calculatePESalesTaxCredit(afni, effectiveClaimsEDC);
    if (peSTCAmount > 0) {
      benefits.push({
        benefitName: "PEI Sales Tax Credit",
        benefitYear: "2026",
        maxAmount: PE_SALES_TAX_CREDIT_2026.perAdult + (effectiveClaimsEDC ? PE_SALES_TAX_CREDIT_2026.perDependant : 0),
        finalAmount: peSTCAmount,
        notes: [
          `$${PE_SALES_TAX_CREDIT_2026.perAdult} individual + $${PE_SALES_TAX_CREDIT_2026.perDependant} eligible dependant`,
          `phases out at ${(PE_SALES_TAX_CREDIT_2026.phaseOutRate * 100).toFixed(1)}% above $${PE_SALES_TAX_CREDIT_2026.phaseOutThreshold.toLocaleString()} AFNI`,
        ].filter(Boolean),
      });
    } else {
      benefitsConsidered.push({
        benefitName: "PEI Sales Tax Credit",
        reason: `$0 — fully phased out (${(PE_SALES_TAX_CREDIT_2026.phaseOutRate * 100).toFixed(1)}% above $${PE_SALES_TAX_CREDIT_2026.phaseOutThreshold.toLocaleString()} AFNI) at AFNI ${afniStr}`,
      });
    }
  } else if (province === "NL") {
    const nlISAmount = calculateNLIncomeSupplement(afni);
    if (nlISAmount > 0) {
      benefits.push({
        benefitName: "NL Income Supplement",
        benefitYear: "2026",
        maxAmount: NL_INCOME_SUPPLEMENT_2026.maxAmount,
        finalAmount: nlISAmount,
        notes: [
          `max $${NL_INCOME_SUPPLEMENT_2026.maxAmount}; phases out at ${(NL_INCOME_SUPPLEMENT_2026.phaseOutRate * 100).toFixed(0)}% above $${NL_INCOME_SUPPLEMENT_2026.phaseOutThreshold.toLocaleString()} AFNI`,
        ],
      });
    } else {
      benefitsConsidered.push({
        benefitName: "NL Income Supplement",
        reason: `$0 — fully phased out (${(NL_INCOME_SUPPLEMENT_2026.phaseOutRate * 100).toFixed(0)}% above $${NL_INCOME_SUPPLEMENT_2026.phaseOutThreshold.toLocaleString()} AFNI) at AFNI ${afniStr}`,
      });
    }

    const nlsb = NL_SENIORS_BENEFIT_2026;
    const nlsbAmount = age !== undefined ? calculateNLSeniorsBenefit(afni, age) : 0;
    if (nlsbAmount > 0) {
      benefits.push({
        benefitName: "NL Seniors' Benefit",
        benefitYear: "2026",
        maxAmount: nlsb.maxAmount,
        finalAmount: nlsbAmount,
        notes: [
          `age ${age} (≥ ${nlsb.eligibleAge} by Dec 31 — eligible)`,
          `max $${nlsb.maxAmount.toLocaleString()}; phases out at ${(nlsb.phaseOutRate * 100).toFixed(2)}% of family net income above $${nlsb.phaseOutThreshold.toLocaleString()}, fully phased out at $${nlsb.phaseOutEnd.toLocaleString()}`,
        ],
      });
    } else if (age !== undefined && age < nlsb.eligibleAge) {
      benefitsConsidered.push({
        benefitName: "NL Seniors' Benefit",
        reason: `$0 — age ${age} below ${nlsb.eligibleAge}-by-Dec-31 eligibility threshold`,
      });
    } else {
      benefitsConsidered.push({
        benefitName: "NL Seniors' Benefit",
        reason: `$0 — fully phased out (${(nlsb.phaseOutRate * 100).toFixed(2)}% of AFNI above $${nlsb.phaseOutThreshold.toLocaleString()}, zero at $${nlsb.phaseOutEnd.toLocaleString()}) at AFNI ${afniStr}`,
      });
    }
  }

  const cwbAmount = calculateCWB(grossIncome + selfEmploymentIncome, afni, totalKidsInCare > 0, benefitsIsCoupled);
  if (cwbAmount > 0) {
    const isFamily = benefitsIsCoupled || totalKidsInCare > 0;
    const cwbMax = isFamily ? CWB_2026.maxFamily : CWB_2026.maxSingle;
    const cwbThreshold = isFamily
      ? CWB_2026.phaseOutThresholdFamily
      : CWB_2026.phaseOutThresholdSingle;
    const cwbWorkingIncome = grossIncome + selfEmploymentIncome;
    const cwbPhasedIn = Math.min(
      cwbMax,
      Math.max(0, (cwbWorkingIncome - CWB_2026.phaseInFloor) * CWB_2026.phaseInRate),
    );
    const cwbReduction = Math.max(0, (afni - cwbThreshold) * CWB_2026.phaseOutRate);
    const statusLabel = benefitsIsCoupled
      ? "family (coupled)"
      : totalKidsInCare > 0
        ? "family (single parent with children)"
        : "single";
    benefits.push({
      benefitName: "Canada Workers Benefit",
      benefitYear: `${CWB_2026.taxYear} tax year`,
      maxAmount: cwbMax,
      finalAmount: cwbAmount,
      notes: [
        `${statusLabel} — max $${cwbMax.toLocaleString()}`,
        cwbPhasedIn < cwbMax
          ? `phase-in: ${(CWB_2026.phaseInRate * 100).toFixed(0)}% × ($${cwbWorkingIncome.toLocaleString()} working income − $${CWB_2026.phaseInFloor.toLocaleString()}) = $${Math.round(cwbPhasedIn).toLocaleString()}`
          : `fully phased in (working income ≥ $${(CWB_2026.phaseInFloor + cwbMax / CWB_2026.phaseInRate).toLocaleString()})`,
        cwbReduction > 0
          ? `phase-out: ${(CWB_2026.phaseOutRate * 100).toFixed(0)}% × ($${Math.round(afni).toLocaleString()} AFNI − $${cwbThreshold.toLocaleString()}) = $${Math.round(cwbReduction).toLocaleString()} reduction`
          : `no phase-out (AFNI ≤ $${cwbThreshold.toLocaleString()})`,
      ],
    });
  } else {
    const isFamily = benefitsIsCoupled || totalKidsInCare > 0;
    const cwbMax = isFamily ? CWB_2026.maxFamily : CWB_2026.maxSingle;
    const cwbThreshold = isFamily
      ? CWB_2026.phaseOutThresholdFamily
      : CWB_2026.phaseOutThresholdSingle;
    const cwbWorking = grossIncome + selfEmploymentIncome;
    const reason = cwbWorking < CWB_2026.phaseInFloor
      ? `$0 — working income $${cwbWorking.toLocaleString()} below $${CWB_2026.phaseInFloor.toLocaleString()} phase-in floor`
      : `$0 — fully phased out (${isFamily ? "family" : "single"} status; max $${cwbMax.toLocaleString()} offset by ${(CWB_2026.phaseOutRate * 100).toFixed(0)}% × AFNI above $${cwbThreshold.toLocaleString()}) at AFNI ${afniStr}`;
    benefitsConsidered.push({
      benefitName: "Canada Workers Benefit",
      reason,
    });
  }

  if (province === "BC") {
    const bcRentersCredit = calculateBCRentersTaxCredit(afni);
    if (bcRentersCredit > 0) {
      benefits.push({
        benefitName: "BC Renter's Tax Credit",
        benefitYear: "2026",
        maxAmount: BC_RENTERS_TAX_CREDIT_2026.maxAmount,
        finalAmount: bcRentersCredit,
        notes: [
          `max $${BC_RENTERS_TAX_CREDIT_2026.maxAmount}; phases out above $${BC_RENTERS_TAX_CREDIT_2026.phaseOutThreshold.toLocaleString()} AFNI`,
        ],
      });
    } else {
      benefitsConsidered.push({
        benefitName: "BC Renter's Tax Credit",
        reason: `$0 — fully phased out (${(BC_RENTERS_TAX_CREDIT_2026.phaseOutRate * 100).toFixed(0)}% above $${BC_RENTERS_TAX_CREDIT_2026.phaseOutThreshold.toLocaleString()} AFNI, fully out by $${BC_RENTERS_TAX_CREDIT_2026.fullPhaseOut.toLocaleString()}) at AFNI ${afniStr}`,
      });
    }
  }

  const benefitsTotal = benefits.reduce((sum, b) => sum + b.finalAmount, 0);

  // ── Net income — authoritative, from calculateNetIncome ──
  const priorCSPaid = params.priorChildSupportPaid ?? 0;
  const priorSSPaid = params.priorSpousalSupportPaid ?? 0;
  const priorSSReceived = params.priorSpousalSupportReceived ?? 0;
  const priorCSReceived = params.priorChildSupportReceived ?? 0;

  const netIncomeResult = calculateNetIncome({
    grossIncome,
    unionDues,
    spousalSupportPaid: spousalSupportPaid + priorSSPaid,
    spousalSupportReceived: spousalSupportReceived + priorSSReceived,
    isCoupled,
    newPartnerNetIncome,
    childrenUnder6InCare,
    children6to17InCare,
    ccbMultiplier,
    excludeCCB: false,
    claimEligibleDependant: claimsEDC,
    province,
    otherIncome,
    rrspWithdrawals,
    capitalGainsActual,
    selfEmploymentIncome,
    pensionIncome,
    eligibleDividends,
    nonEligibleDividends,
    age,
    overrides: params.overrides,
  });
  const nonTaxableIncome = params.nonTaxableIncome ?? 0;
  const netIncome = netIncomeResult.netIncome + nonTaxableIncome;

  const notionalCSAnnual = notionalChildSupportMonthly * 12;
  const indi = netIncome - notionalCSAnnual - section7Share - priorCSPaid;
  const omitINDI = params.omitNotionalAndINDI ?? false;
  const hasPriorSupport =
    priorCSPaid > 0 || priorSSPaid > 0 || priorSSReceived > 0 || priorCSReceived > 0;

  return {
    label,
    grossIncome,
    isImputed,
    actualIncome,
    unionDues,
    spousalSupportPaid,
    spousalSupportReceived,
    taxableIncomeComponents,
    taxableIncome,
    federalTax,
    provincialTax,
    payroll: {
      gross: grossIncome,
      pensionableEarnings: cpp1Pensionable,
      basicExemption: CPP_2026.yearlyBasicExemption,
      cpp1Rate: CPP_2026.baseRate,
      cpp1,
      cpp2Earnings: cpp2Earnings > 0 ? cpp2Earnings : undefined,
      cpp2Rate: cpp2Earnings > 0 ? CPP_2026.enhancedRate : undefined,
      cpp2: cpp2Earnings > 0 ? cpp2 : undefined,
      selfEmploymentCPP: selfEmploymentCPP > 0 ? selfEmploymentCPP : undefined,
      selfEmploymentCPPPensionable:
        selfEmploymentCPP > 0 ? selfEmploymentCPPPensionable : undefined,
      cppTotal,
      eiInsurable: Math.min(grossIncome, EI_2026.maxInsurableEarnings),
      eiRate: EI_2026.employeeRate,
      ei,
    },
    benefits,
    benefitsTotal,
    benefitsConsidered,
    netIncome,
    notionalCSMonthly: omitINDI ? undefined : notionalChildSupportMonthly,
    notionalCSAnnual: omitINDI ? undefined : notionalCSAnnual,
    notionalCSDescription: omitINDI ? undefined : notionalChildSupportDescription,
    section7Share: omitINDI ? undefined : section7Share,
    section7SharePercent: omitINDI ? undefined : section7SharePercent,
    indi: omitINDI ? undefined : indi,
    indiMonthly: omitINDI ? undefined : indi / 12,
    claimsEDC: effectiveClaimsEDC,
    edcRationale: params.edcRationale,
    isCoupled,
    newPartnerNetIncome,
    priorSupport: hasPriorSupport
      ? {
          childSupportPaid: priorCSPaid,
          spousalSupportPaid: priorSSPaid,
          spousalSupportReceived: priorSSReceived,
          childSupportReceived: priorCSReceived,
        }
      : undefined,
  };
}

function buildEDCRationale(params: {
  arrangement: "sole" | "shared" | "split";
  isRecipient: boolean;
  isFormulaCustodialPayor: boolean;
  hasKidsInCare: boolean;
  isCoupled: boolean;
}): string {
  const { arrangement, isRecipient, isFormulaCustodialPayor, hasKidsInCare, isCoupled } = params;

  if (isCoupled) {
    return (
      "Does not claim — re-partnered with a new spouse/common-law partner. " +
      "ITA s.118(1)(b) bars the Eligible Dependant Credit when cohabiting; " +
      "the spousal amount credit (Line 30300) applies instead."
    );
  }

  if (isFormulaCustodialPayor) {
    // custodial is the SS payor; recipient is non-custodial
    if (isRecipient) {
      return "Does not claim — the SS recipient is the non-custodial parent (no dependent child in care).";
    }
    return "Claims — the SS payor is the custodial parent, eligible under ITA s.118(1)(b).";
  }

  if (arrangement === "sole") {
    if (hasKidsInCare) {
      return "Claims — sole custodial parent with a dependent child in care; eligible under ITA s.118(1)(b).";
    }
    return "Does not claim — no dependent child in care.";
  }

  if (arrangement === "shared") {
    if (isRecipient) {
      return (
        "Claims — in shared custody both parents have children in care, but only " +
        "one party may claim per child per year. Practitioner convention gives the " +
        "credit to the lower-earning spousal support recipient for a consistent " +
        "deterministic output (rotation year-to-year is a valid alternative)."
      );
    }
    return "Does not claim — the spousal support recipient claims the credit in shared custody (practitioner convention).";
  }

  // split
  if (isRecipient) {
    return (
      "Claims — the SS recipient is the net child-support recipient in split " +
      "custody and therefore the sole eligible EDC claimant under ITA s.118(5)."
    );
  }
  return (
    "Does not claim — ITA s.118(5) bars the net child-support payor from " +
    "claiming the Eligible Dependant Credit for the year."
  );
}

/**
 * Build the full detailed report from an input + result pair.
 */
export function buildDetailedReport(
  input: SSAGInput,
  result: SSAGResult,
): DetailedReport {
  const province1 = input.spouse1.province ?? "BC";
  const province2 = input.spouse2.province ?? "BC";
  const today = new Date();
  const years = yearsBetween(
    input.cohabitationStartDate,
    input.separationDate,
  );

  // Input echo
  const childEchoes =
    input.hasChildren && input.children
      ? input.children.children.map((c) => ({
          birthdate: c.birthdate,
          age: computeAge(c.birthdate, today),
          residence:
            c.residence === "spouse1"
              ? "Spouse A"
              : c.residence === "spouse2"
                ? "Spouse B"
                : "Shared",
        }))
      : [];

  const inputsEcho = {
    yearsOfRelationship: years,
    cohabitationStartDate: input.cohabitationStartDate,
    separationDate: input.separationDate,
    spouse1: {
      label: "Spouse A",
      grossIncome: input.spouse1.grossIncome,
      guidelinesIncome: totalGuidelinesIncome(input.spouse1),
      age: input.spouse1.ageAtSeparation,
      imputed: input.spouse1.isImputed ?? false,
      isCoupled: input.spouse1.isCoupled ?? false,
      newPartnerNetIncome: input.spouse1.newPartnerNetIncome ?? 0,
    },
    spouse2: {
      label: "Spouse B",
      grossIncome: input.spouse2.grossIncome,
      guidelinesIncome: totalGuidelinesIncome(input.spouse2),
      age: input.spouse2.ageAtSeparation,
      imputed: input.spouse2.isImputed ?? false,
      isCoupled: input.spouse2.isCoupled ?? false,
      newPartnerNetIncome: input.spouse2.newPartnerNetIncome ?? 0,
    },
    children: childEchoes,
    section7MonthlyTotal: input.children?.section7MonthlyTotal ?? 0,
  };

  function buildProvTaxSource(p: SpousalSupportProvince): DataSource {
    return p === "AB"
      ? { label: "Alberta tax brackets", value: "2026 (8% lowest bracket, re-introduced in Budget 2022, indexed annually)", source: "Alberta Treasury Board and Finance — Personal income tax rates", url: "https://www.alberta.ca/personal-income-tax" }
      : p === "ON"
        ? { label: "Ontario tax brackets", value: "2026 (5 brackets, 5.05%–13.16%; surtax thresholds $5,818/$7,446 indexed 1.9%)", source: "Ontario Ministry of Finance — Personal income tax rates", url: "https://www.ontario.ca/document/personal-income-tax-rates" }
        : p === "SK"
          ? { label: "Saskatchewan tax brackets", value: "2026 (3 brackets, 10.5%/12.5%/14.5%; BPA $20,381 under Affordability Act)", source: "Government of Saskatchewan — Income Tax", url: "https://www.saskatchewan.ca/residents/taxes-and-investments/income-tax" }
          : p === "MB"
            ? { label: "Manitoba tax brackets", value: "2026 (3 brackets, 10.8%/12.75%/17.4%; frozen, not indexed)", source: "Province of Manitoba — Finance, Personal Income Taxes", url: "https://www.gov.mb.ca/finance/personal/pit.html" }
            : p === "NB"
              ? { label: "New Brunswick tax brackets", value: "New Brunswick tax brackets (2026, 4 brackets: 9.4%–19.5%)", source: "Government of New Brunswick — Personal Income Tax", url: "https://www2.gnb.ca/content/gnb/en/departments/finance/taxes/personal-income.html" }
              : p === "NS"
                ? { label: "Nova Scotia tax brackets", value: "Nova Scotia tax brackets (2026, 5 brackets: 8.79%–21%)", source: "Government of Nova Scotia — Personal Income Tax", url: "https://novascotia.ca/finance/en/home/taxation/tax101/personalincometax.html" }
                : p === "PE"
                  ? { label: "Prince Edward Island tax brackets", value: "Prince Edward Island tax brackets (2026, 5 brackets: 9.5%–19%)", source: "Government of Prince Edward Island — Personal Income Tax", url: "https://www.princeedwardisland.ca/en/information/finance/tax-rates-personal-income-tax" }
                  : p === "NL"
                    ? { label: "Newfoundland and Labrador tax brackets", value: "Newfoundland and Labrador tax brackets (2026, 8 brackets: 8.7%–21.8%)", source: "Government of Newfoundland and Labrador — Personal Income Tax", url: "https://www.gov.nl.ca/fin/tax-programs-incentives/personal/" }
                    : p === "YT"
                      ? { label: "Yukon tax brackets", value: "Yukon tax brackets (2026, 5 brackets: 6.4%–15%)", source: "Government of Yukon — Income tax", url: "https://yukon.ca/en/doing-business/tax-and-accounting/income-tax-yukoners" }
                      : p === "NT"
                        ? { label: "Northwest Territories tax brackets", value: "Northwest Territories tax brackets (2026, 4 brackets: 5.9%–14.05%)", source: "Government of Northwest Territories — Personal Income Tax", url: "https://www.fin.gov.nt.ca/en/services/personal-income-tax" }
                        : p === "NU"
                          ? { label: "Nunavut tax brackets", value: "Nunavut tax brackets (2026, 4 brackets: 4%–11.5%)", source: "Government of Nunavut — Finance", url: "https://www.gov.nu.ca/finance" }
                          : { label: "BC tax brackets", value: "2026 (lowest rate 5.60% effective Jan 1, 2026 per BC Budget 2026)", source: "BC Ministry of Finance — Personal income tax rates", url: "https://www2.gov.bc.ca/gov/content/taxes/income-taxes/personal/tax-rates" };
  }
  function buildProvBPASource(p: SpousalSupportProvince): DataSource {
    return p === "AB"
      ? { label: "Alberta BPA", value: `$${AB_2026.basicPersonalAmount.toLocaleString()} (indexed)`, source: "Alberta Treasury Board and Finance — Alberta personal income tax credits", url: "https://www.alberta.ca/personal-income-tax" }
      : p === "ON"
        ? { label: "Ontario BPA / EDC", value: `BPA $${ON_2026.basicPersonalAmount.toLocaleString()} (indexed 1.9%); Eligible Dependant Credit $${ON_2026.eligibleDependantAmount.toLocaleString()} (separate from BPA per ON428 line 58160)`, source: "Ontario Ministry of Finance — Personal income tax rates; TD1ON 2026 (CRA)", url: "https://www.ontario.ca/document/personal-income-tax-rates" }
        : p === "SK"
          ? { label: "Saskatchewan BPA", value: `$${SK_2026.basicPersonalAmount.toLocaleString()} (indexed annually under Affordability Act)`, source: "Government of Saskatchewan — Personal income tax", url: "https://www.saskatchewan.ca/residents/taxes/income-taxes/personal-income-taxes" }
          : p === "MB"
            ? { label: "Manitoba BPA", value: `$${MB_2026.basicPersonalAmount.toLocaleString()} (frozen; not indexed per 2025 Budget)`, source: "Province of Manitoba — Finance, Personal Income Taxes; TD1MB 2026 (CRA)", url: "https://www.gov.mb.ca/finance/personal/pit.html" }
            : p === "NB"
              ? { label: "New Brunswick BPA", value: `$${NB_2026.basicPersonalAmount.toLocaleString()} (indexed)`, source: "Government of New Brunswick — Personal Income Tax; TD1NB 2026 (CRA)", url: "https://www2.gnb.ca/content/gnb/en/departments/finance/taxes/personal-income.html" }
              : p === "NS"
                ? { label: "Nova Scotia BPA", value: `$${NS_2026.basicPersonalAmount.toLocaleString()} (indexed)`, source: "Government of Nova Scotia — Personal Income Tax; TD1NS 2026 (CRA)", url: "https://novascotia.ca/finance/en/home/taxation/tax101/personalincometax.html" }
                : p === "PE"
                  ? { label: "Prince Edward Island BPA / EDC", value: `BPA $${PE_2026.basicPersonalAmount.toLocaleString()}; EDC $${PE_2026.eligibleDependantAmount.toLocaleString()} (distinct from BPA per TD1PE 2026)`, source: "Government of Prince Edward Island — Personal Income Tax; TD1PE 2026 (CRA)", url: "https://www.princeedwardisland.ca/en/information/finance/tax-rates-personal-income-tax" }
                  : p === "NL"
                    ? { label: "Newfoundland and Labrador BPA", value: `$${NL_2026.basicPersonalAmount.toLocaleString()} (indexed)`, source: "Government of Newfoundland and Labrador — Personal Income Tax; TD1NL 2026 (CRA)", url: "https://www.gov.nl.ca/fin/tax-programs-incentives/personal/" }
                    : p === "YT"
                      ? { label: "Yukon BPA", value: `$${YT_2026.basicPersonalAmount.toLocaleString()} (mirrors federal BPA)`, source: "Government of Yukon — Income tax; TD1YT 2026 (CRA)", url: "https://yukon.ca/en/doing-business/tax-and-accounting/income-tax-yukoners" }
                      : p === "NT"
                        ? { label: "Northwest Territories BPA", value: `$${NT_2026.basicPersonalAmount.toLocaleString()} (indexed)`, source: "Government of Northwest Territories — Personal Income Tax; TD1NT 2026 (CRA)", url: "https://www.fin.gov.nt.ca/en/services/personal-income-tax" }
                        : p === "NU"
                          ? { label: "Nunavut BPA", value: `$${NU_2026.basicPersonalAmount.toLocaleString()} (indexed)`, source: "Government of Nunavut — Finance; TD1NU 2026 (CRA)", url: "https://www.gov.nu.ca/finance" }
                          : { label: "BC BPA", value: `$${BC_2026.basicPersonalAmount.toLocaleString()}`, source: "BC Gov — B.C. basic personal income tax credits", url: "https://www2.gov.bc.ca/gov/content/taxes/income-taxes/personal/credits/basic" };
  }
  function buildProvBenefitSources(p: SpousalSupportProvince): DataSource[] {
    return p === "AB"
      ? [{ label: "Alberta Child and Family Benefit (ACFB)", value: `${ACFB_2026_2027.benefitYear}`, source: "CRA — Alberta child and family benefit", url: "https://www.canada.ca/en/revenue-agency/services/child-family-benefits/alberta-child-family-benefit.html" }]
      : p === "ON"
        ? [
            { label: "Ontario Child Benefit (OCB)", value: `${OCB_2025_2026.benefitYear} — $${OCB_2025_2026.maxPerChild.toLocaleString()}/child/year`, source: "Ontario.ca — Ontario Child Benefit", url: "https://www.ontario.ca/page/ontario-child-benefit" },
            { label: "Ontario Sales Tax Credit (OSTC)", value: `${OSTC_2025_2026.benefitYear} — $${OSTC_2025_2026.perPerson}/person`, source: "Ontario.ca — Ontario Trillium Benefit", url: "https://www.ontario.ca/page/ontario-trillium-benefit" },
            { label: "Ontario LIFT credit", value: `Max $${ON_2026.lift.maxCredit} single; phases out 5% above $${ON_2026.lift.phaseOutThreshold.toLocaleString()}`, source: "CRA ON428 — Low-income individuals and families tax (LIFT) credit", url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/tax-packages-years/general-income-tax-benefit-package/ontario/5006-r/information-ontario.html" },
            { label: "Ontario Health Premium (OHP)", value: `$0–$900 based on taxable income; $750 for TI $72,601–$200,000`, source: "CRA ON428 line 42 — Ontario health premium", url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/tax-packages-years/general-income-tax-benefit-package/ontario/5006-r/information-ontario.html" },
          ]
        : p === "SK"
          ? [{ label: "Saskatchewan Low Income Tax Credit (SLITC)", value: `${SLITC_2025_2026.benefitYear} — $${SLITC_2025_2026.perAdult}/adult; phases out ${(SLITC_2025_2026.phaseOutRate * 100).toFixed(2)}% above $${SLITC_2025_2026.phaseOutThreshold.toLocaleString()} AFNI`, source: "Government of Saskatchewan — Low-income tax credit", url: "https://www.saskatchewan.ca/residents/taxes/income-taxes/personal-income-taxes" }]
          : p === "MB"
            ? [
                { label: "Manitoba Renters Affordability Tax Credit (RATC)", value: `$${MB_RATC_2026.maxAmount} (flat; increased from $575 per MB Budget 2025)`, source: "Province of Manitoba — Finance, Personal Tax Credits", url: "https://www.gov.mb.ca/finance/personal/pcredits.html" },
                { label: "Manitoba Refundable Personal Tax Credit", value: `$${MB_REFUNDABLE_PERSONAL_CREDIT_2026.baseAmount} base; phases out ${(MB_REFUNDABLE_PERSONAL_CREDIT_2026.phaseOutRate * 100).toFixed(0)}% of net income (→ $0 above ~$${Math.round(MB_REFUNDABLE_PERSONAL_CREDIT_2026.baseAmount / MB_REFUNDABLE_PERSONAL_CREDIT_2026.phaseOutRate).toLocaleString()} AFNI)`, source: "Province of Manitoba — Finance, Personal Tax Credits", url: "https://www.gov.mb.ca/finance/personal/pcredits.html" },
              ]
          : p === "NB"
            ? []
            : p === "NS"
              ? [
                  { label: "NS Affordable Living Tax Credit (NSALTC)", value: `${NSALTC_2025_2026.benefitYear} — $${NSALTC_2025_2026.perAdult}/adult + $${NSALTC_2025_2026.perChild}/child; phases out ${(NSALTC_2025_2026.phaseOutRate * 100).toFixed(0)}% above $${NSALTC_2025_2026.phaseOutThreshold.toLocaleString()} AFNI`, source: "Nova Scotia Department of Finance — NSALTC", url: "https://www.canada.ca/en/revenue-agency/services/child-family-benefits/provincial-territorial-programs/nova-scotia.html" },
                  { label: "Nova Scotia Child Benefit (NSCB)", value: `${NSCB_2025_2026.benefitYear} — $${NSCB_2025_2026.perChild.toLocaleString()}/child; full below $${NSCB_2025_2026.lowerThreshold.toLocaleString()} AFNI, reduced to first-child-only above $${NSCB_2025_2026.upperThreshold.toLocaleString()}`, source: "N.S. Reg. 62/1998 — Nova Scotia Child Benefit Regulations", url: "https://www.canada.ca/en/revenue-agency/services/child-family-benefits/provincial-territorial-programs/nova-scotia.html" },
                ]
              : p === "PE"
                ? [{ label: "PEI Sales Tax Credit", value: `$${PE_SALES_TAX_CREDIT_2026.perAdult}/individual + $${PE_SALES_TAX_CREDIT_2026.perDependant}/eligible dependant; phases out ${(PE_SALES_TAX_CREDIT_2026.phaseOutRate * 100).toFixed(1)}% above $${PE_SALES_TAX_CREDIT_2026.phaseOutThreshold.toLocaleString()} AFNI`, source: "Government of PEI — Sales Tax Credit", url: "https://www.canada.ca/en/revenue-agency/services/child-family-benefits/provincial-territorial-programs/prince-edward-island.html" }]
                : p === "NL"
                  ? [{ label: "NL Income Supplement", value: `max $${NL_INCOME_SUPPLEMENT_2026.maxAmount}; phases out ${(NL_INCOME_SUPPLEMENT_2026.phaseOutRate * 100).toFixed(0)}% above $${NL_INCOME_SUPPLEMENT_2026.phaseOutThreshold.toLocaleString()} AFNI`, source: "Government of NL — Income Supplement", url: "https://www.canada.ca/en/revenue-agency/services/child-family-benefits/provincial-territorial-programs/newfoundland-labrador.html" }]
                  : (p === "YT" || p === "NT" || p === "NU")
                    ? []
                    : [
                        { label: "BC Family Benefit", value: `${BC_FAMILY_BENEFIT_2025_2026.benefitYear}`, source: "BC Gov — B.C. family benefit", url: "https://www2.gov.bc.ca/gov/content/family-social-supports/affordability/family-benefit" },
                        { label: "BC Sales Tax Credit", value: `$${BC_SALES_TAX_CREDIT_2026.perAdult} / adult`, source: "BC Gov — Sales tax credit (Form BC479)", url: "https://www2.gov.bc.ca/gov/content/taxes/income-taxes/personal/credits/sales-tax" },
                        { label: "BC Tax Reduction Credit", value: `$${BC_TAX_REDUCTION_CREDIT_2026.maxAmount} max (BC Budget 2026, 2026-2030)`, source: "BC Gov — Personal tax credits", url: "https://www2.gov.bc.ca/gov/content/taxes/income-taxes/personal/credits/reduction" },
                        { label: "BC Renter's Tax Credit", value: `$${BC_RENTERS_TAX_CREDIT_2026.maxAmount} max; phases out above $${BC_RENTERS_TAX_CREDIT_2026.phaseOutThreshold.toLocaleString()} AFNI`, source: "BC Gov — B.C. renter's tax credit", url: "https://www2.gov.bc.ca/gov/content/taxes/income-taxes/personal/credits/renters-tax-credit" },
                      ];
  }

  const usedProvinces = [...new Set([province1, province2])];
  const provincialTaxSources = usedProvinces.map(buildProvTaxSource);
  const provincialBPASources = usedProvinces.map(buildProvBPASource);
  const provincialBenefitSources = usedProvinces.flatMap(buildProvBenefitSources);

  const dataSources: DataSource[] = [
    {
      label: "Federal tax brackets",
      value: "2026",
      source: "CRA — Canadian income tax rates for individuals",
      url: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/canadian-income-tax-rates-individuals-current-previous-years.html",
    },
    ...provincialTaxSources,
    {
      label: "Federal BPA",
      value: `$${FEDERAL_2026.basicPersonalAmount.toLocaleString()} (clawed back $181,440–$258,482)`,
      source: "CRA TD1 2026 — Personal Tax Credits Return",
      url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/td1-personal-tax-credits-returns/td1-forms-pay-received-on-january-1-later/td1.html",
    },
    ...provincialBPASources,
    {
      label: "Canada Employment Amount",
      value: `$${CANADA_EMPLOYMENT_AMOUNT_2026.toLocaleString()}`,
      source: "CRA Line 31260 — Canada Employment Amount",
      url: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-31260-canada-employment-amount.html",
    },
    {
      label: "CPP",
      value: "YBE $3,500, YMPE $74,600, YAMPE $85,000; rates 5.95% / 4%",
      source: "CRA — CPP contribution rates, maximums and exemptions",
      url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html",
    },
    {
      label: "EI",
      value: "MIE $68,900, rate 1.63%",
      source: "CRA — EI premium rates and maximums",
      url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/employment-insurance-ei/ei-premium-rates-maximums.html",
    },
    {
      label: "CCB",
      value: `${CCB_2025_2026.benefitYear}`,
      source: "CRA — Canada Child Benefit calculation sheet",
      url: "https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-child-benefit-overview/canada-child-benefit-we-calculate-your-ccb.html",
    },
    ...provincialBenefitSources,
    {
      label: "GST/HST Credit",
      value: `${GST_CREDIT_2025_2026.benefitYear} — replaced by CGEB July 2026`,
      source: "CRA — GST/HST credit",
      url: "https://www.canada.ca/en/revenue-agency/services/child-family-benefits/goods-services-tax-harmonized-sales-tax-gst-hst-credit.html",
    },
    {
      label: "Canada Workers Benefit",
      value: `Max $${CWB_2026.maxSingle} single / $${CWB_2026.maxFamily} family`,
      source: "CRA Line 45300 — Canada Workers Benefit",
      url: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-45300-canada-workers-benefit-cwb.html",
    },
    {
      label: "Federal Child Support Guidelines",
      value: "Schedule I, effective 2025-10-01",
      source: "Justice Canada — SOR/97-175 Schedule I",
      url: "https://laws-lois.justice.gc.ca/eng/regulations/sor-97-175/page-10.html",
    },
    {
      label: "SSAG",
      value: "July 2008 + 2016 Revised User's Guide",
      source: "Department of Justice Canada — SSAG Revised User's Guide",
      url: "https://www.justice.gc.ca/eng/rp-pr/fl-lf/spousal-epoux/ug_a1-gu_a1/",
    },
  ];

  const formulaLabel = FORMULA_LABELS[result.formula];
  const formulaRationale = FORMULA_RATIONALE[result.formula];
  const formulaCitation = FORMULA_CITATION[result.formula];

  // Age-of-children test is only meaningful when the SS recipient is
  // the caregiving parent (Basic, Shared, Split). It does NOT apply in
  // custodial-payor scenarios where the recipient is the non-custodial
  // parent.
  const youngestForDuration =
    input.hasChildren && result.formula !== "with-child-custodial-payor"
      ? getYoungestAge(
          filterDependent(input.children?.children ?? [], today),
          today,
        )
      : null;

  const duration: DurationDetail = buildDurationDetail(
    result,
    years,
    youngestForDuration,
    input.spouse1.ageAtSeparation,
    input.spouse2.ageAtSeparation,
    result.recipient,
  );

  // WOCF path: build per-spouse Financial Detail blocks and a Tax-Impact
  // summary alongside the formula breakdown. The engine computes these
  // figures internally regardless of whether the WCF INDI target applies,
  // so exposing them here is near-zero marginal work and lets practitioners
  // audit the tax engine end-to-end on child-less cases.
  if (result.formula === "without-child") {
    const effectiveYears = Math.min(years, 25);
    const isLong = years >= 25;

    const payorIdx = result.payor - 1;
    const recipientIdx = result.recipient - 1;
    const payorSpouseInput = result.payor === 1 ? input.spouse1 : input.spouse2;
    const recipientSpouseInput = result.recipient === 1 ? input.spouse1 : input.spouse2;
    const payorKey = result.payor === 1 ? "spouse1" : "spouse2";
    const recipientKey = result.recipient === 1 ? "spouse1" : "spouse2";
    const payorProvince = payorIdx === 0 ? province1 : province2;
    const recipientProvince = recipientIdx === 0 ? province1 : province2;

    const lowSS = result.monthlyAmount.low * 12;
    const midSS = result.monthlyAmount.mid * 12;
    const highSS = result.monthlyAmount.high * 12;

    const buildWocfSpouseDetail = (
      role: "payor" | "recipient",
      spouseInput: typeof input.spouse1,
      overridesKey: "spouse1" | "spouse2",
      prov: SpousalSupportProvince,
      ssPaid: number,
      ssReceived: number,
    ): SpouseFinancialDetail =>
      buildSpouseDetail({
        label: `Spouse ${(role === "payor" ? result.payor : result.recipient) === 1 ? "A" : "B"} (SS ${role})`,
        grossIncome: spouseInput.grossIncome,
        actualIncome: spouseInput.reportedIncome,
        priorChildSupportPaid: spouseInput.priorChildSupportPaid,
        priorSpousalSupportPaid: spouseInput.priorSpousalSupportPaid,
        priorSpousalSupportReceived: spouseInput.priorSpousalSupportReceived,
        priorChildSupportReceived: spouseInput.priorChildSupportReceived,
        isImputed: spouseInput.isImputed ?? false,
        isCoupled: spouseInput.isCoupled ?? false,
        newPartnerNetIncome: spouseInput.newPartnerNetIncome ?? 0,
        unionDues: spouseInput.unionDues ?? 0,
        spousalSupportPaid: ssPaid,
        spousalSupportReceived: ssReceived,
        otherIncome: spouseInput.otherIncome ?? 0,
        rrspWithdrawals: spouseInput.rrspWithdrawals ?? 0,
        capitalGainsActual: spouseInput.capitalGainsActual ?? 0,
        selfEmploymentIncome: spouseInput.selfEmploymentIncome ?? 0,
        pensionIncome: spouseInput.pensionIncome ?? 0,
        eligibleDividends: spouseInput.eligibleDividends ?? 0,
        nonEligibleDividends: spouseInput.nonEligibleDividends ?? 0,
        nonTaxableIncome: spouseInput.nonTaxableIncome ?? 0,
        childrenUnder6InCare: 0,
        children6to17InCare: 0,
        ccbMultiplier: 1,
        isSingleParent: false,
        notionalChildSupportMonthly: 0,
        notionalChildSupportDescription: "",
        section7Share: 0,
        section7SharePercent: 0,
        claimEligibleDependant: false,
        edcRationale: buildEDCRationale({
          arrangement: "sole",
          isRecipient: role === "recipient",
          isFormulaCustodialPayor: false,
          hasKidsInCare: false,
          isCoupled: spouseInput.isCoupled ?? false,
        }),
        province: prov,
        age: spouseInput.ageAtSeparation,
        overrides: input.overrides?.[overridesKey],
        omitNotionalAndINDI: true,
      });

    const payorDetail = buildWocfSpouseDetail(
      "payor",
      payorSpouseInput,
      payorKey,
      payorProvince,
      midSS,
      0,
    );
    const recipientDetail = buildWocfSpouseDetail(
      "recipient",
      recipientSpouseInput,
      recipientKey,
      recipientProvince,
      0,
      midSS,
    );

    // Net income at each SS level for the tax-impact summary. The Financial
    // Detail blocks above show the At-Mid state to match the displayed SS
    // figure; these additional passes surface the full Low/Mid/High range
    // plus the no-SS counterfactual.
    const netIncomeAt = (
      spouseInput: typeof input.spouse1,
      overridesKey: "spouse1" | "spouse2",
      prov: SpousalSupportProvince,
      ssPaid: number,
      ssReceived: number,
    ) => {
      const bd = calculateNetIncome({
        grossIncome: spouseInput.grossIncome,
        unionDues: spouseInput.unionDues ?? 0,
        spousalSupportPaid: ssPaid,
        spousalSupportReceived: ssReceived,
        isCoupled: spouseInput.isCoupled ?? false,
        newPartnerNetIncome: spouseInput.newPartnerNetIncome ?? 0,
        childrenUnder6InCare: 0,
        children6to17InCare: 0,
        ccbMultiplier: 1,
        excludeCCB: false,
        claimEligibleDependant: false,
        province: prov,
        otherIncome: spouseInput.otherIncome ?? 0,
        rrspWithdrawals: spouseInput.rrspWithdrawals ?? 0,
        capitalGainsActual: spouseInput.capitalGainsActual ?? 0,
        selfEmploymentIncome: spouseInput.selfEmploymentIncome ?? 0,
        pensionIncome: spouseInput.pensionIncome ?? 0,
        eligibleDividends: spouseInput.eligibleDividends ?? 0,
        nonEligibleDividends: spouseInput.nonEligibleDividends ?? 0,
        age: spouseInput.ageAtSeparation,
        overrides: input.overrides?.[overridesKey],
      });
      // Non-taxable income flows straight to cash-in-hand and must be
      // reflected in the Tax Impact netIncome so "Before-SS" reconciles
      // with the buildSpouseDetail "At-Mid" figure.
      const nonTax = spouseInput.nonTaxableIncome ?? 0;
      return { ...bd, netIncome: bd.netIncome + nonTax };
    };

    const payorBeforeBd = netIncomeAt(payorSpouseInput, payorKey, payorProvince, 0, 0);
    const recipientBeforeBd = netIncomeAt(recipientSpouseInput, recipientKey, recipientProvince, 0, 0);
    const payorBefore = payorBeforeBd.netIncome;
    const recipientBefore = recipientBeforeBd.netIncome;
    const payorAtLow = netIncomeAt(payorSpouseInput, payorKey, payorProvince, lowSS, 0).netIncome;
    const payorAtMid = payorDetail.netIncome;
    const payorAtHigh = netIncomeAt(payorSpouseInput, payorKey, payorProvince, highSS, 0).netIncome;
    const recipientAtLow = netIncomeAt(recipientSpouseInput, recipientKey, recipientProvince, 0, lowSS).netIncome;
    const recipientAtMid = recipientDetail.netIncome;
    const recipientAtHigh = netIncomeAt(recipientSpouseInput, recipientKey, recipientProvince, 0, highSS).netIncome;

    const toBeforeBreakdown = (
      label: string,
      bd: ReturnType<typeof netIncomeAt>,
    ) => ({
      label,
      grossIncome: bd.grossIncome,
      taxableIncome: bd.taxableIncome,
      federalTax: bd.federalTax,
      provincialTax: bd.provincialTax,
      cpp: bd.cpp,
      ei: bd.ei,
      benefitsTotal: bd.ccb + bd.gstCredit + bd.provincialBenefits,
      netIncome: bd.netIncome,
    });

    const beforeSSPayor = toBeforeBreakdown(
      `Spouse ${result.payor === 1 ? "A" : "B"} (payor) — before SS`,
      payorBeforeBd,
    );
    const beforeSSRecipient = toBeforeBreakdown(
      `Spouse ${result.recipient === 1 ? "A" : "B"} (recipient) — before SS`,
      recipientBeforeBd,
    );

    const taxImpact = {
      lowSSAnnual: lowSS,
      midSSAnnual: midSS,
      highSSAnnual: highSS,
      payor: {
        label: `Spouse ${result.payor === 1 ? "A" : "B"} (payor) net income`,
        beforeSS: payorBefore,
        atLow: payorAtLow,
        atMid: payorAtMid,
        atHigh: payorAtHigh,
        changeLow: payorAtLow - payorBefore,
        changeMid: payorAtMid - payorBefore,
        changeHigh: payorAtHigh - payorBefore,
      },
      recipient: {
        label: `Spouse ${result.recipient === 1 ? "A" : "B"} (recipient) net income`,
        beforeSS: recipientBefore,
        atLow: recipientAtLow,
        atMid: recipientAtMid,
        atHigh: recipientAtHigh,
        changeLow: recipientAtLow - recipientBefore,
        changeMid: recipientAtMid - recipientBefore,
        changeHigh: recipientAtHigh - recipientBefore,
      },
      combined: {
        label: "Combined household net income",
        beforeSS: payorBefore + recipientBefore,
        atLow: payorAtLow + recipientAtLow,
        atMid: payorAtMid + recipientAtMid,
        atHigh: payorAtHigh + recipientAtHigh,
        changeLow: (payorAtLow + recipientAtLow) - (payorBefore + recipientBefore),
        changeMid: (payorAtMid + recipientAtMid) - (payorBefore + recipientBefore),
        changeHigh: (payorAtHigh + recipientAtHigh) - (payorBefore + recipientBefore),
      },
    };

    return {
      complianceStatement: buildComplianceStatement(province1, province2),
      assumptions: buildAssumptions(province1, province2, {
        hasChildren: false,
        isShared: false,
        anyCoupled: (payorSpouseInput.isCoupled ?? false) || (recipientSpouseInput.isCoupled ?? false),
      }),
      methodologyNotes: buildMethodologyNotes(result.formula, null, province1, province2),
      formulaLabel,
      formulaRationale,
      formulaCitation,
      inputsEcho,
      payorDetail,
      recipientDetail,
      duration,
      wocfBreakdown: {
        grossIncomeDifference: result.grossIncomeDifference,
        effectiveYears,
        // Percentages are derived from the engine-authoritative annual
        // amounts so displayed % × displayed GID reproduces displayed $
        // exactly. Otherwise the rate×years formula and the cap-aware
        // engine amount can drift by a few dollars.
        lowPercent:
          result.grossIncomeDifference > 0 ? lowSS / result.grossIncomeDifference : 0,
        midPercent:
          result.grossIncomeDifference > 0 ? midSS / result.grossIncomeDifference : 0,
        highPercent:
          result.grossIncomeDifference > 0 ? highSS / result.grossIncomeDifference : 0,
        capApplied: isLong
          ? "25+ year relationship — years capped at 25 for the multiplier; high end capped at the 48% net income equalization approximation per SSAG §7.4.3."
          : "Formula applies normally with the 50% Guidelines income difference cap retained (SSAG \"gross income\" terminology).",
        lowAnnual: lowSS,
        midAnnual: midSS,
        highAnnual: highSS,
      },
      taxImpact,
      beforeSSPayor,
      beforeSSRecipient,
      dataSources,
      warnings: result.warnings,
      appliedOverrides: buildAppliedOverrides(input),
    };
  }

  // ── WCF: build per-spouse detail ──
  if (!input.children) {
    // Shouldn't happen — hasChildren true without children info
    return {
      complianceStatement: buildComplianceStatement(province1, province2),
      assumptions: buildAssumptions(province1, province2, {
        hasChildren: false,
        isShared: false,
        anyCoupled: (input.spouse1.isCoupled ?? false) || (input.spouse2.isCoupled ?? false),
      }),
      methodologyNotes: buildMethodologyNotes(result.formula, null, province1, province2),
      formulaLabel,
      formulaRationale,
      formulaCitation,
      inputsEcho,
      duration,
      dataSources,
      warnings: result.warnings,
      appliedOverrides: buildAppliedOverrides(input),
    };
  }

  const dependentKids = filterDependent(input.children.children, today);
  const { arrangement: rawArrangement } = deriveCustodialArrangement(dependentKids);
  const { childrenUnder6, children6to17 } = bucketByAge(dependentKids, today);
  const totalKids = childrenUnder6 + children6to17;

  // Normalize to the three logical cases used throughout the report.
  const arrangement: "sole" | "shared" | "split" =
    rawArrangement === "shared"
      ? "shared"
      : rawArrangement === "split"
        ? "split"
        : "sole";

  // Figure out per-spouse: is this spouse the SS payor or recipient, and what are their per-spouse params?
  const incomes = [input.spouse1.grossIncome, input.spouse2.grossIncome] as const;
  // Guidelines income (Federal CSG s.16 / Sch. III) — all taxable sources.
  // Used for CS table lookups, notional CS, and displayed CS breakdown. The
  // T4 `incomes` array is passed to buildSpouseDetail as `grossIncome` and
  // fed to the tax engine, which adds the non-T4 sources itself.
  const guidelinesIncomes = [
    totalGuidelinesIncome(input.spouse1),
    totalGuidelinesIncome(input.spouse2),
  ] as const;
  const dues = [input.spouse1.unionDues ?? 0, input.spouse2.unionDues ?? 0] as const;
  const otherIncomes = [input.spouse1.otherIncome ?? 0, input.spouse2.otherIncome ?? 0] as const;
  const rrspAmounts = [input.spouse1.rrspWithdrawals ?? 0, input.spouse2.rrspWithdrawals ?? 0] as const;
  const capitalGains = [input.spouse1.capitalGainsActual ?? 0, input.spouse2.capitalGainsActual ?? 0] as const;
  const selfEmploymentAmounts = [input.spouse1.selfEmploymentIncome ?? 0, input.spouse2.selfEmploymentIncome ?? 0] as const;
  const pensionIncomes = [input.spouse1.pensionIncome ?? 0, input.spouse2.pensionIncome ?? 0] as const;
  const eligibleDividendsArr = [input.spouse1.eligibleDividends ?? 0, input.spouse2.eligibleDividends ?? 0] as const;
  const nonEligibleDividendsArr = [input.spouse1.nonEligibleDividends ?? 0, input.spouse2.nonEligibleDividends ?? 0] as const;

  // Section 7 apportionment — on Guidelines income (all sources), not just employment.
  const payorIncome = incomes[result.payor - 1];
  const recipientIncome = incomes[result.recipient - 1];
  const payorSpouseData = result.payor === 1 ? input.spouse1 : input.spouse2;
  const recipientSpouseData = result.recipient === 1 ? input.spouse1 : input.spouse2;
  const s7Shares = calculateSection7Shares(
    totalGuidelinesIncome(payorSpouseData),
    totalGuidelinesIncome(recipientSpouseData),
    input.children.section7MonthlyTotal,
  );
  const payorSpouseKey = result.payor === 1 ? "spouse1" : "spouse2";
  const recipientSpouseKey = result.recipient === 1 ? "spouse1" : "spouse2";
  const payorS7Override = input.overrides?.[payorSpouseKey]?.section7OwnShare;
  const recipientS7Override = input.overrides?.[recipientSpouseKey]?.section7OwnShare;
  const payorS7Annual = payorS7Override ?? s7Shares.payorAnnualShare;
  const recipientS7Annual = recipientS7Override ?? s7Shares.recipientAnnualShare;
  const payorS7Percent = s7Shares.payorProportion * 100;
  const recipientS7Percent = (1 - s7Shares.payorProportion) * 100;

  // Kids in care per spouse depends on arrangement
  let payorKidsU6 = 0,
    payorKids617 = 0,
    recipientKidsU6 = 0,
    recipientKids617 = 0;
  let ccbMultiplierPayor = 1,
    ccbMultiplierRecipient = 1;

  if (arrangement === "shared") {
    payorKidsU6 = childrenUnder6;
    payorKids617 = children6to17;
    recipientKidsU6 = childrenUnder6;
    recipientKids617 = children6to17;
    ccbMultiplierPayor = 0.5;
    ccbMultiplierRecipient = 0.5;
  } else if (arrangement === "split") {
    const { spouse1, spouse2 } = splitBucketsByParent(dependentKids, today);
    if (result.payor === 1) {
      payorKidsU6 = spouse1.childrenUnder6;
      payorKids617 = spouse1.children6to17;
      recipientKidsU6 = spouse2.childrenUnder6;
      recipientKids617 = spouse2.children6to17;
    } else {
      payorKidsU6 = spouse2.childrenUnder6;
      payorKids617 = spouse2.children6to17;
      recipientKidsU6 = spouse1.childrenUnder6;
      recipientKids617 = spouse1.children6to17;
    }
  } else if (result.formula === "with-child-custodial-payor") {
    // Custodial payor: payor (custodial) has the kids
    payorKidsU6 = childrenUnder6;
    payorKids617 = children6to17;
  } else {
    // Basic: recipient (custodial) has the kids
    recipientKidsU6 = childrenUnder6;
    recipientKids617 = children6to17;
  }

  // Notional CS: table amount on each spouse's own income for ALL kids —
  // SSAG WCF convention across all sub-variants (Basic, Shared, Split,
  // Custodial Payor). Advanced-mode overrides take precedence.
  const payorOverrides = input.overrides?.[result.payor === 1 ? "spouse1" : "spouse2"];
  const recipientOverrides = input.overrides?.[result.recipient === 1 ? "spouse1" : "spouse2"];
  const payorGuidelinesIncome = guidelinesIncomes[result.payor - 1];
  const recipientGuidelinesIncome = guidelinesIncomes[result.recipient - 1];
  const csPayorProvince = result.payor === 1 ? province1 : province2;
  const csRecipientProvince = result.recipient === 1 ? province1 : province2;
  const payorNotionalMonthly =
    payorOverrides?.notionalChildSupport !== undefined
      ? payorOverrides.notionalChildSupport / 12
      : totalKids > 0 ? lookupTableAmount(payorGuidelinesIncome, totalKids, csPayorProvince) : 0;
  const recipientNotionalMonthly =
    recipientOverrides?.notionalChildSupport !== undefined
      ? recipientOverrides.notionalChildSupport / 12
      : totalKids > 0 ? lookupTableAmount(recipientGuidelinesIncome, totalKids, csRecipientProvince) : 0;
  const payorNotionalDescription = `Federal Child Support Guidelines, Schedule I — ${totalKids} child${totalKids === 1 ? "" : "ren"} at $${payorGuidelinesIncome.toLocaleString()} Guidelines income (all taxable sources per s.16 / Sch. III, not T4 alone)`;
  const recipientNotionalDescription = `Federal Child Support Guidelines, Schedule I — ${totalKids} child${totalKids === 1 ? "" : "ren"} at $${recipientGuidelinesIncome.toLocaleString()} Guidelines income (all taxable sources per s.16 / Sch. III, not T4 alone)`;

  // Solve for SS is already done — we compute spouse INDI at the MID level for display
  const midSS = result.monthlyAmount.mid * 12;

  const isFormulaCustodialPayor =
    result.formula === "with-child-custodial-payor";

  const payorProvince = result.payor === 1 ? province1 : province2;
  const recipientProvince = result.recipient === 1 ? province1 : province2;

  const payorSpouseInput = result.payor === 1 ? input.spouse1 : input.spouse2;
  const recipientSpouseInput = result.recipient === 1 ? input.spouse1 : input.spouse2;

  const payorDetail = buildSpouseDetail({
    label: `Spouse ${result.payor === 1 ? "A" : "B"} (SS payor)`,
    grossIncome: payorIncome,
    actualIncome: payorSpouseInput.reportedIncome,
    priorChildSupportPaid: payorSpouseInput.priorChildSupportPaid,
    priorSpousalSupportPaid: payorSpouseInput.priorSpousalSupportPaid,
    priorSpousalSupportReceived: payorSpouseInput.priorSpousalSupportReceived,
    priorChildSupportReceived: payorSpouseInput.priorChildSupportReceived,
    isImputed: payorSpouseInput.isImputed ?? false,
    isCoupled: payorSpouseInput.isCoupled ?? false,
    newPartnerNetIncome: payorSpouseInput.newPartnerNetIncome ?? 0,
    unionDues: dues[result.payor - 1],
    spousalSupportPaid: midSS,
    spousalSupportReceived: 0,
    otherIncome: otherIncomes[result.payor - 1],
    rrspWithdrawals: rrspAmounts[result.payor - 1],
    capitalGainsActual: capitalGains[result.payor - 1],
    selfEmploymentIncome: selfEmploymentAmounts[result.payor - 1],
    pensionIncome: pensionIncomes[result.payor - 1],
    eligibleDividends: eligibleDividendsArr[result.payor - 1],
    nonEligibleDividends: nonEligibleDividendsArr[result.payor - 1],
    nonTaxableIncome: payorSpouseInput.nonTaxableIncome ?? 0,
    childrenUnder6InCare: payorKidsU6,
    children6to17InCare: payorKids617,
    ccbMultiplier: ccbMultiplierPayor,
    isSingleParent: payorKidsU6 + payorKids617 > 0,
    notionalChildSupportMonthly: payorNotionalMonthly,
    notionalChildSupportDescription: payorNotionalDescription,
    section7Share: payorS7Annual,
    section7SharePercent: payorS7Percent,
    claimEligibleDependant:
      arrangement === "shared" || arrangement === "split"
        ? false
        : (payorKidsU6 + payorKids617) > 0,
    edcRationale: buildEDCRationale({
      arrangement,
      isRecipient: false,
      isFormulaCustodialPayor,
      hasKidsInCare: payorKidsU6 + payorKids617 > 0,
      isCoupled: payorSpouseInput.isCoupled ?? false,
    }),
    province: payorProvince,
    age: payorSpouseInput.ageAtSeparation,
    overrides: input.overrides?.[payorSpouseKey],
  });

  const recipientDetail = buildSpouseDetail({
    label: `Spouse ${result.recipient === 1 ? "A" : "B"} (SS recipient)`,
    grossIncome: recipientIncome,
    actualIncome: recipientSpouseInput.reportedIncome,
    priorChildSupportPaid: recipientSpouseInput.priorChildSupportPaid,
    priorSpousalSupportPaid: recipientSpouseInput.priorSpousalSupportPaid,
    priorSpousalSupportReceived: recipientSpouseInput.priorSpousalSupportReceived,
    priorChildSupportReceived: recipientSpouseInput.priorChildSupportReceived,
    isImputed: recipientSpouseInput.isImputed ?? false,
    isCoupled: recipientSpouseInput.isCoupled ?? false,
    newPartnerNetIncome: recipientSpouseInput.newPartnerNetIncome ?? 0,
    unionDues: dues[result.recipient - 1],
    spousalSupportPaid: 0,
    spousalSupportReceived: midSS,
    otherIncome: otherIncomes[result.recipient - 1],
    rrspWithdrawals: rrspAmounts[result.recipient - 1],
    capitalGainsActual: capitalGains[result.recipient - 1],
    selfEmploymentIncome: selfEmploymentAmounts[result.recipient - 1],
    pensionIncome: pensionIncomes[result.recipient - 1],
    eligibleDividends: eligibleDividendsArr[result.recipient - 1],
    nonEligibleDividends: nonEligibleDividendsArr[result.recipient - 1],
    nonTaxableIncome: recipientSpouseInput.nonTaxableIncome ?? 0,
    childrenUnder6InCare: recipientKidsU6,
    children6to17InCare: recipientKids617,
    ccbMultiplier: ccbMultiplierRecipient,
    isSingleParent: recipientKidsU6 + recipientKids617 > 0,
    notionalChildSupportMonthly: recipientNotionalMonthly,
    notionalChildSupportDescription: recipientNotionalDescription,
    section7Share: recipientS7Annual,
    section7SharePercent: recipientS7Percent,
    claimEligibleDependant:
      arrangement === "shared" || arrangement === "split"
        ? true
        : (recipientKidsU6 + recipientKids617) > 0,
    edcRationale: buildEDCRationale({
      arrangement,
      isRecipient: true,
      isFormulaCustodialPayor,
      hasKidsInCare: recipientKidsU6 + recipientKids617 > 0,
      isCoupled: recipientSpouseInput.isCoupled ?? false,
    }),
    province: recipientProvince,
    age: recipientSpouseInput.ageAtSeparation,
    overrides: input.overrides?.[recipientSpouseKey],
  });

  // Child support
  const csFormula: ChildSupportDetail["formula"] =
    arrangement === "shared"
      ? "shared-set-off"
      : arrangement === "split"
        ? "split-set-off"
        : "sole";

  const csComponents: ChildSupportDetail["components"] = [];
  if (csFormula === "sole") {
    const csPayorIdxSole = result.childSupportPayor ? result.childSupportPayor - 1 : 0;
    const csPayorProvinceSole = csPayorIdxSole === 0 ? province1 : province2;
    const tableLookup = result.childSupportPayor
      ? lookupTableAmount(guidelinesIncomes[csPayorIdxSole], totalKids, csPayorProvinceSole)
      : 0;
    csComponents.push({
      label: `Table amount at payor's Guidelines income ($${result.childSupportPayor !== undefined ? guidelinesIncomes[result.childSupportPayor - 1].toLocaleString() : ""}) for ${totalKids} child${totalKids === 1 ? "" : "ren"}`,
      amount: tableLookup,
    });
  } else if (csFormula === "shared-set-off") {
    const higherIdx = guidelinesIncomes[0] >= guidelinesIncomes[1] ? 0 : 1;
    const lowerIdx = 1 - higherIdx;
    const higher = guidelinesIncomes[higherIdx];
    const lower = guidelinesIncomes[lowerIdx];
    const higherProvince = higherIdx === 0 ? province1 : province2;
    const lowerProvince = lowerIdx === 0 ? province1 : province2;
    const higherAmt = lookupTableAmount(higher, totalKids, higherProvince);
    const lowerAmt = lookupTableAmount(lower, totalKids, lowerProvince);
    csComponents.push({
      label: `Higher earner's table amount ($${higher.toLocaleString()} Guidelines income, ${totalKids} ${totalKids === 1 ? "child" : "children"})`,
      amount: higherAmt,
    });
    csComponents.push({
      label: `Lower earner's table amount ($${lower.toLocaleString()} Guidelines income, ${totalKids} ${totalKids === 1 ? "child" : "children"})`,
      amount: lowerAmt,
    });
    csComponents.push({
      label: "Set-off (difference — higher earner pays to lower)",
      amount: higherAmt - lowerAmt,
    });
  } else if (csFormula === "split-set-off") {
    const { spouse1: s1Kids, spouse2: s2Kids } = splitBucketsByParent(
      dependentKids,
      today,
    );
    const s1Total = s1Kids.childrenUnder6 + s1Kids.children6to17;
    const s2Total = s2Kids.childrenUnder6 + s2Kids.children6to17;
    const s1Obligation =
      s2Total > 0 ? lookupTableAmount(guidelinesIncomes[0], s2Total, province1) : 0;
    const s2Obligation =
      s1Total > 0 ? lookupTableAmount(guidelinesIncomes[1], s1Total, province2) : 0;
    csComponents.push({
      label: `Spouse A's table amount for ${s2Total} ${s2Total === 1 ? "child" : "children"} living with Spouse B (at $${guidelinesIncomes[0].toLocaleString()} Guidelines income)`,
      amount: s1Obligation,
    });
    csComponents.push({
      label: `Spouse B's table amount for ${s1Total} ${s1Total === 1 ? "child" : "children"} living with Spouse A (at $${guidelinesIncomes[1].toLocaleString()} Guidelines income)`,
      amount: s2Obligation,
    });
    csComponents.push({
      label: "Split set-off (difference)",
      amount: Math.abs(s1Obligation - s2Obligation),
    });
  }

  const childSupport: ChildSupportDetail = {
    formula: csFormula,
    payor: (result.childSupportPayor ?? result.payor) as 1 | 2,
    recipient: ((result.childSupportPayor ?? result.payor) === 1 ? 2 : 1) as 1 | 2,
    monthlyAmount: result.childSupportMonthly ?? 0,
    annualAmount: (result.childSupportMonthly ?? 0) * 12,
    components: csComponents,
    tableVersion: "Federal Child Support Guidelines, Schedule I, effective 2025-10-01",
  };

  // Custodial-Payor: build the Ch. 14 adjusted-income WOCF breakdown
  let custodialPayorBreakdown: CustodialPayorBreakdown | undefined;
  if (isFormulaCustodialPayor) {
    // In this variant, SS payor is the custodial (higher-earning) parent
    const custodialIncome = payorIncome;
    const nonCustodialIncome = recipientIncome;
    const custodialNotionalAnnual = payorNotionalMonthly * 12;
    const nonCustodialNotionalAnnual = recipientNotionalMonthly * 12;
    const custodialAdjusted = Math.max(
      0,
      custodialIncome - custodialNotionalAnnual,
    );
    const nonCustodialAdjusted = Math.max(
      0,
      nonCustodialIncome - nonCustodialNotionalAnnual,
    );
    const adjustedGID = Math.max(0, custodialAdjusted - nonCustodialAdjusted);
    const effectiveYears = Math.min(years, 25);
    const cpLowAnnual = result.monthlyAmount.low * 12;
    const cpMidAnnual = result.monthlyAmount.mid * 12;
    const cpHighAnnual = result.monthlyAmount.high * 12;
    custodialPayorBreakdown = {
      custodialIncome,
      custodialNotionalAnnual,
      custodialAdjusted,
      nonCustodialIncome,
      nonCustodialNotionalAnnual,
      nonCustodialAdjusted,
      adjustedGID,
      effectiveYears,
      // Derived from amounts / adjustedGID so displayed % × GID = displayed $.
      lowPercent: adjustedGID > 0 ? cpLowAnnual / adjustedGID : 0,
      midPercent: adjustedGID > 0 ? cpMidAnnual / adjustedGID : 0,
      highPercent: adjustedGID > 0 ? cpHighAnnual / adjustedGID : 0,
      lowAnnual: cpLowAnnual,
      midAnnual: cpMidAnnual,
      highAnnual: cpHighAnnual,
    };
  }

  const section7Note =
    input.children.section7MonthlyTotal > 0
      ? "Section 7 special/extraordinary expenses are apportioned proportionally to " +
        "each party's Guidelines income (all sources — employment, pension, dividends, " +
        "investment, self-employment, etc.) per Federal Child Support Guidelines s.7(2). " +
        "Each party's share is then subtracted from their INDI."
      : undefined;

  // Solver levels
  const solverLevels: SolverLevelDetail[] = [
    {
      level: "low",
      targetSharePercent: 40,
      spousalSupportAnnual: result.monthlyAmount.low * 12,
      spousalSupportMonthly: result.monthlyAmount.low,
      payorINDIAnnual: result.indi!.payorMonthly.low * 12,
      recipientINDIAnnual: result.indi!.recipientMonthly.low * 12,
      recipientSharePercent: result.indi!.recipientSharePercent.low,
      atUpperBound: false,
    },
    {
      level: "mid",
      targetSharePercent: 43,
      spousalSupportAnnual: result.monthlyAmount.mid * 12,
      spousalSupportMonthly: result.monthlyAmount.mid,
      payorINDIAnnual: result.indi!.payorMonthly.mid * 12,
      recipientINDIAnnual: result.indi!.recipientMonthly.mid * 12,
      recipientSharePercent: result.indi!.recipientSharePercent.mid,
      atUpperBound: false,
    },
    {
      level: "high",
      targetSharePercent: 46,
      spousalSupportAnnual: result.monthlyAmount.high * 12,
      spousalSupportMonthly: result.monthlyAmount.high,
      payorINDIAnnual: result.indi!.payorMonthly.high * 12,
      recipientINDIAnnual: result.indi!.recipientMonthly.high * 12,
      recipientSharePercent: result.indi!.recipientSharePercent.high,
      atUpperBound: false,
    },
  ];

  return {
    complianceStatement: buildComplianceStatement(province1, province2),
    assumptions: buildAssumptions(province1, province2, {
      hasChildren: true,
      isShared: arrangement === "shared",
      anyCoupled: (payorSpouseInput.isCoupled ?? false) || (recipientSpouseInput.isCoupled ?? false),
    }),
    methodologyNotes: buildMethodologyNotes(result.formula, arrangement, province1, province2),
    formulaLabel,
    formulaRationale,
    formulaCitation,
    section7Note,
    inputsEcho,
    payorDetail,
    recipientDetail,
    childSupport,
    solverLevels,
    custodialPayorBreakdown,
    sharedCustody50_50NDIPoint: result.sharedCustody50_50NDIPoint
      ? {
          monthlySpousalSupport: result.sharedCustody50_50NDIPoint.monthlySpousalSupport,
          atUpperBound: result.sharedCustody50_50NDIPoint.atUpperBound,
          withinRange:
            result.sharedCustody50_50NDIPoint.monthlySpousalSupport >= result.monthlyAmount.low &&
            result.sharedCustody50_50NDIPoint.monthlySpousalSupport <= result.monthlyAmount.high,
        }
      : undefined,
    duration,
    dataSources,
    warnings: result.warnings,
    appliedOverrides: buildAppliedOverrides(input),
  };
}

function fmtCAD(n: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

function buildAppliedOverrides(
  input: SSAGInput,
): import("@/types/ssag-detail").AppliedOverride[] | undefined {
  const o = input.overrides;
  if (!o) return undefined;
  const out: import("@/types/ssag-detail").AppliedOverride[] = [];

  if (o.manualSpousalSupport?.monthly !== undefined) {
    out.push({
      scope: "global",
      label: "Manual spousal support (monthly)",
      formattedValue: fmtCAD(o.manualSpousalSupport.monthly),
    });
  }

  const spouseFields: Array<{
    key: keyof import("@/types/overrides").SpouseOverrides;
    label: string;
    kind: "currency" | "percent";
  }> = [
    { key: "netIncomeAtZeroSS", label: "Net income (before spousal support)", kind: "currency" },
    { key: "marginalRate", label: "Combined marginal tax rate", kind: "percent" },
    { key: "federalTaxAtZeroSS", label: "Federal income tax (before spousal support)", kind: "currency" },
    { key: "provincialTaxAtZeroSS", label: "Provincial income tax (before spousal support)", kind: "currency" },
    { key: "cpp", label: "CPP contributions (annual)", kind: "currency" },
    { key: "ei", label: "EI premiums (annual)", kind: "currency" },
    { key: "ccb", label: "Canada Child Benefit (annual)", kind: "currency" },
    { key: "gstCredit", label: "GST/HST credit (annual)", kind: "currency" },
    { key: "provincialBenefits", label: "Provincial benefits (annual)", kind: "currency" },
    { key: "spousalAmountCredit", label: "Spousal amount credit (annual)", kind: "currency" },
    { key: "notionalChildSupport", label: "Notional child support (annual)", kind: "currency" },
    { key: "section7OwnShare", label: "Section 7 own share (annual)", kind: "currency" },
  ];

  for (const scope of ["A", "B"] as const) {
    const per = scope === "A" ? o.spouse1 : o.spouse2;
    if (!per) continue;
    for (const f of spouseFields) {
      const v = per[f.key];
      if (v === undefined) continue;
      out.push({
        scope,
        label: f.label,
        formattedValue:
          f.kind === "percent"
            ? `${((v as number) * 100).toFixed(2)}%`
            : fmtCAD(v as number),
      });
    }
    if (per.benefitsConvention) {
      out.push({
        scope,
        label: "Refundable benefits convention",
        formattedValue:
          per.benefitsConvention === "coupled-household-afni"
            ? "CRA reality (coupled base + household AFNI)"
            : "Unattached (single base + claimant AFNI)",
      });
    }
  }

  return out.length > 0 ? out : undefined;
}

function buildDurationDetail(
  result: SSAGResult,
  years: number,
  youngestAge: number | null,
  age1: number,
  age2: number,
  recipientSpouse: 1 | 2,
): DurationDetail {
  if (result.duration.type === "indefinite") {
    return {
      type: "indefinite",
      reason: result.duration.reason,
    };
  }

  const recipientAge = recipientSpouse === 1 ? age1 : age2;

  const marriageLow = years * 0.5;
  const marriageHigh = years * 1.0;

  const SCHOOL = 5;
  const HS = 18;
  const ageLow = youngestAge === null ? 0 : Math.max(0, SCHOOL - youngestAge);
  const ageHigh = youngestAge === null ? 0 : Math.max(0, HS - youngestAge);

  const finalLow = result.duration.range.low;
  const finalHigh = result.duration.range.high;

  // Age-of-children test applies to WCF amount-formula variants only.
  // Custodial Payor uses WOCF-style duration (Ch. 14) — Test 2 doesn't apply.
  const isWCF =
    result.formula.startsWith("with-child") &&
    result.formula !== "with-child-custodial-payor";

  const marriageTest = {
    testName: "Length of Marriage",
    low: marriageLow,
    high: marriageHigh,
    isLow: Math.abs(finalLow - marriageLow) < 0.01 && marriageLow >= ageLow,
    isHigh: Math.abs(finalHigh - marriageHigh) < 0.01 && marriageHigh >= ageHigh,
    computation: `0.5 × ${years.toFixed(1)} = ${marriageLow.toFixed(1)} years (low), 1.0 × ${years.toFixed(1)} = ${marriageHigh.toFixed(1)} years (high). Recipient age ${recipientAge} + ${years.toFixed(1)} years = ${(recipientAge + years).toFixed(1)} (Rule of 65 threshold not met).`,
  };

  return {
    type: "fixed",
    marriageLengthTest: marriageTest,
    ageOfChildrenTest: isWCF
      ? {
          testName: "Age of Children (WCF only)",
          low: ageLow,
          high: ageHigh,
          isLow: Math.abs(finalLow - ageLow) < 0.01 && ageLow > marriageLow,
          isHigh: Math.abs(finalHigh - ageHigh) < 0.01 && ageHigh > marriageHigh,
          computation:
            youngestAge !== null
              ? `Youngest child age ${youngestAge}. Low: max(0, ${SCHOOL} − ${youngestAge}) = ${ageLow.toFixed(1)} years. High: max(0, ${HS} − ${youngestAge}) = ${ageHigh.toFixed(1)} years.`
              : "No dependent children.",
        }
      : undefined,
    finalLow,
    finalHigh,
  };
}
