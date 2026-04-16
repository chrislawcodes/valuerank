---
reviewer: "codex"
lens: "architecture-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/ci-test-quality/plan.md"
artifact_sha256: "5c93ad6b4697c3896cedf60f04d2a6dbe68e7d31433d3e2eb848e4b6fedd77bb"
repo_root: "."
git_head_sha: "2c5aac580a13a7d49fc70672b5d33f584cdc9c62"
git_base_ref: "origin/main"
git_base_sha: "6396d4f22128d811613f066211f9318ead37f425"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/ci-test-quality/reviews/plan.codex.architecture-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan architecture-adversarial

## Findings

- [MEDIUM][UNVERIFIED] Wave 1 removes `src/**/*.test.ts` from Vitest discovery and deletes/moves files based on the assumption that coverage already exists elsewhere. If any `src` test remains relevant, CI will silently stop running it, which is a coverage regression rather than a cleanup.
- [MEDIUM] Adding `--force` to `turbo build` in CI is a blunt workaround. It guarantees rebuilds but also bypasses cache correctness signals, so the workflow can keep passing while the underlying stale-build or dependency-graph problem remains hidden and every run becomes slower.
- [MEDIUM][UNVERIFIED] Wave 2 changes `access-tracking` from `void` to `Promise<void>` but only names one test file for updates. That is an API contract change, so any unaccounted caller or middleware wrapper can now observe different async timing or unhandled rejections.
- [LOW][UNVERIFIED] Wave 5’s split plan is too vague about fixture ownership and shared mocks. Without a defined boundary for what lives in the extracted fixture files, the split can recreate hidden coupling across files or duplicate setup in slightly different ways.

## Residual Risks

- The plan still relies on the moved tests being behaviorally equivalent after path changes, glob changes, and file deletions.
- Wave 4 only addresses the currently identified async `getBy*` patterns; similar flake patterns elsewhere in the web suite may remain.
- The CI changes may reduce visible flakiness in the short term while increasing runtime or hiding the root cause of cache-related failures.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
