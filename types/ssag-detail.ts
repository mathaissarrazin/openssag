/**
 * Types for the Detailed Calculation Report.
 *
 * Every computed value in the SSAG calculation can be traced through this
 * structure. The report is generated from the same inputs as the main
 * result, calling the same underlying tax/benefit functions, so there is
 * no risk of divergence between the report and the calculator output.
 */

export interface BracketLine {
  /** e.g. "14% × first $58,523" */
  description: string;
  rate: number;
  taxableInBracket: number;
  taxInBracket: number;
}

export interface CreditLine {
  /** e.g. "Basic Personal Amount (BPA)" */
  label: string;
  baseAmount: number;
  rate: number;
  credit: number;
  /** Optional note, e.g. "clawback applied at income > $181,440" */
  note?: string;
}

export interface BracketTaxDetail {
  jurisdiction: "federal" | "bc" | "ab" | "on" | "sk" | "mb" | "nb" | "ns" | "pe" | "nl" | "yt" | "nt" | "nu";
  taxableIncome: number;
  brackets: BracketLine[];
  bracketTotal: number;
  credits: CreditLine[];
  creditTotal: number;
  /** Final tax owing. For Ontario: basicTax + surtax − liftCredit. */
  taxOwed: number;
  /** Ontario only: surtax computed on basic Ontario tax after non-refundable credits */
  surtax?: number;
  /** Ontario only: LIFT credit reducing Ontario tax after surtax (non-refundable) */
  liftCredit?: number;
  /** Ontario only: Ontario Health Premium added after LIFT credit (ON428 line 42) */
  healthPremium?: number;
}

export interface PayrollDetail {
  gross: number;
  /** For CPP1 */
  pensionableEarnings: number;
  basicExemption: number;
  cpp1Rate: number;
  cpp1: number;
  /** For CPP2 (on earnings YMPE–YAMPE) */
  cpp2Earnings?: number;
  cpp2Rate?: number;
  cpp2?: number;
  /**
   * Self-employment CPP (both employee and employer shares, base + enhanced
   * combined). Present when selfEmploymentIncome > 0. Reported separately
   * from CPP1/CPP2 because SE earners pay both halves.
   */
  selfEmploymentCPP?: number;
  /** Pensionable earnings for SE CPP (combined CPP1 + CPP2 pensionable attributable to SE). */
  selfEmploymentCPPPensionable?: number;
  cppTotal: number;
  eiInsurable: number;
  eiRate: number;
  ei: number;
}

export interface BenefitDetail {
  benefitName: string;
  benefitYear: string;
  maxAmount: number;
  /** Phase-out breakdown (if applicable) */
  phaseOut?: {
    threshold: number;
    rate: number;
    excessIncome: number;
    reduction: number;
  };
  additional?: { label: string; amount: number }[];
  finalAmount: number;
  /** For shared custody 0.5 multiplier */
  multiplier?: number;
  notes?: string[];
}

export interface SpouseFinancialDetail {
  label: string;
  grossIncome: number;
  isImputed: boolean;
  actualIncome?: number;
  unionDues: number;
  spousalSupportPaid: number;
  spousalSupportReceived: number;

  taxableIncomeComponents: Array<{ label: string; amount: number }>;
  taxableIncome: number;

  federalTax: BracketTaxDetail;
  provincialTax: BracketTaxDetail;
  payroll: PayrollDetail;

  benefits: BenefitDetail[];
  benefitsTotal: number;

  /**
   * Benefits that the calculator evaluated for this party but which
   * resolved to $0 (fully phased out, income below phase-in floor, etc.).
   * Listed to make the transparency claim explicit — practitioners can
   * see every benefit the engine considered, not just the ones that
   * happened to pay out.
   */
  benefitsConsidered: Array<{ benefitName: string; reason: string }>;

  netIncome: number;

  /**
   * SSAG-specific INDI adjustments — present only for With-Child-Support
   * Formula variants. Omitted for WOCF, where INDI is not a target and the
   * Net Income line is the meaningful SSAG figure.
   */
  notionalCSMonthly?: number;
  notionalCSAnnual?: number;
  notionalCSDescription?: string; // e.g. "table amount at $50,000 income for 1 child"
  section7Share?: number;
  section7SharePercent?: number;

  /** Final INDI = netIncome - notional CS - S7 share. WCF only. */
  indi?: number;
  indiMonthly?: number;

