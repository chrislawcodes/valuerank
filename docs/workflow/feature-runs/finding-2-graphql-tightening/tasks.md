# Tasks — GraphQL Schema Document Tightening (Finding #2)

**Slug**: finding-2-graphql-tightening
**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)
**Status**: Tasks — pre-checkpoint

6 slices. Each bounded by `[CHECKPOINT]`. Estimated total diff ~2000 lines (most in regenerated `graphql.ts`).

## Review Reconciliation

(Tasks checkpoint pending.)

## Slice 0: Regenerate `schema.graphql` from the Pothos backend

- [ ] **T0.1 [CHECKPOINT]** Check if `cloud/apps/api/src/scripts/emit-schema.ts` (or similar) exists. If yes, use it. If no, add one: print the Pothos schema's SDL to stdout, invocable as `npm run emit-schema --workspace @valuerank/api > ../web/schema.graphql`.
- [ ] **T0.2** Run the emitter to regenerate `cloud/apps/web/schema.graphql`.
- [ ] **T0.3** Verify fields appear in the regenerated snapshot:
  - `grep "backfillDomainEvaluationModels" cloud/apps/web/schema.graphql` (expect match)
  - `grep "defaultModelIds" cloud/apps/web/schema.graphql` (expect match on `Domain`)
  - `grep "modelIds" cloud/apps/web/schema.graphql` (expect match on `DomainEvaluationMember`)
  - `grep "targetBatchCount" cloud/apps/web/schema.graphql` (expect match on `DomainEvaluation`)
  - `grep "launchableDefinitions" cloud/apps/web/schema.graphql` (expect match on `DomainEvaluation`)
- [ ] **T0.4** If any grep fails, the Pothos schema also needs an addition — BLOCK and flag to the human; do not attempt to modify Pothos in this feature.
- [ ] **T0.5** Verify contingency for `SetDomainSettings` input: `grep -A 20 "input SetDomainSettingsInput" cloud/apps/web/schema.graphql` — if `defaultModelIds`/`sentencePrefix`/`labelPrefix` are NOT present, add `SetDomainSettingsMutationVariables` to the ESLint allowlist (Slice 4) with an intentional note; else delete the hand-type as planned.
- [ ] **T0.6** `npm run codegen --workspace @valuerank/web` succeeds.

**Estimated diff**: ~1500-2000 lines in the regenerated schema snapshot. Review for unexpected additions/removals.

## Slice 1: Core queries — Domains, DomainEvaluations, DomainEvaluation

- [ ] **T1.1 [CHECKPOINT] [P: cloud/apps/web/src/api/operations/domains.graphql]** Edit the `Domains` query in `domains.graphql`: add `defaultModelIds`, `sentencePrefix`, `labelPrefix` to the `domains` selection.
- [ ] **T1.2 [P: cloud/apps/web/src/api/operations/domains.graphql]** Edit the `DomainEvaluations` query: add `launchableDefinitionIds`, `samplePercentage`, `samplesPerScenario`, `targetBatchCount`, `memberCount`, plus nested `members { modelIds, …existing fields }`.
- [ ] **T1.3 [P: cloud/apps/web/src/api/operations/domains.graphql]** Edit the `DomainEvaluation` query: add `launchableDefinitions { definitionId, definitionName, pairKey }` plus all fields T1.2 added.
- [ ] **T1.4** Run `npm run codegen --workspace @valuerank/web`. Verify `DomainsQuery`, `DomainEvaluationsQuery`, `DomainEvaluationQuery` generated types include the new fields.
- [ ] **T1.5** Edit `cloud/apps/web/src/api/operations/domains.ts`. **Round-4 plan review caught** that `createDomain`/`renameDomain` mutations select a LIMITED shape, so `Domain` can't just alias the full query shape — hooks break. Approach: keep `Domain` as the *mutation-result shape* (subset) for hook return types, and add a separate `DomainListItem = DomainsQuery['domains'][number]` alias for list-rendering call sites. Delete the object-literal `export type Domain`. Similarly handle `DomainEvaluation` if a mutation returns a narrower shape. Verify with `tsc`.
- [ ] **T1.6** Delete `DomainsQueryResult`, `DomainEvaluationQueryResult`, `DomainEvaluationsQueryResult` hand-typed exports; call sites use generated types directly (via T1.5 aliases).
- [ ] **T1.7** Fix call-site compilation errors in: `cloud/apps/web/src/hooks/useDomains.ts`, `cloud/apps/web/src/hooks/useDomainSettings.ts`, `cloud/apps/web/src/pages/DomainStatus.tsx`, `cloud/apps/web/src/pages/DomainStartBatches.tsx`, and the other ~15 importers.
- [ ] **T1.8** Verification: `npm run build --workspace @valuerank/web` succeeds. Manual smoke: Domains page, Domain Detail, Domain Evaluation Status.

