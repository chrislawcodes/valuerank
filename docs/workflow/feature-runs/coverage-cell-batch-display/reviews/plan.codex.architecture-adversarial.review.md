---
reviewer: "codex"
lens: "architecture-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/coverage-cell-batch-display/plan.md"
artifact_sha256: "7116531f6ac1d6d549d6a53484a1ac68d98afab9b3bf70d9fdf151a698b41f5a"
repo_root: "."
git_head_sha: "eab6ffbb2ad3a2f01ce5cd3ffa2dfd3c317349e9"
git_base_ref: "origin/main"
git_base_sha: "eab6ffbb2ad3a2f01ce5cd3ffa2dfd3c317349e9"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "HIGH: Fixed — model-set filter now explicitly gates incompleteBatchCount and nonAggregateRunsByDefinitionId (moved to after filter check), preserving the one-bucket invariant and keeping popover trial counts consistent with batch count cohort. MEDIUM: Fixed as part of the same change — nonAggregateRunsByDefinitionId only populated for model-set-matched runs. Unverified risk on jobChoiceValueFirst spelling already captured as Residual Risk 2 with verification step. availableModels scope noted as out of scope — no UI currently depends on it being the filtered cohort."
raw_output_path: "docs/workflow/feature-runs/coverage-cell-batch-display/reviews/plan.codex.architecture-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan architecture-adversarial

## Findings

- HIGH [CODE-CONFIRMED]: The plan narrows `batchCount`, but it does not carry the same filter through `incompleteBatchCount`. The current code explicitly says the model filter is applied symmetrically so incomplete runs do not mention runs that `batchCount` cannot, to preserve the “exactly one bucket” invariant. As written, the plan would break that invariant and let a cell report batches and incomplete batches from different run sets.
- MEDIUM [CODE-CONFIRMED]: The plan changes the headline batch scope but leaves `allNonAggregateRunsForPair` / `computePerModelTrialCounts` unchanged. In the current code, the per-model breakdown is computed from all non-aggregate runs for the pair, not just the runs that pass the new model-set gate. That means the popover can still show trial counts from runs that no longer contribute to the visible batch count.

## Residual Risks

- [UNVERIFIED] The new `aFirstBatchCount` / `bFirstBatchCount` logic assumes `jobChoiceValueFirst` uses the canonical value names exactly. The provided code only preserves a trimmed string and does not validate the vocabulary, so any historical spelling variant would silently read as zero.
- [CODE-CONFIRMED] `availableModels` is still built from every signature-scoped run, not from the filtered batch cohort. If any UI or downstream consumer starts relying on that field for scope, it will remain broader than the new batch-count behavior.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: HIGH: Fixed — model-set filter now explicitly gates incompleteBatchCount and nonAggregateRunsByDefinitionId (moved to after filter check), preserving the one-bucket invariant and keeping popover trial counts consistent with batch count cohort. MEDIUM: Fixed as part of the same change — nonAggregateRunsByDefinitionId only populated for model-set-matched runs. Unverified risk on jobChoiceValueFirst spelling already captured as Residual Risk 2 with verification step. availableModels scope noted as out of scope — no UI currently depends on it being the filtered cohort.
