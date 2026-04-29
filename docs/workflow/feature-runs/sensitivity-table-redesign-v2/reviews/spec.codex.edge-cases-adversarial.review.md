---
reviewer: "codex"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/sensitivity-table-redesign-v2/spec.md"
artifact_sha256: "d0d22fe5f3b9f7cd15364512b1b44c5de6939c42f5c67fa78e527bb4c0538e6d"
repo_root: "."
git_head_sha: "4e5839c03cf40e17c19de8b044e840b7447457b0"
git_base_ref: "origin/main"
git_base_sha: "4e5839c03cf40e17c19de8b044e840b7447457b0"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Accepted into plan/tasks. Legacy exclusion fields must be removed from v2 frontend reads, source-run collision determinism must be verified, and no-coverage partial evidence remains an accepted insufficient-footer behavior."
raw_output_path: "docs/workflow/feature-runs/sensitivity-table-redesign-v2/reviews/spec.codex.edge-cases-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

- **Medium [CODE-CONFIRMED]** The spec adds `pressureConditionExcludedCount` as the new authoritative exclusion total, but it leaves `excludedScenariosCount` and per-pair `definitionsExcluded` in the same payload story. The current resolver already emits both legacy fields, and `definitionsExcluded` is effectively a dead zero because nothing increments it. That creates a split-brain audit path where a consumer can read the wrong counter and believe the coverage loss is smaller than it is. Relevant code: [pressure-sensitivity.ts](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/api/src/graphql/queries/pressure-sensitivity.ts), [pressure-sensitivity.ts](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/api/src/graphql/types/pressure-sensitivity.ts).

- **Medium [CODE-CONFIRMED]** The determinism guarantee for `source_run_collision` is under-specified. `extractSourceRunIds()` preserves the raw array order from `config.sourceRunIds`, and `buildSourceRunToDefIdMap()` applies last-write-wins over that order. If the same IDs are serialized in a different order, the winning definition changes even though the underlying data did not. The spec says “stable source-run ordering,” but it never pins down what makes that order stable. Relevant code: [pressure-sensitivity.ts](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/api/src/graphql/queries/pressure-sensitivity.ts).

- **Low [CODE-CONFIRMED]** The `no-coverage` fallback is too coarse for edge cases where a model has some usable pair-level evidence but no pair with both directional pools measured. The current resolver routes any model with `pairsMeasured === 0` into `insufficient[]`, which drops all pair rows from the ranked table even if the model still has baseline-only or one-directional-only evidence that could be shown and reasoned about. The spec does not define a fallback surface for that partially informative case. Relevant code: [pressure-sensitivity.ts](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/api/src/graphql/queries/pressure-sensitivity.ts).

## Residual Risks

- The sensitivity check is still only a small sampled check, so it supports the default rule but does not prove corpus-wide stability.
- Equal-weight model means can still overreact to sparse pairs, especially near zero response.
- Leaving legacy exclusion fields in the schema, even if the v2 frontend stops reading them, still creates room for downstream consumers to misread old and new totals.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Accepted into plan/tasks. Legacy exclusion fields must be removed from v2 frontend reads, source-run collision determinism must be verified, and no-coverage partial evidence remains an accepted insufficient-footer behavior.
