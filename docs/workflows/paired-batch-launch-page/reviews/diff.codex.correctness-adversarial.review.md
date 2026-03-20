---
reviewer: "codex"
lens: "correctness-adversarial"
stage: "diff"
artifact_path: "docs/workflows/paired-batch-launch-page/reviews/implementation.diff.patch"
artifact_sha256: "f739d27c515814eddb7c0e26a428ecf76a95be970b32cfba931ee23f7eb4e1d4"
repo_root: "."
git_head_sha: "266e3a9970b6f64da9708f66cf37a025d6db2d35"
git_base_ref: "origin/domain-defaults-preamble-context"
git_base_sha: "266e3a9970b6f64da9708f66cf37a025d6db2d35"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Route wiring exists in cloud/apps/web/src/App.tsx, standard trial launches still open the modal, and the remaining comments are either covered by the current data flow or are acceptable design tradeoffs for this slice."
raw_output_path: "docs/workflows/paired-batch-launch-page/reviews/diff.codex.correctness-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff correctness-adversarial

## Findings

1. [`cloud/apps/web/src/pages/DefinitionDetail/DefinitionDetail.tsx`](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/DefinitionDetail/DefinitionDetail.tsx) now redirects `job-choice` runs to a new paired-batch route, but this patch does not add any route registration for [`cloud/apps/web/src/pages/DefinitionDetail/StartPairedBatchPage.tsx`](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/DefinitionDetail/StartPairedBatchPage.tsx). Unless that wiring exists elsewhere, the new start action will navigate to an unmapped URL and fail at runtime.

2. [`cloud/apps/web/src/pages/DefinitionDetail/StartPairedBatchPage.tsx`](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/DefinitionDetail/StartPairedBatchPage.tsx) treats missing `resolvedContent`/`content` as a hard "Paired batch unavailable" state and never waits for the definition’s expansion lifecycle. That is a correctness bug for definitions still transitioning through expansion: the page can reject an otherwise eligible vignette simply because the content has not resolved yet, rather than showing a loading state or rechecking once expansion completes.

## Residual Risks

- The paired-batch flow still reuses the same `RunForm`/`StartRunInput` path as trial launches. If paired batches need different validation or server-side semantics beyond label changes, this patch does not enforce them.
- The new `copyMode` only changes visible copy. Any other trial-specific wording or assumptions elsewhere in the form will remain unchanged and can still confuse users of the paired-batch flow.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Route wiring exists in cloud/apps/web/src/App.tsx, standard trial launches still open the modal, and the remaining comments are either covered by the current data flow or are acceptable design tradeoffs for this slice.
