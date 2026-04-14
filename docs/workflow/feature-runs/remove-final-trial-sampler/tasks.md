# Tasks — remove-final-trial-sampler

Slug: `remove-final-trial-sampler`
Spec: `spec.md`
Plan: `plan.md`

This tasks document maps 1:1 to the six slices in `plan.md`. Every task below cites the plan subsection that governs it. Tasks inside a single slice commit together; slices commit in order A → B → C → D → E → F.

## Review Reconciliation

- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: See plan.md Review Reconciliation. All 4 findings describe pre-existing bugs in deleted code; deletion itself is the fix.
- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: See plan.md Review Reconciliation. Three-part guardrail is the deliberate trade-off for a pure-deletion PR.
- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: See plan.md Review Reconciliation. Same circular concern addressed in §4 explicit non-goal.
- review: reviews/plan.gemini.architecture-adversarial.review.md | status: accepted | note: See plan.md Review Reconciliation. (Final) suffix downstream dependency empirically false per grep; cost estimate 10x discrepancy moot post-deletion.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: See plan.md Review Reconciliation. All callers hardcode finalTrial false; 6 slices land as one PR so main never sees broken intermediate state.
- review: reviews/plan.codex.testability-adversarial.review.md | status: accepted | note: See plan.md Review Reconciliation. New aliases.test.ts is strictly stronger than deleted plan-final-trial.test.ts coverage.

---

## Slice A — Alias test migration (prep)

One commit. No production code touched. Preserves alias resolution coverage before Slice B deletes the old test.

### Task A.1 — Create `cloud/apps/api/tests/services/models/aliases.test.ts`

**New file:** `cloud/apps/api/tests/services/models/aliases.test.ts`

**Directory setup.** The `cloud/apps/api/tests/services/models/` directory does not exist yet. Create it as part of this task. No `__mocks__` or setup files — the functions under test are pure (plan §2).

**Imports.** Import `resolveModelIdFromAvailable` and `getEquivalentModelIds` from the existing `cloud/apps/api/src/services/models/aliases.ts`. Do NOT introduce a new test util; reuse whatever the existing `cloud/apps/api/tests/` files use for `describe`/`it`/`expect` (vitest).

**Test cases (all four must be present — plan §2, spec §3.7 item 2):**

1. **Exact match wins over alias equivalence.** Given `availableModelIds = ['gemini-2.5-flash', 'gpt-4.1']` and requested `'gemini-2.5-flash'`, `resolveModelIdFromAvailable('gemini-2.5-flash', new Set(availableModelIds))` returns `'gemini-2.5-flash'`.
2. **Alias equivalence returns first available equivalent.** Given `availableModelIds = ['gemini-2.5-flash-lite']` and requested `'gemini-2.5-flash'`, returns `'gemini-2.5-flash-lite'`. This is the case the deleted test `preserves requested model ID when alias is used for analysis lookup` was exercising.
3. **Returns `null` when neither exact nor alias match.** Given `availableModelIds = ['gpt-4.1']` and requested `'unknown-model'`, returns `null`.
4. **`getEquivalentModelIds` exact group equality with hardcoded expected values.** The goal of this case is to catch accidental drift in the alias table — if a future edit adds or drops a member of the `gemini-2.5-flash` group, the test must fail loudly. That only works if the expected value is **independent** of the module under test. Deriving the expected list from `aliases.ts` at test time is circular — a bad edit to the alias table updates both sides and the test still passes.

   Hardcode the expected group inline in the test file. This is a **deliberate duplication** and it is the whole point:

   ```typescript
   const EXPECTED_GEMINI_FLASH_GROUP = [
     'gemini-2.5-flash',
     'gemini-2.5-flash-preview-09-2025',
     'gemini-2.5-flash-preview-05-20',
   ];

   const result = getEquivalentModelIds('gemini-2.5-flash');
   expect(new Set(result)).toEqual(new Set(EXPECTED_GEMINI_FLASH_GROUP));
   expect(result.length).toBe(EXPECTED_GEMINI_FLASH_GROUP.length); // no extras, no dupes
   ```

   Then assert the singleton fallback for an unknown model:

   ```typescript
   expect(getEquivalentModelIds('unknown-model')).toEqual(['unknown-model']);
   ```

   The `new Set(...)` + length check catches both regressions that a "contains all" assertion would miss: (a) an extra alias added to the group and (b) an expected alias dropped from the group. It is a **contract check** against the current shape of the alias table — if a future alias update legitimately changes the group, the test will fail and the committer must update `EXPECTED_GEMINI_FLASH_GROUP` in the same commit. That coupling is the feature, not a bug: it forces the alias table edit to be intentional rather than accidental.

   **Do NOT import `MODEL_EQUIVALENCE_GROUPS` (or any other alias-group constant) from `aliases.ts`.** The constant is file-private and Slice A explicitly promises "no production code touched". Exporting it would break that boundary and would also make the test circular again. If a future refactor benefits from an exported group constant, do it in a separate non-deletion PR.

**Estimated diff:** ~60 lines new, 0 lines deleted.

**Validation:**

```bash
cd cloud
npm run test --workspace @valuerank/api -- aliases.test.ts
```

Expected: all 4 tests pass.

### [CHECKPOINT] after Slice A

Commit message template (plan §9):

```
remove-final-trial-sampler: A — alias test migration (prep)

Spec: docs/workflow/feature-runs/remove-final-trial-sampler/spec.md §3.7
Plan: docs/workflow/feature-runs/remove-final-trial-sampler/plan.md §2

Migrates alias-resolution coverage from plan-final-trial.test.ts (to be
deleted in Slice B) into a new focused test file that exercises
resolveModelIdFromAvailable and getEquivalentModelIds as pure functions.
Strictly stronger than the prior indirect coverage.
```

---

## Slice B — Bulk deletion + queue handler cleanup

One commit. Removes the sampler service, its test, the GraphQL query, the web ops file, and the queue follow-up block. Plan §3.

### Task B.1 — Delete whole files

Delete each of these four files in full (plan §3, spec §3.1):

