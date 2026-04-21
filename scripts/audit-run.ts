/**
 * Engine CLI wrapper for the audit system.
 *
 * Takes a scenario JSON (audit schema) from --input, translates to the
 * engine's SSAGInput, runs calculateSpousalSupport + buildDetailedReport,
 * and emits a flat audit-friendly JSON at --output.
 *
 * Usage:
 *   npm run audit:cli -- --input tests/fixtures/s1_wcf_split_bc_ab.input.json \
 *                       --output tests/audit-results/s1.engine.json
 *
 * The audit output schema is deliberately separate from the engine's internal
 * types so that (a) the schema is stable when engine internals change and
 * (b) auditors see a machine-comparable, flat shape.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { calculateSpousalSupport } from "../lib/spousal-support/calculator";
import { buildDetailedReport } from "../lib/spousal-support/report";
import type {
  SSAGInput,
  SpouseInput,
  ChildEntry,
  SpousalSupportProvince,
  SSAGResult,
} from "../types/spousal-support";
import type {
  DetailedReport,
  SpouseFinancialDetail,
  BenefitDetail,
} from "../types/ssag-detail";

// ── Audit input schema (from the brief, adapted) ─────────────────────────────

interface AuditIncomeSources {
  t4?: number;
  se?: number;
  pension?: number;
  eligible_div?: number;
  non_eligible_div?: number;
  other?: number;
  rrsp?: number;
  capital_gains?: number;
  /** Non-taxable income (WCB, on-reserve, LTD). Grossed up 25% in Guidelines income per RUG §6.6. */
  non_taxable?: number;
}

interface AuditSpouseInput {
  age: number;
  province: SpousalSupportProvince;
  income_sources?: AuditIncomeSources;
  union_dues?: number;
  re_partnered?: boolean;
  partner_net_income?: number;
  /** Display-only — engine accepts but performs no SSAG methodology changes. */
  imputed?: boolean;
  /** Optional reported income shown alongside `grossIncome` when imputation is applied. */
  reported_income?: number;
  /** Blended-family prior obligations — FCSG s.18 Guidelines-income adjustments. */
  prior_child_support_paid?: number;
  prior_spousal_support_paid?: number;
  prior_spousal_support_received?: number;
  prior_child_support_received?: number;
}

interface AuditChild {
  birthdate: string;
  residence: "spouse_a" | "spouse_b" | "shared";
}

interface AuditScenarioInput {
  cohabitation_start: string;
  separation_date: string;
  spouse_a: AuditSpouseInput;
  spouse_b: AuditSpouseInput;
  children: AuditChild[];
  section_7_monthly: number;
}

// ── Audit output schema ──────────────────────────────────────────────────────

interface AuditBenefit {
  name: string;
  amount: number;
}
interface AuditConsideredNotApplicable {
  benefit: string;
  reason: string;
}

interface AuditSpouseOutput {
  label: string;
  gross_income: number;
  guidelines_income: number;
  taxable_income: number;
  federal_tax_owing: number;
  provincial_tax_owing: number;
  cpp_total: number;
  ei_total: number;
  benefits: AuditBenefit[];
  benefits_total: number;
  considered_not_applicable: AuditConsideredNotApplicable[];
  net_income: number;
  notional_cs_monthly: number | null;
  indi_monthly: number | null;
  edc_claimed: boolean;
  edc_rationale: string;
  is_coupled: boolean;
  new_partner_net_income: number;
  actual_income?: number;
  prior_support?: {
    child_support_paid: number;
    spousal_support_paid: number;
    spousal_support_received: number;
    child_support_received: number;
  };
}

interface AuditCSBlock {
  applicable: boolean;
  direction: "spouse_a_to_spouse_b" | "spouse_b_to_spouse_a" | null;
  monthly_amount: number;
  formula_type: "basic" | "shared_setoff" | "split_setoff" | "table_amount" | null;
  source: string;
}

interface AuditSection7Block {
  monthly_total: number;
  spouse_a_percent: number;
  spouse_b_percent: number;
  spouse_a_monthly: number;
  spouse_b_monthly: number;
}

