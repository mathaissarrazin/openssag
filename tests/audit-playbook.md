# Audit Playbook — openssag Engine

**Audience.** LLM auditors (Tier 1 primary and Tier 2 reviewer) and the humans reviewing their reports.

**Purpose.** Establish the sources, methodology rules, defensible conventions, and scope limits that the engine implements, so that auditors check correctness *against the actual implementation target* rather than against their own training priors.

> **Reading rule for auditors.** This playbook is your reference, not your oracle. Cite primary sources (SSAG / RUG / FCSG / ITA) directly. Where the engine departs from a strict reading of a primary source, this playbook explains why and points to the governing convention. If you find a discrepancy that is not addressed here, report it as a finding — do not assume the engine must be right.

---

## 1. Primary sources

| Short form | Full title |
|---|---|
| **SSAG 2008** | Spousal Support Advisory Guidelines — Final Version, July 2008 (Rogerson & Thompson, Justice Canada) |
| **RUG 2016** | Spousal Support Advisory Guidelines: The Revised User's Guide, April 2016 (Rogerson & Thompson, Justice Canada) |
| **FCSG** | Federal Child Support Guidelines, SOR/97-175 (current consolidation, Justice Canada) |
| **FCSG Sch. I** | Federal Child Support Tables (Schedule I of the FCSG) |
| **FCSG Sch. III** | Schedule III — Adjustments to income, FCSG |
| **ITA** | Income Tax Act, RSC 1985, c. 1 (5th Supp.) |
| **CRA** | Canada Revenue Agency published guidance — referenced by the line number of the relevant T1 entry (e.g., Line 30400) |

**Citation discipline.** Always cite to a specific section or chapter (e.g., "RUG §8(g)", "SSAG §8.5", "FCSG s.9", "ITA s.118(5)"). Do not cite generically to "the Guidelines." Do not invent section numbers. If unsure, say "citation uncertain" and describe the textual basis.

---

## 2. Methodology rules (what the engine implements, and how)

### 2.1 Formula selection

- **WOCF** (Without-Child Formula): no dependent children at separation.
- **WCF Basic** (With-Child Formula, primary residence with recipient): children live primarily with the lower-income spouse, who is also the SS recipient.
- **WCF Shared**: shared parenting (children with each parent at least ~40% of the time) — set-off-based child support, INDI-based SSAG.
- **WCF Split**: each parent has primary residence of at least one child — set-off-based child support, INDI-based SSAG. Engine convention: **higher-income parent is treated as the notional CS payor for the split-set-off calculation** (RUG §8(g)).
- **WCF Custodial Payor**: the higher-income parent has primary residence of the children — hybrid formula built on WOCF with an INDI floor/ceiling (SSAG §8.9; RUG §8(j)).

### 2.2 Income

