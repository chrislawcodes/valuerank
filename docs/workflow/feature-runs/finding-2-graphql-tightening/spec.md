# Feature — GraphQL Schema Document Tightening (Finding #2)

**Slug**: finding-2-graphql-tightening
**Branch**: `claude/finding-2-graphql-tightening`
**Created**: 2026-04-17
**Status**: Spec — v2 (major rewrite after first spec checkpoint found the original premise was wrong)
**Input**: Eliminate hand-typed GraphQL shape aliases in `cloud/apps/web/src/api/operations/domains.ts` by selecting fields that already exist in the Pothos schema but that query documents don't yet request, and prevent regressions with a narrowly-scoped ESLint rule.

---

## Revision history

- **v1 → v2**: Original spec assumed the API schema was missing fields (`defaultModelIds`, `modelIds`, `launchableDefinitions`, etc.) and the orphan mutation `backfillDomainEvaluationModels`. The Codex edge-cases review CODE-CONFIRMED that **all those fields are already exposed in Pothos** (see `cloud/apps/api/src/graphql/types/domain.ts:56-58`, `queries/domain/evaluation/types.ts:155-201`, `mutations/domain/evaluation.ts:96`). The real gap is that the frontend *query documents* don't select them. That changes this from a schema-addition feature into a query-document-tightening feature.
- **v2 → v3**: Full-context adversarial reviews surfaced three more issues: (1) query documents actually live in `cloud/apps/web/src/api/operations/domains.graphql`, not `domains.ts` — `domains.ts` is mainly a re-export layer; all query edits happen in the `.graphql` file. (2) `DomainSettings` in the schema does NOT have `defaultModelIds` — that field is on `Domain`. The hand-typed `DomainSettings` shape in `domains.ts` was merging Domain-level and DomainSettings-level concepts into one alias. v3 removes the conflated alias and lets each screen select fields from the correct type. (3) `estimateConfidence` is returned as `String` in the schema but consumers want `'HIGH' | 'MEDIUM' | 'LOW'`. Schema change is out of scope for v3 (separate feature); instead v3 allows a small, explicit, allowlisted narrowing helper for this one field. (4) v3 also covers additional hand-typed wrappers I originally missed: `DomainMutationResult`, `DomainsQueryResult`, `DomainEvaluationQueryResult`, `EstimateDomainEvaluationCostQueryResult`, `DomainSettingsQueryResult`.

---

## Background

From [Codebase Maintainability Findings Section 2](../../plans/codebase-maintainability-findings.md): `cloud/apps/web/src/api/operations/domains.ts` exports hand-maintained type aliases like:

```typescript
export type Domain = {
  id: string;
  name: string;
  // …
  defaultModelIds?: string[];
  sentencePrefix?: string | null;
  labelPrefix?: string | null;
};
```

These fields **exist in the GraphQL schema** but the `DOMAINS_QUERY` document doesn't select them. So codegen can't type them, so the frontend hand-types them. The fix is at the query-document layer, not the schema layer.

A separate JSONB-scalar cleanup (the `ClusterMember`, `DomainCluster`, etc. types in `domainAnalysis.ts`) is tracked as a deferred sibling feature (`finding-2b-json-scalar-graphql-objects`) and is explicitly out of scope here.

---

## Goals

1. `cloud/apps/web/src/api/operations/domains.ts` exports zero hand-maintained type aliases for shapes that codegen can describe given proper query selections.
2. The orphan `BACKFILL_DOMAIN_EVALUATION_MODELS_MUTATION` is a codegen-produced document, not a raw `gql` block.
3. A narrow ESLint rule catches the pattern of "re-shape a generated type into a hand-typed alias" in `api/operations/*.ts` with a precisely-defined allowlist covering files that intentionally stay hand-typed for now.

## Non-goals