interface AuditSSAGPoint {
  monthly: number;
  payor_indi_monthly: number | null;
  recipient_indi_monthly: number | null;
  recipient_share_percent: number | null;
}

interface AuditDuration {
  type: "fixed" | "indefinite";
  low_years: number | null;
  high_years: number | null;
  indefinite_reason: string | null;
  rule_of_65_applies: boolean;
}

interface AuditAssumption {
  label: string;
  prose: string;
}

export interface AuditOutput {
  scenario_id?: string;
  engine_version?: string;
  formula_selected: string;
  formula_rationale: string;
  formula_citation: string;
  payor: "spouse_a" | "spouse_b";
  recipient: "spouse_a" | "spouse_b";
  years_of_relationship: number;
  gross_income_difference: number;
  child_support: AuditCSBlock;
  section_7: AuditSection7Block;
  ssag: {
    low: AuditSSAGPoint;
    mid: AuditSSAGPoint;
    high: AuditSSAGPoint;
  };
  shared_custody_50_50_ndi_point_monthly: number | null;
  duration: AuditDuration;
  spouse_a: AuditSpouseOutput;
  spouse_b: AuditSpouseOutput;
  warnings: string[];
  assumptions_invoked: AuditAssumption[];
  methodology_notes: Array<{ title: string; body: string; citation: string }>;
  data_sources: Array<{ label: string; value: string; source: string; url?: string }>;
  applied_overrides: Array<{ scope: string; label: string; formatted_value: string }>;
}

// ── Input translation ────────────────────────────────────────────────────────

function toSpouseInput(label: string, s: AuditSpouseInput): SpouseInput {
  const inc = s.income_sources ?? {};
  const t4 = inc.t4 ?? 0;
  const out: SpouseInput = {
    label,
    grossIncome: t4,
    ageAtSeparation: s.age,
    province: s.province,
  };
  if (s.union_dues) out.unionDues = s.union_dues;
  if (inc.se) out.selfEmploymentIncome = inc.se;
  if (inc.pension) out.pensionIncome = inc.pension;
  if (inc.eligible_div) out.eligibleDividends = inc.eligible_div;
  if (inc.non_eligible_div) out.nonEligibleDividends = inc.non_eligible_div;
  if (inc.other) out.otherIncome = inc.other;
  if (inc.rrsp) out.rrspWithdrawals = inc.rrsp;
  if (inc.capital_gains) out.capitalGainsActual = inc.capital_gains;
  if (inc.non_taxable) out.nonTaxableIncome = inc.non_taxable;
  if (s.re_partnered) {
    out.isCoupled = true;
    out.newPartnerNetIncome = s.partner_net_income ?? 0;
  }
  if (s.imputed) out.isImputed = true;
  if (s.reported_income !== undefined) out.reportedIncome = s.reported_income;
  if (s.prior_child_support_paid) out.priorChildSupportPaid = s.prior_child_support_paid;
  if (s.prior_spousal_support_paid) out.priorSpousalSupportPaid = s.prior_spousal_support_paid;
  if (s.prior_spousal_support_received) out.priorSpousalSupportReceived = s.prior_spousal_support_received;
  if (s.prior_child_support_received) out.priorChildSupportReceived = s.prior_child_support_received;
  return out;
}

function toChildEntries(kids: AuditChild[]): ChildEntry[] {
  return kids.map((c, i) => ({
    id: `c${i}`,
    birthdate: c.birthdate,
    residence:
      c.residence === "spouse_a"
        ? "spouse1"
        : c.residence === "spouse_b"
          ? "spouse2"
          : "shared",
  }));
}

function translateInput(scenario: AuditScenarioInput): SSAGInput {
  const spouse1 = toSpouseInput("Spouse A", scenario.spouse_a);
  const spouse2 = toSpouseInput("Spouse B", scenario.spouse_b);
  const hasChildren = scenario.children.length > 0;
  const input: SSAGInput = {
    spouse1,
    spouse2,
    cohabitationStartDate: scenario.cohabitation_start,
    separationDate: scenario.separation_date,
    hasChildren,
  };
  if (hasChildren) {
    input.children = {
      children: toChildEntries(scenario.children),
      section7MonthlyTotal: scenario.section_7_monthly ?? 0,
    };
  }
  return input;
}

