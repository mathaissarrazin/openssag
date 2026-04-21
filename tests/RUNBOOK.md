# Audit Runbook

How to run a correctness audit against the engine using the LLM agent of your choice. This runbook is intentionally agent-agnostic — it describes *inputs and outputs*, not tooling.

## Inputs to every audit

1. **Playbook** — `tests/audit-playbook.md`
2. **Fixture** — any `tests/fixtures/*.input.json`
3. **Engine output** — produced by running:
   ```bash
   npm run audit:cli -- --input tests/fixtures/<id>.input.json \
                        --output tests/audit-results/<id>.engine.json
   ```
4. **Prompt** — `tests/prompts/tier1-auditor.md` (Tier 1) or `tests/prompts/tier2-reviewer.md` (Tier 2)

All four are plain files. Any LLM that can read text and return text can run the audit.

## Tier 1 — primary audit

Give the agent the Tier 1 prompt as its system/instructions, and the following as its user message:

```
# Playbook
<contents of tests/audit-playbook.md>

# Scenario input (inputs only — no expected values)
<contents of the fixture>

# Engine audit output
<contents of <id>.engine.json>

Derive expected values from the inputs + primary sources, then compare
to the engine output. Return JSON only.
```

Save the JSON response as `tests/audit-results/<id>.tier1.json`.

## Tier 2 — adversarial review (concern-gated)

Escalate to Tier 2 only if Tier 1 returned:
- one or more `critical` or `major` findings, **or**
- a non-empty `concerns_for_tier_2` list, **or**
- `confidence: "low"`.

**Use a fresh agent context for Tier 2.** Tier 2 must not share context with Tier 1 — that's the point of dual auditing.

Give the agent the Tier 2 prompt as its system/instructions, and the following as its user message:

```
# Playbook
<contents of tests/audit-playbook.md>

# Scenario input (inputs only — no expected values)
<contents of the fixture>

# Engine audit output
<contents of <id>.engine.json>

# Tier 1 report (adjudicate adversarially)
<contents of <id>.tier1.json>

Return JSON only.
```

Save the JSON response as `tests/audit-results/<id>.tier2.json`.

## Agent-specific recipes

These are convenience notes — the pattern above works anywhere.

### Claude Code / Cursor / Aider / similar in-repo agents

Ask the agent directly:

> Run a Tier 1 audit on fixture S1. Follow `tests/RUNBOOK.md`. Invoke `npm run audit:cli` yourself to generate the engine output. Return the Tier 1 JSON and save it to `tests/audit-results/s1.tier1.json`.

For Tier 2, start a fresh session (/clear or a new conversation) so the reviewer's context is clean, then:

> Run a Tier 2 adversarial review on S1. Follow `tests/RUNBOOK.md`. The Tier 1 report is at `tests/audit-results/s1.tier1.json`.

### Web chat UI (Claude.ai, ChatGPT, etc.)

Paste the Tier 1 prompt as a custom instruction or system message, then paste the concatenated user message (playbook + fixture + engine output). Copy the JSON response out.

For Tier 2, use a new chat with the Tier 2 prompt.

### Programmatic (custom wrapper)

A thin wrapper script can call whatever provider's SDK directly. The contract above (four inputs, JSON out) is stable regardless of provider — Anthropic, OpenAI, Google, OpenRouter, local models. The wrapper is ~50 lines.

We intentionally do *not* ship a provider-specific wrapper here so the audit system stays platform-agnostic.

## Self-test — deliberate-bug procedure

To verify the audit system itself detects errors:

1. Introduce a deliberate bug in the engine — e.g., in `lib/spousal-support/with-child-basic.ts`, change the SSAG mid from 43% to 53%.
2. Re-run `npm run audit:cli` on S7 to regenerate the engine output.
3. Run a Tier 1 audit on S7.
4. **Expect**: a `critical` finding at `ssag.mid.monthly` citing SSAG §8.3 / RUG §8.3.
5. Revert the bug.

If Tier 1 misses the bug, investigate: is the playbook stating the 40/43/46% target? Is the prompt enforcing compute-first? Is the model capable enough (bug classes requiring multi-step arithmetic need frontier models)?

Bug classes worth exercising periodically:
- Formula mis-selection (force WCF Basic where Split applies)
- Payor/recipient direction swap
- Duration truncation (cap an indefinite case at 10 years)
- Fabricated citation (the engine cites RUG §99.99)
- Silent rounding drift ($50/mo systematic offset)

## Cost envelope

Approximate tokens per call:
- Input: 30–50k (playbook + scenario + engine output, plus Tier 1 report for Tier 2)
- Output: 2–5k

One fixture with Tier 2 escalation is two calls. Run pricing depends entirely on your provider — check their page.

## Model recommendation

Use a frontier reasoning model. SSAG derivation involves multi-step arithmetic and legal-rule application; weaker models will hallucinate citations and drift on anchors. For Claude specifically, use the latest Opus.

## Updating the playbook

When the engine changes behaviour that the playbook describes, update `audit-playbook.md` in the same change. The playbook is the contract between the engine and the auditors. A stale playbook produces phantom findings.