- Touching any Pothos schema type (the API is already correct).
- Converting JSON-scalar types (`ClusterMember`, `DomainCluster`, …) into GraphQL objects. *(Deferred: `finding-2b`.)*
- Cleaning up `cloud/apps/web/src/api/operations/runs.ts` — that file also has hand-typed shapes, but its cleanup is a separate feature. In this feature, `runs.ts` goes on the ESLint rule's allowlist **with a TODO comment** pointing at a follow-up.
- Removing or narrowing `estimateConfidence` — the server already returns the correct closed union `'HIGH' | 'MEDIUM' | 'LOW'`; v1's idea of adding a GraphQL enum was unnecessary churn.

---

## Design Decisions (from discovery + v1 review)

| # | Decision | Reason |
|---|---|---|
| 1 | **Scope**: query-document changes only, not schema additions. | The v1 spec was wrong about this — schema is already complete. Scope is strictly frontend + ESLint tooling. |
| 2 | **Orphan mutation**: wire `BACKFILL_DOMAIN_EVALUATION_MODELS_MUTATION` as a codegen document. The Pothos resolver already exists at `mutations/domain/evaluation.ts:96`. | Frontend just needs to replace the `gql\`\`` block with a `.graphql`-sourced or codegen-tagged document so codegen picks it up. No backend work. |
| 3 | **Verification**: two layers — grep-based before/after checklist in PR description AND a custom ESLint rule. | Discovery answer confirmed both. |
| 4 | **ESLint rule design**: detects type aliases whose RHS is derived from a codegen import or reshapes a generated query result (e.g. `GeneratedDomainsQuery['domains'][number]`), not just object literals. Narrow file glob (`api/operations/**`). Explicit allowlist. | Review found that v1's object-literal heuristic missed the actual pattern in `domains.ts` (type aliases). Fixed here. |
| 5 | **ESLint allowlist**: covers `domainAnalysis.ts` entirely (JSON-scalar types, staying) AND `runs.ts` entirely with a `TODO(finding-3-runs-cleanup): …` comment next to the rule config. | Review found `runs.ts` has many hand-typed shapes that would trigger the rule — they're out of scope for this feature, so allowlist them with a pointer to a future cleanup. |

---

## Assumptions carried in

- **Pothos schema is correct and complete** for the fields in scope. Verified in v1 review against the actual code. If a field turns out not to be exposed after all, it's a separate bug and blocks this feature.
- **`backfillDomainEvaluationModels` resolver is correct as-is.** We only expose it to codegen; we don't modify it. The feature does not re-review the resolver's internal behavior.
- **Adding a field to a query document adds bytes to the response but no compute cost** — the resolver already computes and returns the value; it's just being serialized where it wasn't before.
- **No data migration**; no runtime behavior change.
- **ESLint rule can be written in ~150 lines of AST-matching code.** If it turns out to need much more, the plan calls for narrowing the pattern detection rather than writing a sprawling rule.

---

## User Stories

### User Story 1 — `domains.ts` exports only codegen-backed types (P1)

A developer opens `cloud/apps/web/src/api/operations/domains.ts`. They see query-document exports, mutation-document exports, and type aliases that `= GeneratedXQuery['...']`. They see **zero** hand-maintained type aliases with explicit field lists (e.g. `export type Domain = { id: string; name: string; ... }`).

**Why this priority**: The whole point.

**Independent Test**: `grep -E "^export type .+ = \{" cloud/apps/web/src/api/operations/domains.ts | wc -l` returns `0` after the change (only aliases to generated types remain). Specifically the symbols `Domain`, `DomainEvaluation`, `DomainEvaluationMember`, `DomainSettings`, `ValueStatementWithVersions`, `DomainEvaluationCostEstimate*`, `DomainTrialRunsStatusQueryResult`, `SetDomainSettingsMutationResult`/`Variables` all either (a) do not exist as object-literal type aliases, or (b) are expressed as `= GeneratedXQuery['...']`.

**Acceptance Scenarios**:

1. **Given** the branch after this feature lands, **When** a developer greps for `export type X = {` in `domains.ts`, **Then** zero such object-literal aliases exist for the symbols listed in the test.
2. **Given** a consumer of `Domain`, **When** it imports from `api/operations/domains`, **Then** the resolved type is derived from the codegen file (either `DomainsQuery['domains'][number]` or a named export from `generated/graphql.ts`).

---

### User Story 2 — Query documents select all fields consumers use (P1)

Each GraphQL document in `domains.ts` — `DOMAINS_QUERY`, `DOMAIN_EVALUATION_QUERY`, `DOMAIN_EVALUATIONS_QUERY`, `DOMAIN_SETTINGS_QUERY`, `DOMAIN_TRIAL_RUNS_STATUS_QUERY`, `ESTIMATE_DOMAIN_EVALUATION_COST_QUERY`, etc. — selects every field that a downstream consumer reads from the hand-typed shape. After the change, removing the hand-type does not break any type-checking.

**Why this priority**: Without this, removing the hand-type causes TypeScript errors at every call site.

**Independent Test**: Remove hand-types → run `tsc` in `apps/web` → zero errors related to missing properties on `domain.defaultModelIds` etc.

**Acceptance Scenarios**:

1. **Given** the updated queries, **When** `DOMAIN_EVALUATION_QUERY` executes, **Then** the response includes every field the `DomainEvaluation` hand-type previously listed (`launchableDefinitionIds`, `launchableDefinitions { definitionId, definitionName, pairKey }`, `samplePercentage`, `samplesPerScenario`, `targetBatchCount`, plus the nested `members` with `modelIds`).
2. **Given** the updated `DOMAINS_QUERY`, **When** the Domains page renders, **Then** `defaultModelIds`, `sentencePrefix`, `labelPrefix` are populated as before.

---

### User Story 3 — `backfillDomainEvaluationModels` is codegen-typed (P1)

The frontend imports `BACKFILL_DOMAIN_EVALUATION_MODELS_MUTATION` and dispatches it via urql. The mutation's input variables and response are typed by codegen, not by hand.

**Why this priority**: Part of the core cleanup story.

**Independent Test**: `grep "gql\`" cloud/apps/web/src/api/operations/domains.ts | wc -l` returns `0` after the change.

**Acceptance Scenarios**:

