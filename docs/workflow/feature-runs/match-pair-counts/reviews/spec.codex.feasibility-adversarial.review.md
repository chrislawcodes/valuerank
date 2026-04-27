---
reviewer: "codex"
lens: "feasibility-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/match-pair-counts/spec.md"
artifact_sha256: "38b307e1ae5d46dd4fb80e4132c6217ba4406674de3ef8fdda60121da97a4b2d"
repo_root: "."
git_head_sha: "728da7d111003c5b052de4afad7f33501fbe10ba"
git_base_ref: "origin/main"
git_base_sha: "ee49253d6dd9ce8c0dfd6789aad31716b74634e8"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Judge round 2 approved spec advance (2/3 proceed). Findings addressed in subsequent edits: null-scenarioId rule (Counting Invariant 4), runCategory validation (Spec-level decision 4), empty scenarioIds fallback (Spec-level decision 8), incomplete-batch warning consistency (Edge Cases table aligned with US-3)."
raw_output_path: "docs/workflow/feature-runs/match-pair-counts/reviews/spec.codex.feasibility-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec feasibility-adversarial

## Findings

- HIGH [CODE-CONFIRMED] The condition-count spec needs an explicit null-`scenarioId` rule. [`Transcript.scenarioId`](/Users/chrislaw/valuerank/.claude/worktrees/infallible-bassi-fafa71/cloud/packages/db/prisma/schema.prisma) is nullable, and the existing completeness helper drops null scenario IDs before slot math. As written, the spec’s `DISTINCT (scenarioId, modelId, sampleIndex)` wording would either collapse all null-scenario rows into one bucket or count invalid slots, which would corrupt `pairedConditionCount` / `orphanedConditionCount` on real data. See [`schema.prisma`](/Users/chrislaw/valuerank/.claude/worktrees/infallible-bassi-fafa71/cloud/packages/db/prisma/schema.prisma) and [`coverage-completeness.ts`](/Users/chrislaw/valuerank/.claude/worktrees/infallible-bassi-fafa71/cloud/apps/api/src/services/run/coverage-completeness.ts).
- MEDIUM [CODE-CONFIRMED] The incomplete-batch warning is internally inconsistent. The spec says not to quote a specific count because `incompleteBatchCount` can be double-counted across companion definitions, but the edge-case table hard-codes “1 batch on this pair is incomplete.” The current resolver sums `incompleteBatchCount` across companion definitions, so that exact wording will be wrong on some valid cells. See [`domain-coverage.ts`](/Users/chrislaw/valuerank/.claude/worktrees/infallible-bassi-fafa71/cloud/apps/api/src/graphql/queries/domain-coverage.ts).
- MEDIUM [CODE-CONFIRMED] The spec leaves an empty explicit-selection path undefined. `buildRunJobPlan()` only uses `scenarioIds` when the array is non-empty; an empty explicit list silently falls back to sampled mode. The Match Pair Counts flow can therefore preview “specific-condition mode” but launch sampled mode unless the plan explicitly forbids or normalizes the empty-selection state. See [`start-plan.ts`](/Users/chrislaw/valuerank/.claude/worktrees/infallible-bassi-fafa71/cloud/apps/api/src/services/run/start-plan.ts).
- LOW [CODE-CONFIRMED] The top-up flow needs a hard validation rule for `runCategory`. `startRun` currently lets an explicit `runCategory` override the launch-mode default. The spec says top-up runs are `PRODUCTION`, but it never says conflicting caller input must be rejected, so a bad client can still launch the top-up under the wrong category and skew downstream reporting. See [`lifecycle.ts`](/Users/chrislaw/valuerank/.claude/worktrees/infallible-bassi-fafa71/cloud/apps/api/src/graphql/mutations/run/lifecycle.ts).

## Residual Risks

- The spec still leaves the exact GraphQL shape for the new per-direction counts open, so the UI contract is not fully pinned down from the provided files alone.
- I could not verify the route-state plumbing or the new launch-mode consumer path from the provided code, so integration risk remains around how the new mode is recognized by downstream code and any signature-based filtering.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Judge round 2 approved spec advance (2/3 proceed). Findings addressed in subsequent edits: null-scenarioId rule (Counting Invariant 4), runCategory validation (Spec-level decision 4), empty scenarioIds fallback (Spec-level decision 8), incomplete-batch warning consistency (Edge Cases table aligned with US-3).