- `cloud/apps/api/src/services/run/plan-final-trial.ts`
- `cloud/apps/api/tests/services/run/plan-final-trial.test.ts`
- `cloud/apps/api/src/graphql/queries/final-trial-plan.ts`
- `cloud/apps/web/src/api/operations/final-trial.ts`

Use `git rm` (not `rm`) so the deletions are staged.

**Do NOT edit `cloud/apps/api/src/graphql/queries/index.ts`.** The query registry uses `autoImportDir` so deleting `final-trial-plan.ts` is sufficient (plan §3, spec §3.4).

### Task B.2 — Edit `cloud/apps/api/src/queue/handlers/aggregate-analysis.ts`

Plan §3, spec §3.2. Apply these edits in one commit:

1. **Line 14:** delete `import { planFinalTrial } from '../../services/run/plan-final-trial.js';`
2. **Line 15:** delete `import { startRun } from '../../services/run/start.js';`. This import is used **only** inside the adaptive sampling block at line 181 — confirmed by grep. After step 4 removes that block, this import becomes dead and must be deleted or the build will fail on unused-import lint. Do **not** soften this to "if not used elsewhere"; it is not.
3. **Line 32:** delete `isFinalTrial: z.boolean().optional(),` from inside `zRunConfig`.
4. **Lines 131–196:** delete the entire "Adaptive Sampling Continuation" try/catch block. After this edit, the handler returns through its normal aggregation path only.
5. **Preemptive registry check (addresses Codex tasks execution review MEDIUM about F.3c remediation ordering and the round 9 MEDIUM about autoImportDir determinism).** `queries/index.ts` uses the `autoImportDir` pattern — at runtime it scans `cloud/apps/api/src/graphql/queries/` and registers every `.ts` file it finds. There is no codegen step for this registry; the "regeneration" is a runtime scan, so deleting `final-trial-plan.ts` is enough as long as `queries/index.ts` does NOT contain a static import or a static reference to the deleted module. Before committing Slice B, run:

   ```bash
   grep -nE 'final-trial|finalTrial|FinalTrialPlan|planFinalTrial' \
     cloud/apps/api/src/graphql/queries/index.ts
   ```

   Expected: **zero matches**. If any line is returned, the registry does NOT use `autoImportDir` for this file, or it was hand-edited at some point. **Add the deletion of that line as step 6 of this task** and include it in the same Slice B commit. Do not defer to Slice F — by then the slice boundary is closed and recovery requires a fixup commit on top. Catching this now keeps the fix inside its natural slice.

   This grep is the deterministic verification step for the autoImportDir assumption. There is nothing else to regenerate or rebuild for the query registry — the runtime scan IS the regeneration, and this grep confirms that no static hand-edit is fighting the runtime scan.

**Build-failure expectation for this task alone (before Task B.3 runs):** the file must compile once all edits land together. If `startRun` has any usage outside lines 131–196 that grep missed, the build will fail on "startRun is not defined" — stop and revisit. The Slice B grep in Task B.3 is the single source of truth for this.

### Task B.3 — File-scoped grep (Slice B behavioral check)

Plan §3, spec §3.2. Run this exact grep:

```bash
grep -nE 'planFinalTrial|startRun|isFinalTrial' \
  cloud/apps/api/src/queue/handlers/aggregate-analysis.ts
```

Expected: **zero matches**. If any of the three keywords still appears in this file, the queue-handler cleanup is incomplete — do not proceed to Slice C.

### Task B.4 — API lint + build (expect failure in specific files only)

```bash
cd cloud
npm run lint --workspace @valuerank/api
npm run build --workspace @valuerank/api
```

**Expected: build fails** because `start.ts`, `start-plan.ts`, and `start-run.ts` (Pothos input) still reference `finalTrial` / `planFinalTrial`. This is by design — Slices C and D pick them up.

**Guardrail:** confirm the build errors are **only** in these expected files:

- `cloud/apps/api/src/services/run/start.ts`
- `cloud/apps/api/src/services/run/start-plan.ts`
- `cloud/apps/api/src/services/run/start-validation.ts`
- `cloud/apps/api/src/graphql/mutations/run/lifecycle.ts`
- `cloud/apps/api/src/graphql/types/inputs/start-run.ts`
- `cloud/apps/api/src/graphql/mutations/domain/evaluation.ts`
- `cloud/apps/api/src/graphql/mutations/domain/launch/execute-runs.ts`

Any error outside this set is a missed reference and must be investigated before committing Slice B.

**Coverage note for aggregate-analysis queue completion path (addresses Codex tasks execution review round 11 MEDIUM about behavioral coverage for the deleted block).** The 66-line "Adaptive Sampling Continuation" block deleted in Task B.2 step 4 is unreachable in production: every caller of `startRunService` hardcodes `finalTrial = false` (plan §4 enumerates all four sites), which means the handler never took the branch in practice. Deleting unreachable code does not introduce a new control-flow regression surface — the "normal aggregation path" the handler now always takes is the same path it already took for every real production request. The preflight test suite in Task F.4 runs the existing `aggregate-analysis` tests and they continue to cover the normal path unchanged. No new dedicated behavioral test is needed; if one were added it would be a test of "code we just deleted is gone", which is already covered by the grep in Task B.3 and the whole-file build in this task.

### [CHECKPOINT] after Slice B

Commit message template:

```
remove-final-trial-sampler: B — bulk deletion + queue handler cleanup

Spec: docs/workflow/feature-runs/remove-final-trial-sampler/spec.md §3.1, §3.2
Plan: docs/workflow/feature-runs/remove-final-trial-sampler/plan.md §3

Deletes plan-final-trial.{ts,test.ts}, final-trial-plan.ts, final-trial.ts,
and removes the 66-line adaptive sampling continuation block from
aggregate-analysis.ts. Build intentionally breaks in start.ts /
start-plan.ts / start-run.ts — fixed in Slices C and D (same PR).
```

---

## Slice C — Run start path

One commit. `start.ts` + `start-plan.ts` + `start-validation.ts` together because `buildRunJobPlan`'s signature changes. Plan §4.

