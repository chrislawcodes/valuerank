---
reviewer: "gemini"
lens: "coverage-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/condition-weighted-winrate/tasks.md"
artifact_sha256: "b7fb7b52ddfd4eb6b36ce3064ed005810ef02d901f47e5f99154a2a40264b916"
repo_root: "."
git_head_sha: "d0a9b73555aebe903a25a4bc3f3e1863d9d2dfba"
git_base_ref: "origin/main"
git_base_sha: "d0a9b73555aebe903a25a4bc3f3e1863d9d2dfba"
generation_method: "codex-runner-as-gemini-fallback"
resolution_status: "accepted"
resolution_note: "HIGH F001 (compute_value_stats type): added T001b. MEDIUM F002 (small-sample): user decision. LOW F003: rationale in plan.md. LOW F004: getPriorityCount/formatCount removed by T012."
raw_output_path: "docs/workflow/feature-runs/condition-weighted-winrate/reviews/tasks.gemini.coverage-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: "Gemini rate-limited; Codex used as fallback per user instruction"
---

# Review: tasks coverage-adversarial

## Findings

| Severity | ID | Finding |
| --- | --- | --- |
| **HIGH** | F001 | **Type Mismatch in compute_value_stats.** T001 and T003 change `ValueCounts` fields to `float`, but `compute_value_stats` still has `int` parameters. T003's loop will call it with floats, causing type-checker failures. |
| **MEDIUM** | F002 | **Small-sample warning removed without replacement.** T004 removes `SMALL_SAMPLE` / `MODERATE_SAMPLE` warnings. The new `conditionCount` field (T002) could be used to provide a condition-based warning, but the plan removes the guardrail instead of adapting it. |
| **LOW** | F003 | **Rationale for equal-run weighting absent from tasks.** T007 and T009 change weights without explaining why in the task list. |
| **LOW** | F004 | **`getPriorityCount`/`formatCount` helpers could be called elsewhere.** If used outside `PairedRunComparisonCard.tsx`, removing count rendering breaks those call sites too. |

## Residual Risks

- The tasks do not add any backfill script tests. If the backfill fails silently mid-run, there's no automated way to detect a partially-migrated dataset.

## Resolution
- status: accepted
- note: HIGH F001 (compute_value_stats type): added T001b. MEDIUM F002 (small-sample): user decision. LOW F003: rationale in plan.md. LOW F004: getPriorityCount/formatCount removed by T012.
