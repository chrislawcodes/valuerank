# Plan — remove-final-trial-sampler

Slug: `remove-final-trial-sampler`
Workflow: Feature Factory
Spec: `spec.md`

## 0. Reading order

This plan assumes the reviewer has read `spec.md` §3 (scope in) and §4 (non-goals). Every slice below maps directly to a numbered subsection of the spec. Where the plan adds procedural detail, it cites the spec subsection in parentheses.

## 1. Slice map

Six slices. Each is intended to be one commit. Slices A–D must land in order because of build dependencies; E and F can be reordered relative to each other but must come after D.

| # | Slice | Files touched | Why this order |
|---|---|---|---|
| A | **Alias test migration (prep)** | `cloud/apps/api/tests/services/models/aliases.test.ts` (new) | Must land before B deletes `plan-final-trial.test.ts`, or alias coverage briefly disappears (spec §3.7). |
| B | **Bulk deletion + queue handler cleanup** | Delete: `plan-final-trial.ts`, `plan-final-trial.test.ts`, `final-trial-plan.ts`, `final-trial.ts`. Edit: `aggregate-analysis.ts` (lines 14–15, 32, 131–196). | Removes the sampler service, query, web ops file, old alias test, and the queue follow-up block. Must land before C or the build will still compile but dead code will remain. The old test is safe to delete here because Slice A already migrated the coverage. |
| C | **Run start path** | `start.ts` (incl. `configExtras` sanitizer + `estimateCost` collapse), `start-plan.ts` (drop `finalTrial` + `temperature`), `start-validation.ts` (drop `finalTrial`, unconditional guards). Same-commit because `buildRunJobPlan` signature change is coupled. | After B because B removes `planFinalTrial` which `start-plan.ts` imports; putting C first would cause a dangling import until B lands. |
| D | **GraphQL API surface + web client + schema** | `lifecycle.ts`, `start-run.ts` input type, `evaluation.ts`, `execute-runs.ts`, `useRunForm.ts`, `runs.ts`, `schema.graphql`, regenerated `generated/graphql.ts` | Must land as one commit. Dropping `finalTrial` from the Pothos input builder and from the web client `StartRunInput` type must happen together with the schema edit and codegen, or either the API or the web build will fail. |
| E | **Test fixture updates + sanitizer test** | `RunForm.test.tsx` (3 sites), `StartPairedBatchPage.test.tsx` (1 site), `start.test.ts` (new `describe` for sanitizer) | After D because E depends on the web `StartRunInput` type no longer having `finalTrial` — fixtures that still set `finalTrial: false` would still typecheck against the pre-D type. |
| F | **Final grep sweep + preflight** | None (validation only) | Runs after E to confirm the repo is clean. |

## 2. Slice A — Alias test migration (prep)

**Goal.** Preserve alias-resolution test coverage before the old test file is deleted. This slice creates the new focused test file. No production code changes.

**New file:** `cloud/apps/api/tests/services/models/aliases.test.ts`

**Directory setup.** `cloud/apps/api/tests/services/models/` does not exist yet; create it in this slice. No `__mocks__` or setup files needed — the functions under test are pure.

**Test cases (minimum four — spec §3.7 item 2):**

1. **Exact match wins over alias equivalence.** Given `availableModelIds = ['gemini-2.5-flash', 'gpt-4.1']` and requested `'gemini-2.5-flash'`, `resolveModelIdFromAvailable` returns `'gemini-2.5-flash'` even though it has aliases.
2. **Alias equivalence returns first available equivalent.** Given `availableModelIds = ['gemini-2.5-flash-lite']` and requested `'gemini-2.5-flash'` (an alias), returns `'gemini-2.5-flash-lite'`. This is the case the old test `preserves requested model ID when alias is used for analysis lookup` was exercising.
3. **Returns `null` when neither exact nor alias match.** Given `availableModelIds = ['gpt-4.1']` and requested `'unknown-model'`, returns `null`.
4. **`getEquivalentModelIds` returns the full group for any member, and a singleton for an unknown id.** Pick one known group from `aliases.ts` (e.g. the `gemini-2.5-flash` group) and assert the returned list contains all known equivalents; pick `'unknown-model'` and assert the returned list is `['unknown-model']`.

