# Spec: CI Test Quality Improvements

**Feature:** ci-test-quality  
**Branch:** claude/cranky-grothendieck  
**Created:** 2026-04-16  
**Status:** draft

---

## Background

A CI audit identified several categories of test-quality issues that cause intermittent failures, inflate CI wall-clock time, and make the test suite brittle against future refactors. This spec covers the fixes in priority order.

**Out of scope (deferred):** DB transaction-wrapping for API test parallelism (`singleFork` removal). That is a separate, larger architectural change.

---

## User Stories

### US-1 — CI no longer runs tests against stale build artifacts (P1)

As a developer, I want CI to always build `@valuerank/shared` fresh before running web tests, so that a cached but stale `dist/` cannot cause web test failures that don't reproduce locally or across branches.

**Acceptance criteria:**
- The `web-tests` job builds `@valuerank/shared` with `--force` so Turbo cache is bypassed.
- A stale `dist/` from a previous cache hit cannot cause the web tests to import wrong types.

**Independent test:** Remove the `dist/` directory from `@valuerank/shared`, push a commit that changes a shared export, and verify web tests pick up the new export (not the previous cached one).

---

### US-2 — Duplicate API test files no longer run twice (P1)

As a developer, I want each API test to run exactly once per CI run, so that DB teardown does not conflict with itself and test output is not doubled.

**Acceptance criteria:**
- The `src/**/*.test.ts` glob is removed from `cloud/apps/api/vitest.config.ts`.
- Only `tests/**/*.test.ts` (and `scripts/__tests__/**/*.test.ts`) remain as include patterns.
- `src/cli/create-user.test.ts` is **deleted**: `tests/cli/create-user.test.ts` already exists and is a superset (200+ lines vs 21 lines). The `src/` copy is an old stub with no unique coverage.
- `src/graphql/queries/__tests__/domain-coverage.test.ts` is **moved** to `tests/graphql/queries/domain-coverage.test.ts` via `git mv`: no counterpart exists in `tests/`, so all 404 lines of coverage are preserved.
- `src/queue/handlers/__tests__/summarize-persistence.test.ts` is **moved** to `tests/queue/handlers/summarize-persistence.test.ts` via `git mv`: no counterpart exists in `tests/`, so all 91 lines of coverage are preserved.

**Independent test:** Run `npx vitest list` for the API suite and verify each test file appears exactly once.

---

### US-3 — CI node_modules cache has a fallback key (P2)

As a CI maintainer, I want node_modules to restore from a partial cache hit when the lockfile changes, so that a single Dependabot PR doesn't force full `npm ci` in all three CI jobs.

**Acceptance criteria:**
- All three cache steps in `.github/workflows/ci.yml` (`lint-build`, `web-tests`, `api-tests`) include a `restore-keys` fallback on `${{ runner.os }}-node-modules-`.
- The exact key still uses `hashFiles('cloud/package-lock.json')` as before.

---

### US-4 — API test job has a timeout (P2)

As a CI maintainer, I want the `api-tests` job to fail fast if something hangs, rather than consuming a runner indefinitely.

**Acceptance criteria:**
- `api-tests` job in `.github/workflows/ci.yml` has `timeout-minutes: 20`.
- `web-tests` already has `timeout-minutes: 10`; that stays unchanged.

---

### US-5 — Large web test files are split to balance CI shards (P2)

As a developer, I want the five web test shards to finish in roughly equal time, so that no single shard is the bottleneck that determines total CI duration.

**Acceptance criteria:**
- `AnalysisPanel.test.tsx` (1,235 lines) is split into 2–3 files by describe group, each under 600 lines.
- `OverviewTab.test.tsx` (1,228 lines) is split into 2–3 files by describe group, each under 600 lines.
- All split files are co-located with the originals in the same directory.
- All tests from the original files pass after the split.

**Approach:** Split by logical groupings visible in the existing describe/it structure. Each new file gets a suffix that matches its describe group (e.g. `AnalysisPanel.pairedMode.test.tsx`, `AnalysisPanel.overview.test.tsx`).

---

### US-6 — Flaky sync DOM queries in web tests are wrapped in waitFor (P2)

As a developer, I want tests that are intermittently failing due to async re-renders to use `waitFor` or `findBy*`, so that React deferring a state update cannot cause a `getBy*` query to throw before the DOM settles.

**Affected files:**
- `cloud/apps/web/tests/components/analysis/OverviewTab.test.tsx`
- `cloud/apps/web/tests/pages/AnalysisDetail.test.tsx`
- `cloud/apps/web/tests/pages/AnalysisTranscripts.test.tsx`
- `cloud/apps/web/tests/pages/AnalysisConditionDetail.test.tsx`

