# Spec — remove-final-trial-sampler

Slug: `remove-final-trial-sampler`
Owner: Chris Law
Workflow: Feature Factory
Discovery: complete (see `state.json`)

## 1. Problem

ValueRank has a "Final Trial" adaptive-sampling feature plumbed end-to-end:

- Python-free planner service `planFinalTrial` in `cloud/apps/api/src/services/run/plan-final-trial.ts` reads aggregate win-rate confidence intervals and decides how many extra probes to queue per model per condition.
- The `aggregate-analysis` queue handler (`cloud/apps/api/src/queue/handlers/aggregate-analysis.ts`, lines 131–196) has a follow-up block that watches for runs tagged `isFinalTrial === true` in `Run.config` and, when the sampler says stability is not yet reached, kicks off another run with `finalTrial: true`.
- A GraphQL query `finalTrialPlan` exposes the planner result.
- The web `RunForm` exposes a checkbox for it via `useRunForm.ts` and `StartRunInput.finalTrial`.

Nobody uses it. Every default is `finalTrial: false`. Every internal caller — `cloud/apps/api/src/graphql/mutations/domain/evaluation.ts:202`, `.../launch/execute-runs.ts:62, 141`, `cloud/apps/web/src/components/runs/useRunForm.ts:193` — hardcodes `finalTrial: false`. The user has confirmed the UI checkbox is never flipped in practice.

The sampler is also a blocker: it reads aggregate `winRate` confidence intervals to decide convergence. The next feature (`winrate-honest-denominator`) redefines `winRate`. Leaving the sampler in place would mean two metric-correction PRs trying to change convergence behavior at the same time. Deleting the sampler first removes that coupling.

## 2. Goal

Delete the Final Trial / adaptive sampler feature from the codebase. End result: no `planFinalTrial`, no `finalTrialPlan` query, no `finalTrial` input on `startRun`, no follow-up block in the aggregate-analysis handler, no `isFinalTrial` branching in `start.ts`. Historical JSON is left untouched as dead weight. No metric math is changed. No Prisma schema change.

After this PR lands, `winrate-honest-denominator` can be unblocked and resumed.

## 3. Scope (in)

### 3.1 Delete whole files

All four of these files disappear entirely:

- `cloud/apps/api/src/services/run/plan-final-trial.ts` — the sampler planner service.
- `cloud/apps/api/tests/services/run/plan-final-trial.test.ts` — its tests. **Caveat (raised by Gemini requirements review):** this file contains one test case — `preserves requested model ID when alias is used for analysis lookup` (line 105) — that is the *only* test in the API suite touching model-alias resolution. The function under indirect test, `resolveModelIdFromAvailable` in `cloud/apps/api/src/services/models/aliases.ts`, is still used by `lifecycle.ts` and `cost-estimate.ts` after this PR. Deleting the file outright would drop test coverage for still-live code. See §3.7 below for the migration plan.
- `cloud/apps/api/src/graphql/queries/final-trial-plan.ts` — the GraphQL query registration. The query index `cloud/apps/api/src/graphql/queries/index.ts` uses `autoImportDir(import.meta.url, 'GraphQL queries')` to register every file in the queries directory dynamically — there is **no** explicit static `import './final-trial-plan.js';` line. Deleting the file is sufficient; `index.ts` itself does not need to be edited (but leave it in scope in case a reviewer wants to verify no stale references remain).
- `cloud/apps/web/src/api/operations/final-trial.ts` — the web client operations file for `FINAL_TRIAL_PLAN_QUERY`.

### 3.2 Queue handler — remove the Final Trial follow-up block

`cloud/apps/api/src/queue/handlers/aggregate-analysis.ts`

**This is live background behavior, not dead code** (raised by Codex feasibility review). The handler today automatically re-launches runs tagged `config.isFinalTrial === true` by calling `planFinalTrial` and then `startRun({ finalTrial: true })`. Removing this block is a real behavioral change — after this PR, completed runs that still have `isFinalTrial: true` in their historical `Run.config` JSON will no longer trigger follow-up runs. That is the intended outcome (the feature is being deleted), but reviewers should understand this is not cosmetic cleanup.

- Lines 131–196 are the "Adaptive Sampling Continuation" try/catch block. Delete the whole block.
- Line 14: remove `import { planFinalTrial } from '../../services/run/plan-final-trial.js';`
- Line 15: `startRun` is only imported for the follow-up call. After deleting lines 131–196, this import also becomes unused. Remove it.
- Line 32: drop `isFinalTrial: z.boolean().optional()` from `zRunConfig`. No other code in this file reads it after deletion.
- After the deletion, the handler's body is just the `updateAggregateRun` loop and its error handling.
- Remove `deriveDefinitionTargets` only if it becomes unused — it is called at line 116 by the core handler, so it stays.

