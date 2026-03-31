# Tasks: Remove `canonical.direction` from Frontend Bucketing

**Prerequisites**: spec.md, plan.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other [P] tasks in same phase
- **[US1/2/3]**: User story label
- File paths are absolute from repo root

---

## Phase 1: Setup

**Purpose**: Branch and orientation

- [ ] T001 Create branch `feat/028-remove-direction-bucketing` from current main

---

## Phase 2: Core Refactor — `canonicalConditionSummary.ts` (US1 + US3)

**Goal**: Replace `direction`-based bucketing in the pivot table's aggregation layer with `favoredValueKey` alphabetical comparison.

**User stories served**: US1 (paired pivot correctness), US3 (single-run consistency)

- [X] T002 [US1] Rewrite `getCanonicalBucket` in `cloud/apps/web/src/utils/canonicalConditionSummary.ts` — replace all `canonical.direction` reads with `favoredValueKey.localeCompare(opposedValueKey) < 0` per plan.md Implementation Detail section
- [X] T003 [US1] Add test to `cloud/apps/web/tests/utils/canonicalConditionSummary.test.ts` covering the case where `favoredValueKey = 'value-b'` (alphabetically second) → should bucket as `opponentStrongly`, confirming `direction` is no longer consulted

**Checkpoint**: `npm run test --workspace @valuerank/web -- tests/utils/canonicalConditionSummary.test.ts` passes

---

## Phase 3: Core Refactor — `conditionDecisionSummary.ts` (US2 + US3)

**Goal**: Replace `direction`-based bucketing and label derivation in the condition detail page with `favoredValueKey` alphabetical comparison.

**User stories served**: US2 (condition detail column labels), US3 (single-run consistency)

- [X] T004 [US2] Rewrite `getConditionDecisionBucketKey` in `cloud/apps/web/src/utils/conditionDecisionSummary.ts` — same alphabetical pattern as T002 but mapping to `strong_first`/`lean_first`/`lean_second`/`strong_second`
- [X] T005 [US2] Simplify `resolveConditionDecisionLabelPair` and `PairLabelStats` type in `cloud/apps/web/src/utils/conditionDecisionSummary.ts` — remove `firstPositionCounts: Map<string, number>`, replace with direct alphabetical ordering (labels already sorted when pair key is built — `bestPair.labels[0]` is always firstValueLabel)
- [X] T006 [US2] Add test to `cloud/apps/web/tests/utils/conditionDecisionSummary.test.ts` covering the case where `favoredValueKey = 'Harmony'` (alphabetically second after Freedom) — all counts should land in `strong_second`/`lean_second`, `firstValueLabel = 'Freedom'`, `secondValueLabel = 'Harmony'`

**Checkpoint**: `npm run test --workspace @valuerank/web -- tests/utils/conditionDecisionSummary.test.ts` passes

---

## Phase 4: Verification

**Purpose**: Full preflight gate per cloud/CLAUDE.md

- [X] T007 Run `npm run lint --workspace @valuerank/web` — zero errors
- [X] T008 Run `npm run test --workspace @valuerank/web` — all 1458+ tests pass
- [X] T009 Run `npm run build --workspace @valuerank/web` — clean compile, no `@ts-ignore` added
- [X] T010 Verify `grep -n "canonical\.direction" cloud/apps/web/src/utils/canonicalConditionSummary.ts` returns no output
- [X] T011 Verify `grep -n "canonical\.direction" cloud/apps/web/src/utils/conditionDecisionSummary.ts` returns no output

---

## Dependencies & Execution Order

- **T001** must precede all other tasks
- **T002–T003** (Phase 2) can run concurrently with **T004–T006** (Phase 3) — different files
- **T007–T011** (Phase 4) must follow all implementation tasks

### Parallel Opportunities

- T002 and T004 can run in parallel (different files)
- T003 and T006 can run in parallel (different test files)
- All Phase 4 verification tasks can run together
