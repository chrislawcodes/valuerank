---
reviewer: "claude-opus-4-5"
lens: "implementation-risk-judge"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/coverage-cell-batch-display/plan.md"
artifact_sha256: "fe8cece0f5f003224ec65cb46794adce0820f07d76b3a1d1240a51db0bcf0469"
repo_root: "."
git_head_sha: "0842af56c8b34162a05e3b010f28873378ec6bb2"
git_base_ref: "origin/main"
git_base_sha: "eab6ffbb2ad3a2f01ce5cd3ffa2dfd3c317349e9"
generation_method: "judge-panel"
resolution_status: "open"
resolution_note: "Three load-bearing gaps would cause a competent implementer to either get stuck or ship a bug. (1) Task 1.3 explicitly says the model-set filter gates `incompleteBatchCountByDefinitionId`, but the Scope section explicitly says 'Changes t..."
raw_output_path: "docs/workflow/feature-runs/coverage-cell-batch-display/reviews/judge.implementation-risk.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan implementation-risk-judge

## Findings

Three load-bearing gaps would cause a competent implementer to either get stuck or ship a bug. (1) Task 1.3 explicitly says the model-set filter gates `incompleteBatchCountByDefinitionId`, but the Scope section explicitly says 'Changes to `incompleteBatchCount` or the amber dot indicator' are NOT in scope — these directly contradict. Following the task literally changes amber-dot behavior that is banned by scope. (2) The spec references `resolveEffectiveDefaultModelIds` as the authoritative source of `effectiveModelIds` (including global fallback resolution), but this function is never located, imported, or shown to exist anywhere in the artifact chain. An implementer cannot be confident it exists or where to import it from. (3) The edge case 'pairedBatchCount = 0, batchCount > 0: ⚠ fires because batchCount > pairedBatchCount' is ambiguous: it covers both the case where one directional count is zero (badge should fire per FR-007) AND the case where both are zero with unrecognized tokens (badge must NOT fire per FR-007 and the 'No directional data' edge case). The two sub-cases are indistinguishable from the edge-case description alone, and an implementer who relies on that description without also reading FR-007 will produce wrong badge logic. Secondary concern: Task 1.3 says to 'Move nonAggregateRunsByDefinitionId population to AFTER this gate (currently it's before matchesModelFilter)' but the diff is broken (fatal: bad revision), so the implementer has no artifact-visible confirmation of the current structure and could misplace the move. The `incompleteBatchCount` contradiction alone is sufficient to block.

## Residual Risks

