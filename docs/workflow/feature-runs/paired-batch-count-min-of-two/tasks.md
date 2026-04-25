# Tasks — `pairedBatchCount` as `min(A-first complete, B-first complete)`

**Slug:** `paired-batch-count-min-of-two`
**Spec:** [spec.md](spec.md) · **Plan:** [plan.md](plan.md)

Two slices, each `[CHECKPOINT]`-bounded. Total expected diff: ~360 lines across 5 files. Slice 1 keeps the integration test wiring temporarily on the old codepath so its diff stays self-contained; Slice 2 swaps the wiring and updates tests.

---

## Slice 1 — Add new helper alongside old + helper-level tests (BACKWARDS-COMPATIBLE)

**Estimated diff size:** ~180 lines (~100 in `domain-coverage-utils.ts` + ~80 in tests).

**Goal:** keep the branch in a fully-green, fully-buildable state at the slice 1 boundary. Achieved by adding a *new* helper `selectPrimaryDefinitionCountsByDirection` alongside the existing `selectPrimaryDefinitionCounts`, NOT replacing it. The existing helper and its callers stay untouched in this slice.

**Files this slice writes to:**
- `cloud/apps/api/src/graphql/queries/domain-coverage-utils.ts`
- `cloud/apps/api/tests/graphql/queries/domain-coverage.test.ts` (helper-test additions only)

### Tasks

- [ ] **T1.1** Add `getCoverageDirection(runConfig: unknown): string | null` to `domain-coverage-utils.ts` with the body specified in plan §3.1. Export it from the same module.
- [ ] **T1.2** Add a new exported function `selectPrimaryDefinitionCountsByDirection` to `domain-coverage-utils.ts` with the new signature in plan §3.1 (`directionalGroupsByDefinitionId` + optional `log`/`cellKey`). Implement the 3 internal steps from plan §3.1. Do **not** remove or modify the existing `selectPrimaryDefinitionCounts` function in this slice.
- [ ] **T1.3** Add helper-level unit tests in `domain-coverage.test.ts`, in new `describe` blocks placed adjacent to the existing ones (do not delete existing tests in this slice):
  - New `describe('getCoverageDirection')` block covering the 9 cases in plan §3.5 second table.
  - New `describe('selectPrimaryDefinitionCountsByDirection')` block covering the 9 cases in plan §3.5 first table (including I5-style log-warn assertion using `vi.fn()`).
- [ ] **T1.4** Run from `cloud/`:
  - `npx turbo lint --filter=@valuerank/api` — must pass.
  - `npx turbo test --filter=@valuerank/api -- domain-coverage` — must pass (existing tests + new helper tests).
  - `npx turbo build --filter=@valuerank/api` — must pass.

  Slice 1 is fully green at this checkpoint because the new helper is purely additive — old code keeps using the old helper.
- [ ] **T1.5** Commit slice 1 with message: `slice 1: add getCoverageDirection + selectPrimaryDefinitionCountsByDirection (additive)`.

### `[CHECKPOINT]` — slice 1 boundary

Diff review (per FF SKILL diff stage): `correctness` + `regression` (Codex) + `quality` (Gemini). Reviewers should verify:
- The new helper's return shape matches the old one exactly: `{ primaryDefinitionId, batchCount, pairedBatchCount }`.
- The `getCoverageDirection` whitespace/null-coercion logic matches spec §5.2.
- The `>2 directions` log call uses `log.warn` (not `log.error`) and includes the cell key.
- The tie-break order is `(batchCount desc, directionCount desc, defId asc)`.
- The old `selectPrimaryDefinitionCounts` is **not** modified.
- All preflight commands pass green (no temporary `@ts-expect-error` left behind).

---

## Slice 2 — Wire `domain-coverage.ts` + integration tests + GQL desc + glossary + remove old helper

**Estimated diff size:** ~230 lines (~50 in `domain-coverage.ts` + ~30 removing old helper from utils + ~120 integration tests in `domain-coverage.test.ts` + ~10 in GQL types + ~30 in glossary).

