# Tasks: Canonical Decision Cache v2 Tolerance + Migration

**Slug**: `decision-cache-v2-tolerance`

Two slices, one PR, one branch (`claude/decision-cache-v2-tolerance`). Each slice is independently shippable and under ~300 lines. Each ends in a [CHECKPOINT] for diff review.

---

## Slice 1 — Validator + type widening

**Estimated diff**: ~60 lines across 3 files.
**Files touched**: `cloud/apps/api/src/graphql/queries/domain/decision-model-types.ts`, `cloud/apps/api/src/graphql/queries/domain/decision-model-helpers.ts`, `cloud/apps/api/tests/graphql/queries/decision-model-helpers.test.ts`.

- [ ] **T1.1** Widen `CachedWinnerFirstDecision.cacheVersion` from `1` to `1 | 2` in `decision-model-types.ts`.
- [ ] **T1.2** Widen `CachedWinnerFirstDecision.decisionState` from `'resolved' | 'neutral' | 'unknown'` to `'resolved' | 'neutral' | 'unknown' | 'refusal'` in the same file.
- [ ] **T1.3** Update `isCachedWinnerFirstDecision` in `decision-model-helpers.ts` to accept `cacheVersion ∈ {1, 2}` and `decisionState ∈ {"resolved", "neutral", "unknown", "refusal"}`. The rejection on malformed inputs stays. Preserve existing branch structure — this is the minimal widening.
- [ ] **T1.4** Add 6 unit tests to `decision-model-helpers.test.ts`:
  - Accepts `v2 + resolved + strong + favoredValueKey`.
  - Accepts `v2 + refusal + unknown + null`.
  - Accepts `v1 + refusal + unknown + null` (backward-tolerant refusal on legacy cacheVersion).
  - Rejects `cacheVersion: 3` (future-version protection).
  - Rejects `v2 + decisionState: "bogus"`.
  - Rejects `v2 + resolved` with `favoredValueKey: null` (existing invariant preserved for resolved rows).
- [ ] **T1.5** Run `npx turbo lint build --filter=@valuerank/api` and `npx vitest run apps/api/tests/graphql/queries/decision-model-helpers.test.ts` — both pass.
- [ ] **T1.6** Commit: `feat(decision-cache): accept cacheVersion 2 and decisionState 'refusal' in validator`.

**[CHECKPOINT]** Diff review before Slice 2 starts. Expected ~60 lines, low risk, purely additive.

---

## Slice 2 — Migration script + derivation tests

**Estimated diff**: ~280 lines across 2 new files.
**Files touched**: `cloud/scripts/backfill-canonical-v2-migration.ts` (new), `cloud/scripts/__tests__/backfill-canonical-v2-migration.test.ts` (new).

- [ ] **T2.1** Create `cloud/scripts/backfill-canonical-v2-migration.ts` skeleton:
  - CLI: `--dry-run` (default), `--apply`, `--domain=<normalizedName>`, `--limit=<n>`.
  - Connects via `@valuerank/db` Prisma client (same pattern as `backfill-reparse-decisions.ts`).
  - Logger from `@valuerank/shared`.
- [ ] **T2.2** Export pure helper `canonicalFromDecisionCode(decisionCode, pair, orientationFlipped)` implementing the truth table from the spec (5 decisionCode values × 2 orientations + "refusal" + "other" + missing). Must always return `cacheVersion: 2`.
- [ ] **T2.3** Implement `pairFromSnapshot(definitionSnapshot)` helper: extracts `{valueA, valueB}` from `.components.value_first.token` and `.components.value_second.token`. Returns null on malformed input (null, missing components, non-string token). Must not throw.
- [ ] **T2.4** Implement per-row processor with the control flow from the plan:
  - `decisionCode` present → derive from truth table + pair + orientationFlipped → category `drifted` or `no-change-with-code`.
  - `decisionCode` absent AND `cacheVersion != 2` → preserve canonical verbatim, bump cacheVersion → category `v1-upgrade-preserving-canonical`.
  - `decisionCode` absent AND `cacheVersion == 2` → no-op, category `already-v2`.
  - Pair extraction failure → category `missing-snapshot`, skip.
