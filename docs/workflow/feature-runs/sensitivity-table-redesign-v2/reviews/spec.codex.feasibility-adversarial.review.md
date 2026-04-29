---
reviewer: "codex"
lens: "feasibility-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/sensitivity-table-redesign-v2/spec.md"
artifact_sha256: "d0d22fe5f3b9f7cd15364512b1b44c5de6939c42f5c67fa78e527bb4c0538e6d"
repo_root: "."
git_head_sha: "4e5839c03cf40e17c19de8b044e840b7447457b0"
git_base_ref: "origin/main"
git_base_sha: "4e5839c03cf40e17c19de8b044e840b7447457b0"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Accepted into plan/tasks. Findings describe migration blast radius, reducer rewrite, and exclusion-audit implementation obligations now explicitly covered by FR-031c/FR-033 and success criteria; no further product-spec change needed."
raw_output_path: "docs/workflow/feature-runs/sensitivity-table-redesign-v2/reviews/spec.codex.feasibility-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec feasibility-adversarial

## Findings

- Medium [CODE-CONFIRMED]: The spec understates the migration blast radius. The current web query wrapper derives its types from generated GraphQL, and the summary/detail components plus their tests still hard-code the legacy `winRateDeltaSummary`, `ownToken`/`opponentToken`, `definitionsExcluded`, `pairsPositive`, and `excludedScenariosCount` shapes. If the atomic cutover misses any of those consumers, the build or tests will break. Evidence: [pressureSensitivity.ts](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/web/src/api/operations/pressureSensitivity.ts#L1), [PressureSensitivitySummary.tsx](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/web/src/components/models/PressureSensitivitySummary.tsx#L45), [PressureSensitivityDetail.tsx](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/web/src/components/models/PressureSensitivityDetail.tsx#L64), [PressureSensitivitySummary.test.tsx](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/web/src/components/models/PressureSensitivitySummary.test.tsx#L6), [PressureSensitivityDetail.test.tsx](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/web/src/components/models/PressureSensitivityDetail.test.tsx#L6).

- Medium [CODE-CONFIRMED]: The spec treats v2 as a field rename, but the current aggregation layer cannot express the new semantics. `pooledBandReduction()` only models two bands and only returns the legacy thin-reason set, while the exported shapes still expose `WinRateDelta` and `WinRateDeltaSummary`. The new baseline-aware summary and `directional-thin` / `inverted-thin` / `baseline-thin` / `directional-and-inverted-thin` reason model require a reducer and schema redesign, not just renamed GraphQL fields. Evidence: [aggregation.ts](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/api/src/services/pressure-sensitivity/aggregation.ts#L36), [aggregation.ts](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/api/src/services/pressure-sensitivity/aggregation.ts#L320), [pressure-sensitivity.ts](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/api/src/graphql/types/pressure-sensitivity.ts#L15).

- Medium [CODE-CONFIRMED]: The new exclusion audit will undercount unless every silent drop site is instrumented. Today the resolver only increments `excludedScenariosCount` when `normalizeScenarioAnalysisMetadata(...) === null`; transcripts can also disappear earlier at `sourceRunToDefId.get(...)`, `definitionMeta.get(...)`, and `assignOwnOpponentLevels(...) === null` with no top-level counter. The spec’s `pressureConditionExcludedCount` / breakdown requirement needs to cover all of those branches explicitly. Evidence: [pressure-sensitivity.ts](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/api/src/graphql/queries/pressure-sensitivity.ts#L417), [pressure-sensitivity.ts](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/api/src/graphql/queries/pressure-sensitivity.ts#L448), [pressure-sensitivity.ts](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/api/src/graphql/queries/pressure-sensitivity.ts#L451).

## Residual Risks

- The sensitivity check is still sample-based, not corpus-wide proof. The artifact already shows near-zero pairs can flip sign across plausible cell-selection rules, so the headline needs strong uncertainty copy or users will over-read borderline cases.

- I did not inspect every downstream consumer outside the files surfaced above. Any additional legacy-field reference in another package or generated artifact would make the atomic schema cutover broader than the spec currently implies.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Accepted into plan/tasks. Findings describe migration blast radius, reducer rewrite, and exclusion-audit implementation obligations now explicitly covered by FR-031c/FR-033 and success criteria; no further product-spec change needed.