1. **Given** the feature lands, **When** `npm run codegen` runs in `apps/web`, **Then** `BackfillDomainEvaluationModelsDocument`, `BackfillDomainEvaluationModelsMutation`, and `BackfillDomainEvaluationModelsMutationVariables` types exist in `generated/graphql.ts`.
2. **Given** the existing consumer of the mutation (LaunchConfirmModal or wherever it's called from), **When** it uses `useMutation(BACKFILL_DOMAIN_EVALUATION_MODELS_MUTATION)`, **Then** urql returns typed `data` and accepts typed `variables`.

---

### User Story 4 — ESLint rule fails on a new hand-typed alias in `api/operations/` (P1)

A developer adds `export type NewThing = { foo: string; bar: number }` to a new file under `cloud/apps/web/src/api/operations/`. CI fails with a clear message pointing at the rule and telling them to either use codegen or allowlist the file with a TODO.

**Why this priority**: Regression prevention.

**Independent Test**: Temporarily add `export type Test = { foo: string }` to `cloud/apps/web/src/api/operations/domains.ts`. Run `npm run lint --workspace @valuerank/web`. The rule fires with a helpful message.

**Acceptance Scenarios**:

1. **Given** a developer adds an object-literal `export type X = { … }` to any non-allowlisted file under `api/operations/`, **When** CI runs web lint, **Then** lint fails with the custom rule's message.
2. **Given** a developer adds a type alias shaped like `export type X = { ... } & GeneratedY` or `export type X = Omit<GeneratedY, 'foo'> & { bar: string }` (a common "shape-massaging" pattern that reviews flagged), **When** CI runs, **Then** lint flags the hand-shaped portion.
3. **Given** an allowlisted file (`runs.ts` or `domainAnalysis.ts`), **When** CI runs, **Then** the rule silently skips its contents.
4. **Given** a developer removes a type that was previously allowlisted (because it finally got codegen'd away), **When** CI runs, **Then** the rule does not require the allowlist entry to match any remaining symbol — orphan allowlist entries are a warning, not an error.

---

### User Story 5 — PR description shows before/after counts (P2)

A reviewer reads the PR description and sees a table:

| Check | Before | After |
|---|---|---|
| Hand-typed `export type … = {` in `domains.ts` | N | 0 |
| `gql\`...\`` blocks in `domains.ts` | 1 | 0 |
| Hand-typed shapes in `domainAnalysis.ts` (allowlisted, staying) | 11 | 11 |
| Hand-typed shapes in `runs.ts` (allowlisted with TODO) | M | M |

**Why this priority**: Verification in review without reading every file.

**Acceptance Scenarios**:

1. **Given** the PR is opened, **When** a reviewer opens the description, **Then** the table is present and the "After" counts match the stated goals.

---

## Edge Cases

- **Query selects a nullable field whose hand-type was non-null.** Fix in the codegen-generated type; update the consumer (rare — most fields are already nullable in the resolvers).
- **Two consumers of the same query want different field sets.** Use GraphQL fragments inline or named fragments; narrowing happens per-document.
- **Allowlist drift.** When sibling feature `finding-2b` lands and removes the `domainAnalysis.ts` hand-types, the allowlist entry for that file can be removed but the rule must tolerate orphan allowlist entries (FR-011, acceptance scenario 4).
- **Codegen discovers a name collision** between the existing manual `BACKFILL_DOMAIN_EVALUATION_MODELS_MUTATION` const and the codegen-generated `BackfillDomainEvaluationModelsDocument`. Resolve by deleting the manual const before running codegen.
- **A query document selects a field that does not exist on the Pothos type.** codegen fails loudly, surfacing a mismatch (edge case unlikely given v2's premise — the fields are confirmed to exist).

---

## Functional Requirements

### Frontend query-document updates

All query edits happen in `cloud/apps/web/src/api/operations/domains.graphql` (not `domains.ts`, which is a re-export layer). After each edit, `npm run codegen --workspace @valuerank/web` regenerates the typed documents.

- **FR-001**: The `Domains` query in `domains.graphql` MUST select `defaultModelIds`, `sentencePrefix`, `labelPrefix` on each Domain node.
- **FR-002**: The `DomainEvaluations` query in `domains.graphql` MUST select `launchableDefinitionIds`, `samplePercentage`, `samplesPerScenario`, `targetBatchCount`, `memberCount`, plus the nested `members { modelIds, …existing fields }`.
- **FR-003**: The `DomainEvaluation` query in `domains.graphql` MUST select `launchableDefinitions { definitionId, definitionName, pairKey }` (the typed array), in addition to everything the `DomainEvaluations` query selects.
- **FR-004**: The `DomainSettings` query in `domains.graphql` MUST select `defaultModelIds`, `sentencePrefix`, `labelPrefix` **on the `domain { … }` child selection** — NOT on `DomainSettings` itself (those fields live on `Domain`, not `DomainSettings`). The current `DomainSettings` hand-type conflates the two; v3 splits them: any screen that needs Domain-level defaults reads them from a `domain { defaultModelIds … }` sub-selection, and any screen that needs DomainSettings-level config reads them from the `DomainSettings` itself. This closes the "FR-004 is infeasible as written" finding from v2 reviews.
- **FR-005**: The `DomainTrialRunsStatus` query in `domains.graphql` MUST select fields such that consumers (e.g. `RowView`) can use the generated type directly — no hand-typed narrowing of `analysisStatus`.
- **FR-006**: The `EstimateDomainEvaluationCost` query in `domains.graphql` MUST select all fields listed in the current hand-typed `DomainEvaluationCostEstimate` shape. Note: `estimateConfidence` is returned by the server as a GraphQL `String`, not a narrowed enum. The frontend's `'HIGH' | 'MEDIUM' | 'LOW'` narrowing is a **UI concern**, preserved as an explicitly allowlisted helper (see FR-015); schema-side enum addition is out of scope for this feature.

### Orphan mutation wiring

- **FR-007**: `BACKFILL_DOMAIN_EVALUATION_MODELS_MUTATION` MUST be defined as a codegen-discoverable document (e.g. moved into a `.graphql` file or kept as a `gql\`\`` export that codegen's `documents` glob already picks up — to be decided in plan). The hand-written `gql\`\`` block MUST be removed.
- **FR-008**: After codegen regenerates, `generated/graphql.ts` MUST export `BackfillDomainEvaluationModelsDocument`, `BackfillDomainEvaluationModelsMutation`, and `BackfillDomainEvaluationModelsMutationVariables`.
- **FR-009**: `api/operations/domains.ts` MUST re-export `BackfillDomainEvaluationModelsDocument` as `BACKFILL_DOMAIN_EVALUATION_MODELS_MUTATION` for backward compatibility with the existing call-site import name.

### Frontend cleanup

- **FR-010**: After FR-001 through FR-009 land, `cloud/apps/web/src/api/operations/domains.ts` MUST NOT contain any object-literal type alias (`export type X = { … }`) for: `Domain`, `DomainEvaluationMember`, `DomainEvaluation`, `DomainSettings`, `ValueStatementWithVersions`, `DomainEvaluationCostEstimateModel`, `DomainEvaluationCostEstimateDefinition`, `DomainEvaluationCostEstimate`, `DomainTrialRunsStatusQueryResult`, `SetDomainSettingsMutationResult`, `SetDomainSettingsMutationVariables`, **`DomainMutationResult`**, **`DomainsQueryResult`**, **`DomainEvaluationQueryResult`**, **`EstimateDomainEvaluationCostQueryResult`**, **`DomainSettingsQueryResult`**. Each must either be deleted (replaced by direct codegen imports at call sites) or expressed as `= GeneratedXQuery['…']` aliases. *The bolded symbols were missed in v2 and added after full-context review.*

### ESLint rule

- **FR-011**: A custom ESLint rule (`no-hand-typed-graphql-shapes`) MUST ship in `cloud/apps/web/eslint-rules/` and flag:
  - `export type X = { … }` where the object literal has 2+ properties whose shapes overlap meaningfully with any field exposed in `generated/graphql.ts` (conservative: matches field *names* plus at least one matching type), OR
  - `export type X = Omit<GeneratedY, …> & { … }`, `export type X = GeneratedY & { … }`, or similar "extend-and-reshape" patterns that re-declare fields present in the underlying generated type.
  - The rule MUST include explicit file-glob filters so it runs only on `cloud/apps/web/src/api/operations/**/*.ts`.
  - The rule MUST respect an allowlist of filenames (initially: `domainAnalysis.ts`, `runs.ts`) and report *orphan* allowlist entries as warnings, not errors.
- **FR-012**: The rule's failure message MUST name: (a) the offending symbol, (b) the offending file, (c) a short remediation sentence like "Select the fields on the backing query document and use the generated type, or add this file to the allowlist in `.eslintrc` with a TODO comment."
- **FR-013**: `.eslintrc` MUST register the rule and include the initial allowlist. Adjacent to each allowlist entry, a comment MUST reference a follow-up: `// TODO(finding-2b-json-scalar-graphql-objects): remove when sibling feature lands` for `domainAnalysis.ts`; `// TODO(finding-3-runs-operations-cleanup): cleanup hand-typed shapes and remove` for `runs.ts`.

### `estimateConfidence` narrowing helper

- **FR-015**: The `'HIGH' | 'MEDIUM' | 'LOW'` narrowing of `estimateConfidence` MUST live in a dedicated helper file `cloud/apps/web/src/api/operations/narrowings.ts` containing only small `as const` / `satisfies`-style refinements that take a `string` from codegen and return a narrowed UI type. The file MUST be added to the ESLint rule's allowlist with `// INTENTIONAL: UI-level narrowing of schema string fields; NOT a regression`. A single function `narrowEstimateConfidence(value: string): 'HIGH' | 'MEDIUM' | 'LOW' | null` is the initial content; LaunchConfirmModal uses it at the boundary. This closes the "estimateConfidence cannot be eliminated by query tightening" finding from v2 reviews without forcing a schema change.

### Verification

- **FR-014**: The PR description MUST include a before/after table per User Story 5's format.

---

## Success Criteria

- **SC-001**: `grep -cE "^export type (Domain|DomainEvaluation|DomainEvaluationMember|DomainSettings|DomainEvaluationCostEstimate|ValueStatementWithVersions|DomainTrialRunsStatusQueryResult|SetDomainSettings) = \{" cloud/apps/web/src/api/operations/domains.ts` returns `0` after the change.
- **SC-002**: `grep -c "gql\`" cloud/apps/web/src/api/operations/domains.ts` returns `0`.
- **SC-003**: `npm run codegen --workspace @valuerank/web` produces `BackfillDomainEvaluationModelsDocument`, `BackfillDomainEvaluationModelsMutation`, `BackfillDomainEvaluationModelsMutationVariables` in `generated/graphql.ts`.
- **SC-004**: `npm run verify --workspace @valuerank/web` (codegen + lint + test + build) passes.
- **SC-005**: Adding `export type Test = { foo: string }` to any non-allowlisted `api/operations/*.ts` file fails `npm run lint --workspace @valuerank/web` with the custom rule's message. Reverting the change allows lint to pass.
- **SC-006**: Adding `export type Test = Omit<DomainsQuery, 'foo'> & { bar: string }` to the same file also fails lint (covers the "extend-and-reshape" pattern).
- **SC-007**: All existing `apps/web` and `apps/api` tests pass unchanged.
- **SC-008**: Smoke test: Domains page, Domain Detail page, Domain Evaluation Status page, Domain Settings page, LaunchConfirmModal render with the same data as pre-feature branch.
- **SC-009**: An orphan allowlist entry (a file listed in allowlist but containing zero offending types) produces a lint *warning*, not an error.

---

## Rollout Plan

Single PR. No feature flags. No runtime behavior change. Rollback is a revert.

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| ESLint rule is too aggressive and flags legitimate non-GraphQL types | Medium | Low | Narrow file glob (`api/operations/**`). Rule description requires "shape overlaps with a generated type" — not just any object literal. Fast iteration in review. |
| ESLint rule is too lax and misses new hand-typed shapes | Medium | Medium | v2 spec explicitly handles both pure object literals and "extend-and-reshape" patterns. SC-005 and SC-006 cover both. |
| Allowlisting `runs.ts` lets the debt persist there indefinitely | High | Low | TODO comment references `finding-3-runs-operations-cleanup` as a named follow-up. Should be filed as a task chip after this feature merges. |
| A query payload size increase breaks a rendering loop (rare) | Low | Low | Manual smoke test (SC-008) catches anything visibly broken. GraphQL payloads are already well under any practical limit. |
| Regenerated codegen output diffs large | Medium | Low | Expected — many new fields added to selection sets will regenerate a lot. Review the diff for unexpected changes (e.g. removed symbols). |
| Hidden consumer reads a field not in any selection set | Low | Medium | FR-001 through FR-006 enumerate all known consumers and their fields. Smoke test catches any remaining cases. |

---

## Related Documentation

- [Codebase Maintainability Findings](../../plans/codebase-maintainability-findings.md) Section 2
- [Codebase Compaction Memo](../../plans/codebase-compaction.md) lines 152-164
- Spec-review findings that shaped this v2: `reviews/spec.codex.edge-cases-adversarial.review.md`, `reviews/spec.codex.feasibility-adversarial.review.md`, `reviews/spec.gemini.requirements-adversarial.review.md`
- Sibling feature (deferred): `finding-2b-json-scalar-graphql-objects`