**Files this slice writes to:**
- `cloud/apps/api/src/graphql/queries/domain-coverage.ts`
- `cloud/apps/api/src/graphql/queries/domain-coverage-utils.ts` (remove old `selectPrimaryDefinitionCounts`; rename `selectPrimaryDefinitionCountsByDirection` → `selectPrimaryDefinitionCounts`)
- `cloud/apps/api/tests/graphql/queries/domain-coverage.test.ts` (integration tests + drop old groupId-based selectPrimaryDefinitionCounts tests; rename references)
- `cloud/apps/api/src/graphql/queries/domain-coverage-gql-types.ts`
- `docs/canonical-glossary.md`

### Tasks

- [ ] **T2.1** In `domain-coverage.ts`, add `getCoverageDirection` to the import list from `./domain-coverage-utils.js`.
- [ ] **T2.2** Replace the local maps `pairedBatchCountByDefinitionId`, `pairedBatchGroupIdsByDefinitionId`, `pairedBatchIncrementsByGroupId` (declared near `domain-coverage.ts:131–133`) with a single `directionalGroupsByDefinitionId: Map<string, Map<string, Set<string>>>`.
- [ ] **T2.3** Replace the inner-loop `pairedBatchCount` block at `domain-coverage.ts:291–314` with the new direction-counting body from plan §3.2 (compute `direction`; if non-null, look up `groupKey = getCoverageBatchGroupId(...) ?? '__ungrouped__:' + run.id`; add to `defMap[direction]`).
- [ ] **T2.4** Update the `selectPrimaryDefinitionCounts` call site (currently `domain-coverage.ts:370–376`) to pass `directionalGroupsByDefinitionId`, `ctx.log`, and `${valueA}::${valueB}` in place of the old group-id maps. Remove the now-unused old-map arguments.
- [ ] **T2.5** Verify the trial-count path (`deduplicateRunsByGroupId(...)` block at `domain-coverage.ts:399`) is **unchanged** — it still feeds `computePerModelTrialCounts` exactly as today. Add an inline comment confirming this is intentional per spec §5.7.
- [ ] **T2.5b** In `domain-coverage-utils.ts`, remove the old `selectPrimaryDefinitionCounts` function. Rename `selectPrimaryDefinitionCountsByDirection` → `selectPrimaryDefinitionCounts`. Update the import in `domain-coverage.ts` accordingly. (At this commit boundary, the call site, helper signature, and tests are all consistent — no temporary stale code.)
- [ ] **T2.6** [P: cloud/apps/api/src/graphql/queries/domain-coverage-gql-types.ts] Update `domain-coverage-gql-types.ts:83`: replace the `pairedBatchCount` field description with the new text in plan §3.3.
- [ ] **T2.7** [P: docs/canonical-glossary.md] Update `docs/canonical-glossary.md`: replace the `Paired Batch` entry per spec §5.8; replace the `Incomplete Batch` entry's body per spec §5.8; append the two glossary notes ("Note on terminology overlap" and "Note on metric divergence within a cell") at the end of the `Paired Batch` entry.
- [ ] **T2.8** [P: cloud/apps/api/tests/graphql/queries/domain-coverage.test.ts] Add the 5 integration tests (I1–I5) from plan §3.5 to `domain-coverage.test.ts`. Each test uses the existing fixture pattern (or constructs minimal mock prisma responses). I5 mocks `ctx.log` with `vi.fn()` and asserts `log.warn` is called with the cell key + 3 direction tokens. Also: in this slice, drop the original (group-id-based) `selectPrimaryDefinitionCounts` test cases at lines 132–207 — the helper signature has changed and those cases are obsolete. Move any preserved coverage (empty-list, simple tie-break) into the renamed-helper test block.
- [ ] **T2.9** Run from `cloud/`:
  - `npx turbo lint --filter=@valuerank/api` — must pass.
  - `npx turbo test --filter=@valuerank/api` — must pass. Record the new test count delta in PR description.
  - `npx turbo build --filter=@valuerank/api` — must pass.
- [ ] **T2.10** Run from `cloud/`:
  - `npx turbo lint --filter=@valuerank/web` — must pass.
  - `npx turbo test --filter=@valuerank/web` — must pass.
  - `npx turbo build --filter=@valuerank/web` — must pass.
