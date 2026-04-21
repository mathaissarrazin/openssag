/**
 * Ontario personal income tax — 2026 tax year.
 *
 * Ontario is the only province with a surtax, applied on top of the basic
 * Ontario tax (after non-refundable credits). Two tiers:
 *   20% on Ontario tax > $5,818
 *   Additional 36% (= 56% total) on Ontario tax > $7,446
 *
 * The LIFT credit (Low-income Individuals and Families Tax credit) is a
 * non-refundable credit applied AFTER the surtax. It phases out at 5% of
 * individual net income above $32,500, fully extinguished at $50,000.
 *
 * Sources:
 *   Ontario Ministry of Finance — Personal Income Tax
 *     https://www.ontario.ca/document/personal-income-tax-rates
 *   CRA ON428 — Ontario Tax (Form and instructions, T1 General 2025 as
 *     2026 proxy for LIFT/surtax parameters where 2026 figures not yet
 *     published by the province)
 *     https://www.canada.ca/en/revenue-agency/services/forms-publications/tax-packages-years/general-income-tax-benefit-package.html
 */

export const ON_2026 = {
  year: 2026,
  jurisdiction: "on" as const,
  brackets: [
    { upTo:  53_891, rate: 0.0505 },
    { upTo: 107_785, rate: 0.0915 },
    { upTo: 150_000, rate: 0.1116 },
    { upTo: 220_000, rate: 0.1216 },
    { upTo: Infinity, rate: 0.1316 },
  ],
  basicPersonalAmount: 12_989,
  creditRate: 0.0505,
  /**
   * Ontario's eligible dependant (equivalent-to-married) amount is distinct
   * from the BPA. For 2026: $11,029 per ON428 line 58160.
   */
  eligibleDependantAmount: 11_029,
  /**
   * Ontario Health Premium (OHP) — charged after LIFT credit on ON428.
   * Not indexed. Phase-in at each tier boundary.
   */
  ohp: {
    tiers: [
      { fromTI: 20_000, toTI: 25_000, base: 0,   phaseInRate: 0.06 },
      { fromTI: 25_000, toTI: 36_000, base: 300,  phaseInRate: 0    },
      { fromTI: 36_000, toTI: 38_500, base: 300,  phaseInRate: 0.06 },
      { fromTI: 38_500, toTI: 48_000, base: 450,  phaseInRate: 0    },
      { fromTI: 48_000, toTI: 48_600, base: 450,  phaseInRate: 0.25 },
      { fromTI: 48_600, toTI: 72_000, base: 600,  phaseInRate: 0    },
      { fromTI: 72_000, toTI: 72_600, base: 600,  phaseInRate: 0.25 },
      { fromTI: 72_600, toTI: 200_000, base: 750, phaseInRate: 0    },
      { fromTI: 200_000, toTI: 200_600, base: 750, phaseInRate: 0.25 },
    ] as const,
    maxPremium: 900,
  },
  surtax: {
    /** 20% surtax applies on Ontario tax above this threshold */
    threshold1: 5_818,
    /** Additional 36% surtax (56% total) applies on Ontario tax above this */
    threshold2: 7_446,
  },
  lift: {
    /** Maximum LIFT credit for a single individual */
    maxCredit: 875,
    /** Phase-out begins above this individual net income */
    phaseOutThreshold: 32_500,
    /** 5% of income above threshold reduces the credit; fully eliminated at ~$50K */
    phaseOutRate: 0.05,
  },
};