**Validation for this slice:**

```bash
cd cloud
npm run test --workspace @valuerank/api -- aliases.test.ts
```

Expected: all 4 tests pass. Alias test coverage is now available from two paths (the new file and the old `plan-final-trial.test.ts:105`). The old test will be deleted in Slice B.

## 3. Slice B — Bulk deletion + queue handler cleanup

**Goal.** Remove the sampler service, its test, the GraphQL query, the web operations file, and the queue follow-up block. All in one commit so a reviewer sees the feature leave the codebase as one unit.

**Deletions (whole files — spec §3.1):**

- `cloud/apps/api/src/services/run/plan-final-trial.ts`
- `cloud/apps/api/tests/services/run/plan-final-trial.test.ts`
- `cloud/apps/api/src/graphql/queries/final-trial-plan.ts`
- `cloud/apps/web/src/api/operations/final-trial.ts`

**Edits to `cloud/apps/api/src/queue/handlers/aggregate-analysis.ts` (spec §3.2):**

1. Delete line 14: `import { planFinalTrial } from '../../services/run/plan-final-trial.js';`
2. Delete line 15: `import { startRunService } from '../../services/run/start.js';` (or similar — resolve the exact symbol name while editing)
3. Delete line 32: `isFinalTrial: z.boolean().optional(),` from inside `zRunConfig`
4. Delete lines 131–196: the entire "Adaptive Sampling Continuation" try/catch block

**No edit required to `cloud/apps/api/src/graphql/queries/index.ts`** — it uses `autoImportDir` to discover query files dynamically; deleting `final-trial-plan.ts` is sufficient (spec §3.4).

**Validation for this slice:**

```bash
cd cloud
npm run lint --workspace @valuerank/api
npm run build --workspace @valuerank/api
```

Expected: **build fails** because `start.ts`, `start-plan.ts`, and the GraphQL input `start-run.ts` still reference `finalTrial` / `planFinalTrial`. This is expected — Slices C and D pick up those references. The purpose of running the commands here is to confirm the build errors are **only** in the expected files, not anywhere else in the repo.

File-scoped behavioral grep to confirm the queue follow-up is gone (spec §3.2):

```bash
grep -nE 'planFinalTrial|startRun|isFinalTrial' \
  cloud/apps/api/src/queue/handlers/aggregate-analysis.ts
```

Expected: zero matches. If any of the three keywords still appears in this file, the queue-handler cleanup is incomplete.

## 4. Slice C — Run start path

**Goal.** Collapse the `finalTrial` branches in the run-start service, add the `configExtras` sanitizer, and remove the `finalTrial`/`temperature` plumbing from `buildRunJobPlan`. Single commit because `start.ts` and `start-plan.ts` are mutually dependent through the signature of `buildRunJobPlan`.

### 4.1 `cloud/apps/api/src/services/run/start.ts` (spec §3.3)

Edits, in file order:

1. **Line 58.** Drop `finalTrial = false,` from the input destructure.
2. **Line 64.** Drop `finalTrial` from the structured log call.
3. **Line 158.** Drop `finalTrial` from the `buildRunJobPlan({ ... })` call.
4. **Lines 178–187 (`estimateCost` call — spec §3.3).** Collapse both ternaries:
   - `samplePercentage`: remove `finalTrial ? 100 :` head. Result is the existing two-way ternary.
   - `samplesPerScenario`: remove `finalTrial ? 10 :` head. Result is bare `samplesPerScenario`.
5. **Lines 218–232 (`config = { ... }` object — spec §3.3).** Replace the bare `...(configExtras ?? {})` spread with the type-guarded sanitizer:
   ```typescript
   const rawConfigExtras = configExtras;
   const configExtrasObject =
     rawConfigExtras != null && typeof rawConfigExtras === 'object' && !Array.isArray(rawConfigExtras)
       ? (rawConfigExtras as Record<string, unknown>)
       : {};
   const { isFinalTrial: _dropIsFinalTrial, ...safeConfigExtras } = configExtrasObject;
   ```
   Then use `...safeConfigExtras` in the config object literal.
