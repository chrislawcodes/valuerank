---
reviewer: "codex"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/sensitivity-table-redesign/spec.md"
artifact_sha256: "fa7be2e8f98d5877d53be462f2a49b97ba7923d78b374787f103eb2e988d5b3d"
repo_root: "."
git_head_sha: "037325feb2617aa96b68cfb204a023144a68c88a"
git_base_ref: "origin/main"
git_base_sha: "4772ae79f8e1580ee31c0f10f32e6d86a842ef68"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "MEDIUM (transparency signals dropped) RESOLVED via new FR-008c explicitly preserving unscoredCount, definitionsMeasured, definitionsExcluded, insufficient list, excludedDefinitions, and excludedScenariosCount in the resolver and the existing coverage footer surfaces. Only Defs and Baseline columns are dropped from the per-pair table proper."
raw_output_path: "docs/workflow/feature-runs/sensitivity-table-redesign/reviews/spec.codex.edge-cases-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

- MEDIUM [CODE-CONFIRMED] The spec removes the current transparency signals for dropped or thin data, but it does not replace them with anything comparable. Today the report still surfaces `unscoredCount` and `definitionsMeasured/definitionsExcluded` in the per-pair table, and it keeps a coverage footer for `insufficient`, `excludedDefinitions`, and `excludedScenariosCount` ([PressureSensitivityDetail.tsx](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/web/src/components/models/PressureSensitivityDetail.tsx#L151), [PressureSensitivity.tsx](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/web/src/pages/PressureSensitivity.tsx#L241), [pressure-sensitivity.ts](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/api/src/graphql/queries/pressure-sensitivity.ts#L518)). FR-002 and FR-008 only add `Trials` plus a thin-Δ hover message, so a row can read as complete even when a lot of data was discarded.

- MEDIUM [CODE-CONFIRMED] The spec says the limitations panel continues unchanged, but the current copy is written around metrics the redesign deletes. It still explains `Direction / Conviction / netScore Δ`, “the aggregate sensitivity number,” and “the pair count next to each row” ([PressureSensitivityLimitations.tsx](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/web/src/components/models/PressureSensitivityLimitations.tsx#L25), [PressureSensitivitySummary.tsx](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/web/src/components/models/PressureSensitivitySummary.tsx#L93), [PressureSensitivityDetail.tsx](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/web/src/components/models/PressureSensitivityDetail.tsx#L79)). After FR-010 and FR-014, leaving that text in place will make the page contradict itself.

- MEDIUM [CODE-CONFIRMED] FR-006b makes the low/high endpoints and the Δ come from different estimators, but the spec never tells readers that the endpoints are no longer algebraically linked. The current helper computes the band means and Δ from one reduction pass ([aggregation.ts](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/api/src/services/pressure-sensitivity/aggregation.ts#L141)), so the redesign will create rows where `High - Low` does not match the displayed Δ, with no on-page warning that the mismatch is intentional.

## Residual Risks

- The spec’s own out-of-scope risks still matter: the 500,000-transcript cap can bias results, and source-run collisions can still silently reattribute transcripts if the mitigation is not implemented.
- I could not verify the referenced `plan.md` tooltip copy from the provided context, so the final implementation still needs a strict wording pass to keep the new labels from drifting back to `Direction Δ` or `aggregate sensitivity`.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: MEDIUM (transparency signals dropped) RESOLVED via new FR-008c explicitly preserving unscoredCount, definitionsMeasured, definitionsExcluded, insufficient list, excludedDefinitions, and excludedScenariosCount in the resolver and the existing coverage footer surfaces. Only Defs and Baseline columns are dropped from the per-pair table proper.
