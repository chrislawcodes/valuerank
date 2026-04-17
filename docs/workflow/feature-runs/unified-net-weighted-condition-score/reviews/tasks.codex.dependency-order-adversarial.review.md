---
reviewer: "codex"
lens: "dependency-order-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/unified-net-weighted-condition-score/tasks.md"
artifact_sha256: "b63e0140e5a360e79dd91deb41d39c2b5d6f4be7d9567a76e6d7f994bacb45dd"
repo_root: "."
git_head_sha: "6bb16c97a0d101ee6d86aabaa5765d61fa877208"
git_base_ref: "origin/main"
git_base_sha: "6bb16c97a0d101ee6d86aabaa5765d61fa877208"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "MEDIUM (existing 1.5 rejection test stale) fixed via S2-T5 flip. MEDIUM (help-text showDetails gate) fixed via S3-T6 click. LOW (no direct totalTrials mismatch regression in Slice 2) fixed — S2-T5 adds off-by-1 totalTrials test that must fire the red callout."
raw_output_path: "docs/workflow/feature-runs/unified-net-weighted-condition-score/reviews/tasks.codex.dependency-order-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks dependency-order-adversarial

## Findings

- **Medium**: Slice 2 leaves the existing non-integer rejection test in [`cloud/apps/web/tests/pages/DomainAnalysisValueDetail.test.tsx`](/Users/chrislaw/valuerank/.claude/worktrees/tender-cerf/cloud/apps/web/tests/pages/DomainAnalysisValueDetail.test.tsx) unchanged. That file currently treats `1.5` as an invalid canonical count, so unless the task explicitly removes or inverts that case, the suite will keep asserting the old “integers only” rule after `validateMatrixCondition` is supposed to accept fractional counts. [CODE-CONFIRMED]
- **Medium**: The new Pivot help-text assertion in [`cloud/apps/web/tests/components/analysis/PivotAnalysisTable.test.tsx`](/Users/chrislaw/valuerank/.claude/worktrees/tender-cerf/cloud/apps/web/tests/components/analysis/PivotAnalysisTable.test.tsx) is underspecified. The descriptive copy lives behind the `showDetails` branch in [`cloud/apps/web/src/components/analysis/PivotAnalysisTable.tsx`](/Users/chrislaw/valuerank/.claude/worktrees/tender-cerf/cloud/apps/web/src/components/analysis/PivotAnalysisTable.tsx), so the test needs an explicit `Details` click before checking for `"net-weighted preference score"`. Without that step, the added test will never reach the target text. [CODE-CONFIRMED]
- **Low**: Slice 2 does not add a direct regression for a `totalTrials` mismatch in [`cloud/apps/web/tests/pages/DomainAnalysisValueDetail.test.tsx`](/Users/chrislaw/valuerank/.claude/worktrees/tender-cerf/cloud/apps/web/tests/pages/DomainAnalysisValueDetail.test.tsx). The validator change still depends on that guard, but the planned test additions only cover fractional validity and cross-field inconsistency, so an incorrect tolerant-equality implementation could slip through. [CODE-CONFIRMED]

## Residual Risks

- Slice 1 will intentionally break the three target view files until S2 and S3 land. If the workflow pauses between slices, `tsc` will stay red by design.
- The Pivot help text and matrix validation both sit behind branch-specific UI states. The planned tests need to drive those branches exactly, or regressions can still hide behind passing assertions.
- Current generated GraphQL and page-level code still expose legacy `selectedValueWinRate` outside the scoped components. That is intentional in the plan, but it means grep-based cleanup checks must stay tightly scoped to avoid false failures.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: MEDIUM (existing 1.5 rejection test stale) fixed via S2-T5 flip. MEDIUM (help-text showDetails gate) fixed via S3-T6 click. LOW (no direct totalTrials mismatch regression in Slice 2) fixed — S2-T5 adds off-by-1 totalTrials test that must fire the red callout.
