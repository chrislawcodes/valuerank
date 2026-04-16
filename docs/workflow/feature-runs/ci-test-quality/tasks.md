# Tasks: CI Test Quality Improvements

## Wave 1: CI Config + Vitest Config

- T-01: Remove `src/**/*.test.ts` glob from `cloud/apps/api/vitest.config.ts`
- T-02: Delete `src/cli/create-user.test.ts`; git mv domain-coverage and summarize-persistence tests to tests/
- T-03: Add `--force` to shared build in web-tests job in `.github/workflows/ci.yml`
- T-04: Add `restore-keys` fallback to all three node_modules cache steps
- T-05: Add `timeout-minutes: 20` to api-tests job

[CHECKPOINT]

## Wave 2: access-tracking Return Type

- T-06: Change all four access-tracking functions to return `Promise<void>`
- T-07: Replace `setTimeout` waits in access-tracking tests with direct `await`

[CHECKPOINT]

## Wave 3: Global Stub Safety

- T-08: Replace manual global save/restore with `vi.stubGlobal` in export.test.ts

[CHECKPOINT]

## Wave 4: waitFor for Flaky Queries

- T-09: Add `waitFor` to post-interaction `getBy*` queries in OverviewTab.test.tsx
- T-10: Add `waitFor` to post-interaction `getBy*` queries in AnalysisDetail.test.tsx

[CHECKPOINT]

## Wave 5: Large Test File Splits

- T-13: Split AnalysisPanel.test.tsx into states, pairedContent, layout files + fixtures
- T-14: Split OverviewTab.test.tsx into overview, repeatPattern, layout files + fixtures

[CHECKPOINT]
