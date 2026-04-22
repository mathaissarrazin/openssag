# OpenSSAG

An open-source TypeScript implementation of Canada's **Spousal Support Advisory
Guidelines (SSAG)** — the Without Child Support Formula (WCSF) and all four
With Child Support Formula (WCF) variants — together with the federal and
provincial tax and Federal Child Support Guidelines (FCSG) engines that the
SSAG requires as inputs.

Live (embeddable) demo available at [simplyseparation.ca/embed/spousal-support](https://www.simplyseparation.ca/embed/spousal-support)

> **Status:** early release. The engine has been validated against the SSAG
> User's Guide worked examples and a growing set of regression anchors, and
> ships with a dual-adversarial LLM audit harness (see `tests/`). It is not a
> substitute for legal advice, and no output constitutes a legal opinion.

## Requirements

- Node.js 20 or later
- TypeScript 5 (if consuming types; plain JavaScript consumers are supported)

## Install

OpenSSAG is not yet published to npm. For now, consume it by cloning this
repository and importing from `lib/` directly:

```bash
git clone https://github.com/mathaissarrazin/OpenSSAG.git
cd OpenSSAG
npm install
```

A published `npm install openssag` package will ship with the first tagged
release.

## Quickstart

```ts
import { calculateSpousalSupport } from "./lib/spousal-support/calculator";
import type { SSAGInput } from "./types/spousal-support";

const input: SSAGInput = {
  spouse1: {
    label: "Spouse 1",
    grossIncome: 100_000,
    ageAtSeparation: 41,
    province: "BC",
  },
  spouse2: {
    label: "Spouse 2",
    grossIncome: 22_000,
    ageAtSeparation: 38,
    province: "AB",
  },
  cohabitationStartDate: "2013-01-01",
  separationDate: "2026-04-19",
  hasChildren: true,
  children: {
    children: [
      { id: "c1", birthdate: "2018-01-01", residence: "spouse1" },
      { id: "c2", birthdate: "2020-01-01", residence: "spouse2" },
    ],
    section7MonthlyTotal: 0,
  },
};

const result = calculateSpousalSupport(input);

console.log(result.formula);        // "with-child-split"
console.log(result.monthlyAmount);  // { low: …, mid: …, high: … }
console.log(result.duration);       // { type: "fixed", range: { … } }  or indefinite
console.log(result.warnings);       // string[]
```

Full input/output shapes are in [`types/spousal-support.ts`](types/spousal-support.ts).

## Entry points

| Module | Entry point | Purpose |
| --- | --- | --- |
| `lib/spousal-support/calculator.ts` | `calculateSpousalSupport(input)` | SSAG engine — all five formulas, INDI, duration, floor rules, s.7 |
| `lib/child-support/calculator.ts` | `calculateChildSupport(input)`, `lookupTableAmount(income, n, prov)` | FCSG Schedule I lookups and s.9 set-off |
| `lib/tax/index.ts` | `calculateNetIncome(input)`, `calculateBracketTax(…)`, per-province tables | 2026 federal + provincial tax and benefits |
| `lib/spousal-support/report.ts` | `buildSpousalSupportReport(…)` | Detailed methodology report (optional, consumer-facing explainer text) |

## What's in the box

| Module | What it does |
| --- | --- |
| `lib/spousal-support/` | SSAG engine: WCSF, WCF Basic / Shared / Split / Custodial-payor, INDI, duration, floor rules, s.7, report generation |
| `lib/child-support/` | FCSG Schedule I table lookups and calculator |
| `lib/tax/` | 2026 federal + 13 provincial/territorial tax engines, CPP/EI, net-income derivation, CCB / GST / provincial benefits |
| `types/` | Input and output type definitions |
| `tests/fixtures/` | Input-only scenario JSONs |
| `tests/` | Audit playbook, runbook, and prompts for dual-tier LLM audits |
| `scripts/` | Validators (`validate-ssag`, `validate-tax-engine`, etc.) and the audit CLI |

## Validate

```bash
npm run validate:ssag       # SSAG User's Guide examples + regression anchors
npm run validate:tax        # federal + provincial tax engine sanity
npm run test:provinces      # per-province benefit + tax spot checks
npm run typecheck
```

## Run an audit

The audit harness asks two independent LLM auditors to derive the SSAG-correct
output from primary sources and compare against the engine. Outputs are never
pinned. See `tests/README.md` and `tests/RUNBOOK.md`.

```bash
npm run audit:cli -- --input tests/fixtures/s1_wcf_split_bc_ab.input.json \
                     --out tests/audit-results/s1.engine.json
```

## Scope and non-goals

**In scope**
- Federal SSAG formulas as published in SSAG 2008 + RUG 2016
- FCSG Schedule I tables (all provinces, all child counts)
- 2026 federal + provincial tax, CPP/EI, major refundable and non-refundable
  credits relevant to SSAG INDI computation

**Out of scope (for now)**
- Provincial spousal-support statutes and provincial case law variations
- Retroactive support calculations
- Years other than 2026 (historical and future years are a roadmap item)
- Complex corporate income attribution under FCSG s.18 beyond the basic
  line-150 convention

## Contributing

See `CONTRIBUTING.md`.

## License

Apache License 2.0 — see `LICENSE` and `NOTICE`.

## Disclaimer

This software is provided "as is," without warranty of any kind. It is a
reference implementation of public-domain statutory formulas. It is **not**
legal advice, and its outputs are not a substitute for the advice of a
qualified family-law lawyer in your jurisdiction. The authors and contributors
make no representation that the implementation is complete or free of error,
and accept no liability for any use of this software or reliance on its
output.
