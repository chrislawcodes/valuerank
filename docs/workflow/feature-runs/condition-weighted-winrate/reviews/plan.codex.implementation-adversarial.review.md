---
reviewer: "codex"
lens: "implementation-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/condition-weighted-winrate/plan.md"
artifact_sha256: "3542adcf056b225cae8475f4611bed1a6fa4692821c8fee0f8d5ccf8c7664fac"
repo_root: "."
git_head_sha: "d0a9b73555aebe903a25a4bc3f3e1863d9d2dfba"
git_base_ref: "origin/main"
git_base_sha: "d0a9b73555aebe903a25a4bc3f3e1863d9d2dfba"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "HIGH (conditionCount required): plan updated — ModelStats uses NotRequired[int] for zero-downtime. MEDIUM (idempotency check): plan updated — hasConditionWeightedShape checks ALL perModel entries, not any one. MEDIUM (small-sample warning): user decision to remove, documented in spec. MEDIUM (MCP deregistration): code-confirmed file-driven auto-discovery — file deletion is sufficient."
raw_output_path: "docs/workflow/feature-runs/condition-weighted-winrate/reviews/plan.codex.implementation-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan implementation-adversarial

## Findings

- High: Step 12’s backfill idempotency check is wrong. It says to skip a row when `any` `perModel` entry has `conditionCount`, but Step 2’s design says a row is only fully backfilled when `every` entry has it. Using `any` will false-skip mixed-shape rows and leave some analyses permanently on the old math.
- Medium [UNVERIFIED]: The rollout order can poison the fresh snapshot cache. The plan bumps `DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION` before the backfill, so any cache rebuild that happens during the backfill window can store stale or mixed old/new data under the new version and keep serving it after the backfill finishes.
- Medium: Step 3 rounds each per-condition fraction to 6 decimals, but the test plan also demands `count.prioritized + count.deprioritized + count.neutral == conditionCount` within `1e-9`. Independent rounding of three fractions per value will not reliably preserve that conservation property and can bias downstream win-rate math.
- Medium [UNVERIFIED]: The plan never defines the all-unscored case. If a model has conditions but no signed-distance scores, Step 3 will pass an empty `condition_means` list to `compute_model_summary`; if that helper does not already handle empty input, this path will fail or emit NaNs.

## Residual Risks

- Deleting `export-pairwise-outcomes` is a breaking removal for any external MCP consumer or ad hoc script that still calls it.
- The verification checklist is internally inconsistent about skipped rows in the dry run, which makes rollout validation easy to misread.
- The plan assumes the validator and cache layers already accept the new fractional count shape and optional `conditionCount`; if they do not, the code may compile but still fail at runtime.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: HIGH (conditionCount required): plan updated — ModelStats uses NotRequired[int] for zero-downtime. MEDIUM (idempotency check): plan updated — hasConditionWeightedShape checks ALL perModel entries, not any one. MEDIUM (small-sample warning): user decision to remove, documented in spec. MEDIUM (MCP deregistration): code-confirmed file-driven auto-discovery — file deletion is sufficient.
