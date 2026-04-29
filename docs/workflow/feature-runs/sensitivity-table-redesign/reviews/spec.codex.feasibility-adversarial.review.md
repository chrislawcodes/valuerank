---
reviewer: "codex"
lens: "feasibility-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/sensitivity-table-redesign/spec.md"
artifact_sha256: "fa7be2e8f98d5877d53be462f2a49b97ba7923d78b374787f103eb2e988d5b3d"
repo_root: "."
git_head_sha: "037325feb2617aa96b68cfb204a023144a68c88a"
git_base_ref: "origin/main"
git_base_sha: "4772ae79f8e1580ee31c0f10f32e6d86a842ef68"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "HIGH (transcript ceiling) ELEVATED to hard requirement via new FR-019. Resolver MUST log structured warning on cap hit and surface transcriptCapHit boolean to the frontend so coverage banner can render. Companion FR-020 covers the sourceRunId collision warning case."
raw_output_path: "docs/workflow/feature-runs/sensitivity-table-redesign/reviews/spec.codex.feasibility-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec feasibility-adversarial

## Findings

- **HIGH [CODE-CONFIRMED]** The spec treats the new win-rate CIs as trustworthy headline numbers, but the resolver still hard-caps transcript fetching at `500_000` rows and stops paginating once that ceiling is reached. There is no warning or truncation flag in the code, so large domains will silently undercount data and produce biased low/high means and CIs while still looking precise.
- **MEDIUM [CODE-CONFIRMED]** The spec assumes source-run attribution is safe, but the code still builds `sourceRunToDefId` with a plain `Map.set()` overwrite and no collision detection. If one `sourceRunId` appears under more than one aggregate-tagged run/definition, transcripts are silently assigned to the last definition seen, which corrupts both per-pair and cross-model results.
- **MEDIUM [CODE-CONFIRMED]** FR-008/FR-008a require band-specific “thin” behavior and a row-level `Trials` count that reflects only contributing bands, but the current resolver only tracks pair-level `unscoredCount` and per-cell `n`. There is no band-level contributing-trial count in the current shape, so the spec’s `Trials` semantics and thin-band tooltips cannot be implemented faithfully without adding more aggregation data than the spec currently names.

## Residual Risks

- The redesign still depends on scenario normalization and level mapping (`normalizeScenarioAnalysisMetadata`, `assignOwnOpponentLevels`) to decide which cells belong to low/high pressure. Any edge-case drift there will change the new win-rate numbers, so that path needs focused test coverage.
- Removing `directionDelta`, `convictionDelta`, `netScoreDelta`, and `aggregateSensitivity` from GraphQL is a hard break for any consumer not updated in the same change. The spec assumes the monorepo migration will be perfectly coordinated.
- The current resolver’s `definitionsMeasured` and `definitionsExcluded` bookkeeping is pair-scoped and not yet tied to the proposed summary fields. If the UI needs those counts for the new tables, the resolver shape will need another pass.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: HIGH (transcript ceiling) ELEVATED to hard requirement via new FR-019. Resolver MUST log structured warning on cap hit and surface transcriptCapHit boolean to the frontend so coverage banner can render. Companion FR-020 covers the sourceRunId collision warning case.
