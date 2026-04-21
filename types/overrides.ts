/**
 * Per-spouse and calculation-wide overrides — caller-supplied values that
 * replace engine-computed intermediates.
 *
 * Intended use: when the tool's tax/benefit tables drift (e.g. after the
 * project is no longer maintained), callers can pin current-law values per
 * spouse to keep the SSAG calculation running on current parameters without
 * waiting for an engine update.
 *
 * Only `manualSpousalSupport` is currently consumed end-to-end by the
 * calculation pipeline. The remaining fields are wired through the tax and
 * benefit layers; consumers that do not need them may omit them.
 */

export interface SpouseOverrides {
  // ── Tax layer ──────────────────────────────────────────────────────────
  /** Federal tax at spousal-support=0. Combined with marginalRate to track SS changes. */
  federalTaxAtZeroSS?: number;
  /** Provincial tax at spousal-support=0. */
  provincialTaxAtZeroSS?: number;
  /**
   * Combined federal + provincial marginal tax rate (decimal, e.g. 0.43).
   * Applied to the spousal support delta when the caller has pinned tax
   * values. Single combined rate per spouse.
   */
  marginalRate?: number;
  /** CPP contributions — does not move with SS (based on gross). */
  cpp?: number;
  /** EI premiums — does not move with SS. */
  ei?: number;

  // ── Benefits ───────────────────────────────────────────────────────────
  /** Canada Child Benefit (annual). */
  ccb?: number;
  /** GST/HST credit (annual). */
  gstCredit?: number;
  /**
   * Single rolled-up provincial benefit override (BC Family Benefit + Sales
   * Tax Credit + Renters Credit + ACFB/OCB/etc). Per-benefit overrides add
   * complexity for marginal values.
   */
  provincialBenefits?: number;
  /** Spousal amount credit (Line 30300 equivalent). */
  spousalAmountCredit?: number;

  // ── SSAG-layer derived values ──────────────────────────────────────────
  /** Annual notional child support contribution (table amount on own income). */
  notionalChildSupport?: number;
  /** Own annual share of Section 7 expenses. */
  section7OwnShare?: number;

  /**
   * Escape hatch — if set, the entire tax engine is bypassed for this spouse.
   * Net income at SS=0 is used directly; SS deltas are applied via
   * marginalRate. Takes precedence over per-field tax overrides.
   */
  netIncomeAtZeroSS?: number;

  /**
   * Refundable-benefits convention for a re-partnered spouse. Controls how
   * CCB, GST/HST credit, CWB, and provincial refundable credits are computed
   * when `isCoupled=true`:
   *   - undefined (default): coupled base rates + claimant-only AFNI
   *   - "coupled-household-afni": coupled base + (claimant + partner) AFNI
   *   - "unattached": single base rates + claimant-only AFNI
   * Does not affect the spousal amount credit or EDC suppression — those
   * follow real marital status. Has no effect when `isCoupled=false`.
   */
  benefitsConvention?: "coupled-household-afni" | "unattached";
}

export interface Overrides {
  spouse1?: SpouseOverrides;
  spouse2?: SpouseOverrides;
  /**
   * Solver bypass — when set, skip the binary-search INDI solver entirely
   * and report what happens at this SS amount. The `monthlyAmount` range
   * in the result collapses to the single caller-supplied value (low=mid=high),
   * and the INDI display shows the resulting share rather than targeted 40/43/46%.
   */
  manualSpousalSupport?: { monthly: number };
}