### Task C.1 — `cloud/apps/api/src/services/run/start.ts`

Plan §4.1, spec §3.3. Apply edits in file order:

1. **Line 58.** Drop `finalTrial = false,` from the input destructure.
2. **Line 64.** Drop `finalTrial` from the structured log call.
3. **Line 158 (`buildRunJobPlan({...})`).** Drop BOTH `finalTrial` and `temperature` from the call — they are being removed from the `BuildRunJobPlanInput` type in Task C.2.
4. **Lines 178–187 (`estimateCost` call).** Collapse both ternaries:
   - `samplePercentage: finalTrial ? 100 : (...)` → drop the `finalTrial ? 100 :` head.
   - `samplesPerScenario: finalTrial ? 10 : samplesPerScenario` → `samplesPerScenario: samplesPerScenario`.
5. **Lines 218–232 (`config = { ... }` object).** Replace the bare spread `...(configExtras ?? {})` with the type-guarded sanitizer pattern (spec §3.3). Exact code:

   ```typescript
   const rawConfigExtras = configExtras;
   const configExtrasObject =
     rawConfigExtras != null && typeof rawConfigExtras === 'object' && !Array.isArray(rawConfigExtras)
       ? (rawConfigExtras as Record<string, unknown>)
       : {};
   const { isFinalTrial: _dropIsFinalTrial, ...safeConfigExtras } = configExtrasObject;
   ```

   Then in the `config` object literal, replace `...(configExtras ?? {})` with `...safeConfigExtras`.

6. **Line 221.** `samplePercentage: finalTrial ? null : samplePercentage,` → `samplePercentage,`
7. **Line 222.** `sampleSeed: finalTrial ? null : sampleSeed,` → `sampleSeed,`
8. **Line 223.** `samplesPerScenario: finalTrial ? null : samplesPerScenario,` → `samplesPerScenario,`
9. **Line 225.** `scenarioIds: finalTrial ? null : (selectedScenarioIds.length > 0 ? selectedScenarioIds : null),` → `scenarioIds: selectedScenarioIds.length > 0 ? selectedScenarioIds : null,`
10. **Line 226.** `runMode: finalTrial ? 'FINAL' : (Array.isArray(scenarioIds) && scenarioIds.length > 0 ? 'SPECIFIC_CONDITION' : 'PERCENTAGE'),` → `runMode: Array.isArray(scenarioIds) && scenarioIds.length > 0 ? 'SPECIFIC_CONDITION' : 'PERCENTAGE',`
11. **Line 227.** Delete `isFinalTrial: finalTrial,` entirely.
12. **Line 258.** Template literal:
    - Before: `` `${month} ${day}-${suffix}${finalTrial ? ' (Final)' : ''}` ``
    - After: `` `${month} ${day}-${suffix}` ``

After these edits, `start.ts` must not contain the literal `finalTrial` anywhere. The only `isFinalTrial` occurrence that may remain is the sanitizer destructure key `isFinalTrial: _dropIsFinalTrial` in step 5 — that is expected and is verified by the Slice F grep counts.

### Task C.2 — `cloud/apps/api/src/services/run/start-plan.ts`

Plan §4.2, spec §3.3. Apply edits:

1. **Line 2.** Delete `import { planFinalTrial } from './plan-final-trial.js';`.
2. **Line 17.** Delete `finalTrial: boolean` from `BuildRunJobPlanInput`.
3. **Line 18.** Delete `temperature?: number | null` from `BuildRunJobPlanInput` (dead plumbing once the `finalTrial` branch is gone — spec §3.3 explains why).
4. **Lines 33–34.** Drop both `finalTrial` and `temperature` from the destructure in `buildRunJobPlan`.
5. **Lines 44–63.** Delete the `if (finalTrial) { ... planFinalTrial(...) ... }` block in its entirety. The non-final path below remains untouched.

**Empirical verification that `temperature` is dead plumbing (addresses Codex tasks execution review round 12 MEDIUM [UNVERIFIED] about temperature still being used in the non-final path).** Confirmed by direct inspection of `start-plan.ts` on the current branch: `temperature` is referenced on exactly two lines — line 34 (destructure) and line 45 (`planFinalTrial(definitionId, models, temperature ?? null)`). Line 45 is inside the `if (finalTrial)` block that Task C.2 step 5 deletes in its entirety. The non-final path (lines 65–110 in the current file) never references `temperature` — it uses only `scenarioIds`, `samplePercentage`, `sampleSeed`, and `samplesPerScenario`. Once Task C.2 step 5 removes the `if (finalTrial)` block and `planFinalTrial` is gone from the module, `temperature` has zero remaining consumers in this file. Removing it from the type signature is a safe no-op, not a behavior change.

### Task C.3 — `cloud/apps/api/src/services/run/start-validation.ts`

Plan §4.3, spec §3.3. Apply edits:

1. **Line 15.** Delete `finalTrial?: boolean` from the input type.
2. **Line 23.** Delete `finalTrial = false` from the destructure.
3. **Lines 29, 33.** The `!finalTrial &&` guards on `samplePercentage` and `samplesPerScenario` become unconditional range checks. Drop the `!finalTrial &&` prefix from both guards.
4. **Lines 41–42.** Delete the `finalTrial && scenarioIds.length > 0` validation entirely.

**Do NOT change the type of `configExtras` in `start-validation.ts:17`.** Spec §3.3 explicitly holds this at `Record<string, unknown>` so the grep count in Slice F stays at exactly two. The runtime sanitizer in Task C.1 step 5 is the enforcement surface.

**Coverage note for the unconditional validation path (addresses Codex tasks execution review round 10 MEDIUM about direct test coverage).** The pre-deletion codebase always called `startRunService` with `finalTrial = false` in every real-world path (all four hardcoded call sites documented in plan §4). The existing `start.test.ts` fixtures exercise those paths, which means the `!finalTrial && <range check>` branch is already exercised with `finalTrial = false` — the only value it ever took in tests. After this task's edit, that same branch becomes an unconditional range check: the behavior under test is identical in every case the existing test suite covered, because the removed branch only protected the `finalTrial = true` case and no test ever set `finalTrial = true`. No new dedicated test is required; adding one would duplicate existing coverage. If the Slice E sanitizer test (Task E.3) exercises the `startRunService` happy path with `baseValidInput`, the unconditional range checks are also transitively covered.

