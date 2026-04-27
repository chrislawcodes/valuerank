---
reviewer: "codex"
lens: "implementation-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/match-pair-counts/plan.md"
artifact_sha256: "552bf20a0efdaab21464d9d6bfcb1b650486978832232f780518fe95602f26ad"
repo_root: "."
git_head_sha: "728da7d111003c5b052de4afad7f33501fbe10ba"
git_base_ref: "origin/main"
git_base_sha: "ee49253d6dd9ce8c0dfd6789aad31716b74634e8"
generation_method: "codex-runner"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/match-pair-counts/reviews/plan.codex.implementation-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan implementation-adversarial

## Findings

- **HIGH** [CODE-CONFIRMED] The planned `Match Pair Counts` gate is keyed off `aggregateRunId === null`, but the current resolver does not use `aggregateRunId` as an “aggregate-only” flag. It sets that field to `latestAggregateRunId ?? latestMatchingRunId ?? null`, so ordinary covered cells will usually have a non-null value too. That means the action would be hidden on most usable cells, not just aggregate ones. See [`cloud/apps/api/src/graphql/queries/domain-coverage.ts#L309`](file:///Users/chrislaw/valuerank/.claude/worktrees/infallible-bassi-fafa71/cloud/apps/api/src/graphql/queries/domain-coverage.ts#L309) and [`cloud/apps/api/src/graphql/queries/domain-coverage.ts#L313`](file:///Users/chrislaw/valuerank/.claude/worktrees/infallible-bassi-fafa71/cloud/apps/api/src/graphql/queries/domain-coverage.ts#L313).

- **HIGH** [CODE-CONFIRMED] The plan assumes the top-up flow can be layered onto the existing paired-batch form without changing the form API, but the current form state only supports `PAIRED_BATCH | AD_HOC_BATCH`, and `RunForm` hardcodes `defaultLaunchMode: 'PAIRED_BATCH'`. There is no path here to prefill or lock a third launch mode the way the artifact describes. See [`cloud/apps/web/src/components/runs/useRunForm.ts#L12`](file:///Users/chrislaw/valuerank/.claude/worktrees/infallible-bassi-fafa71/cloud/apps/web/src/components/runs/useRunForm.ts#L12), [`cloud/apps/web/src/components/runs/useRunForm.ts#L41`](file:///Users/chrislaw/valuerank/.claude/worktrees/infallible-bassi-fafa71/cloud/apps/web/src/components/runs/useRunForm.ts#L41), [`cloud/apps/web/src/components/runs/useRunForm.ts#L114`](file:///Users/chrislaw/valuerank/.claude/worktrees/infallible-bassi-fafa71/cloud/apps/web/src/components/runs/useRunForm.ts#L114), and [`cloud/apps/web/src/components/runs/RunForm.tsx#L110`](file:///Users/chrislaw/valuerank/.claude/worktrees/infallible-bassi-fafa71/cloud/apps/web/src/components/runs/RunForm.tsx#L110).

- **MEDIUM** [CODE-CONFIRMED] The plan points the shared trial-count helper at `cloud/apps/shared/src/launch-trial-count.ts`, but the repo’s shared workspace is `cloud/packages/shared`, not `cloud/apps/shared`. As written, that path will not match the actual package layout and the import strategy in the artifact will not work without rewriting the location. See [`cloud/packages/shared/package.json#L2`](file:///Users/chrislaw/valuerank/.claude/worktrees/infallible-bassi-fafa71/cloud/packages/shared/package.json#L2).

- **MEDIUM** [CODE-CONFIRMED] The new coverage counts are not scoped to the same `modelIds` filter unless the implementation explicitly preserves the current guard. The existing resolver applies `matchesModelFilter` before incrementing `batchCount` and `pairedBatchCount`; the plan never calls out reusing that filtered run set for the new slot-based counts, so a filtered coverage view could end up with batch counts and condition counts that disagree. See [`cloud/apps/api/src/graphql/queries/domain-coverage.ts#L209`](file:///Users/chrislaw/valuerank/.claude/worktrees/infallible-bassi-fafa71/cloud/apps/api/src/graphql/queries/domain-coverage.ts#L209) through [`cloud/apps/api/src/graphql/queries/domain-coverage.ts#L229`](file:///Users/chrislaw/valuerank/.claude/worktrees/infallible-bassi-fafa71/cloud/apps/api/src/graphql/queries/domain-coverage.ts#L229).

## Residual Risks

- The artifact still depends on the exact backend slot-accounting rules for `pairedConditionCount` and `orphanedConditionCount`. The provided code does not expose that logic today, so the implementation should be pinned with targeted tests around filtered views, retries, and multi-sample runs before merge.

- The top-up launch path will need a concrete integration point for the new `topUpDirection` field and the locked launch mode. If the implementation keeps `RunForm` as-is, the UI will still be able to submit only the old launch modes.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: open
- note: 