- [ ] **T2.11** **Manual verification — required, not skippable.** From `cloud/`, run `npm run dev --workspace @valuerank/api` (with `npm run dev --workspace @valuerank/web` if needed for fixture seeding). Issue a GraphQL query against `http://localhost:3031/graphql` for one known value pair from the test DB. Confirm:
  - Response includes `pairedBatchCount` field.
  - For the chosen pair, the value matches the expected `min(A-first, B-first)` for the seeded data.
  - If no fixtures with paired runs exist locally, **block** until the integration tests in T2.8 are extended to cover the resolver shape end-to-end (including the GQL field exposure). Do not skip this verification.
- [ ] **T2.12** Commit slice 2 with message: `slice 2: wire domain-coverage to direction-based pairedBatchCount; update glossary and GQL field description`.

### `[CHECKPOINT]` — slice 2 boundary (also the merge boundary)

Diff review: `correctness` + `regression` (Codex) + `quality` (Gemini). Reviewers should verify:
- All diffs match plan §3 exactly (no scope creep).
- Spec §10 forbidden files list — confirm `git diff --stat origin/main..HEAD` shows only the 5 files in spec §10's edits list.
- Glossary text is verbatim from spec §5.8.
- GQL field description is verbatim from plan §3.3.
- I2 integration test asserts BOTH `pairedBatchCount` and `minTrialCount` on the same fixture (the divergence assertion).

---

## Pre-merge checklist

Before opening PR:

- [ ] **PM1** `git diff --stat origin/main..HEAD` lists exactly these files: `domain-coverage.ts`, `domain-coverage-utils.ts`, `domain-coverage-gql-types.ts`, `domain-coverage.test.ts`, `canonical-glossary.md`. Anything else is scope creep.
- [ ] **PM2** Run preflight from `cloud/`. **All required (no skips):**
  - `npm run lint --workspace @valuerank/shared` (no edits, but transitively imported)
  - `npm run lint --workspace @valuerank/db` (no edits, but transitively imported)
  - `npm run lint --workspace @valuerank/api` (edits)
  - `npm run test --workspace @valuerank/api` (edits + new tests)
  - `npm run build --workspace @valuerank/api` (edits)
  - `npm run lint --workspace @valuerank/web` (no edits, consumes GQL types)
  - `npm run test --workspace @valuerank/web` (no edits, consumes GQL types)
  - `npm run build --workspace @valuerank/web` (no edits, consumes GQL types)
  - DB test setup: skip `npm run db:test:setup` since this slice does not touch the DB schema or migrations.
  All 8 lint/test/build commands MUST pass green. Record pass/fail per command in PR description.
- [ ] **PM3** Pre-deploy SQL spot-checks against prod (read-only, via Railway DB):
  - **Q1** (R3 verification — guard against ad-hoc runs with valueFirst): `SELECT COUNT(*) FROM runs WHERE config->>'jobChoiceLaunchMode' != 'PAIRED_BATCH' AND config ? 'jobChoiceValueFirst' AND status='COMPLETED' AND deleted_at IS NULL;` Expected: 0.
  - **Q2** (R5 verification — guard against >2 directions in any cell): `SELECT definition_id, COUNT(DISTINCT BTRIM(config->>'jobChoiceValueFirst')) AS dirs FROM runs WHERE status='COMPLETED' AND deleted_at IS NULL AND (config->>'isAggregate')::boolean IS NOT TRUE AND BTRIM(COALESCE(config->>'jobChoiceValueFirst',''))<>'' GROUP BY definition_id HAVING COUNT(DISTINCT BTRIM(config->>'jobChoiceValueFirst')) > 2;` Expected: 0 rows.
  - **Q3** (Risk verification — guard against retry duplicates): `SELECT config->>'jobChoiceBatchGroupId' AS bgid, config->>'jobChoiceValueFirst' AS vf, COUNT(*) FROM runs WHERE status='COMPLETED' AND deleted_at IS NULL AND (config->>'isAggregate')::boolean IS NOT TRUE GROUP BY 1,2 HAVING COUNT(*) > 1;` Expected: 0 rows. If non-zero, those cells will see `pairedBatchCount` decrease.
  - **Q4** (R2 verification — pre-record cells that will shift): pick at least 3 value pairs with non-trivial completed runs; for each, record current `pairedBatchCount` from the live Domain Overview, expected post-deploy value (per spec semantic), and category (clean / asymmetric / legacy-only). Save in PR description.