### Task C.4 — API + web lint + build (expect failure in Slice D/E files only)

Run **both** workspaces. The API workspace scripts do not traverse `cloud/apps/web`, so running API-only would silently skip the web failures that Slices D and E are responsible for. Both commands are required to make the guardrail below verifiable:

```bash
cd cloud
npm run lint --workspace @valuerank/api
npm run build --workspace @valuerank/api
npm run lint --workspace @valuerank/web
npm run build --workspace @valuerank/web
```

Expected: **all four still fail** (at least the API build and the web build), but the remaining errors must be confined to the combined Slice D + Slice E file set:

API-side (addressed in Slice D):

- `cloud/apps/api/src/graphql/mutations/run/lifecycle.ts`
- `cloud/apps/api/src/graphql/types/inputs/start-run.ts`
- `cloud/apps/api/src/graphql/mutations/domain/evaluation.ts`
- `cloud/apps/api/src/graphql/mutations/domain/launch/execute-runs.ts`

Web-side (addressed in Slices D and E):

- `cloud/apps/web/src/components/runs/useRunForm.ts` (Slice D.5)
- `cloud/apps/web/src/api/operations/runs.ts` (Slice D.6)
- `cloud/apps/web/tests/components/runs/RunForm.test.tsx` (Slice E.1)
- `cloud/apps/web/tests/pages/StartPairedBatchPage.test.tsx` (Slice E.2)

Errors in any file outside this combined set indicate a missed `finalTrial` reference in Slice C. The `npm run test --workspace @valuerank/web` command is deliberately NOT run here — test failures are expected until Slice E updates the fixtures; run the tests at the Slice E checkpoint (Task E.4) and the Slice F preflight (Task F.4).

### [CHECKPOINT] after Slice C

Commit message template:

```
remove-final-trial-sampler: C — run start path

Spec: docs/workflow/feature-runs/remove-final-trial-sampler/spec.md §3.3
Plan: docs/workflow/feature-runs/remove-final-trial-sampler/plan.md §4

Collapses the finalTrial branches in start.ts, adds the configExtras
sanitizer that strips isFinalTrial from stale client payloads, and removes
finalTrial + temperature from buildRunJobPlan / start-validation. Build
still fails in the Slice D file set (GraphQL surface) — fixed next commit,
same PR.
```

---

## Slice D — GraphQL API surface + web client + schema (single commit)

One commit. API Pothos input, web client `StartRunInput`, `schema.graphql`, and codegen must land together or either the API or web build fails. Plan §5.

### Task D.1 — `cloud/apps/api/src/graphql/mutations/run/lifecycle.ts`

Plan §5.1, spec §3.4.

1. **Line 38.** Drop `finalTrial?: boolean | null` from the input type.
2. **Line 110.** Drop `finalTrial: input.finalTrial ?? false` from the `startRunService(...)` call.

### Task D.2 — `cloud/apps/api/src/graphql/types/inputs/start-run.ts`

Plan §5.1, spec §3.4.

1. **Line 49.** Delete the entire `finalTrial: t.boolean({ required: false, description: '...' })` field definition.

### Task D.3 — `cloud/apps/api/src/graphql/mutations/domain/evaluation.ts`

Plan §5.1, spec §3.4.

1. **Line 202.** Delete `finalTrial: false,`.

### Task D.4 — `cloud/apps/api/src/graphql/mutations/domain/launch/execute-runs.ts`

Plan §5.1, spec §3.4.

1. **Line 62.** Delete `finalTrial: false,`.
2. **Line 141.** Delete `finalTrial: false,`.

### Task D.5 — `cloud/apps/web/src/components/runs/useRunForm.ts`

Plan §5.2, spec §3.5.

1. **Line 193.** Delete `finalTrial: false,`.
2. While editing, grep the rest of the file for `finalTrial` and drop any remaining form type / zod field references. If the file has a `z.object({ ... })` schema that declares `finalTrial`, delete that field. If the `FormValues` type has a `finalTrial` field, delete that field too.

### Task D.6 — `cloud/apps/web/src/api/operations/runs.ts`

Plan §5.2, spec §3.5.

1. **Line 243.** Delete `finalTrial?: boolean` from the `StartRunInput` type.

### Task D.7 — `cloud/apps/web/schema.graphql`

Plan §5.3, spec §3.5. Three deletions:

1. Delete the `type FinalTrialPlan { ... }` block (approximately lines 1186–1188).
2. Delete the `finalTrialPlan(...)` query field (approximately line 2328).
3. Delete the `finalTrial: Boolean` field plus its docstring inside `StartRunInput` (approximately lines 2941–2944).

### Task D.8 — Regenerate `graphql.ts`

```bash
cd cloud/apps/web
npm run codegen
```

Confirm `cloud/apps/web/src/generated/graphql.ts` no longer contains `FinalTrialPlan`, `finalTrialPlan`, or `StartRunInput.finalTrial`. **Do not hand-edit** the generated file.

### Task D.9 — Full API + web lint + build (must all pass)

```bash
cd cloud
npm run lint --workspace @valuerank/api
npm run build --workspace @valuerank/api
npm run lint --workspace @valuerank/web
npm run build --workspace @valuerank/web
```

Expected: all four pass. Tests may still fail until Slice E updates the fixtures — that is acceptable at this checkpoint.

### [CHECKPOINT] after Slice D

Commit message template:

```
remove-final-trial-sampler: D — GraphQL surface + web client + schema

Spec: docs/workflow/feature-runs/remove-final-trial-sampler/spec.md §3.4, §3.5
Plan: docs/workflow/feature-runs/remove-final-trial-sampler/plan.md §5

Drops finalTrial from the Pothos StartRunInput, the web StartRunInput type,
the run form defaults, schema.graphql, and regenerated graphql.ts — single
commit because these are mutually dependent. API + web lint + build all
pass; fixture tests updated in Slice E.
```

