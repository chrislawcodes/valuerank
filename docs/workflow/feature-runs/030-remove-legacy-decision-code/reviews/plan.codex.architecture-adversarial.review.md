---
reviewer: "codex"
lens: "architecture-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/030-remove-legacy-decision-code/plan.md"
artifact_sha256: "9d15bbe45b6dbd3cd1fdf98579fc211e33f7eb8ee9e7e8777d1ce8ff7035c761"
repo_root: "."
git_head_sha: "adee0cd336e4555f34e0ea676185dff6636e93ac"
git_base_ref: "origin/fix/audit-mode-no-legacy-fallback"
git_base_sha: "adee0cd336e4555f34e0ea676185dff6636e93ac"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/030-remove-legacy-decision-code/reviews/plan.codex.architecture-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan architecture-adversarial

## Findings

1. **Medium [UNVERIFIED]** The `ConditionMatrix` fix is underspecified and may be impossible with the data the plan names. The chosen approach needs a 5-bucket strong/somewhat breakdown, but the artifact only lists existing aggregate `prioritized/deprioritized/neutral` counts and does not include any upstream producer or prop-shape update. If that richer data is not already available, the component cannot compute the canonical strength value and will either guess or fall back to a lossy approximation.

2. **Medium [UNVERIFIED]** The worker cleanup assumes every queue payload is already normalized by TypeScript. Removing the numeric-score fallback paths from `analyze-basic`, `decision_model.py`, and the variance code without a compatibility shim leaves retries, replays, or any non-TS producer with no safe path. That is a hidden contract break unless the plan explicitly proves that no legacy-shaped payload can still reach the workers.

3. **Medium [UNVERIFIED]** The GraphQL and transcript-summary removals are treated as safe because in-repo build breaks will expose remaining references, but that does not protect external clients, persisted queries, or downstream tooling. Removing `legacy` and `decisionCode` without a deprecation window or versioned replacement is a breaking API cutover, not just an internal cleanup.

## Residual Risks

- Legacy numeric shapes may still exist in stored JSON, cached aggregates, or archived transcripts. The plan relies on normalizers catching every entry point, so any missed parser will create inconsistent behavior.
- The TS and Python analysis paths now depend on the same ordinal mapping. If one code path misses the new signed-strength conversion, the outputs can drift silently.
- The artifact keeps `decisionCode` in the DB and a fallback in `resolveTranscriptDecisionModel`, so the system will still carry two representations for a while. That is workable, but it means the cleanup is not complete until every read path is audited.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
