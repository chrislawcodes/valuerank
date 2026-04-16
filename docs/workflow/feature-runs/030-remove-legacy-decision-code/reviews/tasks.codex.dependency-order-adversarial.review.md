---
reviewer: "codex"
lens: "dependency-order-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/030-remove-legacy-decision-code/tasks.md"
artifact_sha256: "4a1db078166b7144f0c2dbca35554e46c9e35d0871cf8b5b5a2cca232bc65b2a"
repo_root: "."
git_head_sha: "adee0cd336e4555f34e0ea676185dff6636e93ac"
git_base_ref: "origin/fix/audit-mode-no-legacy-fallback"
git_base_sha: "adee0cd336e4555f34e0ea676185dff6636e93ac"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/030-remove-legacy-decision-code/reviews/tasks.codex.dependency-order-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks dependency-order-adversarial

## Findings

1. [UNVERIFIED] MEDIUM: Slice 1.2 deletes shared legacy compat exports, but the build checkpoint for that wave runs before Slice 1.3 updates the remaining consumers in `variance.ts` and `aggregate-logic.ts`. That makes the wave order dependency-unsafe. The API workspace can fail halfway through the plan even if the later cleanup is correct.

2. [UNVERIFIED] MEDIUM: The plan removes legacy readers and response fields without any explicit backfill or dual-read phase for persisted data. If stored transcripts, aggregates, exports, or worker payloads still carry `scoreCounts`, `rawScore`, `canonicalScore`, or `decisionCode`, the later canonical-only code paths can break on historical records.

3. MEDIUM: The final grep gate is too narrow to prove the migration is complete. It only scans a small set of extensions under `cloud/`, so it can miss legacy references in generated GraphQL output, fixtures, JSON, docs, SQL, or shell scripts and still report success.

4. [UNVERIFIED] MEDIUM: Slice 1.1 allows an approximate ConditionMatrix strength when the parent cannot supply the 5-bucket breakdown. Later tasks and tests assume exact canonical buckets, so this fallback can hide a data-contract problem instead of forcing it to be fixed first.

## Residual Risks

- I could not verify from the artifact alone whether the shared exports, persisted legacy shapes, or 5-bucket inputs actually exist in the current codebase, so the dependency-order risks should be checked against real imports and stored data formats.
- The plan still needs a clear rule for external consumers of legacy GraphQL and MCP fields. Without that, the migration can be internally consistent but still break downstream integrations.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
