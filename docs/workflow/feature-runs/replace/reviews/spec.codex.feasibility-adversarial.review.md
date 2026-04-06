---
reviewer: "codex"
lens: "feasibility-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/replace/spec.md"
artifact_sha256: "59fbf4ee5695cdb3a2a0961407ffd960fcf648d9ae5f3ba684e919bf189fac2b"
repo_root: "."
git_head_sha: "10bf94660675d2780d47c779703b906d451a9b22"
git_base_ref: "origin/main"
git_base_sha: "345d03f7eff71bacc8cef3a464cd4024ce6fa092"
generation_method: "codex-runner"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/replace/reviews/spec.codex.feasibility-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec feasibility-adversarial

## Findings

1. **High**: The aggregation plan is internally inconsistent. It says to remove the `decisionCode` filter from all three resolvers and use canonical decisions for all aggregation, but it also says `aggregateValueCountsFromTranscripts` must not change because the top-level grid stays on the legacy integer path this wave. Those cannot both be true for the same query set. As written, either the legacy grid will start ingesting records it was not meant to handle, or the “all aggregation” requirement is not actually true.

2. **High**: The `orientationFlipped` fix is incomplete for standard vignette batches. The spec tells callers to pass `orientationFlipped: null` into `resolveCanonicalDecision`, but only job-choice-v2 is orientation-free. Standard vignette transcripts still need a real orientation value, and the spec never says where that value comes from after the `definitionSnapshot` change. If implemented as written, non-job-choice records will fall through to `unknown` and get dropped from counts.

3. **High**: The new condition shape does not preserve enough information to render neutral-only cells correctly. The UI rule says neutral should show `–`, but the new fields only provide bucket counts plus mean scores. With `totalTrials > 0` and both mean scores at `0`, the cell will render as `0.0` unless a neutral count or equivalent signal is still available. The spec never states that signal remains in the GraphQL shape, so the display contract is not feasible as written.

4. **Medium**: Dropping the `decisionCode` filter without a compensating metadata validity gate assumes every fetched transcript can be canonicalized. That is a weak assumption for a mixed historical dataset. Legacy transcripts with missing or malformed `decisionMetadata` will now enter the new code path, which can inflate `unknownCount` and shift denominators, and it also risks reintroducing rows the legacy top-level grid was intentionally excluding.

## Residual Risks

- Even if the backend changes compile, mixed batch history will still need an explicit policy for transcripts that have `decisionCode` but no usable `decisionMetadata`, or vice versa.
- The spec does not define how neutral-only conditions should be distinguished from truly empty conditions in the frontend unless the GraphQL shape keeps an explicit neutral count.
- The acceptance criteria focus on build success, but they do not protect against the semantic regression of standard vignette orientation handling or legacy-grid contamination.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: open
- note: 