**No new regression test for this handler.** There is no existing test file for `aggregate-analysis.ts` in `cloud/apps/api/tests/queue/handlers/`; the only API test that exercised any final-trial code is `plan-final-trial.test.ts` (being deleted per §3.1). Creating a brand-new `aggregate-analysis.test.ts` purely to prove a deleted code path stays deleted would be material scope creep for a deletion PR and would require fabricating a Prisma/queue mock harness that does not otherwise exist in the repo.

**Behavioral proof without a new test file.** The deletion is guarded by three mechanisms that cost no new test code:

1. The TypeScript build (`npm run build --workspace @valuerank/api`) catches the unused-import errors for `planFinalTrial` and `startRun` on lines 14–15, forcing both to be removed.
2. A file-scoped grep after the edit: `grep -nE 'planFinalTrial|startRun|isFinalTrial' cloud/apps/api/src/queue/handlers/aggregate-analysis.ts` must return **zero** matches. This is the cheapest possible behavioral proof that no lingering call into `startRun` can re-launch a follow-up run from this handler.
3. The zod schema `zRunConfig` drops `isFinalTrial`, so even if a future edit tried to read `config.isFinalTrial` off the parsed object, the field wouldn't exist on the zod-typed shape (TypeScript would reject the read at build time).

Together these close the behavioral risk without standing up a new Prisma/queue mock harness. This trade-off is called out as an explicit non-goal in §4.

### 3.3 Run start path — remove `finalTrial` parameter

`cloud/apps/api/src/services/run/start.ts`

- Line 58: drop `finalTrial = false` default from input destructure.
- Line 64: drop `finalTrial` from the structured log call.
- Line 158: drop `finalTrial` from whatever it's passed to (a downstream call — check context while editing).
- **`estimateCost` call at lines 178–187** (raised by Codex feasibility review): this is the cost-estimation call site and it uses `finalTrial` in **two** ternaries as its arguments. Both must be simplified in the same edit, or `start.ts` will fail to compile when `finalTrial` is removed from the service signature:
  - **Line 181–185** (`samplePercentage`): currently a three-way ternary `finalTrial ? 100 : (Array.isArray(scenarioIds) && scenarioIds.length > 0) ? Math.max(1, Math.round((selectedScenarioIds.length / definition.scenarios.length) * 100)) : samplePercentage`. Collapse by removing the `finalTrial ? 100 :` head, keeping the remaining two-way ternary.
  - **Line 186** (`samplesPerScenario`): currently `finalTrial ? 10 : samplesPerScenario`. Collapse by removing the ternary head; keep the bare `samplesPerScenario`.
  - After this edit, `estimateCost` is called with the same `samplePercentage` / `samplesPerScenario` logic the non-final path always used. As a side effect, this tightens cost estimation for what was formerly the Final Trial path (Gemini requirements review noted the old `finalTrial ? 10` hardcode was a loose upper bound, always over-reporting).
- Lines 221–227: the `config = { ... }` object. Drop the `finalTrial ? ... : ...` ternaries; keep the base (non-final) values. Specifically drop `isFinalTrial: finalTrial,` entirely (line 227). `runMode` (line 226) loses its `finalTrial ? 'FINAL' : ...` branch — the base expression `Array.isArray(scenarioIds) && scenarioIds.length > 0 ? 'SPECIFIC_CONDITION' : 'PERCENTAGE'` stays.
- Line 258: drop the `${finalTrial ? ' (Final)' : ''}` suffix from `runName`.

**`configExtras` spread guardrail (raised by both Codex reviewers — hard requirement, not procedural).** Line 219 spreads `...(configExtras ?? {})` into `config` before any normalized fields are written. Today `configExtras` is typed as `Record<string, unknown>` in `start-validation.ts:17`, which means a caller could smuggle `isFinalTrial` (or any other dead key) into `Run.config` without any literal `isFinalTrial` appearing in a grep. A grep sweep alone is insufficient; the spec needs a **runtime + type-level** sanitizer.

Required in the plan's `start.ts` slice:

1. In `start.ts` at line 218–232, replace the bare spread `...(configExtras ?? {})` with a type-guarded object destructure that strips the key. The guard handles the edge case (raised by Gemini requirements review) where a caller could pass a non-object primitive into `configExtras` — the typed signature is `Record<string, unknown> | undefined | null` in practice, but because `start-validation.ts` types it as `Record<string, unknown>`, a future caller that upcasts from `unknown` could slip through a non-object value and cause `TypeError` on destructure. Guard with `typeof === 'object' && !== null`:
   ```typescript
   const rawConfigExtras = configExtras;
   const configExtrasObject =
     rawConfigExtras != null && typeof rawConfigExtras === 'object' && !Array.isArray(rawConfigExtras)
       ? (rawConfigExtras as Record<string, unknown>)
       : {};
   const { isFinalTrial: _dropIsFinalTrial, ...safeConfigExtras } = configExtrasObject;
   const config = {
     ...safeConfigExtras,
     models,
     // ...
   };
   ```
   The leading `_` on the discarded binding keeps the project's `no-unused-vars` lint rule happy. The `!Array.isArray` check matters because arrays are `typeof === 'object'` in JavaScript but spreading them produces numeric-indexed keys in the destination object, which would corrupt `Run.config`. A non-object (string, number, bool, array, null, undefined) falls through to an empty object — the caller's malformed input is silently dropped rather than thrown, which is consistent with how the existing `?? {}` fallback behaves today.
