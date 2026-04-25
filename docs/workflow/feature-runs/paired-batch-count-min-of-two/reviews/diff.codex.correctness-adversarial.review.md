---
reviewer: "codex"
lens: "correctness-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/paired-batch-count-min-of-two/reviews/implementation.diff.patch"
artifact_sha256: "44ea3851c100a8f8dd59853fa7954817ed8b9c50454bc49fa288323a3cd2f8e0"
repo_root: "."
git_head_sha: "04ab7e6288e547d237aba0269aef1ff3fb4be0db"
git_base_ref: "origin/main"
git_base_sha: "2cd6635c7bf0a0007e9f2c340a95e21779560a8b"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/paired-batch-count-min-of-two/reviews/diff.codex.correctness-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff correctness-adversarial

## Findings

- [UNVERIFIED][MEDIUM] The new directional helper is not wired into the live coverage query path. `cloud/apps/api/src/graphql/queries/domain-coverage.ts:370-375` still calls `selectPrimaryDefinitionCounts(...)`, so this patch does not change the numbers surfaced to users. If the intent was to switch coverage cells to the directional model, the implementation is still inert.
- [UNVERIFIED][MEDIUM] `selectPrimaryDefinitionCountsByDirection()` computes `pairedBatchCount` from `min(set.size)` after unioning per-direction sets. That assumes the two direction buckets contain the same batch-group IDs. If they drift, the function overcounts. Example: A-first `{g1,g2}` and B-first `{h1,h2}` would return `2` even though there are no matched pairs. The code does not verify or warn on that invariant.

## Residual Risks

- I could not verify the upstream guarantee that every paired batch shares the same group ID across both directions. If that invariant is strict, the overcount risk above is lower.
- There are no tests here that exercise the actual GraphQL query output, only the new helper. That leaves room for a wiring regression even if the helper itself is correct.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