---

## Slice E — Test fixture updates + sanitizer test

One commit. Updates the remaining `finalTrial: false` fixture occurrences and adds the `configExtras` sanitizer test. Plan §6.

### Task E.1 — `cloud/apps/web/tests/components/runs/RunForm.test.tsx`

Plan §6.1, spec §3.6. Three sites at approximately lines 217, 367, 459. **Remove** `finalTrial: false` from each fixture object literal (do not flip to `true` — delete the key).

### Task E.2 — `cloud/apps/web/tests/pages/StartPairedBatchPage.test.tsx`

Plan §6.1, spec §3.6. One site at approximately line 52. Same — remove `finalTrial: false`, do not flip.

### Task E.3 — New sanitizer test in `cloud/apps/api/tests/services/run/start.test.ts`

Plan §6.2, spec §3.3. Add one new `describe('startRunService configExtras sanitizer', ...)` block inside the existing `start.test.ts` file (do not create a new test file).

**Requirements — all four `it(...)` cases are mandatory. The non-object case is NOT optional; Task C.1 step 5 adds the runtime guard and this slice must prove it actually works.**

1. **Use `DEAD_KEY` constant.** Declare `const DEAD_KEY = 'isFinalTrial';` once at the top of the new `describe` block (or at file scope if the existing file uses that style). Do NOT put the literal `'isFinalTrial'` in more than one place.
2. **Reuse existing fixture helpers.** Do NOT build a fresh Prisma / definition / user / scenario graph from scratch. Copy the setup pattern from the nearest existing `it(...)` in the same file — spec §3.3 explicitly calls out that the sanitizer test needs the same ~30–50 LOC of integration-style setup as every other test in this file.
3. **Shared call shape inside each `it(...)`.** Every case must capture the resolved value so the `result.run.config` assertions are not ambiguous. Use this exact shape (adapt the `configExtras` argument per case):

   ```typescript
   const result = await startRunService({
     ...baseValidInput,                 // reuse the fixture helper that builds a minimum valid input
     configExtras: <per-case-value>,    // the thing under test
   });
   expect(result).toBeDefined();
   expect(result.run).toBeDefined();
   expect(result.run.config).toBeDefined();
   ```

   Every case below adds its case-specific assertions on top of this boilerplate. Do NOT use `await expect(startRunService(...)).resolves.toBeDefined()` in isolation — that pattern does not give you a `result` handle to assert on afterwards, which is exactly the ambiguity the Codex tasks execution review round 7 LOW called out.

4. **First `it(...)` — dead-key stripped from object input.** `configExtras: { [DEAD_KEY]: true, otherField: 'keep-me' }`. Assert:
   - `expect(result.run.config).not.toHaveProperty(DEAD_KEY)` — the dead key is gone.
   - `expect(result.run.config).toHaveProperty('otherField', 'keep-me')` — unrelated keys are preserved (proves the sanitizer strips only the dead key, not the whole object).
5. **Second `it(...)` — non-object primitive input must not throw.** `configExtras: 'not-an-object' as unknown as Record<string, unknown>`. Assert:
   - The boilerplate completes without throwing (an exception here fails the test).
   - `expect(result.run.config).not.toHaveProperty(DEAD_KEY)` — re-verifies the sanitizer emitted an empty `safeConfigExtras` rather than passing the primitive through.

   This exercises the `typeof === 'object'` branch of the guard from Task C.1 step 5.
6. **Third `it(...)` — array input must not throw and must not leak array entries into `run.config`.** `configExtras: [{ [DEAD_KEY]: true }] as unknown as Record<string, unknown>`. Assert:
   - The boilerplate completes without throwing.
   - `expect(result.run.config).not.toHaveProperty(DEAD_KEY)` — the dead key is still stripped.
   - `expect(result.run.config).not.toHaveProperty('0')` — the sanitizer did NOT spread the array into `run.config` as numbered properties (a regression would spread index `0` into the config).

   This exercises the `!Array.isArray(...)` branch of the guard from Task C.1 step 5. Required because the guard has two rejection conditions and both must be covered — a future refactor that drops `!Array.isArray` would otherwise pass tests and silently regress the config shape.
7. **Fourth `it(...)` — `null` and `undefined` must not throw.** The runtime guard from Task C.1 step 5 also branches on `rawConfigExtras != null`. Cover both nullish cases in one parameterized `it.each(...)` (or two short `it(...)` blocks). For each of `configExtras: null` and `configExtras: undefined`, assert:
   - The boilerplate completes without throwing.
   - `expect(result.run.config).not.toHaveProperty(DEAD_KEY)` — the config does not gain the dead key.

   This closes the last remaining branch of the sanitizer guard. Required — without this case, a refactor that removes the `!= null` check (e.g. replacing with a strict `typeof rawConfigExtras === 'object'`) would still pass tests but reject `null` at runtime (because `typeof null === 'object'`) in a way the existing assertions do not detect.

**Estimated diff:** ~130–160 lines new.

### Task E.4 — Full test run

```bash
cd cloud
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test" \
JWT_SECRET="test-secret-that-is-at-least-32-characters-long" \
npm run test --workspace @valuerank/api
npm run test --workspace @valuerank/web
```

Expected: all tests pass. The new sanitizer test asserts the guard is in place and the non-object edge case is handled.

### [CHECKPOINT] after Slice E

Commit message template:

```
remove-final-trial-sampler: E — fixture updates + sanitizer test

Spec: docs/workflow/feature-runs/remove-final-trial-sampler/spec.md §3.3, §3.6
Plan: docs/workflow/feature-runs/remove-final-trial-sampler/plan.md §6

Removes finalTrial: false from four test fixtures and adds a new sanitizer
describe block that asserts startRunService strips isFinalTrial from
configExtras (primary case) and survives a non-object primitive input
(edge case from Gemini LOW finding). All API + web tests pass.
```