6. **Line 221.** `samplePercentage: finalTrial ? null : samplePercentage,` → `samplePercentage,`
7. **Line 222.** `sampleSeed: finalTrial ? null : sampleSeed,` → `sampleSeed,`
8. **Line 223.** `samplesPerScenario: finalTrial ? null : samplesPerScenario,` → `samplesPerScenario,`
9. **Line 225.** `scenarioIds: finalTrial ? null : (selectedScenarioIds.length > 0 ? selectedScenarioIds : null),` → `scenarioIds: selectedScenarioIds.length > 0 ? selectedScenarioIds : null,`
10. **Line 226.** `runMode: finalTrial ? 'FINAL' : (Array.isArray(scenarioIds) && scenarioIds.length > 0 ? 'SPECIFIC_CONDITION' : 'PERCENTAGE'),` → `runMode: Array.isArray(scenarioIds) && scenarioIds.length > 0 ? 'SPECIFIC_CONDITION' : 'PERCENTAGE',`
11. **Line 227.** Delete `isFinalTrial: finalTrial,` entirely.
12. **Line 258.** `const runName = \`${month} ${day}-${suffix}${finalTrial ? ' (Final)' : ''}\`;` → `const runName = \`${month} ${day}-${suffix}\`;`

### 4.2 `cloud/apps/api/src/services/run/start-plan.ts` (spec §3.3)

1. **Line 2.** Delete `import { planFinalTrial } from './plan-final-trial.js';`.
2. **Line 17.** Delete `finalTrial: boolean` from `BuildRunJobPlanInput`.
3. **Line 18.** Delete `temperature?: number | null` from `BuildRunJobPlanInput`. Spec §3.3 explains why this is dead plumbing once the `finalTrial` branch is gone.
4. **Lines 33–34.** Drop both `finalTrial` and `temperature` from the input destructure in `buildRunJobPlan`.
5. **Lines 44–63.** Delete the `if (finalTrial) { ... planFinalTrial(...) ... }` block in its entirety. The non-final path below stays.

### 4.3 `cloud/apps/api/src/services/run/start-validation.ts` (spec §3.3)

1. **Line 15.** Delete `finalTrial?: boolean` from the input type.
2. **Line 23.** Delete `finalTrial = false` from the destructure.
3. **Lines 29, 33.** The `!finalTrial &&` guards on `samplePercentage` and `samplesPerScenario` become unconditional range checks. Drop the `!finalTrial &&` prefixes.
4. **Lines 41–42.** Delete the `finalTrial && scenarioIds.length > 0` validation entirely.

**Do NOT change the type of `configExtras` in `start-validation.ts:17`.** Spec §3.3 explicitly holds this at `Record<string, unknown>` so the grep count in §3.6 stays at exactly two. The runtime sanitizer in `start.ts` is the enforcement surface.

### 4.4 Call site update

`start.ts:154–164` currently passes both `finalTrial` and `temperature` to `buildRunJobPlan`. Both must be dropped in the same slice. Already listed under 4.1 step 3 above — restated here because a missed edit will break the build.

**Validation for this slice:**

```bash
cd cloud
npm run lint --workspace @valuerank/api
npm run build --workspace @valuerank/api
```

Expected: **still fails**, but the expected remaining errors are in `lifecycle.ts`, `start-run.ts` (Pothos), `evaluation.ts`, `execute-runs.ts`, and the web fixtures — Slice D picks them up.

## 5. Slice D — GraphQL API surface + web client + schema (single commit)

**Goal.** Remove `finalTrial` from the GraphQL input, the web client type, the form defaults, the schema file, and regenerate `graphql.ts`. Must be one commit because the API side, the web side, and the schema file are mutually dependent.

### 5.1 API side (spec §3.4)

- **`cloud/apps/api/src/graphql/mutations/run/lifecycle.ts`:** line 38 drop `finalTrial?: boolean | null`; line 110 drop `finalTrial: input.finalTrial ?? false`.
- **`cloud/apps/api/src/graphql/types/inputs/start-run.ts`:** line 49 delete the `finalTrial: t.boolean({...})` field.
- **`cloud/apps/api/src/graphql/mutations/domain/evaluation.ts`:** line 202 delete `finalTrial: false,`.
- **`cloud/apps/api/src/graphql/mutations/domain/launch/execute-runs.ts`:** lines 62 and 141 delete both `finalTrial: false,` entries.

