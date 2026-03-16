---
reviewer: "codex"
lens: "correctness"
stage: "diff"
artifact_path: "docs/workflows/domain-first-site-ia-migration/reviews/wave-8-usability-hardening.diff.patch"
artifact_sha256: "f0f7ac8a1589be9e6ef1a338c9606100a7c99a79fd08abb44399087e0b2acfb8"
repo_root: "."
git_head_sha: "ad1056848eaf99799e005d2b73be7a3e1f9287f2"
git_base_ref: "origin/main"
git_base_sha: "ad1056848eaf99799e005d2b73be7a3e1f9287f2"
generation_method: "codex-session"
resolution_status: "accepted"
resolution_note: "No blocking correctness issue remains in the Wave 8 slice; the new exact links, configuration-review affordances, findings-state wording, and query-string restore behavior match the intended usability hardening and are covered by focused web tests."
raw_output_path: ""
---

# Review: diff correctness

## Findings
No blocking correctness issue was found in this wave.

The diff lines up with the intended usability fixes:

1. `Dashboard` now provides exact resume links into an active domain’s setup, findings, and evaluation launcher instead of only high-level navigation
2. `Domains` persists domain workspace state through `domainId`, `tab`, and `setupTab` query params, which makes the new exact links restorable
3. `LaunchControlsPanel` and `LaunchConfirmModal` now surface configuration review explicitly before launch, including direct links back to setup coverage and vignette overrides
4. `LaunchStatusPanel` and `DomainTrialsDashboard` now distinguish domain-evaluation cohort tracking from run-scoped diagnostics more clearly
5. `DomainAnalysis` now labels the current evidence scope directly and makes the diagnostics-only state harder to misread as auditable findings

## Residual Risks
1. The new query-string restore logic is intentionally narrow. If future waves add more workspace state, that sync logic should be kept coherent rather than expanded opportunistically.
2. The touched test suites still emit existing non-blocking React `act(...)` warnings. They did not hide failures in this slice, but they remain cleanup debt.

## Resolution
- status: accepted
- note: No blocking correctness issue remains in the Wave 8 slice; the new exact links, configuration-review affordances, findings-state wording, and query-string restore behavior match the intended usability hardening and are covered by focused web tests.
