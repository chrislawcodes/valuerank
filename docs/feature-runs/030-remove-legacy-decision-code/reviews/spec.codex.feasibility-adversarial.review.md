---
reviewer: "codex"
lens: "feasibility-adversarial"
stage: "spec"
artifact_path: "docs/feature-runs/030-remove-legacy-decision-code/spec.md"
artifact_sha256: "5c1990b277f7a4bcb07127c34a2d7f1c9fc4181434a3ddb169733ae7f645d353"
repo_root: "."
git_head_sha: "5d04de64d2bf84e1434fd754cd77b7159a695474"
git_base_ref: "origin/main"
git_base_sha: "b60f7e7ff0708de6013e64f4045868895bbbcf6e"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/feature-runs/030-remove-legacy-decision-code/reviews/spec.codex.feasibility-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec feasibility-adversarial

## Findings

- **High**: The spec removes the scalar 1-5 score, but it never defines a deterministic replacement order for sorting consumers. `direction` + `strength` is a 2-axis model, so `getTranscriptDecisionSortValue`, transcript lists, GraphQL ordering, and any export sort that used a single score now need an explicit total order. Without that, the “frontend sort uses canonical direction/strength” change is underspecified and likely to produce unstable or inconsistent ordering.
- **High**: There is no real migration plan for persisted analysis artifacts that still contain `scoreCounts`, `canonicalScore`, `rawScore`, or `legacy` sub-objects. The spec says new code should use canonical fields, but historical aggregate JSON will not rewrite itself. If any view reads old runs before recompute, this cutover will either break those views or force silent shape-guessing with no guarantee of correctness.
- **Medium [UNVERIFIED]**: The Python worker cutover assumes every job payload already contains canonical `direction`/`strength` data and that no replay, backfill, or direct worker invocation still emits `summary.score` / `rawScore`. If that assumption is wrong, removing `normalize_resolved_score()` and the score fallback chain will turn analyzable transcripts into excluded data instead of merely deprecating an old path.
- **Medium**: The resolver rule “if `decisionMetadata` is present but invalid, return null” discards potentially recoverable legacy data even when `decisionCode` still exists. That makes the transition brittle against partial or corrupt metadata writes and creates a failure mode where a transcript that could have been scored becomes permanently unscored with no recovery path.

## Residual Risks

- Historical transcripts that only have `decisionCode` will remain dependent on the resolver fallback until a cleanup or backfill exists.
- New export and MCP shapes are hard-breaking for any downstream consumer that has not been updated in lockstep.
- Any system that reads stored analysis results will need a clear strategy for mixed old/new shapes during the recompute window.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
