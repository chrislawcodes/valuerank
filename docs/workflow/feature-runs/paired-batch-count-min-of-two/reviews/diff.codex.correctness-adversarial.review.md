---
reviewer: "codex"
lens: "correctness-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/paired-batch-count-min-of-two/reviews/implementation.diff.patch"
artifact_sha256: "f3b88c5ba6d8daf716de6db78e9a0572a81f6005e661118ead203807daa3999d"
repo_root: "."
git_head_sha: "5bf1f43159d498f3f315d9fd7e11ee01afa41624"
git_base_ref: "HEAD~1"
git_base_sha: "127161edbdf3433b548fa27cd52d742bea0d58d6"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "MED (model filter not applied to per-model trial-count path) — pre-existing behavior unchanged by this slice; nonAggregateRunsByDefinitionId population logic predates this refactor. Out of scope; flagged for closeout. MED (jobChoiceValueFirst not paired-batch-guarded) — already addressed in spec residual risks R3; per §6.3 prod data, 100% completed runs are PAIRED_BATCH; tripwire test in place."
raw_output_path: "docs/workflow/feature-runs/paired-batch-count-min-of-two/reviews/diff.codex.correctness-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff correctness-adversarial

## Findings

- MEDIUM: The model filter is still not applied to the per-model trial-count path in [`cloud/apps/api/src/graphql/queries/domain-coverage.ts`](/Users/chrislaw/valuerank/.claude/worktrees/busy-tesla-89e817/cloud/apps/api/src/graphql/queries/domain-coverage.ts#L233). `nonAggregateRunsByDefinitionId` is populated before `matchesModelFilter` is checked, so runs that should be excluded from the cell can still flow into `computePerModelTrialCounts()`. That means `minTrialCount`, `maxTrialCount`, and `modelBreakdown` can describe a different run population than `batchCount` and `incompleteBatchCount`, which breaks the symmetry the new comments claim.

- MEDIUM [UNVERIFIED]: The new paired-batch logic trusts any non-empty `jobChoiceValueFirst` token in [`cloud/apps/api/src/graphql/queries/domain-coverage-utils.ts`](/Users/chrislaw/valuerank/.claude/worktrees/busy-tesla-89e817/cloud/apps/api/src/graphql/queries/domain-coverage-utils.ts#L165) without validating paired-batch provenance. The write path in [`cloud/apps/api/src/graphql/mutations/run/lifecycle.ts`](/Users/chrislaw/valuerank/.claude/worktrees/busy-tesla-89e817/cloud/apps/api/src/graphql/mutations/run/lifecycle.ts#L124) only sets that field for paired launches, but `startRun` also accepts arbitrary `configExtras` in [`cloud/apps/api/src/services/run/start.ts`](/Users/chrislaw/valuerank/.claude/worktrees/busy-tesla-89e817/cloud/apps/api/src/services/run/start.ts#L40). If any malformed or future caller stamps the token onto a non-paired run, the resolver will count it as pairable data and inflate `pairedBatchCount`.

## Residual Risks

- The new `min(A-first, B-first)` model still pairs runs across launches when they share only the direction token and, optionally, a launch group id. That is intentional per the glossary, but it still assumes launch settings are consistent enough that those runs are truly comparable.

- The added tests cover the helper with synthetic fixtures, but they do not exercise the full resolver path under a real `modelIds` filter or with malformed config provenance. A wiring regression in the query loop could still slip through.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: MED (model filter not applied to per-model trial-count path) — pre-existing behavior unchanged by this slice; nonAggregateRunsByDefinitionId population logic predates this refactor. Out of scope; flagged for closeout. MED (jobChoiceValueFirst not paired-batch-guarded) — already addressed in spec residual risks R3; per §6.3 prod data, 100% completed runs are PAIRED_BATCH; tripwire test in place.