- **Guidelines income (FCSG s.16 / Sch. III)** is the single income figure used for *both* child support and spousal support (RUG §6(g)).
- **Non-taxable income** (workers' compensation, on-reserve employment income, long-term disability, etc.) is **grossed up by 25%** (FCSG Sch. III §19 default, referenced in RUG §6.6) into Guidelines income for WOCF / Custodial-Payor GID, s.7 apportionment, and CS table lookups. The **raw** (un-grossed) amount is added to INDI net income in WCF paths as cash-in-hand.
- **Social assistance** is excluded from Guidelines income (FCSG Sch. III §4).
- **Union / professional dues** are deducted only when entered by the user (FCSG Sch. III §1).
- **Lump sums and capital gains** if entered periodically are treated as recurring income; lump sums must be tax-discounted separately and are outside the engine's scope.

### 2.3 Child support

- **Table amount** per FCSG Sch. I, keyed by province of the paying parent (FCSG s.3).
- **Shared** and **Split**: set-off of notional table amounts (FCSG s.9).
- **Custodial Payor**: no CS payable by the lower-income spouse in the standard case (children with the higher earner); CS in the SSAG calculation enters only through the notional-CS deduction of the payor on their WOCF-style base.

### 2.4 Section 7 (special/extraordinary expenses)

- Entered as a single household-level monthly total and apportioned **proportionally to Guidelines income** (FCSG s.7(1)–(2)).
- Apportionment is iterated to convergence where it interacts with INDI and notional CS in WCF paths (RUG §8(b) — s.7 post-transfer apportionment).

### 2.5 INDI (Individual Net Disposable Income) — WCF paths

- `INDI = net income (after tax/CPP/EI) + non-taxable income − notional child support − own s.7 share`.
- SSAG target range for WCF: 40% / 43% / 46% of combined INDI for the recipient (SSAG §8.3; RUG §8.3).
- **Anchor flooring at $0:** if the recipient's pre-transfer INDI share already exceeds the 40% / 43% / 46% target for a given anchor, the corresponding SSAG monthly amount is floored at $0 — a negative transfer is never emitted. This is the correct outcome (no support owing at that anchor) and should not be flagged as a bug. Typical in short-marriage WCF Basic scenarios with modest income gaps where CCB/benefits already push the recipient above the low-end target.
- **Audit-output convention:** each spouse's `taxable_income`, `net_income`, and benefits reflect the **at-mid-SSAG** financial position — i.e., after the payor deducts and the recipient adds $mid × 12 of spousal support. This is the view that feeds SSAG verification downstream. It is *not* a bug for a recipient's `taxable_income` to exceed `gross_income` by roughly the annualized mid anchor, nor for a payor's `taxable_income` to fall below gross by the same amount.

### 2.6 NDI cap (25+ year WOCF)

- For marriages of ~25 years or more under WOCF, the engine applies the **precise NDI-equalization cap**: it computes the amount that equalizes the payor and recipient NDI and caps the high-end SSAG amount at that figure.
- **Fallback:** if the precise NDI-equalization cannot be computed (tax-engine edge case, missing inputs), the engine falls back to the legacy **48%-of-combined-GID cap** documented in SSAG §7.4.1 / RUG §7.4.1.

### 2.7 Duration

- **Length-of-marriage test:** 0.5 to 1 year per year of cohabitation (SSAG §7.5.2 / §8.5).
- **Age-of-children test** (WCF only): from separation until the youngest starts full-time school (low end) to when the youngest finishes high school (high end) (SSAG §8.5).
- **Indefinite** where: marriage ≥ 20 years, **or** Rule of 65 applies (marriage ≥ 5 years AND recipient's age + years of cohabitation ≥ 65), **or** (WCF only) age-of-children test yields a longer duration than length-of-marriage indefinite trigger (RUG §7).
- Duration marks the **end of entitlement**, not a countdown timer (RUG Ch. 3(e)).

### 2.8 Re-partnering

- Engine applies **Option 2** from RUG Ch. 14: coupled base rates for refundable benefits (GST/HST credit, CCB family base, provincial equivalents), and the spousal amount / Eligible Dependant Credit is adjusted per ITA s.118 rules.
- Rationale: SSAG is silent on the sub-mechanic; Option 2 matches the industry-standard convention used by established SSAG implementations.

### 2.9 Shared custody 50/50 NDI equalization point

- For WCF Shared, the engine additionally reports a **50/50 combined-INDI point** as a non-presumptive reference (RUG §8(f)).

---

## 3. Defensible conventions (engine design choices that are *not bugs*)

These are places where the SSAG is silent or permissive; the engine picks a specific convention. Auditors should **note** the convention but should not flag it as a bug unless the engine departs from the convention as stated.

| # | Convention | Source / rationale |
|---|---|---|
| C1 | **Tenant assumption**: both parties are treated as renters for applicable provincial rent credits (e.g., BC Renter's Tax Credit). Homeowner property tax credits are not modelled. | RUG silent on housing credits; tenant assumption is more conservative for Guidelines income. |
| C2 | **CCB in shared custody**: split 50/50 between the parents per CRA rule. | ITA s.122.61(1.1); CRA CCB shared-custody rule. |
| C3 | **OCB (Ontario Child Benefit)** in shared custody: split 50/50. | CRA rule. |
| C4 | **ACFB (Alberta Child and Family Benefit)**: awarded to the custodial parent only in non-shared scenarios — no CRA shared-custody split rule for ACFB. | Alberta CRA administration. |
| C5 | **OEPTC** (Ontario Energy and Property Tax Credit) excluded — depends on rent paid and property tax values not collected by the engine. | Data-completeness choice. |
| C6 | **Eligible Dependant Credit (Line 30400)** in shared/split: one parent only per child per year; engine applies a convention for display. | ITA s.118(5)/(5.1); CRA Line 30400. |
| C7 | **EDC suppression on re-partnering**: when a party is coupled with a new partner, spousal amount (T1 Line 30300) is applied and EDC is suppressed for that party. | ITA s.118 — can't claim both spousal amount and EDC. |
| C8 | **Split custody CS payor assumption**: higher-income parent is the notional CS payor for the split-set-off. | RUG §8(g). |
| C9 | **s.7 apportionment** iterates to convergence with notional CS and INDI in WCF. | Addresses circularity in RUG §8(b). |
| C10 | **Government child benefits are income for SSAG** (not just for CS). | SSAG §6.3–§6.4; RUG §8(a). |
| C11 | **Above-ceiling treatment**: when payor Guidelines income exceeds the $350,000 SSAG ceiling, the formulas are applied to the payor's full income (not truncated at $350k) and a ceiling warning is surfaced. The formulas act as a *floor* above the ceiling, not a hard cap. Judicial discretion is expected to refine the result. | SSAG §11.4; RUG §11 ("formulas as floor above ceiling, not a truncation rule"). |

---

## 4. Scope limitations (intentionally out of scope)

The engine does **not** attempt:

- **Entitlement analysis.** The engine assumes entitlement; this is a legal question (RUG Ch. 2(b)).
- **Lump-sum tax-discounting** (RUG Ch. 2(l)).
- **Restructuring** — trading amount against duration (RUG Ch. 10). The engine reports the raw low/mid/high range.
- **Location within the range** — the engine does not opine on where within the low–high range a specific case should fall (RUG Ch. 9 factors are not modelled).
- **Interim, variation, or review** — the engine computes a single point in time (RUG Ch. 5, Ch. 13).
- **Homeowner-specific credits** (see C1).
- **Provincial tax-system edges** beyond what's encoded in the province-tables data source.

Auditors should **not** report findings in these areas as bugs; they may note them as limitations if relevant to a scenario's realism.

---

## 5. Audit output schema contract

The engine CLI emits a flat JSON structure defined by `AuditOutput` in `scripts/audit-run.ts`. Key fields auditors should rely on:

- `formula_selected`: one of `"WOCF"`, `"WCF Basic"`, `"WCF Shared"`, `"WCF Split"`, `"WCF Custodial Payor"`.
- `payor`, `recipient`: `"spouse_a" | "spouse_b"`.
- `child_support`: `{ applicable, direction, monthly_amount, formula_type, source }`.
- `section_7`: `{ monthly_total, spouse_a_percent, spouse_b_percent, spouse_a_monthly, spouse_b_monthly }`.
- `ssag`: `{ low, mid, high }` each with `{ monthly, payor_indi_monthly, recipient_indi_monthly, recipient_share_percent }`.
- `shared_custody_50_50_ndi_point_monthly`: WCF-Shared only (§2.9).
- `duration`: `{ type, low_years, high_years, indefinite_reason, rule_of_65_applies }`.
- `spouse_a` / `spouse_b`: full financial detail (gross, Guidelines, taxable, tax, benefits, net, notional CS, INDI).
- `warnings`: engine-generated soft warnings — do not treat as findings unless the warning itself is wrong.
- `assumptions_invoked`: array of `{ label, prose }`. Labels are stable identifiers (see §6); prose is the user-facing text.
- `methodology_notes`: titled blocks with a citation each. Auditors should compare the cited rule against primary sources.
- `data_sources`: provenance of tax-table and benefits data.
- `applied_overrides`: caller-supplied overrides — always check whether an override is present before assuming a default was applied.

---

## 6. Stable assumption labels

Auditors matching against assumptions should use `label`, not the prose (prose may be reworded across releases).

| Label | Meaning |
|---|---|
| `income_types_supported` | Enumerates the income types the engine accepts. |
| `social_assistance_excluded` | Social assistance is not Guidelines income (FCSG Sch. III §4). |
| `union_dues_user_entered` | Union / professional dues deducted only when user enters them. |
| `notional_cs_definition` | Definition of notional CS used in INDI. |
| `non_taxable_gross_up` | Non-taxable income grossed up 25% into Guidelines income (§2.2). |
| `edc_convention` | Eligible Dependant Credit handling across split/shared/re-partnered cases (C6, C7). |
| `re_partnering_option_2` | Coupled base rates for refundable benefits on re-partnering (§2.8). |
| `section_7_guidelines_apportionment` | s.7 apportioned by Guidelines income (§2.4). |
| `tenant_assumption` | Both parties treated as renters (C1). |
| `ccb_shared_50_50` | CCB split 50/50 in shared custody (C2). |
| `ocb_shared_50_50` | OCB split 50/50 in shared custody (C3). |
| `acfb_custodial_only` | ACFB to custodial parent only (C4). |
| `oeptc_excluded` | OEPTC not modelled (C5). |
| `imputed_income_display_only` | Imputed income label is display-only — no separate methodology. |
| `other` | Catch-all for any assumption not matching a labelled convention. |

---

## 7. What counts as a finding

A finding is a specific, cite-able discrepancy between the engine output and a primary source (or a stated convention). Each finding must include:

1. **Severity** — `critical` (changes the legal outcome by > $50/mo or misapplies a formula), `major` (wrong citation or wrong formula branch without output impact), `minor` (prose, rounding, methodology-note clarity).
2. **Location** — field path in the audit output (e.g., `ssag.mid.monthly`, `duration.indefinite_reason`).
3. **Expected** — what the primary source (or convention) calls for, with citation.
4. **Observed** — what the engine emitted.
5. **Reasoning** — the chain from primary source to expected.

**Auditors must refuse pre-authored expected values.** The expected comes from the auditor's own reading of the source, not from a fixture-side label. If the auditor cannot derive an expected from a primary source, that is *not* a finding — it is a scope-limit note.

---

*End of playbook.*
