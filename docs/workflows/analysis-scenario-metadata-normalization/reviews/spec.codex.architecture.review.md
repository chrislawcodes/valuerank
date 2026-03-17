---
reviewer: codex
lens: architecture
stage: spec
artifact_path: docs/workflows/analysis-scenario-metadata-normalization/spec.md
artifact_sha256: 1e2f3234d4e92b91519e7025766fb5bd8e5a37f1e0a24c75588a1ee9b4fd9846
repo_root: .
git_head_sha: 624b0f433b3bde215339f6a95d865f7163a2cc2a
git_base_ref: origin/main
git_base_sha: ad7e0c4060f149412a4100117981a45704a5c3c0
generation_method: codex-session
resolution_status: "accepted"
resolution_note: "The spec cleanly separates decision evidence from scenario metadata and keeps normalization bounded to deterministic condition data while making precedence and partial-coverage behavior explicit."
raw_output_path: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec architecture

## Findings

No blocking architecture issue in the spec. The scope remains properly centered on canonical scenario metadata rather than on transcript-answer rewrites, which keeps the feature reversible and lowers risk to existing analysis semantics.

## Residual Risks

1. The implementation still needs one clear canonical ownership point for normalized metadata. If normalization is duplicated across queue handlers, GraphQL types, and UI adapters, the repo will keep drifting.
2. Job-choice normalization must stay deterministic. If any path silently guesses numeric levels from prose labels without preset-backed mapping, the architecture will reintroduce hidden semantic drift.
3. The warning, visualization, and drilldown paths should all be switched together. Fixing only the worker warning would leave the architecture inconsistent even if the spec intent is sound.

## Resolution
- status: accepted
- note: The spec cleanly separates decision evidence from scenario metadata and keeps normalization bounded to deterministic condition data while making precedence and partial-coverage behavior explicit.