  /** Whether this spouse claims the Eligible Dependant Credit, and the rule that governs it. */
  claimsEDC: boolean;
  edcRationale: string;

  /** True if this spouse is re-partnered (spousal amount credit replaces EDC) */
  isCoupled: boolean;
  /** New partner's net income used for spousal credit calculation */
  newPartnerNetIncome: number;

  /**
   * Prior support obligations (FCSG s.18 / blended-family).
   * Present only when at least one of the four amounts is non-zero; the
   * receiver (prior CS received) is exposed for transparency even though it
   * is excluded from Guidelines income and INDI by default.
   */
  priorSupport?: {
    childSupportPaid: number;
    spousalSupportPaid: number;
    spousalSupportReceived: number;
    /** Shown for transparency; not included in Guidelines income or INDI. */
    childSupportReceived: number;
  };
}

export interface SolverLevelDetail {
  level: "low" | "mid" | "high";
  targetSharePercent: number;
  spousalSupportAnnual: number;
  spousalSupportMonthly: number;
  payorINDIAnnual: number;
  recipientINDIAnnual: number;
  recipientSharePercent: number;
  /** True if solver hit upper bound without reaching target */
  atUpperBound: boolean;
}

export interface DurationTestDetail {
  testName: string;
  /** Years at low / mid / high */
  low: number;
  high: number;
  /** Whether this test won at each end */
  isLow: boolean;
  isHigh: boolean;
  computation: string; // human-readable explanation
}

export interface DurationDetail {
  type: "fixed" | "indefinite";
  reason?: string;
  marriageLengthTest?: DurationTestDetail;
  ageOfChildrenTest?: DurationTestDetail;
  finalLow?: number;
  finalHigh?: number;
}

export interface ChildSupportDetail {
  formula: "sole" | "shared-set-off" | "split-set-off";
  payor: 1 | 2;
  recipient: 1 | 2;
  monthlyAmount: number;
  annualAmount: number;
  /** For sole: table lookup at payor income. For shared: each parent's amount + set-off. For split: each's obligation for other's kids. */
  components: Array<{ label: string; amount: number; note?: string }>;
  tableVersion: string;
}

export interface DataSource {
  label: string;
  value: string;
  source: string;
  url?: string;
}

/**
 * A single SSAG methodology choice with the authority that governs it.
 * Shown in the "Methodology & Citations" section so a reviewer can trace
 * every SSAG-specific choice to its source.
 */
export interface MethodologyNote {
  title: string;
  /** The choice we make, in plain language. */
  body: string;
  /** Authoritative citation — SSAG chapter, ITA section, CRA rule, etc. */
  citation: string;
}

/**
 * Custodial Payor variant uses the Without-Child-Support formula applied
 * to gross incomes adjusted by each party's own notional child support
 * (SSAG Revised User's Guide 2016 Ch. 14). This breakdown exposes that
 * computation for full transparency.
 */
export interface CustodialPayorBreakdown {
  custodialIncome: number;
  custodialNotionalAnnual: number;
  custodialAdjusted: number;
  nonCustodialIncome: number;
  nonCustodialNotionalAnnual: number;
  nonCustodialAdjusted: number;
  adjustedGID: number;
  effectiveYears: number;
  lowPercent: number;
  midPercent: number;
  highPercent: number;
  lowAnnual: number;
  midAnnual: number;
  highAnnual: number;
}

export interface DetailedReport {
  /**
   * High-level statement of SSAG compliance — displayed at the top of the
   * report so a reviewer understands the authorities the calculation is
   * built from.
   */
  complianceStatement: string;

  /** Assumptions the calculator relies on (renter status, employment income, etc.) */
  assumptions: string[];

  /**
   * Key SSAG methodology choices (notional CS convention, EDC assignment,
   * Section 7 apportionment, etc.) each tied to an authoritative citation.
   */
  methodologyNotes: MethodologyNote[];

  /** Arrangement identified (WOCF or which WCF variant) */
  formulaLabel: string;
  formulaRationale: string;
  /** Short citation for the formula choice, e.g. "SSAG Revised User's Guide 2016 §8.3" */
  formulaCitation: string;

  /** Section 7 apportionment method note — shown when S7 > 0. */
  section7Note?: string;

