---
reviewer: "codex"
lens: "architecture-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/finding-2-graphql-tightening/plan.md"
artifact_sha256: "e2f094ca68876263832b386606a4cf70d0093373146b8a47edd1a42633c2f006"
repo_root: "."
git_head_sha: "6aa2af3410351431f88a8a4bc12fda6deeef7c8e"
git_base_ref: "origin/main"
git_base_sha: "6aa2af3410351431f88a8a4bc12fda6deeef7c8e"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Round-4 HIGH Domain-alias-mismatch-with-mutation-shape addressed in tasks T1.5 (keep Domain as narrow mutation-result shape, add DomainListItem for list call sites). MEDIUM single-property-wrappers-slip-past-rule addressed in tasks T4.1 (rule now flags ALL TSTypeLiteral in operations/). MEDIUM analysisStatus-narrowing-lost addressed in tasks T3.4 (narrowings.ts gains narrowAnalysisStatus)."
raw_output_path: "docs/workflow/feature-runs/finding-2-graphql-tightening/reviews/plan.codex.architecture-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "partial"
coverage_note: "context exceeded max_context_chars and was narrowed"
---

# Review: plan architecture-adversarial

## Findings

1. **High [CODE-CONFIRMED]** The plan’s `Domain` alias swap is not safe as written. `useDomains.ts` returns `createDomain` and `renameDomain` as `Promise<Domain | null>`, but the current `CreateDomainDocument` and `RenameDomainDocument` only select `id`, `name`, `createdAt`, `updatedAt`, and `definitionCount` in `graphql.ts`. Replacing `Domain` with `DomainsQuery['domains'][number]` would require fields those mutation payloads do not contain, so the hook return types would stop lining up unless the mutation documents are also widened.

2. **Medium [CODE-CONFIRMED]** The proposed lint rule is too narrow to enforce the plan. It only flags `TSTypeLiteral` aliases with `>= 2` members, but several of the exact hand-typed shapes the plan wants gone are single-property wrappers in `domains.ts`, including `DomainsQueryResult`, `DomainSettingsQueryResult`, `EstimateDomainEvaluationCostQueryResult`, `SetDomainSettingsMutationResult`, and `BackfillDomainEvaluationModelsMutationResult`. Those would sail past the rule unchanged.

3. **Medium [CODE-CONFIRMED]** Slice 2 drops `DomainTrialRunsStatusQueryResult` without preserving its intentional narrowing. `domains.ts` explicitly says generated `analysisStatus` is `string | null | undefined`, but the manual alias narrows it to `string | null` because consumers assign it directly. The plan only creates a narrowing helper for `estimateConfidence`; it does not replace this `analysisStatus` contract, so deleting the alias will reopen the same type mismatch the comment warns about.

## Residual Risks

- The backfill mutation is still only half-covered in the plan. `DomainStartBatches.tsx` currently depends on `BackfillDomainEvaluationModelsMutationResult` and `BackfillDomainEvaluationModelsMutationVariables`, so moving only the document into `.graphql` leaves manual types behind unless they are cleaned up in the same pass.

- Slice 0 is a hard prerequisite, and any mismatch between the regenerated `schema.graphql` snapshot and the backend schema will cascade into later slices. If that snapshot is off, codegen can succeed while still omitting fields that the pages now read.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Round-4 HIGH Domain-alias-mismatch-with-mutation-shape addressed in tasks T1.5 (keep Domain as narrow mutation-result shape, add DomainListItem for list call sites). MEDIUM single-property-wrappers-slip-past-rule addressed in tasks T4.1 (rule now flags ALL TSTypeLiteral in operations/). MEDIUM analysisStatus-narrowing-lost addressed in tasks T3.4 (narrowings.ts gains narrowAnalysisStatus).