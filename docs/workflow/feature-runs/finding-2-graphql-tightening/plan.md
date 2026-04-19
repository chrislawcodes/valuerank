# Plan — GraphQL Schema Document Tightening (Finding #2)

**Slug**: finding-2-graphql-tightening
**Spec**: [spec.md](./spec.md) (v2)
**Status**: Plan — pre-checkpoint

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: Full-context HIGH finding (FR-004 infeasible because DomainSettings schema lacks defaultModelIds) addressed in v3 by FR-004 rewrite — defaultModelIds read via domain{} sub-selection, not DomainSettings itself. Missed-aliases MEDIUM finding (DomainMutationResult, DomainsQueryResult, etc.) addressed in v3 FR-010 expansion. estimateConfidence MEDIUM addressed by FR-015 narrowings.ts helper.
- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: estimateConfidence HIGH addressed by FR-015. Missed-aliases MEDIUM addressed in v3 FR-010. Wrong-file MEDIUM (queries live in domains.graphql not domains.ts) addressed in v3 by explicitly pointing all FR-001 through FR-006 at domains.graphql.
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: v2 ESLint-rule-design HIGH findings carried forward in v3 (allowlist covers runs.ts, rule detects type-alias extend-and-reshape patterns).
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.codex.architecture-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted

## Approach

The work is 100% frontend. No Pothos schema changes. Five kinds of work:

1. **Query document tightening** — audit each query in **`cloud/apps/web/src/api/operations/domains.graphql`** (the real source of truth; `domains.ts` is a re-export layer), add field selections that match what the hand-typed shapes declared, regenerate codegen.
2. **Orphan mutation wiring** — replace the hand-written `gql\`\`` block with a codegen-discoverable document so it appears in `generated/graphql.ts`.
3. **Hand-type deletion** — remove the hand-typed aliases in `domains.ts` whose fields are now in the generated types. v3 scope expanded: includes `DomainMutationResult`, `DomainsQueryResult`, `DomainEvaluationQueryResult`, `EstimateDomainEvaluationCostQueryResult`, `DomainSettingsQueryResult` (missed in v2).
4. **`narrowings.ts` helper** — a new file in `cloud/apps/web/src/api/operations/narrowings.ts` holds the one case that can't be solved by query tightening: `estimateConfidence` is returned as `String` by the schema but the UI wants `'HIGH' | 'MEDIUM' | 'LOW'`. Narrowing is a UI concern, lives in one small file, gets its own allowlist entry with a `// INTENTIONAL:` comment.
5. **ESLint rule + allowlist** — write `no-hand-typed-graphql-shapes` rule, register in `.eslintrc`, allowlist `domainAnalysis.ts`, `runs.ts`, and `narrowings.ts` with distinct rationale comments.

---

## Architectural decisions

### Keep aliases where useful, delete where redundant

After codegen runs, consumers have two options for typing a domain:

```typescript
// Option A: use the codegen type directly at call sites
function render(d: DomainsQuery['domains'][number]) { … }

// Option B: re-export a named alias from operations/
export type Domain = DomainsQuery['domains'][number];
```

Option B is still a hand-maintained line, but it's a single-line alias whose RHS is derived from codegen — a schema change propagates through. The ESLint rule tolerates option B (it flags only shapes with 2+ properties of the object-literal or extend-and-reshape kind). We use option B for types with many consumers to reduce churn.

### ESLint rule design

The rule ships as a plain JS module under `cloud/apps/web/eslint-rules/no-hand-typed-graphql-shapes.js`. It uses `@typescript-eslint/utils` (already a dep) to access the TypeScript AST. Pattern detection:

```
For each `TSTypeAliasDeclaration` in a file matching `api/operations/**/*.ts`:
  If the file is in the allowlist → skip
  If the alias's RHS is:
    - `TSTypeLiteral` (object literal) with ≥ 2 members → FLAG
    - `TSIntersectionType` where any branch is a `TSTypeLiteral` with ≥ 1 member → FLAG ("extend-and-reshape")
    - `TSTypeReference` to a name in `generated/graphql.ts` exports → OK
    - `TSIndexedAccessType` whose object is a `TSTypeReference` to a generated name → OK
```