**Estimated diff**: ~250 lines + ~500 in regenerated `graphql.ts`.

## Slice 2: Remaining queries — DomainSettings, DomainTrialRunsStatus, EstimateDomainEvaluationCost

- [ ] **T2.1 [CHECKPOINT] [P: cloud/apps/web/src/api/operations/domains.graphql]** Edit the `DomainSettings` query: add `domain { defaultModelIds, sentencePrefix, labelPrefix }` as a sub-selection (NOT on `DomainSettings` directly — the fields live on `Domain`).
- [ ] **T2.2 [P: cloud/apps/web/src/api/operations/domains.graphql]** Edit the `DomainTrialRunsStatus` query: select every field that `DomainTrialRunsStatusQueryResult.RowView` reads (analysisStatus, runId, …). Confirm generated type matches consumer shape.
- [ ] **T2.3 [P: cloud/apps/web/src/api/operations/domains.graphql]** Edit the `EstimateDomainEvaluationCost` query: select all fields listed in the current hand-typed `DomainEvaluationCostEstimate`. Note: `estimateConfidence` remains a `String`; narrowing to `'HIGH' | 'MEDIUM' | 'LOW'` happens in `narrowings.ts` (Slice 3).
- [ ] **T2.4** Regen codegen. Delete hand-typed `DomainSettings`, `ValueStatementWithVersions`, `DomainTrialRunsStatusQueryResult`, `DomainEvaluationCostEstimateModel`, `DomainEvaluationCostEstimateDefinition`, `DomainEvaluationCostEstimate`, `DomainSettingsQueryResult`, `EstimateDomainEvaluationCostQueryResult` from `domains.ts`.
- [ ] **T2.5** Fix call sites.
- [ ] **T2.6** Per Slice 0 contingency T0.5: if `SetDomainSettingsInput` is complete, delete `SetDomainSettingsMutationResult`, `SetDomainSettingsMutationVariables`. Else allowlist them in the ESLint rule (Slice 4).
- [ ] **T2.7** Verification: `npm run build`, smoke-test Settings page + LaunchConfirmModal.

**Estimated diff**: ~200 lines + regen graphql.ts.

## Slice 3: Wire orphan mutation + narrowings helper

- [ ] **T3.1 [CHECKPOINT] [P: cloud/apps/web/src/api/operations/domains.graphql]** Move the `BACKFILL_DOMAIN_EVALUATION_MODELS_MUTATION` gql content from `domains.ts` into `domains.graphql` as a proper GraphQL document.
- [ ] **T3.2** Regen codegen. Verify `BackfillDomainEvaluationModelsDocument`, `BackfillDomainEvaluationModelsMutation`, `BackfillDomainEvaluationModelsMutationVariables` appear in `generated/graphql.ts`.
- [ ] **T3.3 [P: cloud/apps/web/src/api/operations/domains.ts]** Replace the hand-written `gql\`...\`` block in `domains.ts` with a re-export: `export { BackfillDomainEvaluationModelsDocument as BACKFILL_DOMAIN_EVALUATION_MODELS_MUTATION } from '../../generated/graphql'`.
- [ ] **T3.4 [P: cloud/apps/web/src/api/operations/narrowings.ts]** Create `narrowings.ts` with: (a) `narrowEstimateConfidence(value: string): 'HIGH' | 'MEDIUM' | 'LOW' | null`, (b) `narrowAnalysisStatus(value: string | null | undefined): string | null` (round-4 plan review correction — `DomainTrialRunsStatusQueryResult.analysisStatus` was being narrowed from `string|null|undefined` to `string|null` by the hand-type; preserve that narrowing in the helper).
- [ ] **T3.5** Update `LaunchConfirmModal` (or wherever the narrowed value is read) to call `narrowEstimateConfidence(cost.estimateConfidence)`.
- [ ] **T3.6** Verification: `grep "gql\`" cloud/apps/web/src/api/operations/domains.ts | wc -l` returns 0. Manual test: trigger a `backfillDomainEvaluationModels` mutation from the UI.

