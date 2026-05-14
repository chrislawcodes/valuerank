---
reviewer: "codex"
lens: "implementation-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/full-pvq-survey/plan.md"
artifact_sha256: "883c6c75b23949e2ce6151d1d29a3aabd3a9f5e226e6962c01d056260e4a4a8f"
repo_root: "."
git_head_sha: "597508be0050a106dddfaa1bc4d6b1a4443993af"
git_base_ref: "origin/main"
git_base_sha: "597508be0050a106dddfaa1bc4d6b1a4443993af"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "HIGH 1 (fullPvqResults return shape wrong for grid): FIXED — AD-2 updated, query now returns AggregatedResults { models, categories[{ name, scores[{ modelId, mean, trialCount, refusedCount }] }] }. HIGH 2 (framing inferred from mutable analysisPlan): FIXED — AD-1 updated, framing stored immutably in Run.config.fullPvqFraming at run-creation time. MEDIUM 1 (duplicate answers as valid data): REJECTED — last-match-wins with parseWarnings is explicit design per spec. MEDIUM 2 (parser transcript content shape UNVERIFIED): ACCEPTED as UNVERIFIED — Wave 1 must verify transcript.content JSON path before regex. MEDIUM 3 (delete path leaks through other screens UNVERIFIED): ACCEPTED — deleteFullPvq soft-deletes via analysisPlan.deletedAt; full audit of non-fullPvq screens is out of scope for v1."
raw_output_path: "docs/workflow/feature-runs/full-pvq-survey/reviews/plan.codex.implementation-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan implementation-adversarial

## Findings

1. HIGH: The results query contract is underspecified and does not support the stated UI. `fullPvqResults` is described as returning `{ categories: [{ name, mean, trialCount, refusedCount }], models: [...] }`, but the page needs a mean per `category × model` cell. As written, the API can only return one aggregate per category, so the grid cannot be rendered without a second aggregation path or a shape change.
2. HIGH: Framing is being inferred from mutable survey metadata instead of being stored immutably with the run. Using `analysisPlan.straightDefinitionId` / `desireDefinitionId` to reconstruct historical framing means any later edit, repair, or delete logic that touches `analysisPlan` can silently reclassify old runs or make them unresolvable. Results should not depend on a mutable JSON blob for historical truth.
3. MEDIUM: Duplicate answers are treated as valid data, not as refusal. The plan says the parser is strict on ambiguity, but then explicitly allows duplicate `Qn` lines with “last match wins.” That lets malformed or prompt-injected transcripts influence averages instead of being excluded.
4. MEDIUM [UNVERIFIED]: The parser assumes transcript content can be reliably reduced to one plain response string from the existing transcript JSON shape. If the content structure varies or includes the prompt text, the regex can score the wrong `Qn:` lines. No code context was provided, so this depends on the current transcript schema.
5. MEDIUM [UNVERIFIED]: The delete path introduces a new `analysisPlan.deletedAt` convention, but the plan only says the new PVQ queries will honor it. Existing generic experiment, definition, and run paths are not covered, so deleted surveys may still leak through other admin or archive screens depending on the current codebase.

## Residual Risks

1. Compute-on-read will stay sensitive to survey size and transcript count. The plan accepts this for v1, but performance will degrade if usage grows or if transcript reads become expensive.
2. The plan does not paginate the trial detail view. A larger-than-expected survey could make the page slow or hard to use.
3. Mean-only category display hides spread and outliers. That is acceptable for v1, but it limits how much a reviewer can trust a category’s central tendency at a glance.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: HIGH 1 (fullPvqResults return shape wrong for grid): FIXED — AD-2 updated, query now returns AggregatedResults { models, categories[{ name, scores[{ modelId, mean, trialCount, refusedCount }] }] }. HIGH 2 (framing inferred from mutable analysisPlan): FIXED — AD-1 updated, framing stored immutably in Run.config.fullPvqFraming at run-creation time. MEDIUM 1 (duplicate answers as valid data): REJECTED — last-match-wins with parseWarnings is explicit design per spec. MEDIUM 2 (parser transcript content shape UNVERIFIED): ACCEPTED as UNVERIFIED — Wave 1 must verify transcript.content JSON path before regex. MEDIUM 3 (delete path leaks through other screens UNVERIFIED): ACCEPTED — deleteFullPvq soft-deletes via analysisPlan.deletedAt; full audit of non-fullPvq screens is out of scope for v1.