---

## Slice F — Final grep sweep + preflight

One commit (or zero commits if nothing is changed — this slice is validation-only). Plan §7.

### Task F.1 — Source-scoped grep sweep (five independent case-sensitive greps)

Plan §7.1, spec §3.6.

**Why separate greps and no arithmetic:** earlier drafts in this tasks file used `grep -v` filtering and then occurrence-count arithmetic to work around a supposed substring overlap between `finalTrial` and `isFinalTrial`. That premise is false: grep is case-sensitive by default, and the lowercase `finalTrial` is NOT a substring of camelCase `isFinalTrial` (the `F` is uppercase there). Verified empirically in this worktree: `echo 'isFinalTrial' | grep 'finalTrial'` produces **no output**. The keyword patterns have zero substring overlap, so each can be verified by its own simple grep with no filtering and no arithmetic.

**Five greps — each must print zero lines:**

```bash
grep -rn --include='*.ts' --include='*.tsx' 'finalTrial'     cloud/apps cloud/packages
grep -rn --include='*.ts' --include='*.tsx' 'planFinalTrial' cloud/apps cloud/packages
grep -rn --include='*.ts' --include='*.tsx' 'FinalTrialPlan' cloud/apps cloud/packages
grep -rn --include='*.ts' --include='*.tsx' 'final-trial'    cloud/apps cloud/packages
grep -rn --include='*.ts' --include='*.tsx' 'Final Trial'    cloud/apps cloud/packages
```

Each grep exits with status 1 (no match) and prints nothing. Any output line is a stray reference — trace it to its owning slice and delete before opening the PR.

**The `'Final Trial'` (two words, space between) grep is required** because the deletion sweep has to catch the human-readable label used in UI copy, JSDoc comments, error messages, and option labels. The identifier-form greps above (`finalTrial`, `FinalTrialPlan`, etc.) would miss a string literal like `'Final Trial'` in a React component or a `// Final Trial` comment.

**One additional manual-triage grep — case-insensitive, not a zero-expected check:**

```bash
grep -rni --include='*.ts' --include='*.tsx' 'final trial' cloud/apps cloud/packages
```

This catches lowercase `final trial`, all-caps `FINAL TRIAL`, and mixed-case variants that the case-sensitive grep above would miss. Unlike the five zero-expected greps, this grep is expected to possibly produce hits that are legitimate English phrases unrelated to the deleted feature (e.g. `"this is the final trial of the experiment"` in an unrelated comment). For each line returned:

1. If it refers to the deleted adaptive sampler feature (UI copy, option label, docstring for the deleted code path), delete it in the owning slice and re-run.
2. If it is an unrelated English phrase, record it in the PR description's Validation block as an explicit manual exception ("reviewed and kept: `<file>:<line>` — unrelated to deleted feature").

Do **not** blanket-delete hits from this grep. Do **not** auto-flag them as blockers. The explicit exception list in the PR description is the audit trail — if a reviewer sees the line in the PR body they can spot a bad exception call and push back.

**One grep — `isFinalTrial` must print exactly two lines:**

```bash
grep -rn --include='*.ts' --include='*.tsx' 'isFinalTrial' cloud/apps cloud/packages
```

Expected: exactly two lines of output, one from each of:

1. `cloud/apps/api/src/services/run/start.ts` — the sanitizer destructure key `isFinalTrial: _dropIsFinalTrial` from Task C.1 step 5.
2. `cloud/apps/api/tests/services/run/start.test.ts` — the `DEAD_KEY = 'isFinalTrial'` constant from Task E.3.

**Developer verification** (run once before trusting any F.1 result — confirms the local grep is case-sensitive as the whole plan assumes):

```bash
echo 'isFinalTrial' | grep 'finalTrial' && echo 'UNEXPECTED: case-insensitive' || echo 'OK: case-sensitive'
```

Must print `OK: case-sensitive`. If this prints `UNEXPECTED: case-insensitive`, the local grep is case-insensitive (check the `GREP_OPTIONS` environment variable) and the five-grep design is broken — fix the environment before running Tasks F.1 and F.3b.

**Failure triage:**

- Any of the four zero-expected greps returns output → prior slice missed a reference in that keyword's owning area.
- The `isFinalTrial` grep returns fewer than 2 lines → sanitizer (Task C.1 step 5) or `DEAD_KEY` (Task E.3) was not added.
- The `isFinalTrial` grep returns more than 2 lines → a dead-write path still exists outside the sanctioned sites.
- The `isFinalTrial` grep returns 2 lines from different files than expected → investigate the mismatch before proceeding.

### Task F.2 — File-scoped queue handler grep

Plan §7.2, spec §3.2. Run:

```bash
grep -nE 'planFinalTrial|startRun|isFinalTrial' \
  cloud/apps/api/src/queue/handlers/aggregate-analysis.ts
```

Expected: **zero matches**. This re-verifies the Slice B guardrail after all other slices have landed.

### Task F.3 — Schema-scoped grep

Plan §7.3. The source grep in F.1 uses `--include='*.ts' --include='*.tsx'` and skips `schema.graphql`. Because `schema.graphql` is the input to the web codegen step in Slice D, any stale entry there would round-trip back into `generated/graphql.ts` on the next codegen run. Verify directly:

```bash
grep -nE 'finalTrial|isFinalTrial|planFinalTrial|FinalTrialPlan|final-trial' \
  cloud/apps/web/schema.graphql
```

Expected: **zero matches**. If any keyword is still present, return to Slice D, delete it, re-run codegen, then re-run F.1.

### Task F.3b — Full-tree source sweep by exclusion (independent case-sensitive greps)

Tasks F.1 and F.3 together cover `.ts`, `.tsx`, and `schema.graphql`. The Codex tasks execution review raised two successive MEDIUMs about extension-list-based grep being incomplete (e.g. `.prisma`, `.sql`, `.toml`, `.sh`, `.cjs`, `.mjs`, `.py`, `.json` all missed by earlier drafts). The correct fix is exclusion-based: scan every file in the cloud tree and skip only paths that should legitimately contain the strings. Same keyword set as F.1.