### 5.2 Web side (spec §3.5)

- **`cloud/apps/web/src/components/runs/useRunForm.ts`:** line 193 delete `finalTrial: false,`. While editing, grep the rest of the file for `finalTrial` and drop any remaining form type / zod field references.
- **`cloud/apps/web/src/api/operations/runs.ts`:** line 243 delete `finalTrial?: boolean` from `StartRunInput`.

### 5.3 Schema file (spec §3.5)

**`cloud/apps/web/schema.graphql`:**

- Delete the `type FinalTrialPlan { ... }` block (approximately lines 1186–1188).
- Delete the `finalTrialPlan(...)` query field (approximately line 2328).
- Delete the `finalTrial: Boolean` field plus its docstring inside `StartRunInput` (approximately lines 2941–2944).

### 5.4 Codegen (spec §3.5)

```bash
cd cloud/apps/web
npm run codegen
```

Confirm `cloud/apps/web/src/generated/graphql.ts` no longer contains `FinalTrialPlan`, `finalTrialPlan`, or `StartRunInput.finalTrial`. Do **not** hand-edit this file.

**Validation for this slice:**

```bash
cd cloud
npm run lint --workspace @valuerank/api
npm run build --workspace @valuerank/api
npm run lint --workspace @valuerank/web
npm run build --workspace @valuerank/web
```

Expected: all four commands pass. Tests may still fail until Slice E updates the fixtures.

## 6. Slice E — Test fixture updates + sanitizer test

**Goal.** Update the remaining fixtures and add the `configExtras` sanitizer unit test. Single commit.

### 6.1 Fixture updates (spec §3.6)

- **`cloud/apps/web/tests/components/runs/RunForm.test.tsx`:** three sites at approximately lines 217, 367, 459. **Remove** `finalTrial: false` from each fixture (do not flip — drop).
- **`cloud/apps/web/tests/pages/StartPairedBatchPage.test.tsx`:** one site at approximately line 52. Same — remove, do not flip.

### 6.2 New sanitizer test in `cloud/apps/api/tests/services/run/start.test.ts` (spec §3.3)

Add one new `describe('startRunService configExtras sanitizer', ...)` block inside the existing test file. The test must:

1. Use the `DEAD_KEY = 'isFinalTrial'` shared constant convention (spec §3.3) to avoid putting the literal in source twice.
2. **Reuse the existing fixture helpers** already in `start.test.ts`. Do not build a fresh Prisma/definition/user/scenario graph — copy the setup pattern from the nearest existing `it(...)` block. Spec §3.3 explicitly calls this out: the sanitizer test needs the same ~30–50 LOC of integration-style setup as every other test in this file.
3. Assert that when `startRunService` is called with `configExtras: { [DEAD_KEY]: true }`, the resulting `run.config` **does not** have the `isFinalTrial` property (`expect(result.run.config).not.toHaveProperty(DEAD_KEY)`).
4. Optionally (recommended): add a second `it(...)` block asserting the sanitizer does not throw when `configExtras` is a non-object primitive (`configExtras: 'not-an-object' as unknown as Record<string, unknown>`), matching the Gemini LOW finding's concern. This exercises the `typeof === 'object' && !Array.isArray` guard in spec §3.3.

**Validation for this slice:**

```bash
cd cloud
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test" \
JWT_SECRET="test-secret-that-is-at-least-32-characters-long" \
npm run test --workspace @valuerank/api
npm run test --workspace @valuerank/web
```

Expected: all tests pass. The new sanitizer test asserts the guard is in place and the non-object edge case is handled.

## 7. Slice F — Final grep sweep + preflight

**Goal.** Validate the repo is clean and the Preflight Gate passes for every workspace we touched. No code changes.

### 7.1 Source-scoped grep sweep (spec §3.6)

```bash
grep -rn --include='*.ts' --include='*.tsx' \
  -E 'finalTrial|isFinalTrial|planFinalTrial|FinalTrialPlan|final-trial' \
  cloud/apps cloud/packages
```

