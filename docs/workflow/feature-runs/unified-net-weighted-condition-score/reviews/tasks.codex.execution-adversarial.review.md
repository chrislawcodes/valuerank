---
reviewer: "codex"
lens: "execution-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/unified-net-weighted-condition-score/tasks.md"
artifact_sha256: "b63e0140e5a360e79dd91deb41d39c2b5d6f4be7d9567a76e6d7f994bacb45dd"
repo_root: "."
git_head_sha: "6bb16c97a0d101ee6d86aabaa5765d61fa877208"
git_base_ref: "origin/main"
git_base_sha: "6bb16c97a0d101ee6d86aabaa5765d61fa877208"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "HIGH (neutral-tie branch missing from bundle helper) fixed in tasks.md; MEDIUM (1.5 test flip) fixed via S2-T5; MEDIUM (Details click) fixed via S3-T6."
raw_output_path: "docs/workflow/feature-runs/unified-net-weighted-condition-score/reviews/tasks.codex.execution-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks execution-adversarial

## Findings

1. **HIGH** [CODE-CONFIRMED] `cloud/apps/web/src/utils/canonicalConditionSummary.ts#L144` still treats every non-opponent, non-null score as blue, because `getCanonicalConditionBackground()` and `getCanonicalConditionTextColor()` have no neutral-tie branch. The tasks for `getConditionCellDisplay()` only spell out the `hasData: false` case, so if implemented literally, a real tie (`direction === 'neutral'` with `hasData === true`) will still get tinted instead of rendering gray/no fill. That would break the intended tie-neutral behavior.

2. **MEDIUM** [CODE-CONFIRMED] `cloud/apps/web/tests/pages/DomainAnalysisValueDetail.test.tsx#L441` still contains the `['non-integer', 1.5]` case under `rejects invalid canonical counts`. The plan says Slice 2 removes the integer-only guard, so this test must flip to acceptance or be deleted. As written, the tasks never call out this existing failing assertion, so the suite will keep expecting old behavior.

3. **MEDIUM** [CODE-CONFIRMED] `cloud/apps/web/src/components/analysis/PivotAnalysisTable.tsx#L293` gates the help copy behind `showDetails && (...)`. The new help-text test in S3-T6 only says to assert the substring `"net-weighted preference score"`, but it does not say to click the `Details` button first. Without that interaction, the test will not find the element.

## Residual Risks

- The plan intentionally leaves `selectedValueWinRate` and other legacy winner-only terminology in generated GraphQL types and unrelated pages. That is scoped out, but the repo will still contain old naming outside the three target views.
- `canonicalConditionSummary.ts` still depends on `localeCompare` for the canonical first/opponent split. The tasks correctly defer that, but locale-sensitive behavior can still swap sides in different environments.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: HIGH (neutral-tie branch missing from bundle helper) fixed in tasks.md; MEDIUM (1.5 test flip) fixed via S2-T5; MEDIUM (Details click) fixed via S3-T6.
