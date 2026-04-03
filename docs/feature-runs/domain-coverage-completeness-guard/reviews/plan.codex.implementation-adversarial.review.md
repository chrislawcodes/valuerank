---
reviewer: "codex"
lens: "implementation-adversarial"
stage: "plan"
artifact_path: "docs/feature-runs/domain-coverage-completeness-guard/plan.md"
artifact_sha256: "444816f3feae02738f662797ee438a7d60e79f40381486fe3e17eff818523f09"
repo_root: "."
git_head_sha: "7e06a2a7970de5894586516244030f86b6c3fc3e"
git_base_ref: "origin/030-remove-legacy-decision-code"
git_base_sha: "7e06a2a7970de5894586516244030f86b6c3fc3e"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Accepted: the plan intentionally keeps historical runs without persisted runScenarioSelection out of live coverage totals and routes them through the audit script instead of inventing a third live state; the paired-batch and bulk-loading behavior are bounded by the explicit coverageState fields and the bulk-query decision already recorded in the plan."
raw_output_path: "docs/feature-runs/domain-coverage-completeness-guard/reviews/plan.codex.implementation-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan implementation-adversarial

## Findings

- **Medium [UNVERIFIED]**: The plan excludes every historical run without a persisted `runScenarioSelection` from coverage counts, but it does not define a live "unknown coverage" state. That means normal coverage surfaces can quietly omit real runs until someone checks the audit output, which makes the reported coverage look better than it is.
- **Medium**: Empty expected-key sets are marked "not coverage-complete," but the plan does not say how that state should be surfaced when `missingKeyCount = 0`. That creates an ambiguous case where a cell or batch can look clean on counts while still being excluded from coverage totals.
- **Medium [UNVERIFIED]**: The paired-batch rule is too blunt. If one run in a group is incomplete, the whole group stops counting for coverage, but the plan does not preserve a separate "some runs complete" signal at the aggregate level. One bad run can therefore erase an otherwise mostly complete group from coverage reporting.
- **Low [UNVERIFIED]**: The bulk-completeness design assumes all relevant transcript keys can be loaded in one query and held in memory. The plan does not define any chunking or guardrail for large domains, so the "avoid N+1" fix can still become a single large hotspot or fail on scale.

## Residual Risks

- Coverage totals will drop sharply by design, so rollout messaging has to explain that the new numbers are stricter, not broken.
- The audit script only helps if someone owns the backfill or repair path for excluded historical runs.
- The legacy UI fallback is still under-specified, so some paths may continue to hide incomplete metadata until every query surface is migrated.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Accepted: the plan intentionally keeps historical runs without persisted runScenarioSelection out of live coverage totals and routes them through the audit script instead of inventing a third live state; the paired-batch and bulk-loading behavior are bounded by the explicit coverageState fields and the bulk-query decision already recorded in the plan.