- tasks :: Slice 1 — Task 1.3 - This gates `batchCountByDefinitionId`, `directionalGroupsByDefinitionId`, and `incompleteBatchCountByDefinitionId`.
- spec :: Scope — Not in scope - Changes to `incompleteBatchCount` or the amber dot indicator
- spec :: Edge Cases — No default models - Note: an empty per-domain `defaultModelIds` does not guarantee `effectiveModelIds` is empty; global defaults may still apply... `resolveEffectiveDefaultModelIds` returns an empty array
- spec :: Edge Cases — pairedBatchCount = 0, batchCount > 0 - Cell shows `batchCount`. ⚠ fires because `batchCount > pairedBatchCount`. Direction tooltip shows 0 for the missing direction.
- spec :: Edge Cases — No directional data - If no runs have a recognized direction token (`jobChoiceValueFirst`), `pairedBatchCount = 0` and `aFirstBatchCount = bFirstBatchCount = 0`. No ⚠ badge. Runs with missing or blank `jobChoiceValueFirst` are excluded from directional counts but still contribute to `batchCount`.
- diff :: diff block - fatal: bad revision '7116531f6ac1d6d549d6a53484a1ac68d98afab9b3bf70d9fdf151a698b41f5a'
- tasks :: Slice 1 — Task 1.3 - Move `nonAggregateRunsByDefinitionId` population to AFTER this gate (currently it's before `matchesModelFilter`).
- plan :: Slice 2 — Changes - `orphanedBatchCount` is already in the API response but currently unused on the frontend. It will be threaded through... as a cross-check but the badge condition uses the individual counts.

## Verdict (structured)

```json
{
  "confidence": 4,
  "evidence": [
    {
      "artifact": "tasks",
      "quote": "This gates `batchCountByDefinitionId`, `directionalGroupsByDefinitionId`, and `incompleteBatchCountByDefinitionId`.",
      "section": "Slice 1 \u2014 Task 1.3"
    },
    {
      "artifact": "spec",
      "quote": "Changes to `incompleteBatchCount` or the amber dot indicator",
      "section": "Scope \u2014 Not in scope"
    },
    {
      "artifact": "spec",
      "quote": "Note: an empty per-domain `defaultModelIds` does not guarantee `effectiveModelIds` is empty; global defaults may still apply... `resolveEffectiveDefaultModelIds` returns an empty array",
      "section": "Edge Cases \u2014 No default models"
    },
    {
      "artifact": "spec",
      "quote": "Cell shows `batchCount`. \u26a0 fires because `batchCount > pairedBatchCount`. Direction tooltip shows 0 for the missing direction.",
      "section": "Edge Cases \u2014 pairedBatchCount = 0, batchCount > 0"
    },
    {
      "artifact": "spec",
      "quote": "If no runs have a recognized direction token (`jobChoiceValueFirst`), `pairedBatchCount = 0` and `aFirstBatchCount = bFirstBatchCount = 0`. No \u26a0 badge. Runs with missing or blank `jobChoiceValueFirst` are excluded from directional counts but still contribute to `batchCount`.",
      "section": "Edge Cases \u2014 No directional data"
    },
    {
      "artifact": "diff",
      "quote": "fatal: bad revision '7116531f6ac1d6d549d6a53484a1ac68d98afab9b3bf70d9fdf151a698b41f5a'",
      "section": "diff block"
    },
    {
      "artifact": "tasks",
      "quote": "Move `nonAggregateRunsByDefinitionId` population to AFTER this gate (currently it's before `matchesModelFilter`).",
      "section": "Slice 1 \u2014 Task 1.3"
    },
    {
      "artifact": "plan",
      "quote": "`orphanedBatchCount` is already in the API response but currently unused on the frontend. It will be threaded through... as a cross-check but the badge condition uses the individual counts.",
      "section": "Slice 2 \u2014 Changes"
    }
  ],
  "judge": "implementation-risk",
  "model": "claude-opus-4-5",
  "reasoning": "Three load-bearing gaps would cause a competent implementer to either get stuck or ship a bug. (1) Task 1.3 explicitly says the model-set filter gates `incompleteBatchCountByDefinitionId`, but the Scope section explicitly says 'Changes to `incompleteBatchCount` or the amber dot indicator' are NOT in scope \u2014 these directly contradict. Following the task literally changes amber-dot behavior that is banned by scope. (2) The spec references `resolveEffectiveDefaultModelIds` as the authoritative source of `effectiveModelIds` (including global fallback resolution), but this function is never located, imported, or shown to exist anywhere in the artifact chain. An implementer cannot be confident it exists or where to import it from. (3) The edge case 'pairedBatchCount = 0, batchCount > 0: \u26a0 fires because batchCount > pairedBatchCount' is ambiguous: it covers both the case where one directional count is zero (badge should fire per FR-007) AND the case where both are zero with unrecognized tokens (badge must NOT fire per FR-007 and the 'No directional data' edge case). The two sub-cases are indistinguishable from the edge-case description alone, and an implementer who relies on that description without also reading FR-007 will produce wrong badge logic. Secondary concern: Task 1.3 says to 'Move nonAggregateRunsByDefinitionId population to AFTER this gate (currently it's before matchesModelFilter)' but the diff is broken (fatal: bad revision), so the implementer has no artifact-visible confirmation of the current structure and could misplace the move. The `incompleteBatchCount` contradiction alone is sufficient to block.",
  "timestamp": "2026-04-26T00:00:00Z",
  "unaddressed_high_finding_ids": [],
  "verdict": "block"
}
```

## Resolution
- status: open
- note: Three load-bearing gaps would cause a competent implementer to either get stuck or ship a bug. (1) Task 1.3 explicitly says the model-set filter gates `incompleteBatchCountByDefinitionId`, but the Scope section explicitly says 'Changes t...
