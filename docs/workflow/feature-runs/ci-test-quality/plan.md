# Plan: CI Test Quality Improvements

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: All findings UNVERIFIED; implementation verified each: delete was a 21-line stub superset; TypeScript build passes; all 1232 web tests pass after split; --force scoped to --filter=@valuerank/shared
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: US-5 HIGH resolved by extracting shared fixtures to *.fixtures.tsx; all 1232 tests pass; remaining findings informational or already handled
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.codex.architecture-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: Implementation complete — all 1232 web tests pass, TypeScript builds clean, YAML is valid. Testability concerns are addressed: access-tracking tests now await directly (no real timers), export.test.ts uses vi.stubGlobal (auto-cleanup), split test files each run independently.

## Implementation Order

Waves 1–5 run sequentially (each wave's verification depends on previous changes). Within Wave 1, all tasks are independent. Within Wave 4, tasks target different files and are independent.

**Wave 1 — CI config and vitest config (US-1, US-2, US-3, US-4):** Pure config edits.

**Wave 2 — access-tracking return type (US-7):** Application + test change.

**Wave 3 — export.test.ts global stubbing (US-8):** Test-only change.

**Wave 4 — waitFor wrapping in flaky tests (US-6):** Test-only change across 2 files with actual getBy* after interaction patterns.

**Wave 5 — large test file splits (US-5):** Structural change with shared fixture extraction.

---

## Wave 1: CI Config + Vitest Config

**`.github/workflows/ci.yml` changes:**
- Add `--force` to `npx turbo build --filter=@valuerank/shared` in web-tests job (US-1)
- Add `restore-keys: ${{ runner.os }}-node-modules-` to all three node_modules cache steps (US-3)
- Add `timeout-minutes: 20` to api-tests job (US-4)

**`cloud/apps/api/vitest.config.ts` changes (US-2):**
- Remove `'src/**/*.test.ts'` from include array
- Delete `src/cli/create-user.test.ts` (21-line stub, superset exists in tests/)
- `git mv` `src/graphql/queries/__tests__/domain-coverage.test.ts` → `tests/graphql/queries/domain-coverage.test.ts`
- `git mv` `src/queue/handlers/__tests__/summarize-persistence.test.ts` → `tests/queue/handlers/summarize-persistence.test.ts`

---

## Wave 2: access-tracking Return Type (US-7)

**`cloud/apps/api/src/middleware/access-tracking.ts`:** Change all four functions from `void` to `Promise<void>` by adding `return` before each Prisma chain. Early return becomes `return Promise.resolve()`. Keep `.catch()` intact.

**`cloud/apps/api/tests/middleware/access-tracking.test.ts`:** Replace `await new Promise(resolve => setTimeout(resolve, 100))` after direct function calls with `await trackXxxAccess(...)`. Preserve setTimeout waits in the "Run Access Tracking" describe block (HTTP-triggered path).

---

## Wave 3: export.test.ts Global Stub Safety (US-8)

**`cloud/apps/web/tests/api/export.test.ts`:** Remove manual save/restore variables. Replace direct global assignment with `vi.stubGlobal(...)`. Add `vi.unstubAllGlobals()` to afterEach.

---

## Wave 4: waitFor for Flaky Async Queries (US-6)

Only target `getBy*` queries that appear after `fireEvent.*` or `userEvent.*`. Audit found 4 qualifying blocks:
- `OverviewTab.test.tsx` ~line 578: tooltip after fireEvent.focus
- `AnalysisDetail.test.tsx`: ~3 blocks with fireEvent.click/change + immediate getBy*

---

## Wave 5: Split Large Test Files (US-5)

Extract shared fixtures, then create 3 test files per component:

**AnalysisPanel:** `analysisPanel.fixtures.tsx` + states + pairedContent + layout files  
**OverviewTab:** `overviewTab.fixtures.ts` + overview + repeatPattern + layout files

---

## Files Touched

| File | Wave |
|------|------|
| `.github/workflows/ci.yml` | 1 |
| `cloud/apps/api/vitest.config.ts` | 1 |
| `cloud/apps/api/src/cli/create-user.test.ts` | 1 (delete) |
| `cloud/apps/api/src/graphql/queries/__tests__/domain-coverage.test.ts` | 1 (move) |
| `cloud/apps/api/src/queue/handlers/__tests__/summarize-persistence.test.ts` | 1 (move) |
| `cloud/apps/api/src/middleware/access-tracking.ts` | 2 |
| `cloud/apps/api/tests/middleware/access-tracking.test.ts` | 2 |
| `cloud/apps/web/tests/api/export.test.ts` | 3 |
| `cloud/apps/web/tests/components/analysis/OverviewTab.test.tsx` | 4+5 |
| `cloud/apps/web/tests/components/analysis/AnalysisPanel.test.tsx` | 4+5 |
| `cloud/apps/web/tests/pages/AnalysisDetail.test.tsx` | 4 |
