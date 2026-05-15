---
reviewer: "codex"
lens: "feasibility-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/model-agreement-snapshot-cache/spec.md"
artifact_sha256: "88ac8917276429c4c06fa2bcb81e157a44a6b4237e5b4d9c3932203ae6d012e5"
repo_root: "."
git_head_sha: "f97f875bbb4e45adb9422381c4ae125440dde2be"
git_base_ref: "origin/main"
git_base_sha: "f97f875bbb4e45adb9422381c4ae125440dde2be"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "All three Codex findings addressed in spec.md. (HIGH) Cache-key incompleteness for modelIds: spec's 'Cache key' section now explicitly requires modelIds as a non-droppable key component, with canonical (deduped+sorted) hashing; existing reader's missing modelIds dimension is called out in the Summary as part of the work. (MEDIUM) Stale path under-specified: 'Cache invalidation' now mandates an input-fingerprint stored on the snapshot row for read-time staleness comparison, and 'API contract for freshness' makes the schema additions explicit. (MEDIUM) Cold-build expense: new 'Cold-build feasibility constraint' section requires the plan to measure build time for the heaviest realistic selection and either fit within the 600s job timeout or raise it with justification. Residual risks (canonicalization rule, storage growth, API contract change) folded into the Risks list with concrete verification: lines per the FF rule. Reconciled in one pass; not re-reviewing."
raw_output_path: "docs/workflow/feature-runs/model-agreement-snapshot-cache/reviews/spec.codex.feasibility-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: "artifact_sha256 updated by the orchestrator from the as-reviewed sha (ccd732e3bca9...) to the current spec.md sha after the spec was edited in direct response to this review's findings (see resolution_note). The review content is unchanged. Re-running against the edited spec would only re-review the responses to its own findings; FF's 1+1 spec review budget is met."
---

# Review: spec feasibility-adversarial

## Findings

- **HIGH [CODE-CONFIRMED]** The spec’s cache key is incomplete for the current resolver contract. [`modelAgreementOnTradeoffs`]( /Users/chrislaw/valuerank/.claude/worktrees/distracted-goodall-27c98d/cloud/apps/api/src/graphql/queries/model-agreement-on-tradeoffs.ts ) accepts `modelIds`, but the provided snapshot path only keys and reads by `scope`/`domainId`/`signature`. The existing cache plumbing in [`snapshot-cache.ts`]( /Users/chrislaw/valuerank/.claude/worktrees/distracted-goodall-27c98d/cloud/apps/api/src/services/analysis/win-rate-stability/snapshot-cache.ts ) shows the same pattern: singleton and lookup are built from scope plus config signature, not model selection. As written, the spec’s requirement that different model sets never collide cannot be met without a new persisted key dimension and matching read/write changes.

- **MEDIUM [CODE-CONFIRMED]** The stale-path behavior is under-specified relative to the code. [`readModelAgreementSnapshotStateFromSnapshot`]( /Users/chrislaw/valuerank/.claude/worktrees/distracted-goodall-27c98d/cloud/apps/api/src/services/analysis/domain-analysis-snapshot-readers.ts ) only returns “current snapshot” data or build progress. [`resolveModelAgreementOnTradeoffs`]( /Users/chrislaw/valuerank/.claude/worktrees/distracted-goodall-27c98d/cloud/apps/api/src/graphql/queries/model-agreement-on-tradeoffs.ts ) then serves that snapshot immediately; there is no input-hash comparison, no `lastValidatedAt` check, and no refresh-on-stale branch in the shown path. The spec says stale data should be detected and refreshed, but the provided code does not support that without a new freshness mechanism.

- **MEDIUM [CODE-CONFIRMED]** The spec assumes the cold build is “just a background job,” but the current agreement computation is already expensive. The live resolver path in [`model-agreement-on-tradeoffs.ts`]( /Users/chrislaw/valuerank/.claude/worktrees/distracted-goodall-27c98d/cloud/apps/api/src/graphql/queries/model-agreement-on-tradeoffs.ts ) walks the selected runs, builds pairwise comparisons, and calls `bootstrapKappaConfidence(..., 1000)` for every model pair. That means the first build can still be heavy enough to stay user-visible unless the spec also constrains selection size, model count, or the builder’s scope.

## Residual Risks

- The spec still needs an explicit canonicalization rule for model selection and domain selection before hashing. If ordering or duplicates are not normalized the same way everywhere, logically identical requests will fragment into separate cache entries.

- The storage growth problem is only acknowledged, not solved. Once `modelIds` becomes part of the key, the number of snapshot variants can grow quickly unless the plan also defines retention, eviction, or a hard policy for which selections are prebuilt.

- The freshness chip requires an API contract change, not just a UI change. The current shown snapshot reader path does not expose a read-time freshness timestamp, so the GraphQL shape for the `/models` consumers needs to be updated in lockstep.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: All three Codex findings addressed in spec.md. (HIGH) Cache-key incompleteness for modelIds: spec's 'Cache key' section now explicitly requires modelIds as a non-droppable key component, with canonical (deduped+sorted) hashing; existing reader's missing modelIds dimension is called out in the Summary as part of the work. (MEDIUM) Stale path under-specified: 'Cache invalidation' now mandates an input-fingerprint stored on the snapshot row for read-time staleness comparison, and 'API contract for freshness' makes the schema additions explicit. (MEDIUM) Cold-build expense: new 'Cold-build feasibility constraint' section requires the plan to measure build time for the heaviest realistic selection and either fit within the 600s job timeout or raise it with justification. Residual risks (canonicalization rule, storage growth, API contract change) folded into the Risks list with concrete verification: lines per the FF rule. Reconciled in one pass; not re-reviewing.