3. Current callers (`plan-slots.ts:126`, `lifecycle.ts:124,135,160`, `execute-runs.ts:144`) pass only `jobChoice*` / `methodologySafe` keys — none of them passes `isFinalTrial` today. The sanitizer is defense in depth against a future caller, not a fix for an existing bug.
4. A unit test must cover this. **Location:** `cloud/apps/api/tests/services/run/start.test.ts` (the file already exists; the plan's implementation slice adds a new `describe`/`it` for the sanitizer). The test gives `startRunService` a `configExtras` containing `isFinalTrial: true` and asserts that the resulting `Run.config` has no `isFinalTrial` key. This test is the enforcement surface — not the grep.

**Integration-style setup required** (raised by Gemini requirements review). The existing tests in `start.test.ts` are integration-style: they create a full fixture graph (definition, scenarios, users, LLM models, etc.) in the test database before calling `startRunService`. The sanitizer test cannot skip this — `startRunService` walks the validation layer before it ever touches `configExtras`, and that validation queries the database for the definition, scenarios, and models. So the sanitizer test must **reuse the existing fixture helpers** already present in `start.test.ts` (do not write a fresh fixture graph — copy the pattern from the nearest existing `it(...)` block). The plan's implementation slice should estimate this test at one new `describe`/`it` block of ~30–50 lines, not a trivial 5-line unit test. The enforcement value is unchanged; only the implementation effort is higher than a naive read of the snippet above suggests.

**Test-writing convention (raised by both Codex reviewers as brittleness concern).** A naive test would type the literal `'isFinalTrial'` twice (once to set the input, once to assert the absence), which would break the §3.6 exactly-two-match rule. Write the test using a **single shared string constant at the top of the new `describe` block**, referenced by name in both places:

```typescript
describe('startRunService configExtras sanitizer', () => {
  const DEAD_KEY = 'isFinalTrial';
  it('strips isFinalTrial from configExtras before persisting Run.config', async () => {
    const result = await startRunService({
      // ...minimal fixture args...
      configExtras: { [DEAD_KEY]: true },
    });
    expect(result.run.config).not.toHaveProperty(DEAD_KEY);
  });
});
```

With this pattern, the literal `'isFinalTrial'` appears **exactly once** in the test file (in the `DEAD_KEY` constant). Combined with the one literal in `start.ts` (the destructure key), the total repo-wide count is exactly two, matching §3.6.
5. The final grep sweep in §3.6 remains, but it is a cheap secondary check, not the primary guardrail.

`cloud/apps/api/src/services/run/start-plan.ts`

- Line 2: drop `import { planFinalTrial } from './plan-final-trial.js';`
- Line 17: drop `finalTrial: boolean` from `BuildRunJobPlanInput`.
- Line 18: drop `temperature?: number | null` from `BuildRunJobPlanInput` as well — this field is **only** consumed inside the deleted `if (finalTrial)` block (at line 45, `planFinalTrial(definitionId, models, temperature ?? null)`). Once the block is gone, `temperature` is dead plumbing in this file and will trigger the `no-unused-vars` lint rule. **Do not** try to preserve `temperature` "in case a future non-final path wants it" — the normal non-final path in `buildRunJobPlan` ignores temperature entirely; `temperature` still lives in `start.ts` where it is written into `Run.config`, and that is sufficient.
- Line 33–34: drop `finalTrial` and `temperature` from the input destructure in `buildRunJobPlan`.
- Lines 44–63: the `if (finalTrial) { ... planFinalTrial(...) ... }` block returns the planned sampler jobs. Delete the whole block; keep the non-final path.
- **Call site update:** `cloud/apps/api/src/services/run/start.ts:154–164` currently passes both `finalTrial` and `temperature` to `buildRunJobPlan`. Drop **both** from that call when editing per §3.3 — the `finalTrial` drop is already called out, and `temperature` must be dropped at the same time to match the removed field. This is a coupled edit — it has to land in the same slice or the build will break.

`cloud/apps/api/src/services/run/start-validation.ts`

- Line 15: drop `finalTrial?: boolean` from the input type.
- Line 23: drop `finalTrial = false` from the destructure.
- Lines 29, 33: the `!finalTrial &&` guards on `samplePercentage` and `samplesPerScenario` become unconditional range checks. Keep the checks, drop the guards.
- Lines 41–42: delete the `finalTrial && scenarioIds.length > 0` validation entirely.

### 3.4 GraphQL surface — remove `finalTrial` input

`cloud/apps/api/src/graphql/mutations/run/lifecycle.ts`

- Line 38: drop `finalTrial?: boolean | null` from the input shape type.
- Line 110: drop `finalTrial: input.finalTrial ?? false` from the call to `startRun`.

`cloud/apps/api/src/graphql/types/inputs/start-run.ts`

- Line 49: delete the `finalTrial: t.boolean({...})` field from the Pothos input builder.

`cloud/apps/api/src/graphql/mutations/domain/evaluation.ts`

- Line 202: delete `finalTrial: false,` from the internal call to `startRun`.

`cloud/apps/api/src/graphql/mutations/domain/launch/execute-runs.ts`

- Lines 62, 141: delete both `finalTrial: false,` entries.

`cloud/apps/api/src/graphql/queries/index.ts`

- **No edit required.** The index uses `autoImportDir(import.meta.url, 'GraphQL queries')` to discover query files dynamically. Once `final-trial-plan.ts` is deleted (§3.1), `autoImportDir` simply stops finding it. Listed here for reviewer cross-reference only.

### 3.5 Web client — remove `finalTrial` wiring

`cloud/apps/web/src/components/runs/useRunForm.ts`

- Line 193: delete `finalTrial: false,` from the form defaults. Check the whole file while editing — if `finalTrial` shows up in the form type/zod shape or in UI bindings, remove those too. There should be no other references after this.

`cloud/apps/web/src/api/operations/runs.ts`

- Line 243: delete `finalTrial?: boolean` from the `StartRunInput` type.

`cloud/apps/web/schema.graphql`

- Lines 1186–1188 (approximate): delete the `type FinalTrialPlan { ... }` block in full.
- Line 2328: delete the `finalTrialPlan(...)` query field in full.
- Lines 2941–2944: delete the `finalTrial: Boolean` field (plus its docstring) from `StartRunInput`.

`cloud/apps/web/src/generated/graphql.ts`

- This file is auto-generated by GraphQL codegen from `schema.graphql`. **Do not hand-edit.** Re-run web client codegen after editing `schema.graphql`. Confirm the result no longer contains `FinalTrialPlan`, `finalTrialPlan`, or `StartRunInput.finalTrial`.

### 3.6 Tests — strip `finalTrial` from fixtures

All fixtures should **drop** the `finalTrial` field entirely (not flip to `true`).

- `cloud/apps/web/tests/components/runs/RunForm.test.tsx` — three sites at lines ~217, ~367, ~459. Remove `finalTrial: false` from each fixture.
- `cloud/apps/web/tests/pages/StartPairedBatchPage.test.tsx` — line ~52. Remove `finalTrial: false` from the fixture.
- `cloud/apps/api/tests/services/run/plan-final-trial.test.ts` — deleted whole (see 3.1).

After the edits, the grep sweep must be scoped to **source files only** (`*.ts` and `*.tsx`) to avoid false positives in markdown, git patches, lint artifacts, and other non-source files. Use this exact invocation:

```bash
grep -rn --include='*.ts' --include='*.tsx' \
  -E 'finalTrial|isFinalTrial|planFinalTrial|FinalTrialPlan|final-trial' \
  cloud/apps cloud/packages
```

The only acceptable remaining matches are:

- **`isFinalTrial`** — exactly two matches, per the "exactly-two-matches requirement" below.
- **All other keywords** (`finalTrial`, `planFinalTrial`, `FinalTrialPlan`, `final-trial`) — **zero** matches.

Excluded from the source grep (these may still contain historical mentions and are **not** part of the rule because the `--include` flags above skip them):

- Lint-output artifact files (`cloud/lint_report.txt`, `cloud/lint_output.txt`, `cloud/global_lint_output.txt`, `cloud/apps/api/lint_output.txt`, `cloud/api_lint_full.txt`) — stale CI artifacts, overwritten on next lint run.
- Feature-factory workflow docs under `docs/workflow/feature-runs/remove-final-trial-sampler/` — the spec, plan, tasks, closeout, and review files legitimately reference the deleted feature by name.
- Git patches and changelog artifacts, if any.
- `cloud/apps/web/src/generated/graphql.ts` — regenerated from `schema.graphql`; after codegen it must have **zero** matches for any of the five keywords.

**Grep sweep as a secondary check (not the primary enforcement).** The primary enforcement of the `configExtras` spread guardrail from §3.3 is the runtime strip in `start.ts` plus the unit test in `start.test.ts`. A source grep cannot *prove* a caller will not inject `isFinalTrial` — it can only catch cases where someone types the literal string in source. The sweep below is a cheap belt-and-suspenders check that source authors haven't re-typed the removed key anywhere unexpected.

**Exactly-two-matches requirement:** `isFinalTrial` must return **exactly two** matches across `cloud/apps/**/*.{ts,tsx}` and `cloud/packages/**/*.{ts,tsx}`. Both are load-bearing:

1. `cloud/apps/api/src/services/run/start.ts` — the runtime strip destructure from §3.3 (`const { isFinalTrial: _dropIsFinalTrial, ...safeConfigExtras } = configExtras ?? {};`). This is the enforcement site.
2. `cloud/apps/api/tests/services/run/start.test.ts` — the sanitizer unit test input from §3.3, which passes `configExtras: { isFinalTrial: true }` and asserts the key is dropped from `Run.config`. This is the test that proves the strip works.

Any **other** match is a spec violation, not a nit. Grep invocation: `grep -rn 'isFinalTrial' cloud/apps cloud/packages --include='*.ts' --include='*.tsx'` — the two expected matches are (a) the destructure key in `start.ts` and (b) the test input in `start.test.ts`.

### 3.7 Alias-resolution test coverage migration

Raised by the Gemini requirements-adversarial review of this spec. The test at `cloud/apps/api/tests/services/run/plan-final-trial.test.ts:105` — `preserves requested model ID when alias is used for analysis lookup` — is the *only* test that exercises alias behavior in the API suite. It does so indirectly through `planFinalTrial`, but the function under the hood (`resolveModelIdFromAvailable` in `cloud/apps/api/src/services/models/aliases.ts`) stays in production use after this PR via `lifecycle.ts` and `cost-estimate.ts`.

Do **not** delete the alias coverage alongside the planner test. Instead:

1. Create a new focused test file: `cloud/apps/api/tests/services/models/aliases.test.ts` (the directory may not exist yet — create it). The file tests `resolveModelIdFromAvailable` and `getEquivalentModelIds` directly as pure functions — no Prisma mocks, no queue setup. Reference implementation: `cloud/apps/api/src/services/models/aliases.ts`.
2. The new file must cover at minimum:
   - Exact match wins over alias equivalence (requested id is in `availableModelIds`).
   - Alias equivalence returns the first available equivalent when the exact id is absent (this is the behavior the deleted `planFinalTrial` test was leaning on for `gemini-2.5-flash`).
   - Returns `null` when neither the exact id nor any equivalent is in `availableModelIds`.
   - `getEquivalentModelIds` returns the full group for any member of a known group, and a singleton list for an unknown id.
3. The original `plan-final-trial.test.ts` file is then deleted per §3.1 — we do not need to migrate the exact test *shape*, since the new file tests the same behavior more directly and at a lower level.
4. This is a small, scoped coverage move (one new file, ~40 lines). It does not drag the PR toward any behavior change and does not trigger the "no drive-by cleanup" non-goal — it preserves a test guarantee that already exists in the repo.
5. **Why this is strictly stronger, not weaker (raised by Codex edge-cases review).** The deleted test at `plan-final-trial.test.ts:105` only covered alias resolution as a side effect of calling `planFinalTrial`. It required a fully mocked Prisma + aggregate snapshot to exercise the alias path, and its failure mode would have pointed at `planFinalTrial`, not at `aliases.ts`. A direct unit test on `resolveModelIdFromAvailable` and `getEquivalentModelIds`:
   - Exercises the function with zero mocks.
   - Fails with a pointer to the correct file.
   - Can cover all four paths (exact match / alias hit / unknown id / empty equivalents) instead of just one.
   - Does not re-introduce any `planFinalTrial` surface.
   The integration shape that `plan-final-trial.test.ts` provided was incidental — no other service was using `planFinalTrial` to test aliases, and `resolveModelIdFromAvailable` is a pure function that does not benefit from integration-style coverage.
6. **Factual rebuttal to the "lost service-level coverage" finding** (raised by Codex edge-cases and Gemini requirements reviews, repeatedly). Both reviewers have claimed this migration loses integration-style test coverage for `lifecycle.ts` and `cost-estimate.ts` — the two other consumers of `resolveModelIdFromAvailable`. **This claim is factually incorrect.** The deleted test at `plan-final-trial.test.ts:105` exercised `planFinalTrial` only. It never loaded `lifecycle.ts`, never called the GraphQL mutation layer, and never invoked cost estimation. It tested one specific call site (the one inside `planFinalTrial`) and nothing else. Deleting it does not reduce coverage of `lifecycle.ts` or `cost-estimate.ts` because **those call sites were never covered by this test in the first place**. If reviewers believe `lifecycle.ts` or `cost-estimate.ts` need their own integration-style test coverage for alias resolution, that is a separate pre-existing coverage gap that predates this PR and is explicitly out of scope here (see §4: "no drive-by cleanups").
7. **Factual rebuttal to the "exemplar null-fallback pattern unique to planFinalTrial.ts" finding** (raised by Gemini requirements-adversarial review as a HIGH). The finding claimed that `planFinalTrial.ts:306` — `resolveModelIdFromAvailable(requestedModelId, availableKeys) ?? requestedModelId` — is the only example of the robust null-fallback pattern, and that deleting it increases the risk that the remaining call sites are brittle. **Direct grep of the repo at `git_head_sha=e0daf36` disproves this.** The three live call sites are:
   - `cloud/apps/api/src/services/run/plan-final-trial.ts:306` — `resolveModelIdFromAvailable(requestedModelId, availableKeys) ?? requestedModelId` (being deleted).
   - `cloud/apps/api/src/graphql/mutations/run/lifecycle.ts:85` — `input.models.map((id) => resolveModelIdFromAvailable(id, activeModelIdSet) ?? id)`. **This already uses the exact same `?? id` fallback pattern.** Deleting `planFinalTrial.ts` does not remove the only example; the pattern is preserved verbatim in `lifecycle.ts`.
   - `cloud/apps/api/src/graphql/types/cost-estimate.ts:325–328` — `const resolvedModelId = resolveModelIdFromAvailable(input.modelId, providerAvailableIds); if (resolvedModelId === undefined || resolvedModelId === null || resolvedModelId === '') { throw new NotFoundError('Model', input.raw); }`. **This deliberately throws on the null return, and that is the intended behavior for cost estimation**: a price lookup for an unknown model should be a hard error, not a silent fall-through to "zero cost for unknown model." The absence of a `?? input.modelId` fallback here is a design choice, not a bug.
   The finding is based on the premise that the fallback pattern is unique to the file being deleted; code inspection shows it is not. There is no architectural degradation to remove. This rebuttal applies to the HIGH as-written; reviewing or hardening `lifecycle.ts` / `cost-estimate.ts` remains out of scope per §4 ("no drive-by cleanups").

## 4. Scope (out) — non-goals

From discovery, confirmed with the human:

- **Do not touch the Prisma schema.** There is no `isFinalTrial` Postgres column. It lives inside the `Run.config` JSONB blob; see Section 6. No migration is needed or wanted. `cloud/packages/db/prisma` is in the scope allowlist only to keep options open; it is expected to stay untouched.
- **Do not try to "remove" `runMode = 'FINAL'` as if it were a Postgres enum.** It is **not** an enum. `runMode` is a plain string field inside the `Run.config` JSONB blob written at `cloud/apps/api/src/services/run/start.ts:226`. There is no `RunMode` enum in `schema.prisma` and no enum migration to write. After this PR, `start.ts:226` stops producing the literal `'FINAL'` on new runs (the `finalTrial ? 'FINAL' : ...` ternary collapses to its non-final branch). Historical rows that already contain `config.runMode = 'FINAL'` are left alone as dead data. No code reads that value after the aggregate-analysis follow-up block is deleted.
- **Do not rewrite historical `Run.config` JSON** to strip `isFinalTrial: true/false`. That JSON stays as dead weight.
- **Do not touch historical run names ending in `(Final)`.** A Gemini requirements review raised concern that old runs with names like `"Apr 14-12345 (Final)"` would persist forever. That is correct but intentional. The suffix lives in `Run.name` as a plain string, not as a computed UI label — a repo-wide grep of `cloud/apps/web/src` for `runMode`, `isFinalTrial`, or `(Final)` returns **zero matches**, confirming no UI component reads the `runMode='FINAL'` field or renders a special "Final" badge. The `(Final)` text is displayed verbatim as part of the run name the same way any other run name renders. Rewriting historical run names would be a data migration, which is explicitly out of scope per `data-critical-waves.md`. Users seeing old `(Final)` suffixes on historical runs is an accepted cosmetic outcome.
- **Do not touch `cloud/workers/stats` or any `winRate` math.** This PR is pure Final Trial removal. The `winrate-honest-denominator` feature is blocked on this PR landing and will pick up the metric changes after.
- **Do not rename or restructure** surrounding code while editing. No drive-by cleanups; this PR should read as pure deletion.
- **Do not retire the Final Trial run tag** (if one exists on historical runs). Human accepted the tag-on-old-rows outcome; no code reads it after deletion.
- **Do not broaden the `configExtras` sanitizer beyond `isFinalTrial`.** A Codex feasibility review raised that stripping only one key leaves the door open for other "dead" keys to be smuggled into `Run.config` through the same spread. That is true in general but is *out of scope* for this PR. The scope of this feature is removing the Final Trial sampler — the only key it ever wrote was `isFinalTrial`. Broader `configExtras` hardening (e.g. validating a strict whitelist of allowed keys, or switching to a typed union) is a separate architectural task and belongs in its own feature. Note: `finalTrial` (without the `is` prefix) is the *input parameter name* on `startRun`, not a persisted config key — no caller ever stored `config.finalTrial` in the database, so there is no "finalTrial" key to strip.
- **Do not create a new `aggregate-analysis.test.ts` file** to regression-test the removal of the follow-up block. No such test file exists in `cloud/apps/api/tests/queue/handlers/` today; creating one purely to prove a deleted code path stays deleted would require standing up a brand-new Prisma/queue mock harness for this PR alone, which is material scope creep for a pure-deletion change. The build (unused-import errors), the type checker (removed symbols), and a file-scoped grep (`planFinalTrial`, `startRun`, `isFinalTrial` must be zero inside `cloud/apps/api/src/queue/handlers/aggregate-analysis.ts`) give sufficient proof. See §3.2 for the justification in context, and note that the grep is specifically file-scoped — not directory-wide — so it is a targeted behavioral assertion, not a loose sweep.
- **Do not add a `finalTrial` (non-`is`-prefixed) key to the `configExtras` sanitizer.** A Codex edge-cases review suggested stripping a "sibling key" called `finalTrial` from `configExtras` in addition to `isFinalTrial`. This is based on a misreading of the code. A targeted grep confirms the only key `start.ts` ever writes into `Run.config` for this feature is `isFinalTrial: finalTrial` on line 227 — `finalTrial` without the `is` prefix is the **input parameter name** on `startRun`, not a persisted config field. No caller, anywhere in the codebase, writes `config.finalTrial` to the database. Stripping a key that does not exist is a no-op that would add noise to the sanitizer and the grep-sweep count. The sanitizer covers exactly the one key that was ever persisted.

## 5. Assumptions (from discovery, as corrected)

All seven assumptions in `state.json` stand with one correction:

- **Assumption 3 / 4 correction (important):** there is **no** `isFinalTrial` Postgres column. A direct grep of `cloud/packages/db/prisma/schema.prisma` and every migration file in `cloud/packages/db/prisma/migrations/` confirms zero matches for `isFinalTrial` or `final_trial`. The field exists only inside the `Run.config` JSONB blob — written at `cloud/apps/api/src/services/run/start.ts:227` and read at `cloud/apps/api/src/queue/handlers/aggregate-analysis.ts:165`. The intent of "Option B" from discovery still holds (leave historical JSON alone; stop writing the field on new runs; leave the enum alone), but the implementation is simpler than discovery assumed: zero Prisma changes, zero migrations.

Other assumptions unchanged:

- The feature is plumbed end-to-end but nobody uses it (confirmed by grep and by human).
- Removing the sampler is a prerequisite for `winrate-honest-denominator`.
- The GraphQL schema change requires re-running web client codegen; `generated/graphql.ts` is not hand-edited.
- Deletable whole files: four listed in §3.1.
- Test fixtures with `finalTrial: false` get the field dropped, not flipped.

## 6. Data story

Recap because it's the part most likely to surprise a reviewer:

- The `runs` table has no typed `isFinalTrial` column. Its schema is at `cloud/packages/db/prisma/schema.prisma:359–410` and has `config Json @db.JsonB`. No column for `isFinalTrial`. No migration ever added one.
- `cloud/apps/api/src/services/run/start.ts:218–232` builds the `config` object and writes `isFinalTrial: finalTrial` as a field inside the JSONB blob.
- `cloud/apps/api/src/queue/handlers/aggregate-analysis.ts:29–34, 150–166` parses the JSONB blob with a zod schema that tolerates an optional `isFinalTrial` boolean and filters runs by it.

After this PR:

- `start.ts` stops writing `isFinalTrial` to new runs' config.
- `aggregate-analysis.ts` stops reading it (and stops parsing it in the zod shape).
- Historical rows keep a dead `isFinalTrial` key in `Run.config` JSONB. Nothing reads it.
- No data-rewrite script. No Prisma migration.

This is why `cloud/packages/db/prisma` stays in scope allowlist but is expected to stay untouched — leaving it listed just means we do not need a scope edit if the reviewer wants to add a no-op Prisma comment, but by default no file there changes.

## 7. Acceptance criteria (from discovery — verbatim, as corrected)

1. `planFinalTrial` service, `finalTrialPlan` GraphQL query, `final-trial.ts` web operations file, `FinalTrialPlan` schema type, and the Final Trial follow-up block in `aggregate-analysis.ts` are all deleted.
2. `finalTrial` is removed as an input on the `startRun` mutation, from `StartRunInput` in the web client, from `useRunForm` defaults, and from all internal callers (`execute-runs.ts`, `evaluation.ts`).
3. No Prisma schema change and no data migration are introduced. `start.ts` stops writing `isFinalTrial` into `Run.config`; `aggregate-analysis.ts` stops reading it; the `'FINAL'` string literal in `runMode` stops being produced on new runs (see §4 on the non-enum nature of `runMode`). The `configExtras` spread guardrail from §3.3 is enforced at runtime (explicit `isFinalTrial` key strip in `start.ts`) and by a unit test in `cloud/apps/api/tests/services/run/start.test.ts`. The final grep sweep is a secondary check: it must return **exactly two** matches for `isFinalTrial` in `cloud/apps` + `cloud/packages` source (the strip destructure in `start.ts` and the sanitizer test input in `start.test.ts`), and zero matches for `finalTrial`, `planFinalTrial`, `FinalTrialPlan`, and `final-trial` (with the lint-artifact exception from §3.6).
4. Historical `Run.config.isFinalTrial` JSON is left as-is on old rows; no data rewrite script is run.
5. Web client GraphQL codegen is re-run; `cloud/apps/web/src/generated/graphql.ts` reflects a schema without `FinalTrialPlan`, `finalTrialPlan` query, or `StartRunInput.finalTrial`.
6. All tests referencing `finalTrial` or `isFinalTrial` are updated or deleted; no new test failures are introduced.
7. Preflight Gate passes for shared, db, api, and web workspaces.
8. The PR is small and focused — pure deletion with no schema change and no metric math changes.
9. After this PR lands, the `winrate-honest-denominator` feature can be unblocked and resumed safely.

## 8. Risks

- **Stale imports breaking build.** GraphQL query files register by import side effect via `cloud/apps/api/src/graphql/queries/index.ts`. Deleting `final-trial-plan.ts` without also removing its import breaks `tsc`. Mitigation: edit the queries index in the same slice as the file deletion.
- **`start.ts` refactor larger than expected.** `finalTrial` touches the samplePercentage / samplesPerScenario / scenarioIds / runMode / name plumbing. Lines 181–186 in particular do real work under the `finalTrial` branch. Mitigation: the plan must walk `start.ts` diff line-by-line in a dedicated slice and verify with `npm run build --workspace @valuerank/api`.
- **Generated code drift.** If codegen is run with a different codegen version than what the last author used, `generated/graphql.ts` will have unrelated churn. Mitigation: run codegen from the same `cloud/` workspace with `npm run` scripts only; do not edit by hand.
- **Stale JSON on aggregation.** After this PR, `aggregate-analysis.ts` still sees `Run.config.isFinalTrial` on old rows but ignores it (zod `.passthrough()` on the rest of the config). Confirmed safe because the field is removed from the zod shape and no code reads it.
- **Data-critical waves rule does not apply here.** There is no migration, no backfill, no enum change, no data rewrite. The rule in `docs/workflow/rules/data-critical-waves.md` still requires a "why not" note in the closeout. Mitigation: closeout explicitly states that this PR is a pure code deletion with no data rollout.
- **Missed caller.** The `finalTrial` parameter flows from `startRun` mutation input → service → config. A missed site anywhere breaks types. Mitigation: the implementation slice does a final `grep -r 'finalTrial\|isFinalTrial\|FinalTrialPlan\|planFinalTrial\|final-trial' cloud/apps cloud/packages` and confirms only lint-artifact matches remain.

## 9. Validation plan (preview)

Details live in `plan.md`. High-level:

1. Delete the four whole files (§3.1) + their index imports.
2. Edit `aggregate-analysis.ts` to drop the follow-up block and the two now-dead imports.
3. Edit the run start path (`start.ts`, `start-plan.ts`, `start-validation.ts`).
4. Edit the GraphQL surface (`lifecycle.ts`, `start-run.ts`, `evaluation.ts`, `execute-runs.ts`, `queries/index.ts`).
5. Edit the web client (`useRunForm.ts`, `runs.ts`).
6. Edit `schema.graphql`, re-run web codegen, diff `generated/graphql.ts`.
7. Strip `finalTrial` from test fixtures.
8. Final grep sweep.
9. Preflight Gate for shared / db / api / web from `cloud/`:
   - `npm run lint --workspace @valuerank/shared`
   - `npm run lint --workspace @valuerank/db`
   - `npm run lint --workspace @valuerank/api`
   - `npm run test --workspace @valuerank/api` (with `DATABASE_URL` + `JWT_SECRET`)
   - `npm run build --workspace @valuerank/api`
   - `npm run lint --workspace @valuerank/web`
   - `npm run test --workspace @valuerank/web`
   - `npm run build --workspace @valuerank/web`
10. Manual spot-check: start the dev server, open the run form, confirm the Final Trial checkbox is gone and that a normal run still starts.

## 10. Rollout

1. Merge the PR. No data rollout — `data-critical-waves.md` does not apply because there is no migration, no backfill, and no enum change.
2. **Atomic code rollout caveat (raised by Codex feasibility review).** The API and web workspaces are deployed together from the `cloud/` monorepo on Railway — there is no separate worker deployment, because `aggregate-analysis.ts` lives inside `cloud/apps/api` and runs in the same process as the GraphQL API. So the queue-handler side and the `startRun` mutation side ship in the same deploy; there is no compatibility window where the handler could still try to call `startRun({ finalTrial: true })` against a server that no longer accepts `finalTrial`.
3. **Stale browser bundle caveat.** There is still one non-atomic rollout window: users with a cached web bundle will send `startRun(finalTrial: false)` to a server whose `StartRunInput` no longer declares `finalTrial`. GraphQL strict-input validation rejects unknown fields, so the mutation will fail until the user refreshes. Mitigations:
   - The user has confirmed Final Trial is internally-unused and the product has a small user base, so the cached-bundle blast radius is bounded to one or two refresh prompts in practice.
   - No complex compatibility shim (deprecated-field-held-for-a-release) is warranted for an internal tool at this user scale.
   - Closeout must explicitly call out this window so anyone hitting a post-deploy `startRun` failure knows to hard-refresh, not file a bug.
4. Closeout explicitly notes: no data rollout; historical `Run.config.isFinalTrial` JSON is dead weight; stale-bundle hard-refresh may be needed for up to one session per user.
5. Unblock `winrate-honest-denominator` in `docs/workflow/feature-runs/winrate-honest-denominator/state.json` and resume that workflow.
6. Open a follow-up tracking note (not a PR) if we ever want to reclaim the `RunMode.FINAL` enum value; out of scope for this PR.
