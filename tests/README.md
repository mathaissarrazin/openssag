# SSAG Audit System

Dual-adversarial LLM audit for the openssag engine.

## Why this exists

Traditional regression tests pin outputs to pre-computed "expected" values. That works for refactors but fails on the thing we actually care about: **is the engine correct against the SSAG?** If the fixture is wrong, a green test just means the bug is stable.

This system inverts the model. It never stores expected values. Instead it asks two independent LLM auditors — given the scenario inputs, the engine's output, and the primary legal sources — to *derive* what the SSAG requires and find where the engine departs from it.

The audit output is a narrative finding list, not a diff.

## Architecture

```
scripts/audit-run.ts         Engine CLI — translates audit-schema JSON → engine → flat AuditOutput
tests/
├── fixtures/                Input-only scenario JSONs (non-contiguous numbering is intentional — see "Fixture numbering" below)
├── prompts/
│   ├── tier1-auditor.md     Tier 1 system prompt — adversarial primary auditor
│   └── tier2-reviewer.md    Tier 2 system prompt — adversarial reviewer of Tier 1
├── audit-playbook.md        Primary sources, methodology rules, defensible conventions, scope limits
├── RUNBOOK.md               How to actually run an audit (platform-agnostic)
├── README.md                This file
└── audit-results/           Per-run outputs (gitignored)
    ├── <id>.engine.json     Flat audit-friendly engine output
    ├── <id>.tier1.json      Tier 1 JSON response
    └── <id>.tier2.json      Tier 2 JSON response (if escalated)
```

Everything is platform-agnostic data: fixtures, prompts, playbook. The only code is the engine CLI. To actually drive an audit, see `RUNBOOK.md` — Claude Code, Cursor, Aider, a web chat UI, or a thin custom wrapper all work.

### Why dual auditors

A single model's errors are correlated with its own prior beliefs. Running two adversarial passes in **separate contexts** — Tier 2 never sees Tier 1's derivation, only Tier 1's report — cuts out the shared-distribution failure mode where both auditors quietly agree on the same wrong reading.

Tier 2 is **concern-gated**: it runs only when Tier 1 flags critical/major findings, non-empty concerns_for_tier_2, or confidence=low. This is a cost/latency optimization with a known failure mode: if Tier 1 silently misses a bug and reports high confidence with no findings, Tier 2 never looks. Mitigations:

- Periodic full-audit passes where every fixture escalates regardless.
- Self-test via deliberate bugs (see RUNBOOK).

### Why correctness-based, not fixture-based

If the engine changes from $1214/mo to $1215/mo SSAG mid, a regression test screams. An audit says "still within ±2% of correct." The two modes answer different questions; we want the latter because:
- SSAG is a *guideline*, not a spec — small variations across implementations are normal.
- Tax tables and benefits tables change yearly; engine output shifts even when correctness holds.
- Fixture-based tests freeze in *our current interpretation*. Correctness-based audits force re-derivation each run.

## Running the engine CLI

```bash
npm run audit:cli -- --input tests/fixtures/s1_wcf_split_bc_ab.input.json \
                     --output tests/audit-results/s1.engine.json
```

This is the only code-level command. Running the audit itself is described in `RUNBOOK.md`.

## Fixture numbering

Fixture IDs are stable identifiers, not a contiguous sequence. Gaps in the numbering (e.g. no S3, no S11) are intentional — IDs are preserved across refactors so audit reports keyed by ID remain meaningful. Add new fixtures with the next unused number; do not renumber existing ones.

## Updating the playbook

When the engine changes behaviour that the playbook describes, update `audit-playbook.md` in the same change. The playbook is the contract between the engine and the auditors. A stale playbook produces phantom findings.