Shared exclusions (applied to every command below):

```bash
EXCLUDE="--exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.next --exclude-dir=build --exclude-dir=coverage"
```

**Five greps — each must print zero lines, full tree:**

```bash
grep -rn $EXCLUDE 'finalTrial'     cloud/
grep -rn $EXCLUDE 'planFinalTrial' cloud/
grep -rn $EXCLUDE 'FinalTrialPlan' cloud/
grep -rn $EXCLUDE 'final-trial'    cloud/
grep -rn $EXCLUDE 'Final Trial'    cloud/
```

Each must print nothing. Any line is a blocker — trace it to the owning slice. A line from `.py`, `.json`, `.prisma`, `.yaml`, `.toml`, `.sh`, etc. indicates a historical reference that was missed by the TS-scoped F.1 sweep and must be removed. The `'Final Trial'` two-word grep is the human-readable-label catch described in F.1 above.

**Path-based sweep (addresses Codex tasks execution review round 10 MEDIUM about filename/directory leftovers).** Content greps miss stale file or directory names that contain the deleted feature's identifiers but have their content stripped. Run:

```bash
find cloud/ \
  -not -path '*/node_modules/*' \
  -not -path '*/dist/*' \
  -not -path '*/.next/*' \
  -not -path '*/build/*' \
  -not -path '*/coverage/*' \
  \( -iname '*final-trial*' -o -iname '*finalTrial*' -o -iname '*FinalTrial*' \)
```

Expected: **zero matches**. The four files listed in Task B.1 are deleted in Slice B, so this find should be empty by Slice F. If any path is returned, a file or directory was renamed but its content was not cleaned up, or a new file was added that still uses the deleted name. Trace to the owning slice and delete.

**Full-tree case-insensitive manual-triage grep (addresses Codex tasks execution review round 13 LOW about case-insensitive search being limited to `cloud/apps cloud/packages`).** F.1's case-insensitive grep only covers `cloud/apps cloud/packages` — it misses lowercase / mixed-case human-readable leftovers in other `cloud/` subdirectories such as `cloud/workers/`, `cloud/scripts/`, `cloud/docker/`, etc. Run the same manual-triage grep over the full tree:

```bash
grep -rni $EXCLUDE 'final trial' cloud/
```

Same triage rules as the F.1 version: hits are NOT automatic blockers. For each line returned, either trace to the owning slice and delete (if it references the deleted feature) or record it in the PR Validation block as an explicit manual exception (if it is an unrelated English phrase).

**One grep — `isFinalTrial` must print exactly two lines (same two sanctioned sites as F.1):**

```bash
grep -rn $EXCLUDE 'isFinalTrial' cloud/
```

Expected: two lines, exactly matching `start.ts` (sanitizer destructure key) and `start.test.ts` (`DEAD_KEY` constant). Any line from any other file type is a historical reference that needs removal.

The `docs/` path is deliberately NOT scanned here — this feature-run directory (`docs/workflow/feature-runs/remove-final-trial-sampler/`) legitimately contains the strings in `spec.md`, `plan.md`, and `tasks.md`, and scanning it would produce expected false positives. The commands above only scan `cloud/`.

### Task F.3c — Registry and generated-glue verification (addresses Codex tasks execution review MEDIUM)

The plan leans on `autoImportDir` and `npm run codegen` to keep the GraphQL registry (`cloud/apps/api/src/graphql/queries/index.ts`) and the web types (`cloud/apps/web/src/generated/graphql.ts`) consistent after Slices B and D land. Those files are not hand-edited in any slice, so a stale entry there would not be caught by a diff review — it has to be actively verified.

Run all three checks:

```bash
# 1. Query registry must not contain any static reference to the deleted file or symbol.
grep -nE 'final-trial|finalTrial|FinalTrialPlan|planFinalTrial' \
  cloud/apps/api/src/graphql/queries/index.ts

# 2. Generated web types must not contain the removed schema symbols.
grep -nE 'FinalTrialPlan|finalTrialPlan|finalTrial' \
  cloud/apps/web/src/generated/graphql.ts

# 3. Locate any on-disk schema artifact emitted by the API build (Pothos output,
#    snapshotted schemas, etc.). This avoids silently skipping if the path differs
#    from the expected default — find is deterministic and fails loudly if the
#    directory structure is unexpected.
find cloud/apps/api \
  -not -path '*/node_modules/*' \
  -not -path '*/dist/*' \
  -not -path '*/build/*' \
  -type f -name '*.graphql'

# 4. Grep each artifact found in step 3 (if any) for the deleted symbols.
#    If step 3 returned any paths, grep them explicitly. If step 3 returned
#    nothing, the API does not emit a .graphql artifact on this branch and
#    there is nothing to check — record that result explicitly in the PR body
#    ("no API-side .graphql artifact on disk; web-side generated/graphql.ts
#    covered by step 2").
#    Example invocation if step 3 finds cloud/apps/api/schema.graphql:
#    grep -nE 'finalTrial|FinalTrialPlan|planFinalTrial' cloud/apps/api/schema.graphql
```

Expected: **zero matches** from steps 1, 2, and the grep over step 3's output (if any). Step 3 itself has no expected count — it is a discovery step whose result must be reported explicitly in the PR body.

**Remediation — the primary defense is the preemptive check in Task B.2 step 5, not F.3c. F.3c is a belt-and-braces re-verification only. If F.3c catches a hit here, Task B.2 step 5 was skipped or run incorrectly.**