**Scope of change:** Only non-`async` `it()` blocks (or async blocks with no `waitFor`) that call `screen.getBy*()` or `within(...).getBy*()` **after a user interaction (`fireEvent.*`, `userEvent.*`) or after a component that is known to use `useEffect`/async state** are in scope. Pure synchronous renders where the component has no deferred effects and all data is injected via synchronous mocks do NOT need `waitFor` wrapping — only tests that match the flakiness pattern described in the audit (async state update triggered by render or interaction not yet committed to DOM).

**Acceptance criteria:**
- `it()` blocks that fire an event or render a component with known async state and then query the DOM immediately use `await waitFor(() => { ... })` or `await screen.findBy*()` for those queries.
- Tests that already use `waitFor` correctly are not changed.
- `queryBy*` calls (which return `null` instead of throwing) remain synchronous.
- No test logic or assertions are changed — only the async wrapper is added.
- The implementer documents in a comment which specific pattern (interaction trigger vs deferred effect) warranted the fix for each changed test block.

---

### US-7 — access-tracking middleware exposes a testable seam (P2)

As a developer, I want to be able to `await` the fire-and-forget DB writes in tests, so that `access-tracking.test.ts` does not need real 100ms `setTimeout` waits.

**Acceptance criteria:**
- `trackRunAccess`, `trackTranscriptAccess`, `trackTranscriptsAccess`, and `trackDefinitionAccess` in `cloud/apps/api/src/middleware/access-tracking.ts` return the underlying `Promise<void>` instead of `void`.
- The functions still swallow errors (the `.catch` behavior is unchanged) — callers that ignore the return value continue to work as fire-and-forget.
- `cloud/apps/api/tests/middleware/access-tracking.test.ts` replaces the 10 `await new Promise(resolve => setTimeout(resolve, 100))` calls with `await trackXxxAccess(...)` directly.
- All 10 sleep-based tests pass without real timer waits.

**Note:** TypeScript callers that currently ignore the return value do not need to be updated — `void` functions can return a `Promise<void>` without callers being affected.

---

### US-8 — export.test.ts uses vi.stubGlobal instead of manual save/restore (P3)

As a developer, I want global patching in `export.test.ts` to be safe against test-order pollution, so that a thrown exception in a test does not leave a broken global state for subsequent tests.

**Acceptance criteria:**
- `cloud/apps/web/tests/api/export.test.ts` replaces manual save/restore of `global.fetch`, `global.localStorage`, and `global.URL` with `vi.stubGlobal(...)`.
- `vi.unstubAllGlobals()` is called in `afterEach` (or `vi.stubGlobal` auto-restore via Vitest's `restoreAllMocks` config is relied on).
- Test behavior is unchanged — only the stub mechanism changes.

---

## Non-Goals

- DB transaction-wrapping / `singleFork: false` for API test parallelism.
- Fixing API teardown ID-tracking arrays (that's part of the transaction refactor).
- Adding `testTimeout` to `vitest.config.ts` (low-impact, can be a standalone 1-line PR).
- Verifying or removing the Python install step in `api-tests` (needs investigation outside this feature).

---

## Scope

| Path | Change type |
|------|-------------|
| `.github/workflows/ci.yml` | Edit (US-1, US-3, US-4) |
| `cloud/apps/api/vitest.config.ts` | Edit (US-2) |
| `cloud/apps/api/src/middleware/access-tracking.ts` | Edit (US-7) |
| `cloud/apps/api/tests/middleware/access-tracking.test.ts` | Edit (US-7) |
| `cloud/apps/web/tests/components/analysis/OverviewTab.test.tsx` | Edit + split (US-5, US-6) |
| `cloud/apps/web/tests/components/analysis/AnalysisPanel.test.tsx` | Edit + split (US-5, US-6) |
| `cloud/apps/web/tests/pages/AnalysisDetail.test.tsx` | Edit (US-6) |
| `cloud/apps/web/tests/pages/AnalysisTranscripts.test.tsx` | Edit (US-6) |
| `cloud/apps/web/tests/pages/AnalysisConditionDetail.test.tsx` | Edit (US-6) |
| `cloud/apps/web/tests/api/export.test.ts` | Edit (US-8) |

---

## Risks

- **Split files break shard distribution:** Vitest shards by file count; splitting large files into smaller ones increases file count and changes shard assignment. This is desirable but should be verified by comparing shard timing before/after.
- **access-tracking return type change:** Changing `void` → `Promise<void>` is backward-compatible in TypeScript but should be verified against all callers in GraphQL resolvers that call `trackRunAccess` etc.
- **Duplicate test file removal:** If the `src/` copies of the test files have diverged from `tests/` copies, deletions need a merge review.
