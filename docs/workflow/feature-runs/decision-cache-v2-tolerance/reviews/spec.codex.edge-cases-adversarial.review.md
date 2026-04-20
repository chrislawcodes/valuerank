---
reviewer: "codex"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/decision-cache-v2-tolerance/spec.md"
artifact_sha256: "f0de8d8cd4c87502e36b8eab7868fc59a0a85c228f48f1ba7ed985da197c2bf0"
repo_root: "."
git_head_sha: "bd742f04a07dd015aa976e30754c675d915b3903"
git_base_ref: "origin/main"
git_base_sha: "bd742f04a07dd015aa976e30754c675d915b3903"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/decision-cache-v2-tolerance/reviews/spec.codex.edge-cases-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

- **HIGH**: [CODE-CONFIRMED] The spec’s migration strips `decisionCode` and `decisionCodeSource` from `summaryCache.summary`, but the current cache gate still requires both fields. `resolveSummarizeJob()` only treats a row as cacheable when `isSummaryCache()` passes, and that validator still calls `isSummaryCacheSummary()`, which insists on `decisionCode`, `decisionCodeSource`, and `cacheVersion: 1` ([`summarize-types.ts:69`](sandbox:/Users/chrislaw/valuerank/.claude/worktrees/serene-lamarr-4f056c/cloud/apps/api/src/queue/handlers/summarize-types.ts#L69), [`summarize-transcript.ts:195`](sandbox:/Users/chrislaw/valuerank/.claude/worktrees/serene-lamarr-4f056c/cloud/apps/api/src/queue/handlers/summarize-transcript.ts#L195)). Migrated rows will stop hitting the summarize cache and can be reprocessed as if they were uncached.

- **MEDIUM**: [CODE-CONFIRMED] The spec assumes the backfill can leave prod in a stable v2-only state until PR #2 lands, but the current write path still emits v1 cache rows on every fresh summary. `buildWinnerFirstSummaryCache()` returns `cacheVersion: 1`, and `persistSuccessfulSummary()` writes that shape back into `decisionMetadata.summaryCache` ([`summarize-transcript.ts:116`](sandbox:/Users/chrislaw/valuerank/.claude/worktrees/serene-lamarr-4f056c/cloud/apps/api/src/queue/handlers/summarize-transcript.ts#L116), [`summarize-persistence.ts:209`](sandbox:/Users/chrislaw/valuerank/.claude/worktrees/serene-lamarr-4f056c/cloud/apps/api/src/queue/handlers/summarize-persistence.ts#L209)). Without a write freeze or a simultaneous write-path change, new v1 rows can reappear immediately after the migration.

- **MEDIUM**: [CODE-CONFIRMED] US2’s refusal acceptance is not expressible through the current resolver contract. `TranscriptDecisionModelResult` only returns `{ raw, canonical }`, and `CanonicalDecision` has no `decisionState` field at all ([`decision-model-types.ts:87`](sandbox:/Users/chrislaw/valuerank/.claude/worktrees/serene-lamarr-4f056c/cloud/apps/api/src/graphql/queries/domain/decision-model-types.ts#L87), [`decision-model-types.ts:110`](sandbox:/Users/chrislaw/valuerank/.claude/worktrees/serene-lamarr-4f056c/cloud/apps/api/src/graphql/queries/domain/decision-model-types.ts#L110)). In addition, `resolveCanonicalDecision()` collapses any cached decision with `favoredValueKey == null` or `strength` unknown/neutral back to an unknown canonical ([`decision-model.ts:141`](sandbox:/Users/chrislaw/valuerank/.claude/worktrees/serene-lamarr-4f056c/cloud/apps/api/src/graphql/queries/domain/decision-model.ts#L141)). So the spec’s claim that refusal is “readable by downstream code” needs an API shape change, not just a cache/type tweak.

- **LOW**: [CODE-CONFIRMED] The spec under-scopes the shared DB type update. `@valuerank/db` still defines `SummaryCacheSummary.canonicalDecision` as `cacheVersion: 1` with only `resolved | neutral | unknown` ([`cloud/packages/db/src/types.ts:178`](sandbox:/Users/chrislaw/valuerank/.claude/worktrees/serene-lamarr-4f056c/cloud/packages/db/src/types.ts#L178)). That is the canonical type imported by the summarize code, so a v2/refusal migration will leave the package-level data model out of sync with the persisted shape.

## Residual Risks

- I did not verify the full population of malformed legacy rows. The spec assumes the only skipped class is `missing-snapshot`, but any other unexpected JSON shape will need a separate skip or repair rule.

- If summarization keeps running during or after the backfill, the database will not stay clean unless PR #2 ships immediately or the writer is paused.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