// ── Output flattening ────────────────────────────────────────────────────────

const FORMULA_LABEL: Record<SSAGResult["formula"], string> = {
  "without-child": "WOCF",
  "with-child-basic": "WCF Basic",
  "with-child-shared": "WCF Shared",
  "with-child-split": "WCF Split",
  "with-child-custodial-payor": "WCF Custodial Payor",
};

function flattenBenefits(d: SpouseFinancialDetail): AuditBenefit[] {
  return d.benefits
    .filter((b: BenefitDetail) => b.finalAmount !== 0)
    .map((b) => ({ name: b.benefitName, amount: round2(b.finalAmount) }));
}

function flattenConsidered(d: SpouseFinancialDetail): AuditConsideredNotApplicable[] {
  return d.benefitsConsidered.map((c) => ({ benefit: c.benefitName, reason: c.reason }));
}

function toSpouseOutput(
  label: "spouse_a" | "spouse_b",
  detail: SpouseFinancialDetail | undefined,
  echo: { grossIncome: number; guidelinesIncome: number; isCoupled?: boolean; newPartnerNetIncome?: number },
): AuditSpouseOutput {
  if (!detail) {
    // WOCF path — the report's spouse block is synthesized separately.
    return {
      label,
      gross_income: echo.grossIncome,
      guidelines_income: echo.guidelinesIncome,
      taxable_income: 0,
      federal_tax_owing: 0,
      provincial_tax_owing: 0,
      cpp_total: 0,
      ei_total: 0,
      benefits: [],
      benefits_total: 0,
      considered_not_applicable: [],
      net_income: 0,
      notional_cs_monthly: null,
      indi_monthly: null,
      edc_claimed: false,
      edc_rationale: "",
      is_coupled: echo.isCoupled ?? false,
      new_partner_net_income: echo.newPartnerNetIncome ?? 0,
    };
  }
  const benefits = flattenBenefits(detail);
  return {
    label,
    gross_income: round2(detail.grossIncome),
    guidelines_income: round2(echo.guidelinesIncome),
    taxable_income: round2(detail.taxableIncome),
    federal_tax_owing: round2(detail.federalTax.taxOwed),
    provincial_tax_owing: round2(detail.provincialTax.taxOwed),
    cpp_total: round2(detail.payroll.cppTotal),
    ei_total: round2(detail.payroll.ei),
    benefits,
    benefits_total: round2(detail.benefitsTotal),
    considered_not_applicable: flattenConsidered(detail),
    net_income: round2(detail.netIncome),
    notional_cs_monthly: detail.notionalCSMonthly ?? null,
    indi_monthly: detail.indiMonthly ?? null,
    edc_claimed: detail.claimsEDC,
    edc_rationale: detail.edcRationale,
    is_coupled: detail.isCoupled,
    new_partner_net_income: detail.newPartnerNetIncome,
    ...(detail.actualIncome !== undefined ? { actual_income: round2(detail.actualIncome) } : {}),
    ...(detail.priorSupport
      ? {
          prior_support: {
            child_support_paid: round2(detail.priorSupport.childSupportPaid),
            spousal_support_paid: round2(detail.priorSupport.spousalSupportPaid),
            spousal_support_received: round2(detail.priorSupport.spousalSupportReceived),
            child_support_received: round2(detail.priorSupport.childSupportReceived),
          },
        }
      : {}),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function classifyIndefiniteReason(reason: string | undefined): string | null {
  if (!reason) return null;
  if (/rule of 65/i.test(reason)) return "rule_of_65";
  if (/20.?year|≥ ?20|>= ?20/i.test(reason)) return "20_year_marriage";
  if (/age.?of.?children/i.test(reason)) return "age_of_children";
  return "other";
}

function buildCSBlock(result: SSAGResult, report: DetailedReport): AuditCSBlock {
  const monthly = result.childSupportMonthly ?? 0;
  if (!result.childSupportPayor || monthly === 0) {
    return {
      applicable: false,
      direction: null,
      monthly_amount: 0,
      formula_type: null,
      source:
        report.dataSources.find((d) => /Federal Child Support Guidelines|Schedule I/i.test(d.source))
          ?.source ?? "Federal Child Support Guidelines, Schedule I",
    };
  }
  const direction =
    result.childSupportPayor === 1 ? "spouse_a_to_spouse_b" : "spouse_b_to_spouse_a";
  let formula: AuditCSBlock["formula_type"];
  switch (result.formula) {
    case "with-child-shared":
      formula = "shared_setoff";
      break;
    case "with-child-split":
      formula = "split_setoff";
      break;
    case "with-child-basic":
    case "with-child-custodial-payor":
      formula = "basic";
      break;
    default:
      formula = "table_amount";
  }
  const source =
    report.dataSources.find((d) => /Schedule I|Federal Child Support Guidelines/i.test(d.source))?.source ??
    report.childSupport?.tableVersion ??
    "Federal Child Support Guidelines, Schedule I";
  return {
    applicable: true,
    direction,
    monthly_amount: round2(monthly),
    formula_type: formula,
    source,
  };
}

function buildS7Block(result: SSAGResult, scenario: AuditScenarioInput): AuditSection7Block {
  const monthly = scenario.section_7_monthly ?? 0;
  const payorProp = result.section7PayorProportion ?? 0;
  const payorIsA = result.payor === 1;
  const aProp = payorIsA ? payorProp : 1 - payorProp;
  const bProp = 1 - aProp;
  return {
    monthly_total: monthly,
    spouse_a_percent: round2(aProp * 100),
    spouse_b_percent: round2(bProp * 100),
    spouse_a_monthly: round2(monthly * aProp),
    spouse_b_monthly: round2(monthly * bProp),
  };
}

function buildSSAGBlock(result: SSAGResult): AuditOutput["ssag"] {
  const indi = result.indi;
  const mk = (lvl: "low" | "mid" | "high"): AuditSSAGPoint => ({
    monthly: round2(result.monthlyAmount[lvl]),
    payor_indi_monthly: indi ? round2(indi.payorMonthly[lvl]) : null,
    recipient_indi_monthly: indi ? round2(indi.recipientMonthly[lvl]) : null,
    recipient_share_percent: indi ? round2(indi.recipientSharePercent[lvl]) : null,
  });
  return { low: mk("low"), mid: mk("mid"), high: mk("high") };
}

function buildDuration(result: SSAGResult): AuditDuration {
  const d = result.duration;
  if (d.type === "indefinite") {
    return {
      type: "indefinite",
      low_years: null,
      high_years: null,
      indefinite_reason: classifyIndefiniteReason(d.reason) ?? d.reason,
      rule_of_65_applies: /rule of 65/i.test(d.reason ?? ""),
    };
  }
  return {
    type: "fixed",
    low_years: round2(d.range.low),
    high_years: round2(d.range.high),
    indefinite_reason: null,
    rule_of_65_applies: false,
  };
}

function labelAssumption(prose: string): string {
  const lower = prose.toLowerCase();
  if (/option 2|coupled base rates/.test(lower)) return "re_partnering_option_2";
  if (/renter|tenant/.test(lower)) return "tenant_assumption";
  if (/ccb.*shared.*50|shared custody.*ccb/.test(lower)) return "ccb_shared_50_50";
  if (/ocb.*50.*50|ontario child benefit.*split/.test(lower)) return "ocb_shared_50_50";
  if (/acfb|alberta child and family benefit/.test(lower)) return "acfb_custodial_only";
  if (/oeptc|ontario energy and property/.test(lower)) return "oeptc_excluded";
  if (/edc|eligible dependant/.test(lower)) return "edc_convention";
  if (/section 7|s\.7/.test(lower)) return "section_7_guidelines_apportionment";
  if (/imputed/.test(lower)) return "imputed_income_display_only";
  if (/non.?taxable/.test(lower)) return "non_taxable_gross_up";
  if (/notional child support/.test(lower)) return "notional_cs_definition";
  if (/union.*dues|professional dues/.test(lower)) return "union_dues_user_entered";
  if (/social assistance|ontario works|odsp|aish/.test(lower)) return "social_assistance_excluded";
  if (/income types supported|t4 employment|self-employment/.test(lower)) return "income_types_supported";
  return "other";
}

function buildAuditOutput(scenario: AuditScenarioInput): AuditOutput {
  const ssInput = translateInput(scenario);
  const result = calculateSpousalSupport(ssInput);
  const report = buildDetailedReport(ssInput, result);

  const spouseAEcho = report.inputsEcho.spouse1;
  const spouseBEcho = report.inputsEcho.spouse2;

  const payorIsA = result.payor === 1;
  const payorDetail = report.payorDetail;
  const recipientDetail = report.recipientDetail;
  const spouseADetail = payorIsA ? payorDetail : recipientDetail;
  const spouseBDetail = payorIsA ? recipientDetail : payorDetail;

  const out: AuditOutput = {
    formula_selected: FORMULA_LABEL[result.formula],
    formula_rationale: report.formulaRationale,
    formula_citation: report.formulaCitation,
    payor: payorIsA ? "spouse_a" : "spouse_b",
    recipient: payorIsA ? "spouse_b" : "spouse_a",
    years_of_relationship: round2(result.yearsOfRelationship),
    gross_income_difference: round2(result.grossIncomeDifference),
    child_support: buildCSBlock(result, report),
    section_7: buildS7Block(result, scenario),
    ssag: buildSSAGBlock(result),
    shared_custody_50_50_ndi_point_monthly:
      result.sharedCustody50_50NDIPoint?.monthlySpousalSupport != null
        ? round2(result.sharedCustody50_50NDIPoint.monthlySpousalSupport)
        : null,
    duration: buildDuration(result),
    spouse_a: toSpouseOutput("spouse_a", spouseADetail, spouseAEcho),
    spouse_b: toSpouseOutput("spouse_b", spouseBDetail, spouseBEcho),
    warnings: report.warnings,
    assumptions_invoked: report.assumptions.map((prose) => ({
      label: labelAssumption(prose),
      prose,
    })),
    methodology_notes: report.methodologyNotes.map((m) => ({
      title: m.title,
      body: m.body,
      citation: m.citation,
    })),
    data_sources: report.dataSources.map((d) => ({
      label: d.label,
      value: d.value,
      source: d.source,
      url: d.url,
    })),
    applied_overrides: (report.appliedOverrides ?? []).map((o) => ({
      scope: o.scope,
      label: o.label,
      formatted_value: o.formattedValue,
    })),
  };
  return out;
}

// ── CLI entry ────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): { input?: string; output?: string } {
  const out: { input?: string; output?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input") out.input = argv[++i];
    else if (a === "--output") out.output = argv[++i];
  }
  return out;
}

function main() {
  const { input, output } = parseArgs(process.argv.slice(2));
  if (!input || !output) {
    console.error("Usage: audit-run --input <scenario.json> --output <result.json>");
    process.exit(2);
  }
  const inputPath = resolve(input);
  const outputPath = resolve(output);
  const scenario = JSON.parse(readFileSync(inputPath, "utf8")) as AuditScenarioInput;
  const result = buildAuditOutput(scenario);
  // Tag the output with the scenario filename stem for downstream reporting.
  const stem = inputPath.split(/[\\/]/).pop()?.replace(/\.input\.json$/i, "") ?? "";
  result.scenario_id = stem;
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(result, null, 2) + "\n", "utf8");
  console.log(`Wrote audit output → ${outputPath}`);
}

// Allow programmatic use from tests/run-audit.ts
export { buildAuditOutput, translateInput };
export type { AuditScenarioInput };

// ESM entry-point detection: tsx resolves __filename via import.meta.url.
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`
    || process.argv[1]?.endsWith("audit-run.ts")) {
  main();
}
