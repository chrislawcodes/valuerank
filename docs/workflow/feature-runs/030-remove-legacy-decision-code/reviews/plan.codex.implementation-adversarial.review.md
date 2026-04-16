---
reviewer: "codex"
lens: "implementation-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/030-remove-legacy-decision-code/plan.md"
artifact_sha256: "9d15bbe45b6dbd3cd1fdf98579fc211e33f7eb8ee9e7e8777d1ce8ff7035c761"
repo_root: "."
git_head_sha: "adee0cd336e4555f34e0ea676185dff6636e93ac"
git_base_ref: "origin/fix/audit-mode-no-legacy-fallback"
git_base_sha: "adee0cd336e4555f34e0ea676185dff6636e93ac"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/030-remove-legacy-decision-code/reviews/plan.codex.implementation-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan implementation-adversarial

## Findings

1. **Medium [UNVERIFIED] ConditionMatrix is under-scoped for the data it now needs.** The plan says `ConditionMatrix.tsx` should show strength while color encodes the winner, but it also admits the component currently only has aggregate `prioritized`/`deprioritized`/`neutral` counts. The new logic needs either per-side strength buckets or a different approximation, yet no upstream file is included to supply that shape. If the data is not already available, this is a dead-end or a silent semantic downgrade.

2. **Medium [UNVERIFIED] Legacy-job compatibility is removed without a cutover path.** The plan deletes score parsing and fallback logic from both TypeScript and Python workers, but it does not define a dual-read, version gate, or requeue strategy for queued payloads already in flight. If any job, export, or stored payload still carries `score` or `decisionCode`, the deploy can break work that was serialized before the change.

3. **Low [UNVERIFIED] The KS-test change is only partly validated.** The plan asserts that mapping to signed strengths preserves the statistic, but it only promises one parity test and does not cover other consumers that may sort, bin, or label by the old 1-5 codes. Ordinal equivalence is not enough if adjacent code assumes non-negative bucket values or uses numeric codes as keys.

## Residual Risks

- Mixed historical data may still surface in stored aggregates or long-lived API responses, so compatibility issues can remain even after the main code paths are updated.
- Removing `legacy` from GraphQL and MCP outputs will still break external clients that do not regenerate types from this repo.
- ConditionMatrix may still be lossy if the only upstream data is aggregate win/loss counts rather than the canonical 5-bucket breakdown.
- Worker behavior after deploy still depends on whether any queued jobs were serialized under the old schema at cutover time.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
