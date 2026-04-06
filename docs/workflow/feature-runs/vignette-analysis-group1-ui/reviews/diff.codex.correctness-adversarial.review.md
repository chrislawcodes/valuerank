---
reviewer: "codex"
lens: "correctness-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/vignette-analysis-group1-ui/reviews/implementation.diff.patch"
artifact_sha256: "904a39e825ea49535a5ff9a80ed493f45ecb9077e957e7da988c6eb2384df5ce"
repo_root: "."
git_head_sha: "a1c887eb123d02287d5f3f4e7ac2e95a1fa42056"
git_base_ref: "9cf5b60dc2f1274c190de0f6d382366a86555257"
git_base_sha: "9cf5b60dc2f1274c190de0f6d382366a86555257"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Accepted: the descending tie-break regression is now covered by test, and the condition detail header keys stay stable by decision code rather than visible label text."
raw_output_path: "docs/workflow/feature-runs/vignette-analysis-group1-ui/reviews/diff.codex.correctness-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff correctness-adversarial

## Findings

- **Medium** `cloud/apps/web/src/components/runs/TranscriptList.tsx:376` adds an unconditional tie-break on `createdAt` and then `id`, but it ignores the active sort direction. For any sort where the primary values compare equal, descending sorts will still resolve ties in ascending time/id order, so the visible ordering can change in ways the user did not ask for. That makes the new "stable" behavior direction-blind rather than consistent with the selected sort.
- **Medium** `cloud/apps/web/src/pages/AnalysisConditionDetail.tsx:464` switches the table header React key from the numeric `code` to the visible `label`. The code was the only guaranteed-unique identifier; labels are derived text and are not guaranteed unique. If two labels collide, React will reconcile the wrong header cells and the decision matrix can render incorrectly.

## Residual Risks

- I did not verify the implementation of `getTranscriptDecisionDisplayMode` and `hasRenderableTranscriptDecisionModelV2`, so any edge cases in the new audit/legacy gating outside the shown call sites remain unreviewed.
- The removal of token-count displays looks intentional, but I did not assess whether any downstream workflow still depends on that metadata being visible in these surfaces.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Accepted: the descending tie-break regression is now covered by test, and the condition detail header keys stay stable by decision code rather than visible label text.