- [ ] **T2.5** Query builder reads `transcripts.decision_metadata`, `transcripts.scenario_id`, `transcripts.definition_snapshot`. Scenario's `orientation_flipped` read via `scenarios` table (join by `scenario_id`).
- [ ] **T2.6** Per-row write: single `transcript.update({where: {id}, data: {decisionMetadata: ...}})` call with the updated `summaryCache.summary`. `decisionCode` and `decisionCodeSource` stripped from the summary (not written back). Top-level `transcripts.decision_code` column NOT touched.
- [ ] **T2.7** Report categorized counts at the end of both dry-run and apply. Progress every 100 rows during apply.
- [ ] **T2.8** Create `cloud/scripts/__tests__/backfill-canonical-v2-migration.test.ts` — 22 truth-table cases for `canonicalFromDecisionCode`:
  - `"5"` × {flipped: false, true} × expected `{direction favor_first/second, strong, resolved, favoredValueKey = valueA/valueB}`.
  - `"4"` × {flipped: false, true} × expected lean variants.
  - `"3"` × {flipped: false, true} × expected neutral (same output both orientations).
  - `"2"` × {flipped: false, true} × expected lean variants.
  - `"1"` × {flipped: false, true} × expected strong variants.
  - `"refusal"` × {flipped: false, true} × expected `{decisionState: "refusal", strength: "unknown", favoredValueKey: null}` (same output both orientations).
  - `"other"` × {flipped: false, true} × expected `{decisionState: "unknown", ...null}`.
  - `null` / `undefined` / `""` × {flipped: false, true} × expected `{decisionState: "unknown", ...null}`.
- [ ] **T2.9** Test invariant: every return has `cacheVersion === 2` literally.
- [ ] **T2.10** Test `pairFromSnapshot`:
  - Valid snapshot → returns `{valueA, valueB}`.
  - Null snapshot → returns null.
  - Missing `components` → returns null.
  - Missing `value_first` → returns null.
  - Non-string token → returns null.
  - Does not throw on any input (including non-object, non-JSON-like, arbitrary types).
- [ ] **T2.11** Run `npx vitest run cloud/scripts/__tests__/backfill-canonical-v2-migration.test.ts` — all 28+ tests pass.
- [ ] **T2.12** Smoke-test the script against an empty DB / dev DB (optional, but validates CLI wiring).
- [ ] **T2.13** Commit: `feat(decision-cache): add migration script to upgrade cached canonicals to v2`.

**[CHECKPOINT]** Diff review of Slice 2. Expected ~280 lines.

---

## Post-merge operational steps

These happen after the PR merges, not during implementation.

- [ ] **P1** Run migration dry-run against prod: `DATABASE_URL=$PROD_URL npx tsx scripts/backfill-canonical-v2-migration.ts`. Verify categorization counts look reasonable (no zero-visited, no unexpected `missing-snapshot` explosion).
- [ ] **P2** Apply against prod: `DATABASE_URL=$PROD_URL npx tsx scripts/backfill-canonical-v2-migration.ts --apply`.
- [ ] **P3** Re-run dry-run — expect `drifted: 0`, `no-change-with-code: 0`, `already-v2 ~= total`, `missing-snapshot` unchanged from step 1.
- [ ] **P4** Verify `SELECT COUNT(*) FROM transcripts WHERE decision_metadata->'summaryCache'->'summary' ? 'decisionCode'` returns 0 (SC-003).
- [ ] **P5** Verify cacheVersion distribution: only `"2"` (plus any `missing-snapshot` residual).
- [ ] **P6** Open one analysis page in the web UI — no regression.
- [ ] **P7** Open PR #2 (decision-cache-single-source — rewire consumers, reshape external APIs, remove `cacheVersion: 1` from types).

---

## Dependencies

- No new Prisma migration needed (data-only, no schema change).
- No new environment variables.
- Reuses existing `@valuerank/db` and `@valuerank/shared` packages.
- Does not depend on PR #706 (feature-factory workflow fixes) being merged, but benefits from it.

## Parallel opportunities

None meaningful. Slice 1 is blocking for Slice 2 (Slice 2's migration tests import the updated types). Both are small enough that serial execution is fine.

## Out of scope for this PR

See plan.md "Deferred to PR #2" section. Do not scope-creep:

- No write-path changes.
- No consumer rewires.
- No type removals (only additions).
- No external API changes.
- No manual-override reshape.
- No Python worker changes.

## Review Reconciliation

- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted.
- review: reviews/plan.codex.architecture-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted.
