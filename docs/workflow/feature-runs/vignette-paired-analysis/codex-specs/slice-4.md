# Codex spec: vignette-paired-analysis slice 4 (Verification tests)

You are implementing slice 4 of the `vignette-paired-analysis` Feature Factory workflow. Slices 1-3 are merged on this branch (commits `b60d67ed`, `a5bb9815`, `30b4f3d4`). The architecture is in place; this slice locks it in with regression tests.

**Read first:**

- `docs/workflow/feature-runs/vignette-paired-analysis/spec.md` (full)
- `docs/workflow/feature-runs/vignette-paired-analysis/plan.md` § 6 ("Slice 4 — Verification")
- `docs/workflow/feature-runs/vignette-paired-analysis/tasks.md` § "Slice 4"
- `cloud/CLAUDE.md` § "Testing Requirements"
- The existing test patterns at:
  - `cloud/apps/api/src/services/pressure-sensitivity/aggregation.test.ts` (or similar) for unit-test idiom
  - `cloud/apps/web/src/pages/PressureSensitivity.test.tsx` for page-test idiom
  - `cloud/apps/web/tests/pages/AnalysisDetail.test.tsx` for the existing redirect-test mocking pattern

## Slice 4 scope

Add regression tests covering:

1. The equal-weight aggregation property: `directionBalancedWinRate` averages by direction, NOT by trial count.
2. The companion expansion helper: `expandToCompanionDefinition` returns the right `{ ids, status }` for paired / companion_missing / not_paired / collision / mirror-failure cases.
3. The resolver-level argument validation: `domainId` + `definitionId` rejected.
4. The new page renders the right state for loading / error / empty / collision / success / URL-rewrite.
5. The legacy `?mode=paired` redirect logic in `AnalysisDetail.tsx`.

**Constraints:**

- NO production code changes in this slice. Tests only.
- Reuse existing test fixtures and helpers where possible. Do NOT introduce a new test framework or harness.
- Follow the existing test idiom for each file (vitest for API and web).
- File-size limits per `cloud/CLAUDE.md`: tests warn 800, error 1200.
- Tests must run with `DATABASE_URL` and `JWT_SECRET` env vars per repo memory; DO NOT mock the database — use the test DB pattern already established in `cloud/apps/api/tests/`.

## Files to create or extend

1. `cloud/apps/api/src/services/pressure-sensitivity/snapshot-builder.test.ts` — extend (it likely already exists; if not, create it). Add tests for `expandToCompanionDefinition`.
2. `cloud/apps/api/src/services/pressure-sensitivity/aggregation.test.ts` — extend (it likely already exists). Add the equal-weight regression cases (rate-averaging vs count-pooling, plus null-rate edge cases).
3. `cloud/apps/api/tests/graphql/queries/pressure-sensitivity.test.ts` — extend. Add `definitionId` validation cases plus a happy-path positive test.
4. `cloud/apps/web/src/pages/VignettePairedAnalysis.test.tsx` — NEW FILE. 6 test cases for loading/error/empty/collision/success/URL-rewrite.
5. `cloud/apps/web/tests/pages/AnalysisDetail.test.tsx` — extend. Add the 4-branch redirect tests for `?mode=paired`.

If any of these files do not yet exist, create them following the convention of neighboring test files in the same directory.

## DO NOT MODIFY

`CLAUDE.md`, `AGENTS.md`, `cloud/CLAUDE.md`, `cloud/AGENTS.md`, `cloud/agents.md`, `MEMORY.md`, `.gitignore`, `STATUS.md`, `docs/workflow/feature-runs/vignette-paired-analysis/spec.md`, `plan.md`, `tasks.md`, or any production code file. If you find a production-code bug while writing tests, note it in your output but do not fix it; we'll spawn a follow-up.

## Detailed task list

### 4.1 Equal-weight regression tests (API)

**File:** `cloud/apps/api/src/services/pressure-sensitivity/aggregation.test.ts`

If the file does not exist, create it. If it exists, extend it.

Test target: the path through `buildVignetteWeightedCellMetrics` and `computeDirectionBalancedPairWinRates` must produce direction-balanced rates that are equal-weight, not count-weighted.

Test cases:

1. **Asymmetric trial counts.** Two definitions sharing a `pair_key`, one with 100 trials in direction A (e.g., 80 own_picked, 20 opponent_picked → rate 0.8), the other with 10 trials in direction B (5 own_picked, 5 opponent_picked → rate 0.5). Assert: `directionBalancedWinRate ≈ (0.8 + 0.5) / 2 = 0.65`, NOT `(80+5)/(100+10) = 0.773`.
2. **Zero trials in one direction.** A has data, B has none. Assert: result equals A's rate (averageNonNull skips B).
3. **Zero trials in both directions.** Assert: result is null.
4. **Equal trial counts.** Both directions have the same count. Assert: result is the simple average.
5. **Null win rate in one direction.** A has trials but all are unscored/refusal (winRate === null), B has scored trials. Assert: result equals B's rate (NOT NaN, NOT 0).
6. **Null win rate in both.** Assert: result is null.

Use the existing test idiom in the file. If creating from scratch, mirror the pattern of other `*.test.ts` files in the same directory.

### 4.2 Companion expansion tests (API)

**File:** `cloud/apps/api/src/services/pressure-sensitivity/snapshot-builder.test.ts`

If the file does not exist, create it. If it exists, extend it.

Test target: `expandToCompanionDefinition(definitionId)` from `cloud/apps/api/src/services/pressure-sensitivity/snapshot-builder.ts`.

Test cases:

1. **Single companion exists.** Two definitions sharing a `pair_key`, different `value_first`, same `domainId`. Returns `{ ids: [selfId, companionId], status: 'paired' }`.
2. **Multi-candidate collision.** Two definitions in the same domain match the input's pair_key with different value_first tokens. Throws `AppError('pair_key_companion_collision')`.
3. **No candidate.** Definition exists with a `pair_key` but no other definition shares it in the same domain. Returns `{ ids: [definitionId], status: 'companion_missing' }`.
4. **Missing pair_key.** Definition has no `methodology.pair_key`. Returns `{ ids: [definitionId], status: 'not_paired' }`.
5. **Cross-domain isolation.** A definition in domain X with `pair_key=foo` should NOT find a candidate in domain Y with `pair_key=foo`. Returns `{ ids: [definitionId], status: 'companion_missing' }`.
6. **Mirroring failure (if reproducible).** If `findPairedCompanion` returns null for the candidate (bad mirror), throws `AppError('pair_key_companion_mirror_failure')`. Skip this case if the fixture cost is high.

Use the existing test DB and Prisma factory patterns. Do NOT mock `db`.

### 4.3 Resolver validation tests (API)

**File:** `cloud/apps/api/tests/graphql/queries/pressure-sensitivity.test.ts`

If the file does not exist, create it. If it exists, extend it.

Test target: `pressureSensitivity` GraphQL query at `cloud/apps/api/src/graphql/queries/pressure-sensitivity.ts`.

Test cases:

1. **Reject domainId + definitionId combination.** Query with both args set. Expects ValidationError "Pass either domainId or definitionId, not both".
2. **Happy path with definitionId.** Seed two paired definitions with at least one completed run each, sharing a pair_key. Query with `definitionId` set. Expect a non-empty `models` array (or correct `excludedDefinitions` if no completed runs).
3. **Happy path with domainId (regression).** Existing domain-scoped path still works unchanged. Pass `domainId` and `signature` only. Expect existing behavior.

Use the existing GraphQL test harness if there is one (look at `cloud/apps/api/tests/graphql/queries/` for the convention).

### 4.4 New page tests (web)

**File:** `cloud/apps/web/src/pages/VignettePairedAnalysis.test.tsx`

NEW FILE. Follow the pattern of `cloud/apps/web/src/pages/PressureSensitivity.test.tsx` (and `cloud/apps/web/tests/pages/AnalysisDetail.test.tsx` for routing-aware tests).

Test cases:

1. **Loading state.** While the underlying queries fetch, the page renders the `<Loading>` indicator (or the equivalent component the page uses — read `VignettePairedAnalysis.tsx` to confirm).
2. **Error state.** When the pressureSensitivity query errors, the page renders `<ErrorMessage>`.
3. **Empty result.** When the query returns no models and no exclusions, the page renders an empty banner.
4. **Collision state.** When `result.excludedDefinitions[]` includes an entry with `reason: 'pair_key_companion_collision'`, the page renders the non-dismissible alert message.
5. **Success state.** When `result.models` has at least one entry, the page renders the per-model section. Confirm at least one model name appears.
6. **URL signature rewrite.** When the route is loaded without `?signature=`, after mount the URL's search includes the resolved signature.

Mock the pressureSensitivity query at the urql level using the same pattern as `PressureSensitivity.test.tsx`. Mock `useDefinition` if needed.

### 4.5 Legacy redirect tests (web)

**File:** `cloud/apps/web/tests/pages/AnalysisDetail.test.tsx`

Extend the existing file. Add a new `describe` block titled "legacy ?mode=paired redirect" with these cases:

1. **(a) No pair_key, no companionRunId.** Renders single-mode view, no alert, no redirect.
2. **(b) pair_key present, definition.id present.** Calls `navigate` to `/vignette/<definitionId>/paired` with `replace: true`.
3. **(c) pair_key present, definition.id missing.** Renders single-mode view + the orphaned-paired alert (text matches "cannot navigate" or similar).
4. **(d) companionRunId present, pair_key absent.** Renders single-mode view + the legacy-companion-run alert (text matches "deprecated" or similar).

Mock `navigate` (likely via the existing `useNavigate` mock pattern in this file). Use `renderWithRouter('/analysis/<id>?mode=paired')` to set up the URL state. Read the existing test setup for the right mock seam.

## Verification

After implementing, run from `cloud/`:

1. `npm run lint --workspace @valuerank/api`
2. `npm run lint --workspace @valuerank/web`
3. `DATABASE_URL=postgresql://valuerank:valuerank@localhost:5433/valuerank_test JWT_SECRET=test-secret-that-is-at-least-32-characters-long npm run test --workspace @valuerank/api`
4. `npm run test --workspace @valuerank/web`
5. `npm run build --workspace @valuerank/api`
6. `npm run build --workspace @valuerank/web`

If a test you wrote fails because of a real production bug, note it in your output. Do NOT fix the production code — flag it so we can spawn a follow-up.

## Output expectations

- 5 test files modified or created.
- ~150-300 lines of test code added.
- All listed test cases pass.
- Lint, build, and test green for both `@valuerank/api` and `@valuerank/web`.

## After implementation

Commit with message:

```
ff(slice 4): regression tests for vignette-paired-analysis

Locks in equal-weight aggregation, companion expansion, resolver
validation, redirect logic, and the new page rendering as regression
guards against the architecture put in place in slices 1-3.

Refs: docs/workflow/feature-runs/vignette-paired-analysis/spec.md
Refs: docs/workflow/feature-runs/vignette-paired-analysis/plan.md § 6
```

Run `git status` after committing to confirm no stray files remain.

Report your findings (any production bugs surfaced, fixtures that needed unusual setup, tests deferred because the test DB harness was missing) in your output.