**Config location (plan-checkpoint round-3 correction):** the web-workspace ESLint config lives at `cloud/.eslintrc.cjs` under the `apps/web/**/*.{ts,tsx}` override, NOT at `cloud/apps/web/.eslintrc`. The rule is registered there.

**Allowlist (expanded after round-3 review):**

```js
// cloud/.eslintrc.cjs (inside the apps/web override)
"custom/no-hand-typed-graphql-shapes": ["error", {
  "allowlist": [
    "src/api/operations/domainAnalysis.ts",  // JSON-scalar types, staying; see finding-2b
    "src/api/operations/runs.ts",            // out of scope; see finding-3
    "src/api/operations/narrowings.ts",      // UI-level narrowings; INTENTIONAL
    "src/api/operations/modelsAnalysis.ts",  // hand-typed; out of scope
    "src/api/operations/scenarios.ts",       // hand-typed; out of scope
    "src/api/operations/definitions.ts",     // hand-typed; out of scope
    "src/api/operations/llm.ts"              // hand-typed; out of scope
  ]
}]
```

Each entry has a rationale comment. `modelsAnalysis.ts`, `scenarios.ts`, `definitions.ts`, `llm.ts` are follow-ups: they have the same pattern of hand-typed shapes as `runs.ts` and should eventually be cleaned up, but this feature's scope is `domains.ts` only.

Orphan allowlist entries (file is listed but contains zero flagged types) produce a `warn`-level issue, not `error`, per FR-011 acceptance scenario 4.

### Codegen document discovery for the orphan mutation

**Plan checkpoint correction**: the plan-checkpoint reviews CODE-CONFIRMED that `cloud/apps/web/codegen.ts` reads `schema: './schema.graphql'` and `documents: 'src/**/*.graphql'` — it does NOT discover `gql\`\`` blocks in TypeScript files. The v2 plan's three-option decision was wrong; only one option works:

**Approach (corrected):**
1. **First**: regenerate `cloud/apps/web/schema.graphql` from the backend's Pothos schema (the snapshot is stale — `backfillDomainEvaluationModels`, `Domain.defaultModelIds`, `DomainEvaluationMember.modelIds`, and the launch fields all exist in Pothos but are NOT in the checked-in snapshot). This is the missing prerequisite step.
2. **Then**: move the mutation into `cloud/apps/web/src/api/operations/domains.graphql` as a proper GraphQL document.
3. **Then**: run codegen — now it picks up the mutation AND the new fields, because both exist in the regenerated schema snapshot.
4. Frontend re-exports `BackfillDomainEvaluationModelsDocument` from `generated/graphql.ts` under the legacy alias.

### Schema snapshot regeneration

`cloud/apps/web/schema.graphql` is a committed snapshot. To regenerate: either run the backend server locally and introspect (`graphql-codegen` can fetch from `http://localhost:3031/graphql`), or use the backend's own schema-emit tool if one exists. Plan Slice 0 (new) handles this.

---

## Slice breakdown (each ≤ ~300 lines)

### Slice 0: Regenerate `schema.graphql` from the Pothos backend [CHECKPOINT]

**New slice, added after plan-checkpoint review found the checked-in schema snapshot was stale.**

Regenerate `cloud/apps/web/schema.graphql` so it reflects the current Pothos schema, which already exposes `backfillDomainEvaluationModels`, `Domain.defaultModelIds`, `DomainEvaluationMember.modelIds`, and the `DomainEvaluation` launch fields. Without this, codegen can't pull those fields into `generated/graphql.ts`.

Options: (a) introspect a running local API; (b) use the backend's schema-emit script if one exists in `cloud/apps/api/src/graphql/`; (c) add a new script to the API to dump its schema for the frontend to pick up. Plan Slice 0 picks one of these (likely b or c — check before starting).

**Files:**
- `cloud/apps/web/schema.graphql` (regenerated snapshot)
- Potentially a new `cloud/apps/api/src/scripts/emit-schema.ts` if not already present