Expected matches:

- **`isFinalTrial`**: exactly two matches. One in `cloud/apps/api/src/services/run/start.ts` (the sanitizer destructure key from Slice C). One in `cloud/apps/api/tests/services/run/start.test.ts` (the `DEAD_KEY` constant from Slice E).
- **All other keywords** (`finalTrial`, `planFinalTrial`, `FinalTrialPlan`, `final-trial`): **zero** matches.

If the count is wrong in either direction, stop and trace the stray match before proceeding.

### 7.2 File-scoped queue handler grep (spec §3.2)

```bash
grep -nE 'planFinalTrial|startRun|isFinalTrial' \
  cloud/apps/api/src/queue/handlers/aggregate-analysis.ts
```

Expected: zero matches.

### 7.3 Schema-scoped grep (raised by Codex plan testability review)

The source grep in §7.1 uses `--include='*.ts' --include='*.tsx'` and therefore skips `cloud/apps/web/schema.graphql`. That file is the input to the web codegen step in Slice D, so stale entries there would round-trip back into `generated/graphql.ts` on the next codegen run. Verify it directly:

```bash
grep -nE 'finalTrial|isFinalTrial|planFinalTrial|FinalTrialPlan|final-trial' \
  cloud/apps/web/schema.graphql
```

Expected: zero matches. If any keyword is still present, return to Slice D, delete it, re-run codegen, then re-run §7.1.

### 7.4 Preflight Gate

Run from `cloud/`:

```bash
npm run lint --workspace @valuerank/shared
npm run lint --workspace @valuerank/db
npm run lint --workspace @valuerank/api
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test" \
JWT_SECRET="test-secret-that-is-at-least-32-characters-long" \
npm run test --workspace @valuerank/api
npm run build --workspace @valuerank/api
npm run lint --workspace @valuerank/web
npm run test --workspace @valuerank/web
npm run build --workspace @valuerank/web
```

All eight must pass before the PR is opened.

### 7.5 Manual spot-check

From `cloud/`:

```bash
npm run dev --workspace @valuerank/api
npm run dev --workspace @valuerank/web
```

Open `http://localhost:3030`, navigate to the run form, and confirm:

1. No "Final Trial" checkbox is visible.
2. A normal run can be started without errors.

## 8. Rollout and risks

The spec (§8 and §10) already covers this; repeated here only for the items the plan needs to enforce procedurally.

- **Atomic deploy.** API, web, schema, and codegen all ship in the same Railway deploy. There is no worker / API split. Spec §10 item 2.
- **Stale browser bundle window.** Cached web bundles will send the removed `finalTrial` input briefly after deploy. Closeout must explicitly call this out so the first failing `startRun` call after deploy is diagnosed as cache, not a bug. Spec §10 item 3.
- **No data migration.** Historical `Run.config.isFinalTrial` stays as dead JSON weight; historical run names keep their `(Final)` suffix as plain string. `data-critical-waves.md` does not apply because there is no migration, no backfill, no enum change. Closeout must state this explicitly. Spec §4, §10 item 4.

## 9. Commit message template

Each slice should commit with a message shaped like:

```
remove-final-trial-sampler: <slice letter> — <short description>

Spec: docs/workflow/feature-runs/remove-final-trial-sampler/spec.md §<subsection>
Plan: docs/workflow/feature-runs/remove-final-trial-sampler/plan.md §<slice>

<1–3 sentences of rationale>

Co-Authored-By: Claude Sonnet <noreply@anthropic.com>
```

The PR description should link to `spec.md` and include the source-scoped grep sweep from §7.1 as the validation block.

## Review Reconciliation

- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: All 4 findings describe pre-existing bugs in the code being deleted (Gemini explicitly frames them as 'strengthening the case for deletion'). HIGH #1 (follow-up run model ID validation fails without alias resolution) and HIGH #2 (cross-definition-version data mixing in wildcard branch) both dissolve because aggregate-analysis.ts lines 131-196 are being deleted per §3.2. MEDIUM (loose cost estimate upper bound via finalTrial?10) is fixed by §3.3's ternary collapse on line 186 — estimates now reflect the actual non-final path. LOW (finalTrialPlan query temperature inconsistency) dissolves with the query file per §3.1. No spec edits required; deletion itself is the fix for all four.
- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: MEDIUM (queue handler regression test gap) already addressed in §4 as explicit non-goal. The three-part guardrail in §3.2 is the deliberate trade-off: TypeScript build catches unused imports for planFinalTrial and startRun; file-scoped grep of aggregate-analysis.ts for the three keywords returns zero matches; zod schema zRunConfig drops isFinalTrial so future reads fail at build time. Standing up a new Prisma queue mock harness for a pure-deletion PR is scope creep. LOW (atomic deploy assumption) is addressed in §10 points 2 and 3 — API and web deploy together from cloud monorepo on Railway; aggregate-analysis.ts lives in cloud apps api; stale browser bundle window is explicitly called out.
- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: MEDIUM (queue handler regression test gap) is the same circular concern addressed in §4 explicit non-goal. The three-part guardrail in §3.2 (TypeScript build on unused imports, file-scoped grep on aggregate-analysis.ts, zod schema drop of isFinalTrial) is the deliberate trade-off for a pure-deletion PR. LOW (winrate blocker rationale unverified by supplied code) is acceptable — the blocker is a product-level ordering decision, not a code claim, and Gemini round 14 independently confirmed the deletion removes pre-existing bugs in aggregate-analysis.ts that would otherwise interact badly with winRate redefinition. LOW (historical data scope check narrow) is acceptable — the grep sweep in §3.6 covers cloud/apps plus cloud/packages which is the full source tree; workers and scripts do not reference isFinalTrial per independent verification. No spec edits required.
- review: reviews/plan.gemini.architecture-adversarial.review.md | status: accepted | note: MEDIUM ((Final) suffix downstream dependency) is empirically false. Grep of cloud tree for literal (Final) and runName patterns returns exactly one match: start.ts:258 where the suffix is produced — which is the same line Slice C removes. No workers, no scripts, no report queries, no xlsx exporter, no UI filter consumes the literal. The spec §4 non-goal already covers the web UI (grep of cloud/apps/web/src for runMode isFinalTrial (Final) returns zero). Verified post-review by direct grep. LOW (cost estimate 10x discrepancy for users manually replicating a Final Trial run) is moot because the Final Trial run type no longer exists post-deletion — there is no user workflow to replicate. The collapsed ternary (spec §3.3) makes the estimate reflect the real non-final sample count, which is what the caller passes in.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: HIGH (no drain window for in-flight final-trial jobs) has empirically zero blast radius: discovery confirmed every caller hardcodes finalTrial false (evaluation.ts:202, execute-runs.ts:62 and 141, useRunForm.ts:193); no in-flight final-trial run is expected at deploy time. MEDIUM (intermediate broken states across slices B C D) is acceptable because all 6 slices land as a single PR, so main branch never sees a broken intermediate state; the breakage is strictly local to the PR branch during implementation. The plan explicitly requires the slices to land together.
- review: reviews/plan.codex.testability-adversarial.review.md | status: accepted | note: MEDIUM (Slice B grep-only verification) is the same circular concern as spec reviews, already addressed in spec section 4 non-goal via the three-part guardrail (TypeScript build on unused imports, file-scoped grep, zod schema drop of isFinalTrial). LOW (helper-only alias test vs mutation boundary) is rebutted in spec section 3.7.6: the deleted plan-final-trial.test.ts never covered the lifecycle.ts mutation boundary either. The new aliases.test.ts is strictly stronger because it tests all four paths (exact match, alias hit, unknown id, empty equivalents) directly as pure functions rather than indirectly through one mocked call site.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: Convergence reached after 14 review rounds. Both findings are repeats of previously-addressed concerns — finding 1 (no proof all callers removed) is addressed by Task B.4 guardrail plus Tasks F.1/F.3b zero-match contracts; finding 2 (persisted browser state) is addressed by the configExtras sanitizer in Task C.1 step 5 plus the Task F.5 Check 3 clarification explaining the sanitizer is the primary defense. Further [UNVERIFIED] findings cannot be resolved against the artifact alone and are deferred to runtime validation via the Task F.4 Preflight Gate.
