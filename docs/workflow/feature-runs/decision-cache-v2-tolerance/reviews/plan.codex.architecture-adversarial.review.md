---
reviewer: "codex"
lens: "architecture-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/decision-cache-v2-tolerance/plan.md"
artifact_sha256: "fc53e8f5e1e0134d821890dcfd0bf74ce396b8a5ebf4674b63fb3ade6b3ac4c9"
repo_root: "."
git_head_sha: "bd742f04a07dd015aa976e30754c675d915b3903"
git_base_ref: "origin/main"
git_base_sha: "bd742f04a07dd015aa976e30754c675d915b3903"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/decision-cache-v2-tolerance/reviews/plan.codex.architecture-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "partial"
coverage_note: "context exceeded max_context_chars and was narrowed"
---

# Review: plan architecture-adversarial

## Findings

- HIGH [CODE-CONFIRMED] The plan’s backfilled cache shape does not match the current cache reader. `isWinnerFirstSummaryCache` still hard-rejects any `cacheVersion !== 1`, and `isSummaryCacheSummary` still requires `decisionCode` and `decisionCodeSource`; the summarize worker only uses the cache when `isSummaryCache(...)` passes. A row rewritten the way this plan describes will be treated as cache-missing and re-summarized instead of behaving like a usable v2 cache. Evidence: [summarize-types.ts](/Users/chrislaw/valuerank/.claude/worktrees/serene-lamarr-4f056c/cloud/apps/api/src/queue/handlers/summarize-types.ts#L69), [summarize-types.ts](/Users/chrislaw/valuerank/.claude/worktrees/serene-lamarr-4f056c/cloud/apps/api/src/queue/handlers/summarize-types.ts#L96), [summarize-transcript.ts](/Users/chrislaw/valuerank/.claude/worktrees/serene-lamarr-4f056c/cloud/apps/api/src/queue/handlers/summarize-transcript.ts#L195).

- MEDIUM [CODE-CONFIRMED] Adding `decisionState: 'refusal'` to `CachedWinnerFirstDecision` is not enough by itself. The only read path that consumes cached canonical decisions, `resolveCanonicalDecision`, only special-cases `neutral` and otherwise requires a non-null `favoredValueKey` with non-`unknown`/non-`neutral` strength. A refusal cache will fall through and be treated as unknown, so the new state is semantically dead unless more than the validator is changed. Evidence: [decision-model.ts](/Users/chrislaw/valuerank/.claude/worktrees/serene-lamarr-4f056c/cloud/apps/api/src/graphql/queries/domain/decision-model.ts#L141), [decision-model.ts](/Users/chrislaw/valuerank/.claude/worktrees/serene-lamarr-4f056c/cloud/apps/api/src/graphql/queries/domain/decision-model.ts#L147).

- MEDIUM [CODE-CONFIRMED] The migration’s “default `orientationFlipped` to false if missing” assumption is not aligned with current behavior. The summarize worker passes `null` when the scenario lookup is missing, and the resolver explicitly treats `orientationFlipped == null` as unresolvable rather than assuming a default orientation. Coercing missing orientation to `false` would silently canonicalize rows the live code currently leaves unknown. Evidence: [summarize-transcript.ts](/Users/chrislaw/valuerank/.claude/worktrees/serene-lamarr-4f056c/cloud/apps/api/src/queue/handlers/summarize-transcript.ts#L120), [decision-model.ts](/Users/chrislaw/valuerank/.claude/worktrees/serene-lamarr-4f056c/cloud/apps/api/src/graphql/queries/domain/decision-model.ts#L137).

## Residual Risks

- The migration script itself is not provided, so its final skip logic, batching, and retry behavior remain unverified.
- Any rows with missing scenario orientation still need an explicit policy. If that population is non-trivial, a `false` default can create silent misclassification.
- If any other cache validator exists outside the files reviewed here, v2 rows will still be rejected until that path is updated too.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