- [ ] **PM4** PR description includes:
  - Summary linking to spec/plan/closeout artifacts.
  - "Validation" section listing exact preflight commands run with pass/fail.
  - "Pre-deploy verification" section with results from PM3 Q1–Q4.
  - "Post-deploy verification plan" copying spec §9 step list.
- [ ] **PM5** PR opened against `chrislawcodes/valuerank` (per AGENTS.md). Not merged. Left for human review.

---

## Parallel analysis

- T1.1 + T1.2 + T1.3 must be sequential (T1.3 imports the helper symbols from T1.1/T1.2).
- T2.1 → T2.5 must be sequential (they all touch `domain-coverage.ts`).
- T2.6 (GQL types) and T2.7 (glossary) **can run in parallel** with T2.8 (integration tests): they touch disjoint files. **[P: cloud/apps/api/src/graphql/queries/domain-coverage-gql-types.ts, docs/canonical-glossary.md]**

No cross-slice parallelism within this small a refactor — T1 and T2 are tightly coupled through the helper signature change.

---

## Test-coverage parity (old → new mapping)

The old `selectPrimaryDefinitionCounts` test cases at `domain-coverage.test.ts:132–207` cover specific behaviors. The new helper covers them in the new model — explicit mapping:

| Old test (lines) | What it asserted | New equivalent in `selectPrimaryDefinitionCountsByDirection` tests | Notes |
|---|---|---|---|
| 90–105 "returns the total cell counts" | Sums batchCount across companions; picks primary by higher pairedBatchCount | "Both directions equal" + "Tie-break on directionCount" cases (plan §3.5 first table) | Sum-batchCount semantic preserved; tie-break replaced with directionCount-based per spec A8b |
| 107–122 "prefers the higher paired count when batch counts tie" | Tie-break on pairedBatchCount when batchCount ties | "Tie-break on directionCount" case | Old tie-break replaced; document in test that the secondary tie-break is now `directionCount` not `pairedBatchCount` per spec A8b |
| 124–130 "returns zero for an empty definition list" | `[]` → all zeros | "Empty" case (plan §3.5) | Direct port |
| 132–155 "deduplicates shared group IDs across companion definitions" | A_first + B_first share group IDs; counts unique groups | "Cross-definition pair (companion structure)" case (plan §3.5) | Same scenario, new model: companion definitions naturally split into disjoint direction sets, merging gives `min(|A|,|B|)` |
| 157–176 "counts ungrouped runs separately from grouped runs" | Ungrouped runs get their own `1` increments | I3-style legacy case + the `__ungrouped__:<runId>` sentinel ensures each ungrouped run survives (plan §3.5) | Coverage of the ungrouped-run path preserved via the sentinel |
| 178–207 "deduplicates with samplesPerScenario increments across companions" | sps≠1 still produces `1` per group (post-PR #756 semantic) | Implicit in all new cases — the new helper counts groups, not increments. samplesPerScenario plays no role in pairedBatchCount per the post-PR-#756 semantic. | Add a one-liner test asserting `samplesPerScenario` is irrelevant to the new helper (a tripwire that fails if someone re-adds the multiplication) |

**T1.3 must add the tripwire test:** `it('ignores samplesPerScenario — directional count is per (group, direction), not per sample', () => { ... })` constructing a directional map where the underlying runs would have varied sps; assert the helper output ignores it.

## Notes

- **Diff size discipline:** Slice 1 ≤ 150 lines, Slice 2 ≤ 250 lines. Both well under the ~300-line `[CHECKPOINT]` cap. If implementation grows beyond these bounds (e.g. test fixtures balloon), split T2.8 (integration tests) into its own checkpoint between T2.6/2.7 and T2.9.
- **Forbidden files** (spec §10, repeated for emphasis): do not touch `start.ts`, `lifecycle.ts`, `plan-slots.ts`, `execute-runs.ts`, `anomaly-detection.ts`, `aggregate/*`, `circumplex/*`, `types/run.ts`, any web file, `CLAUDE.md`, `AGENTS.md`, `MEMORY.md`. If implementation discovers a need to edit any of these, **stop** and re-open the spec.