**Verification:**
- `grep "backfillDomainEvaluationModels" cloud/apps/web/schema.graphql` returns a match.
- `grep "defaultModelIds" cloud/apps/web/schema.graphql` returns at least one match on `Domain`.
- `npm run codegen --workspace @valuerank/web` succeeds (schema is valid, existing queries still parse).

**Estimated diff:** ~1000-2000 lines in the schema snapshot (many new lines as fields are exposed). Review the diff for unexpected additions/removals.

---

### Consumer file inventory (plan-checkpoint correction)

Before the slices touch the aliases, the plan enumerates every known consumer whose imports change:

- `cloud/apps/web/src/hooks/useDomains.ts` — imports `DomainMutationResult`; after Slice 1/2, switches to `GeneratedCreateDomainMutation['createDomain']` or equivalent.
- `cloud/apps/web/src/hooks/useDomainSettings.ts` — imports `DomainSettingsQueryResult`, `SetDomainSettingsMutationResult`; after Slice 2, switches to generated query-result types.
- `cloud/apps/web/src/pages/DomainStartBatches.tsx` — uses evaluation shapes; after Slice 1, reads from `DomainEvaluationQuery['domainEvaluation']` directly.
- `cloud/apps/web/src/pages/DomainStatus.tsx` — reads `currentEvaluation.members[*].modelIds`, `currentEvaluation.launchableDefinitions { definitionId, definitionName, pairKey }`, `currentEvaluation.targetBatchCount`. Slice 1 MUST select all three in `DOMAIN_EVALUATION_QUERY`; Slice 2 MUST select `targetBatchCount` in `DOMAIN_EVALUATIONS_QUERY` too if this page ever reads the listing variant.

Each slice's verification step includes a `tsc --workspace @valuerank/web` pass plus a manual smoke of each affected page. Any remaining consumer error after the slice means a missing field selection or a missed import rewrite.

---

### Slice 1: Core queries — DOMAINS_QUERY, DOMAIN_EVALUATIONS_QUERY, DOMAIN_EVALUATION_QUERY [CHECKPOINT]

Update the three highest-fanout queries to select the new fields. Regenerate. Delete the `Domain`, `DomainEvaluationMember`, `DomainEvaluation` hand-typed aliases. Replace with `DomainsQuery['domains'][number]`-style aliases. Fix any type errors at call sites.

**Files:**
- `cloud/apps/web/src/api/operations/domains.ts` (edit: update the three query documents; delete the three hand-typed exports; re-add as generated aliases)
- `cloud/apps/web/src/generated/graphql.ts` (regenerated)
- Call-site updates in the 19 importers (likely 0-5 will actually break; most will just accept the new shapes)

**Verification:**
- `npm run codegen --workspace @valuerank/web` succeeds.
- `npm run build --workspace @valuerank/web` succeeds.
- Smoke-test the Domains page, Domain Detail page, Domain Evaluation Status page.

**Estimated diff:** ~300 lines (most in regenerated `graphql.ts`).

---

### Slice 2: Remaining queries — DOMAIN_SETTINGS_QUERY, DOMAIN_TRIAL_RUNS_STATUS_QUERY, ESTIMATE_DOMAIN_EVALUATION_COST_QUERY [CHECKPOINT]

Same pattern as Slice 1 for the remaining three queries. Delete `DomainSettings`, `ValueStatementWithVersions`, `DomainEvaluationCostEstimate*`, `DomainTrialRunsStatusQueryResult`, `SetDomainSettings*` hand-types.

**Files:**
- `cloud/apps/web/src/api/operations/domains.ts` (edit: three more query documents + related hand-types deleted)
- `cloud/apps/web/src/generated/graphql.ts` (regenerated)
- Consumer call-site fixes

**Verification:** same as Slice 1 plus Settings page and LaunchConfirmModal smoke.

**Estimated diff:** ~200 lines.

---

### Slice 3: Wire the orphan mutation [CHECKPOINT]

Convert the `BACKFILL_DOMAIN_EVALUATION_MODELS_MUTATION` const to a codegen-discoverable document. Re-export from `generated/graphql.ts` under the legacy name. Consumers unchanged.

