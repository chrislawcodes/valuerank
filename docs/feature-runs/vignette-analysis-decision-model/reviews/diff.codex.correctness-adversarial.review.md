---
reviewer: "codex"
lens: "correctness-adversarial"
stage: "diff"
artifact_path: "docs/feature-runs/vignette-analysis-decision-model/reviews/implementation.diff.patch"
artifact_sha256: "9704d12332dfcd72279479f2c1a67ce8f1dd72e08947f46f39febaccb339e45f"
repo_root: "."
git_head_sha: "fce47f73a2542524b87e0bbf199703aaf9f3c4c6"
git_base_ref: "origin/chore/agents-md-single-source-of-truth"
git_base_sha: "fce47f73a2542524b87e0bbf199703aaf9f3c4c6"
generation_method: "codex-runner"
resolution_status: "deferred"
resolution_note: "Deferred as intentional report-level consistency. The table and modal use one mode per surface, and mixed conditions remain legacy until the condition is fully V2-backed, which matches the migration contract."
raw_output_path: "docs/feature-runs/vignette-analysis-decision-model/reviews/diff.codex.correctness-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff correctness-adversarial

## Findings

- High: `reportDecisionDisplayMode` is computed with `every(hasTranscriptDecisionModelV2)`, so one legacy transcript forces the entire condition into legacy mode. That suppresses canonical headlines in the table and canonical rendering in `TranscriptViewer` even for transcripts that already have `decisionModelV2`. In mixed conditions, the new canonical path becomes unusable for the transcripts that support it.

## Residual Risks

- The new tests do not cover empty transcript lists, partially populated `decisionModelV2` payloads, or stale/cache-mixed responses, so mode-selection edge cases could still regress.
- If `TranscriptViewer` has other call sites outside this page, they may still be on the old decision-display behavior unless updated separately.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: deferred
- note: Deferred as intentional report-level consistency. The table and modal use one mode per surface, and mixed conditions remain legacy until the condition is fully V2-backed, which matches the migration contract.