  /** Input echo */
  inputsEcho: {
    yearsOfRelationship: number;
    cohabitationStartDate: string;
    separationDate: string;
    spouse1: { label: string; grossIncome: number; guidelinesIncome: number; age: number; imputed?: boolean; isCoupled?: boolean; newPartnerNetIncome?: number };
    spouse2: { label: string; grossIncome: number; guidelinesIncome: number; age: number; imputed?: boolean; isCoupled?: boolean; newPartnerNetIncome?: number };
    children: Array<{ birthdate: string; age: number; residence: string }>;
    section7MonthlyTotal: number;
  };

  /** Per-spouse financial detail (WCF) — omitted for WOCF */
  payorDetail?: SpouseFinancialDetail;
  recipientDetail?: SpouseFinancialDetail;

  /** Child support (WCF) */
  childSupport?: ChildSupportDetail;

  /** SSAG solver output at each target (WCF) */
  solverLevels?: SolverLevelDetail[];

  /** WOCF-specific breakdown */
  wocfBreakdown?: {
    grossIncomeDifference: number;
    effectiveYears: number;
    lowPercent: number;
    midPercent: number;
    highPercent: number;
    capApplied: string;
    lowAnnual: number;
    midAnnual: number;
    highAnnual: number;
  };

  /**
   * WOCF-only: compares each party's Net Income before and after the SS
   * transfer at Low, Mid, and High levels. Makes the gross formula numbers
   * legible as cash-flow decisions and surfaces the combined deadweight tax
   * cost at each level of the SSAG range.
   */
  taxImpact?: TaxImpactSummary;

  /**
   * WOCF-only: compact Before-SS financial summaries for payor and
   * recipient. Lets the reader reconcile the "Before SS" column in the
   * Tax Impact table to a visible breakdown — the main Financial Detail
   * blocks show the At-Mid state, not the counterfactual.
   */
  beforeSSPayor?: BeforeSSBreakdown;
  beforeSSRecipient?: BeforeSSBreakdown;

  /**
   * Custodial Payor variant — exposes the SSAG Ch. 14 income-adjusted
   * WOCF calculation. Present only when `formula === "with-child-custodial-payor"`.
   */
  custodialPayorBreakdown?: CustodialPayorBreakdown;

  /**
   * Shared-custody RUG §8(f) presumptive "50/50 NDI point" — the monthly
   * SS amount that leaves each household with equal net disposable income.
   * Present only for shared-custody results.
   */
  sharedCustody50_50NDIPoint?: {
    monthlySpousalSupport: number;
    atUpperBound: boolean;
    /** True if this amount lies between Low and High — usually the case. */
    withinRange: boolean;
  };

  /** Duration calculation */
  duration: DurationDetail;

  /** All data sources + versions used */
  dataSources: DataSource[];

  /** Warnings raised during calculation */
  warnings: string[];

  /**
   * List of overrides pinned for this calculation. Absent or empty when
   * no overrides were supplied.
   */
  appliedOverrides?: AppliedOverride[];
}

/**
 * Compact summary of a party's financial state at zero SS. Populated only
 * in the WOCF report path so practitioners can reconcile the "Before SS"
 * numbers in the Tax Impact table to a source breakdown without reading
 * the full Financial Detail block (which is rendered at Mid SS).
 */
export interface BeforeSSBreakdown {
  label: string;
  grossIncome: number;
  taxableIncome: number;
  federalTax: number;
  provincialTax: number;
  cpp: number;
  ei: number;
  benefitsTotal: number;
  netIncome: number;
}

export interface TaxImpactRow {
  label: string;
  beforeSS: number;
  atLow: number;
  atMid: number;
  atHigh: number;
  changeLow: number;
  changeMid: number;
  changeHigh: number;
}

export interface TaxImpactSummary {
  /** Annual SS amounts at each SSAG level. */
  lowSSAnnual: number;
  midSSAnnual: number;
  highSSAnnual: number;
  payor: TaxImpactRow;
  recipient: TaxImpactRow;
  combined: TaxImpactRow;
}

export interface AppliedOverride {
  /** Which spouse the override targets (undefined for calculation-wide overrides). */
  scope: "A" | "B" | "global";
  /** Human-readable field name. */
  label: string;
  /** Pre-formatted display value ("$42,000", "43.00%", etc.). */
  formattedValue: string;
}