**Files:**
- `cloud/apps/web/src/api/operations/domains.ts` (edit: delete the `gql\`\`` block; add `export { BackfillDomainEvaluationModelsDocument as BACKFILL_DOMAIN_EVALUATION_MODELS_MUTATION } from '../../generated/graphql'`)
- `cloud/apps/web/codegen.ts` (verify `gql\`\``-tagged documents are picked up; adjust if needed)
- `cloud/apps/web/src/generated/graphql.ts` (regenerated; must now include `BackfillDomainEvaluationModelsDocument`)

**Verification:**
- `grep "gql\`" cloud/apps/web/src/api/operations/domains.ts` returns 0.
- The mutation still dispatches correctly (manual test via LaunchConfirmModal backfill flow).

**Estimated diff:** ~50 lines.

---

### Slice 4: ESLint rule + allowlist [CHECKPOINT]

**Sequencing note (plan-checkpoint correction):** the lint rule activates only AFTER Slices 1–3 remove the hand-typed aliases from `domains.ts`. Enabling the rule earlier would fail lint on pre-existing hand-types in `domains.ts`. The allowlist covers `domainAnalysis.ts`, `runs.ts`, and the new `narrowings.ts` — NOT `domains.ts` (by the time this slice runs, `domains.ts` is clean).

Write the custom rule. Register in `.eslintrc`. Add allowlist entries with TODO comments.

**Files:**
- `cloud/apps/web/eslint-rules/no-hand-typed-graphql-shapes.js` (new, ~150 lines)
- `cloud/apps/web/.eslintrc` (edit: register rule + allowlist)
- `cloud/apps/web/eslint-rules/no-hand-typed-graphql-shapes.test.js` (new: unit tests covering all FR-011/FR-013 scenarios)

**Verification:**
- Rule unit tests pass.
- `npm run lint --workspace @valuerank/web` passes on the current branch (allowlist covers `runs.ts` and `domainAnalysis.ts`).
- Adding `export type Test = { foo: string }` to `domains.ts` → lint fails.
- Adding `export type Test = Omit<DomainsQuery, 'foo'> & { bar: string }` → lint fails.
- Both reverts → lint passes.

**Estimated diff:** ~250 lines.

---

### Slice 5: PR polish [CHECKPOINT]

Before/after grep table in the PR description. Smoke-test checklist. Spawn a task chip for the deferred `finding-3-runs-operations-cleanup` follow-up.

**Files:** none in the repo. PR description + task spawn.

**Estimated diff:** 0.

---

## Risk callouts (implementation-specific)

| Risk | Mitigation in plan |
|---|---|
| Updated query payload breaks an unrelated consumer due to a schema naming mismatch (e.g. `LaunchableDefinition { pairKey }` doesn't match what the frontend reads) | Slice 1 verification includes manual smoke of every affected page. Any mismatch surfaces in `tsc` or at render time. |
| ~~Codegen configuration doesn't pick up `gql\`\`` tagged templates~~ | **Resolved**: round-1 plan review CODE-CONFIRMED codegen scans `.graphql` only. Mutation moves into `domains.graphql`; no fallback needed. |
| ESLint rule has a broken AST matcher that silently passes bad code | Slice 4's unit tests cover both positive and negative cases. A snapshot of expected rule output is committed. |
| `runs.ts` allowlist is forgotten forever | Named TODO pointing at `finding-3-runs-operations-cleanup`. Task chip spawned at PR-merge time. |
| Regenerated codegen removes a symbol a consumer depends on (e.g. operation name) | Diff review in Slice 1. Any removed symbol is a codegen misconfiguration — investigate before merging. |

---

## Testing strategy

- **Unit**: ESLint rule tests (Slice 4).
- **Integration**: existing `apps/web` Vitest suite passes unchanged.
- **Manual smoke** per slice: Domains, Domain Detail, Domain Evaluation Status, Domain Settings, LaunchConfirmModal. All render with the same data.

---

## Rollout plan

Single PR. No feature flags. No runtime behavior change. Rollback is a revert.

Each slice is shippable in principle — intermediate commits on main would still be correct because no slice breaks a user-visible flow. But reviewers will want to see the whole cleanup at once, so this is one PR.
