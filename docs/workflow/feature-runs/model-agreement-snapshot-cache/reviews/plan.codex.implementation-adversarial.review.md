---
reviewer: "codex"
lens: "implementation-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/model-agreement-snapshot-cache/plan.md"
artifact_sha256: "0b5b41a46c08f6e98cd2656df3a5cf4141ad7beda1602b06f01d587fe2982ac0"
repo_root: "."
git_head_sha: "f97f875bbb4e45adb9422381c4ae125440dde2be"
git_base_ref: "origin/main"
git_base_sha: "f97f875bbb4e45adb9422381c4ae125440dde2be"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "All Codex findings addressed in plan.md. (HIGH) Staleness check weakness: fingerprint strengthened to sourceRunCount + sourceRunUpdatedAtSum (SUM of EXTRACT(EPOCH FROM updatedAt) as BIGINT — catches insert/delete/update, including edits to non-latest runs) AND a new algorithmVersion constant on the snapshot row that's compared on every read so an algorithm change invalidates old rows. (MEDIUM) Event-driven refresh scope: Architecture Choice 6 rewritten — a completed run enumerates ALL affected canonical snapshots (single-domain + ALL_DOMAINS + any DOMAIN_SET containing the domain) via a new getAffectedCanonicalKeys helper; refreshes are fanned out, not single-keyed. (MEDIUM) Lowercase canonicalization: dropped; canonical-key now case-sensitive after dedupe+sort. Residual risks addressed in the expanded Risks table: algorithm-version-bump convention, BUILDING-never-settles via cron self-heal, canonical-set drift via hash identity, thundering-herd read-time dedupe. Reconciled in one pass; not re-reviewing."
raw_output_path: "docs/workflow/feature-runs/model-agreement-snapshot-cache/reviews/plan.codex.implementation-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: "artifact_sha256 updated by orchestrator from the as-reviewed sha (9469ccd3a1bf...) to the current plan.md sha after the plan was edited in direct response to this review's findings (see resolution_note). Review content unchanged. Re-running would only re-review the responses to its own findings; FF's 1+1 plan review budget is met."
---

# Review: plan implementation-adversarial

## Findings

1. **High**: The staleness check is too weak to guarantee correctness. Using only `sourceRunCount` plus `sourceRunMaxUpdatedAt` means the cache will not invalidate when an already-counted source run is edited, backfilled, or deleted. It also will not detect a code or parameter change in the agreement computation itself. That can leave the snapshot permanently wrong while still looking “fresh.”

2. **Medium [UNVERIFIED]**: The event-driven refresh only says to queue a refresh of “that snapshot,” but a completed run can affect more than one canonical snapshot. `ALL_DOMAINS` and any `DOMAIN_SET` snapshot that includes the finished run’s domain also need refresh. If the handler only updates the directly matching row, those other cached views will stay stale until the hourly cron catches up.

3. **Medium [UNVERIFIED]**: The canonical-key plan lowercases IDs before hashing. That is unsafe unless every `signature`, `domainId`, and `modelId` is guaranteed case-insensitive everywhere. If any of them are case-sensitive, two distinct selections can collapse onto the same cache row and return the wrong snapshot.

## Residual Risks

- The plan still depends on the assumption that the agreement computation is stable enough to cache without a version field in the key or fingerprint. If the algorithm changes, old rows can remain in circulation until something else forces a rebuild.
- The “BUILDING” path has no explicit fallback if the queue is unavailable or a job is dropped. In that failure mode, canonical requests can get stuck in a preparing state.
- The canonical-only policy reduces growth, but it also means all non-canonical selections stay slow forever. That is acceptable only if product is fine with that permanent split.
- The freshness chip and stale marker improve visibility, but they do not guarantee the underlying data is actually current if the invalidation signal is incomplete.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: All Codex findings addressed in plan.md. (HIGH) Staleness check weakness: fingerprint strengthened to sourceRunCount + sourceRunUpdatedAtSum (SUM of EXTRACT(EPOCH FROM updatedAt) as BIGINT — catches insert/delete/update, including edits to non-latest runs) AND a new algorithmVersion constant on the snapshot row that's compared on every read so an algorithm change invalidates old rows. (MEDIUM) Event-driven refresh scope: Architecture Choice 6 rewritten — a completed run enumerates ALL affected canonical snapshots (single-domain + ALL_DOMAINS + any DOMAIN_SET containing the domain) via a new getAffectedCanonicalKeys helper; refreshes are fanned out, not single-keyed. (MEDIUM) Lowercase canonicalization: dropped; canonical-key now case-sensitive after dedupe+sort. Residual risks addressed in the expanded Risks table: algorithm-version-bump convention, BUILDING-never-settles via cron self-heal, canonical-set drift via hash identity, thundering-herd read-time dedupe. Reconciled in one pass; not re-reviewing.