**Estimated diff**: ~100 lines.

## Slice 4: ESLint rule + allowlist

- [ ] **T4.1 [CHECKPOINT]** Create `cloud/apps/web/eslint-rules/no-hand-typed-graphql-shapes.js`. Use `@typescript-eslint/utils` to walk the AST. Pattern detection (round-4 plan review correction: includes single-property wrappers): flag ANY `TSTypeLiteral` (≥ 1 member), flag `TSIntersectionType` with any `TSTypeLiteral` branch. Allow `TSTypeReference`/`TSIndexedAccessType` pointing at generated types. Apply only to `src/api/operations/**/*.ts`. Single-property wrappers like `{ domains: Domain[] }` must flag — they're exactly the pattern we're removing.
- [ ] **T4.2 [P: cloud/apps/web/eslint-rules/no-hand-typed-graphql-shapes.test.js]** Write rule tests covering: object-literal fail, extend-and-reshape fail, generated-alias pass, allowlisted-file pass, orphan-allowlist warn.
- [ ] **T4.3 [P: cloud/.eslintrc.cjs]** Register the rule in `cloud/.eslintrc.cjs` (the actual web-workspace config) under the `apps/web/**/*.{ts,tsx}` override. Allowlist `domainAnalysis.ts`, `runs.ts`, `narrowings.ts`, `modelsAnalysis.ts`, `scenarios.ts`, `definitions.ts`, `llm.ts` with TODO comments for each.
- [ ] **T4.4** Verification: `npm run lint --workspace @valuerank/web` passes on the current branch. Add a throwaway `export type Test = { foo: string }` to `domains.ts` → lint fails. Revert → lint passes. Add same line to an allowlisted file (e.g. `runs.ts`) → lint still passes.

**Estimated diff**: ~250 lines.

## Slice 5: PR polish

- [ ] **T5.1 [CHECKPOINT]** Run all grep verification steps from SC-001, SC-002, SC-003 and capture before/after counts for the PR description.
- [ ] **T5.2 [P: new task chip]** Spawn a followup task chip `finding-3-runs-operations-cleanup`: port the same schema-tightening pattern to `runs.ts` and remove from the ESLint allowlist.
- [ ] **T5.3 [P: new task chip]** Spawn another followup chip for `modelsAnalysis.ts`, `scenarios.ts`, `definitions.ts`, `llm.ts` cleanups — these were discovered during this feature's ESLint-rule scoping.
- [ ] **T5.4** Write the PR description with the before/after table per spec User Story 5.

**Estimated diff**: 0 lines in repo.

## Verification (overall)

- [ ] **V.1** `npm run codegen --workspace @valuerank/web` succeeds; diff reviewed.
- [ ] **V.2** `npm run verify --workspace @valuerank/web` (codegen + lint + test + build) passes.
- [ ] **V.3** `npm run build --workspace @valuerank/web` succeeds.
- [ ] **V.4** Manual smoke of five pages: Domains, Domain Detail, Domain Evaluation Status, Domain Settings, LaunchConfirmModal.
- [ ] **V.5** ESLint rule fails on a test hand-type, passes when reverted.

## Parallel analysis

Several steps within Slice 1 (T1.1-T1.3) and Slice 4 (T4.1-T4.3) are marked `[P]` because they touch different files. Slice-level parallelism is NOT applicable because: Slice 1 depends on Slice 0's regen, Slice 2 and Slice 3 depend on Slice 0 + Slice 1's call-site pattern, Slice 4 depends on Slice 1-3 being complete (rule must not fail on in-flight hand-types). Slice 5 is pure PR polish with no code dependencies.