- **If the registry check (#1) shows any hit**, `queries/index.ts` is NOT behaving as the plan assumes. Task B.2 step 5 is supposed to catch this *before* Slice B commits, at a point where the fix can be added to the same Slice B commit. If you reach Slice F with a registry hit, it means Task B.2 step 5 was skipped. The recovery is a **fixup commit on the PR branch** (not a "return to Slice B" — the slice letter is just a commit boundary, and all slices land in the same PR, so adding a new commit after Slice E is fine):

  ```bash
  # From the worktree, on the PR branch:
  # Edit cloud/apps/api/src/graphql/queries/index.ts to remove the stale import.
  git add cloud/apps/api/src/graphql/queries/index.ts
  git commit -m "remove-final-trial-sampler: B.fixup — drop stale final-trial import from queries/index.ts"
  ```

  Then re-run F.3c and F.1 to confirm clean. The PR is still one unit; this is a local fixup, not a re-opening of Slice B.

- **If the generated check (#2) shows any hit**, re-run `npm run codegen` in `cloud/apps/web` and confirm the output is on disk (Task D.8 may have been skipped, or a cached output is present). If codegen runs cleanly and the hit persists, the source `schema.graphql` still contains the symbol — return to Task D.7 and re-verify all three schema deletions. If Slice D is already committed, apply the schema fix as a fixup commit the same way as the registry case above.

- **If the built schema check (#3) shows any hit**, re-run the API build after Slice D. Pothos regenerates its schema artifact from the TypeScript input type definitions; a hit here means Task D.2 (`start-run.ts` Pothos input) was not fully applied. Same fixup-commit pattern applies.

### Task F.4 — Preflight Gate

Plan §7.4. Run from `cloud/`:

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

All **eight** commands must pass. This is the production gate — do not open the PR until every command exits 0.

### Task F.5 — Manual spot-check

Plan §7.5. From `cloud/` in two separate shells:

```bash
# shell 1
npm run dev --workspace @valuerank/api
# shell 2
npm run dev --workspace @valuerank/web
```

Wait for both servers to report ready (`API listening on 3031`, Vite on `3030`).

**Authentication.** Log in with the dev account credentials in `~/.claude/projects/-Users-chrislaw-valuerank/memory/reference_dev_account.md` (referenced in `MEMORY.md`). Do not use a fresh/empty local user — you need an existing user with access to the existing definitions.

**Setup prerequisites.** Confirm the local database has at least one `Definition` row. If empty:

1. Run `docker-compose up -d` from `cloud/` to ensure Postgres is up.
2. Create one `Definition` via the local web UI at `http://localhost:3030/definitions` → "New Definition". This is the only supported fallback — do not depend on external MCP or prod APIs in this step, they may not be available to the executor.
3. If the "New Definition" page is broken or the executor cannot create a definition interactively, skip Checks 2 and 3 below and report "manual spot-check blocked: no local definitions available" in the closeout notes. Checks 1 and 4 can still run.

**UI confirmation steps:**

1. Navigate to `http://localhost:3030`, log in with the dev account.
2. Open the "Start Run" form (from the runs list or the dashboard).
3. **Check 1 — no Final Trial UI.** Visually confirm: no "Final Trial" checkbox, no "Final Trial" toggle, no "Final Trial" menu option, no `(Final)` label anywhere on the form. If any visible string matches "final trial" case-insensitive, the web deletion sweep missed something — return to Task D.5 and re-grep `cloud/apps/web/src/` for `finalTrial`/`Final Trial`.
4. **Check 2 — normal run succeeds.** Pick any existing definition, leave sampling at defaults (`samplePercentage = 100`, `samplesPerScenario = 1`, no specific scenarios), select any two available models, submit. The mutation must return successfully, the new run appears at the top of the runs list with status `PENDING` or `RUNNING`, and the run name does NOT contain `(Final)`.
5. **Check 3 — DevTools network check.** Open Chrome DevTools → Network tab, re-submit the form, locate the `startRun` mutation request, and confirm the request body does NOT contain the string `finalTrial`. This catches any stale form state that the grep in Task D.5 missed.

   **Stale browser state is already defended against at the API layer.** The configExtras sanitizer in Task C.1 step 5 unconditionally strips `isFinalTrial` from incoming payloads regardless of source (fresh form, rehydrated draft, local storage, stale client cache). So even if the network payload carries a dead field, the run would still be created with a clean config. The DevTools check exists to confirm the web client itself is clean, not because a stale payload would break anything.

   If `finalTrial` appears in the network payload:
   1. This is a correctness concern for the web client, not a data-integrity concern (the sanitizer already handles it).
   2. A form default or local storage value is still carrying it — clear browser local storage for `localhost:3030` and retry.
   3. If the field is still present after clearing local storage, a Task D.5 / D.6 edit was missed — re-grep `cloud/apps/web/src/` for `finalTrial` and trace it.
   4. This is NOT a blocker for the API-side deletion landing, but it IS a blocker for the PR — fix the web leak before opening the PR.

If any check fails, trace the failure to its slice (D.5 for UI, D.6/D.7 for schema, D.8 for codegen) and fix before opening the PR.

### [CHECKPOINT] after Slice F

If Slice F produced no file changes (it is validation-only), there is no commit for this slice. If it did produce a commit (e.g. a last-minute grep adjustment), use this message:

```
remove-final-trial-sampler: F — final grep sweep + preflight

Spec: docs/workflow/feature-runs/remove-final-trial-sampler/spec.md §3.6
Plan: docs/workflow/feature-runs/remove-final-trial-sampler/plan.md §7

Final validation sweep. All grep counts match plan expectations (isFinalTrial
= 2, all others = 0). Preflight Gate passes for all 8 commands.
```

---

## PR assembly

After Slice F passes:

1. **Rebase first, push second** (addresses Codex tasks execution review LOW #3 — pushing before rebasing rewrites the remote branch and forces a second force-push). From the worktree: `git fetch origin && git rebase origin/main`. Resolve any conflicts locally.
2. Push branch to `origin` (first push will need `-u origin/<branch>`). If the rebase in step 1 updated any commit SHAs on the already-pushed branch, use `--force-with-lease` rather than `--force`.
3. `gh pr create --repo chrislawcodes/valuerank` with:
   - Title: `remove-final-trial-sampler: delete unused Final Trial / adaptive sampler`
   - Body links to `spec.md` and `plan.md`.
   - Validation block embeds the source-scoped grep output from Task F.1.
   - Rollout notes from plan §8 (atomic deploy, stale browser window, no data migration).
