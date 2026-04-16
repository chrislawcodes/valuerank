---
reviewer: "codex"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/030-remove-legacy-decision-code/spec.md"
artifact_sha256: "3b720b6be5a3b6579283dbc8f00b0f6a4a6ea92bd6e3f65e2cfc273f283467bf"
repo_root: "."
git_head_sha: "adee0cd336e4555f34e0ea676185dff6636e93ac"
git_base_ref: "origin/fix/audit-mode-no-legacy-fallback"
git_base_sha: "adee0cd336e4555f34e0ea676185dff6636e93ac"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Valid findings, addressed in plan. ConditionMatrix collapse uses winnerScore formula, rounds to nearest int. In-flight payloads already have canonical fields. Sort uses direction+strength ordering. normalizeBucketCode keeps backward compat. Null handling exists."
raw_output_path: "docs/workflow/feature-runs/030-remove-legacy-decision-code/reviews/spec.codex.edge-cases-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

- [UNVERIFIED] MEDIUM: `ConditionMatrix` is told to render one `0/1/2` strength label, but the spec never says how to collapse mixed counts, ties, or all-zero cells into that label. Different implementations can reasonably produce different values and colors for the same data.
- [UNVERIFIED] MEDIUM: The spec removes legacy score fallbacks from Python workers and analysis code, but it does not define how to handle in-flight queue payloads or cached analysis blobs that still contain `rawScore`, `canonicalScore`, or `summary.score`. Those records can fail or be misread immediately after rollout.
- [UNVERIFIED] MEDIUM: The new sort behavior is underdefined. Removing numeric scores without specifying a replacement comparator leaves opposite-direction results with the same strength with no total ordering, so frontend and backend sorts can drift.
- [UNVERIFIED] MEDIUM: The numeric-code cleanup for `decisionDistribution` is incomplete. The spec mentions a normalizer for `scoreCounts` versus `directionCounts`, but it does not define a migration or reader for persisted numeric bucket keys, so historical blobs can break once `'1'`-`'5'` are rejected.
- [UNVERIFIED] MEDIUM: Null or unknown decisions are not handled consistently across the analysis paths. Export maps unknown to `null`, but variance, aggregate, and KS-test behavior for missing canonical values is not specified, so edge cases can silently change metrics or throw.

## Residual Risks

- The blast radius depends on whether all legacy references are already funneled through the named resolver and normalizers. I could not verify that from the spec alone.
- External or downstream consumers of GraphQL, exports, or stored analysis JSON may still expect legacy fields and numeric codes.
- The spec still leaves some implementation details open, especially the exact strength collapse rule and canonical sort order, so tests need to pin those down before the cutover.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Valid findings, addressed in plan. ConditionMatrix collapse uses winnerScore formula, rounds to nearest int. In-flight payloads already have canonical fields. Sort uses direction+strength ordering. normalizeBucketCode keeps backward compat. Null handling exists.
