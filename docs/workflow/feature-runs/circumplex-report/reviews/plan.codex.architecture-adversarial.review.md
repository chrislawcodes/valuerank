---
reviewer: "codex"
lens: "architecture-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/circumplex-report/plan.md"
artifact_sha256: "c57bff338416a79a7f67ed7468339b95f4d78318e0126d4f6b12dd70d571a4f7"
repo_root: "."
git_head_sha: "2a61705a6965451e85ef5426ef3dffad0fabbbd7"
git_base_ref: "origin/claude/consistency-signature-dropdown"
git_base_sha: "2a61705a6965451e85ef5426ef3dffad0fabbbd7"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "HIGH (orientation-aware canonicalization missing): Decision 1 rewritten — aggregation now routes every transcript through resolveTranscriptDecisionModel() with orientationFlipped + pairOverride before counting wins, drops unknown decisions, and gates on COMPLETED + deletedAt IS NULL + runMatchesSignature. Explicit test in wave A (flipped scenarios must produce identical counts to unflipped). MEDIUM (picker cannot determine eligibility from llmModels): Decision 8 added — server returns {models, insufficient} mirroring ModelsConsistency; client renders both lists; no llmModels roundtrip needed. MEDIUM (null-aware Spearman wrapper): Decision 4 revised — circumplexFit wraps the shared spearmanRankCorrelation and returns nullable rho/p with 'insufficient_data' verdict when below threshold; Self-Direction exclusion falls back to next included value in canonical order. Residual risks acknowledged in plan."
raw_output_path: "docs/workflow/feature-runs/circumplex-report/reviews/plan.codex.architecture-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: "Coverage reconciled after plan revision addresses all findings; no new spec or plan territory introduced."
---

# Review: plan architecture-adversarial

## Findings

1. **High** The plan’s direct `Transcript` aggregation path is missing the same orientation-aware canonicalization that the rest of the codebase already depends on. Existing aggregation routes every transcript through `resolveTranscriptDecisionModel(...)` with `orientationFlipped` plus `pairOverride` before counting wins, and it explicitly drops `unknown` directions. If circumplex reads transcripts “directly” without that step, flipped scenarios will be counted against the wrong pair and the matrix will be wrong at the source. [CODE-CONFIRMED] Evidence: [domain-analysis-aggregation.ts](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/api/src/graphql/queries/domain/domain-analysis-aggregation.ts#L33) and [value-detail.ts](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/api/src/graphql/queries/domain/analysis/value-detail.ts#L188)

2. **Medium** The proposed picker cannot actually determine eligibility from `llmModels` alone. The current models report gets a server-computed `models` list and a separate `insufficient` list, and the UI only renders from that filtered result. The plan’s Wave B says the circumplex picker will use the full `llmModels` roster and filter eligibility client-side, but that roster does not carry the per-value coverage needed to know whether a model meets `minTrialsPerValue`. [CODE-CONFIRMED] Evidence: [ModelsConsistency.tsx](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/web/src/pages/ModelsConsistency.tsx#L100) and [modelsConsistency.tsx](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/api/src/graphql/queries/models-consistency.ts#L185)

3. **Medium** Decision 4 needs a null-aware wrapper around Spearman, not a straight reuse of the consistency helper. The existing `spearmanRankCorrelation` returns `{ rho: 0, p: 1 }` for short or degenerate inputs, while `coherenceForPair` only converts fully non-finite results to `null`. The circumplex artifact promises nullable `spearmanRho`/`spearmanP` and an `insufficient_data` state, so reusing the existing helper without an extra guard will collapse “not enough determinate pairs” into “no correlation.” [CODE-CONFIRMED] Evidence: [statistics.ts](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/api/src/services/consistency/statistics.ts#L322) and [statistics.ts](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/api/src/services/consistency/statistics.ts#L353)

## Residual Risks

- Pooling across all pressure conditions can still erase a real circumplex pattern that only appears under a subset of pressures, or the reverse. The plan acknowledges this, but it is still a real interpretive risk.
- A per-value trial floor can still admit models whose 10×10 matrix is too sparse to support a stable MDS fit. The page will need a strong `insufficient_data` or poor-fit treatment, not just a raw threshold.
- Classical MDS can rotate or flip arbitrarily, so the visual anchor rule needs to be robust when the anchor value is excluded or weakly supported.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: HIGH (orientation-aware canonicalization missing): Decision 1 rewritten — aggregation now routes every transcript through resolveTranscriptDecisionModel() with orientationFlipped + pairOverride before counting wins, drops unknown decisions, and gates on COMPLETED + deletedAt IS NULL + runMatchesSignature. Explicit test in wave A (flipped scenarios must produce identical counts to unflipped). MEDIUM (picker cannot determine eligibility from llmModels): Decision 8 added — server returns {models, insufficient} mirroring ModelsConsistency; client renders both lists; no llmModels roundtrip needed. MEDIUM (null-aware Spearman wrapper): Decision 4 revised — circumplexFit wraps the shared spearmanRankCorrelation and returns nullable rho/p with 'insufficient_data' verdict when below threshold; Self-Direction exclusion falls back to next included value in canonical order. Residual risks acknowledged in plan.