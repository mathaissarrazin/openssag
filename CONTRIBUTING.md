# Contributing

Thanks for your interest in openssag.

## Ground rules

1. **Cite a primary source.** Any change that affects a computed output must
   cite the governing provision (SSAG section, RUG page, FCSG section, ITA
   section, or CRA publication). Reviewers will ask for it.
2. **No pinned expecteds for SSAG correctness.** The audit harness
   deliberately refuses pre-authored expected values — see
   `tests/audit-playbook.md`. If you add a regression anchor, it anchors the
   *current* implementation; correctness is separately established by audit.
3. **Tax and benefits are year-specific.** When adding a new tax year, mirror
   the 2026 file layout rather than retrofitting existing files.
4. **No UI.** This repo is the calculation core only. Presentation layers
   belong downstream.

## Filing an issue

Describe the scenario (inputs, expected output, actual output) and cite the
primary source your expected value is derived from. Engine output alone is not
a bug report.

## Pull requests

- Add or update a regression anchor in `scripts/validate-ssag.ts` when
  changing SSAG behaviour.
- Run `npm run typecheck` and `npm run validate:ssag` before opening.
- Describe the SSAG / FCSG / ITA basis in the PR body.

## Security

Report suspected correctness bugs or security issues privately via GitHub's
**Security Advisories** — use the "Report a vulnerability" button on the
Security tab of this repository. Please do not open a public issue for
correctness or security reports before they've been triaged privately.
