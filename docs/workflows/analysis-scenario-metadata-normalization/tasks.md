# Analysis Scenario Metadata Normalization Tasks

## Current Status

Workflow initialized manually because the repo runner is blocked in this checkout. Spec and plan checkpoints still use the workflow artifact structure and Gemini review records.

## Task List

- [x] Choose the bounded workflow scope and create the workflow folder
- [x] Write `spec.md`
- [x] Write `plan.md`
- [x] Write `tasks.md`
- [x] Save spec Codex review
- [x] Run and save spec Gemini review
- [x] Reconcile spec findings in `plan.md`
- [x] Save plan Codex review
- [x] Run and save plan Gemini review
- [x] Reconcile plan findings in `plan.md`
- [x] Implement canonical scenario metadata normalization
- [x] Add regression tests for legacy numeric scenarios
- [x] Add regression tests for job-choice `dimension_values`
- [x] Verify warning, grouping, and stability behavior with normalized metadata
- [x] Save implementation diff artifact and run diff reviews
