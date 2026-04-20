# Tasks: Remove `decisionCode` From the Codebase

**Slug:** `remove-decision-code`

Per `plan.md`, 10 waves. Each ends with a `[CHECKPOINT]` so the factory review triad runs on the slice diff before the next wave starts.

---

## Slice W1 — Derivation helper

**Estimated diff:** ~80 lines.
**Files:** `cloud/apps/api/src/graphql/queries/domain/scale-code-from-canonical.ts` (new), `cloud/apps/api/tests/graphql/queries/scale-code-from-canonical.test.ts` (new).

- [ ] **T1.1** Verify `CachedWinnerFirstDecision.cacheVersion: 1 | 2` + `decisionState` includes `"refusal"` in `decision-model-types.ts` (already done on this branch in `ab7dcd53`). If missing, add. No other type changes.
- [ ] **T1.2** Create `scale-code-from-canonical.ts` exporting `scaleCodeFromCanonical(canonical: CachedWinnerFirstDecision, pair: DomainAnalysisValuePair, orientationFlipped: boolean): '1' | '2' | '3' | '4' | '5' | 'refusal' | 'unknown'`. JSDoc block lists approved callers: `cloud/scripts/job-choice-bridge-report-lib.ts` and its tests. Body implements the inverse mapping of the migration's case 3 logic.
- [ ] **T1.3** Unit tests: all 4 decisionStates × both orientations × both pair orderings. Verify return values for refusal and unknown. Verify neutral maps to `'3'`.
- [ ] **T1.4** `npx turbo lint --filter=@valuerank/api` and `npx vitest run apps/api/tests/graphql/queries/scale-code-from-canonical.test.ts` pass.
- [ ] **T1.5** Commit: `feat(decision-cache): add scaleCodeFromCanonical helper`.

**[CHECKPOINT W1]**

---

## Slice W2 — TS write path + cache-hit validator

**Estimated diff:** ~180 lines.
**Files:** `cloud/apps/api/src/queue/handlers/summarize-persistence.ts`, `summarize-transcript.ts`, `summarize-types.ts`, `cloud/apps/api/tests/queue/handlers/summarize-transcript.test.ts`.

- [ ] **T2.1** Update `SummaryCacheSummary` type in `summarize-types.ts`: remove `decisionCode` and `decisionCodeSource` from the shape.
- [ ] **T2.2** Update `isSummaryCacheSummary` at `summarize-types.ts:96` to NOT require `decisionCode` / `decisionCodeSource`. Require only: `summary` object shape, `canonicalDecision` present & valid via `isWinnerFirstSummaryCache`, any existing parser-evidence fields.
- [ ] **T2.3** Update `isWinnerFirstSummaryCache` to accept both `cacheVersion: 1` and `cacheVersion: 2`.
- [ ] **T2.4** Update `buildWinnerFirstSummaryCache` in `summarize-transcript.ts:116` to write `cacheVersion: 2` on fresh caches.
- [ ] **T2.5** Update `buildSummaryCacheRecord` / persistence in `summarize-persistence.ts` to stop spreading `decisionCode` / `decisionCodeSource` into `summaryCache.summary`. Silently ignore `decisionSource` from the Python worker output contract.
- [ ] **T2.6** Tests: assert written summary has no `decisionCode` / `decisionCodeSource`. Assert fresh writes emit `cacheVersion: 2`. Assert validators accept v2 shape. Assert validators reject shapes missing `canonicalDecision`.
- [ ] **T2.7** Preflight: `npx turbo lint test build --filter=@valuerank/api` passes.
- [ ] **T2.8** Commit: `feat(decision-cache): stop persisting decisionCode; write v2 cache`.

**[CHECKPOINT W2]**

---

## Slice W3 — Python worker emission

**Estimated diff:** ~200 lines.
**Files:** `cloud/workers/summarize.py`, `cloud/workers/summarize_extract.py`, `cloud/workers/stats/decision_model.py`, `cloud/workers/tests/test_summarize.py`.

- [ ] **T3.1** Identify the Python worker's output dict construction (look for `decisionCode` and `decisionSource` keys). Remove those keys from the dict the worker returns. Keep internal scale-position detection — the parser still uses it to pick `matchedLabel`.
- [ ] **T3.2** Emit `decisionMetadata["refusal"] = True` at the top level of the returned decisionMetadata dict when `extract_decision_code_from_text()` returns the refusal sentinel. Omit the field (or emit `False`) otherwise. This is the new first-class refusal signal replacing `decisionCode == "refusal"`.
- [ ] **T3.3** **Test rewrite, per-parser-branch coverage with semantic preservation** (Gemini HIGH finding):
  - Each existing test keyed on `decisionCode` is re-evaluated for the semantic it tests:
    - `decisionCode == "5"` on "Strongly support X" → assertion on `matchedLabel` + eventual canonical via integration test.
    - `decisionCode == "refusal"` → assertion on `decisionMetadata["refusal"] == True`.
    - `decisionCode == "other"` / None → assertion on `parseClass == "unparseable"` and `decisionMetadata.get("refusal")` falsy.
  - Every parser branch has at least one surviving test:
    - exact-match
    - leading-match
    - relaxed (filler-words)
    - distinctive-tail
    - refusal
    - unparseable
- [ ] **T3.4** Run `pytest cloud/workers/tests/test_summarize.py`. All pass. Document any tests that are deleted (and why) in the PR body.
- [ ] **T3.5** Commit: `feat(decision-cache): python worker emits decisionMetadata.refusal; stops emitting decisionCode`.

**[CHECKPOINT W3]**

---

## Slice W4 — Read path rewires

**Estimated diff:** ~300 lines.
**Files** (per plan.md W4, comprehensive list): `apps/api/src/services/unresolvable-count.ts`, `services/analysis/aggregate/*`, `services/run/summarization.ts`, `queue/handlers/analyze-basic-data.ts`, `graphql/queries/domain/analysis/value-detail.ts`, `condition-transcripts.ts`, `domain-analysis-aggregation.ts`, `types-detail.ts`, `graphql/queries/models-consistency.ts`, `graphql/queries/domain/decision-model.ts`, `decision-model-types.ts`, `services/decision-model-shadow-validation.ts`, `cli/decision-model-shadow-validation.ts`, plus their test files.

- [ ] **T4.1** Remove `decisionCode` field from `TranscriptDecisionModelInput` type in `decision-model-types.ts`. **Note the two resolvers:** `resolveTranscriptDecisionModel` (the public wrapper at `decision-model.ts:95`, used by GraphQL resolvers and analysis) takes `TranscriptDecisionModelInput` and calls the internal `resolveCanonicalDecision` (at `decision-model.ts:120`). We remove `decisionCode` from the wrapper's input type. The inner function's input type (`DecisionModelInput`) does not have `decisionCode`.
- [ ] **T4.2** Update every call site that passes `decisionCode` into `resolveTranscriptDecisionModel`. Grep pattern: `resolveTranscriptDecisionModel\(` (the wrapper, not the inner). Known hits include `types-detail.ts:122`, both shadow-validation files (`services/decision-model-shadow-validation.ts`, `cli/decision-model-shadow-validation.ts`).
- [ ] **T4.2a** Teach `resolveCanonicalDecision` the refusal signal: early-check `decisionMetadata.refusal === true` before parseClass gate; return refusal canonical (`decisionState: "refusal"`, `direction: "refusal"`, `strength: "unknown"`, keys null). Add `buildRefusalCanonicalDecision` helper or extend `buildUnknownCanonicalDecision`. Write a dedicated test.
- [ ] **T4.3** Rewire `unresolvable-count.ts`: replace `decisionCodeSource` filter with `canonicalDecision.decisionState`.
- [ ] **T4.4** Rewire analysis aggregation: replace `decisionCode` groupings with `canonicalDecision.decisionState` + `.strength`. Files: `aggregate-logic.ts`, `aggregate-preparation.ts`, `aggregate-transcript-builder.ts`, `aggregate-fingerprint-payload.ts`, `aggregate-helpers.ts`, `variance.ts`, `contracts.ts`.
- [ ] **T4.5** Rewire `analyze-basic-data.ts` queue handler.
- [ ] **T4.6** Rewire GraphQL query files: `value-detail.ts`, `condition-transcripts.ts`, `domain-analysis-aggregation.ts`, `types-detail.ts`, `models-consistency.ts`.
- [ ] **T4.7** Stop `services/run/summarization.ts:234` from writing `decisionCode: null` to the top-level column on reprocess.
- [ ] **T4.8** Rewire both shadow-validation files to read and write canonical fields.
- [ ] **T4.9** Update every affected test file. Bulk approach: find tests that assert on `decisionCode` in these modules, rewire assertions to `canonicalDecision.*`.
- [ ] **T4.10** Preflight: lint + test + build passes for api workspace.
- [ ] **T4.11** Commit: `feat(decision-cache): rewire internal reads to canonicalDecision`.

**[CHECKPOINT W4]**

---

## Slice W5 — External APIs (MCP, CSV, OData)

**Estimated diff:** ~250 lines.
**Files:** `apps/api/src/mcp/tools/get-run-results.ts`, `get-transcript-summary.ts`, `get-unsummarized-transcripts.ts`, `services/mcp/formatters.ts`, `services/export/decision-display.ts`, `services/export/xlsx/types.ts`, `routes/export/runs.ts`, plus their tests.

- [ ] **T5.1** MCP tools: remove `decisionCode` field from response payloads. Internal filter logic rewires to `canonicalDecision.*`.
- [ ] **T5.2** `get-unsummarized-transcripts`: replace `decisionCode` filter with `canonicalDecision.decisionState === 'unknown'`.
- [ ] **T5.3** CSV export: remove `decisionCode` column from column list. DO NOT add any replacement scale-code column — the CSV export is NOT on the `scaleCodeFromCanonical` allowlist (FR-008). Consumers migrate to reading `canonicalDecision.favoredValueKey` / `.strength` / `.decisionState`.
- [ ] **T5.4** OData `$metadata`: remove `decisionCode` field from the transcript entity schema.
- [ ] **T5.5** Tests: assert each response / export shape does NOT contain `decisionCode`. Negation assertions. File fixtures updated to match.
- [ ] **T5.6** Preflight passes.
- [ ] **T5.7** Commit: `feat(decision-cache): remove decisionCode from external API response shapes`.

**[CHECKPOINT W5]**

---

## Slice W6 — GraphQL schema + web regen

**Estimated diff:** ~150 lines + generated file churn.
**Files:** `apps/api/src/graphql/types/transcript.ts`, `run.ts`, `apps/web/src/generated/graphql.ts` (regen), operations in `apps/web/src/api/operations/*.ts`.

- [ ] **T6.1** Remove `decisionCode` and `decisionCodeSource` fields from the `Transcript` GraphQL type in `transcript.ts` (lines 45-46, 106-107).
- [ ] **T6.2** Remove any reference to those fields in `run.ts` GraphQL types.
- [ ] **T6.3** Remove any operation fragments in `apps/web/src/api/operations/domainAnalysis.ts` / `runs.ts` that select `decisionCode`.
- [ ] **T6.4** Run GraphQL codegen to refresh `apps/web/src/generated/graphql.ts`. Commit generated file.
- [ ] **T6.5** Fix any TypeScript errors that surface from the regenerated types (those will be captured in W7).
- [ ] **T6.6** Preflight passes.
- [ ] **T6.7** Commit: `feat(decision-cache): drop decisionCode from GraphQL Transcript type`.

**[CHECKPOINT W6]**

---

## Slice W7 — Web consumers

**Estimated diff:** ~250 lines.
**Files:** `apps/web/src/components/runs/TranscriptRow.tsx`, `TranscriptList.tsx`, `TranscriptViewer.tsx`, `RunResults.tsx`, `apps/web/src/pages/RunDetail/useRunDetailHandlers.ts`, `apps/web/src/hooks/useRunMutations.ts`, `apps/web/src/utils/transcriptDecisionModel.ts`, `apps/web/src/pages/DomainAnalysisValueDetail.tsx`, plus their tests.

- [ ] **T7.1** `transcriptDecisionModel.ts`: remove every `decisionCode` read path. Display helper always reads `canonicalDecision`.
- [ ] **T7.2** `TranscriptRow.tsx`: remove the legacy `getLegacyDecisionDisplay` branch that reads `content.summary.decisionCode`. Display always uses canonical.
- [ ] **T7.3** `TranscriptList.tsx`, `TranscriptViewer.tsx`, `RunResults.tsx`: rewire reads.
- [ ] **T7.4** `useRunDetailHandlers.ts`, `useRunMutations.ts`: remove `decisionCode` from mutation variables.
- [ ] **T7.5** `DomainAnalysisValueDetail.tsx`: rewire aggregations.
- [ ] **T7.6** Update every affected web test — fixtures and assertions.
- [ ] **T7.7** Preflight: `npx turbo lint test build --filter=@valuerank/web` passes.
- [ ] **T7.8** Commit: `feat(decision-cache): web reads canonicalDecision only`.

**[CHECKPOINT W7]**

---

## Slice W8 — Manual override mutation reshape

**Estimated diff:** ~220 lines.
**Files:** `apps/api/src/graphql/mutations/run/maintenance.ts`, `apps/api/tests/graphql/mutations/run.test.ts`, `apps/web/src/hooks/useRunMutations.ts`, `apps/web/src/components/runs/TranscriptRow.tsx` (override dispatch site).

- [ ] **T8.1** Change mutation GraphQL input from `{decisionCode}` to `{decisionState, favoredValueKey?, strength?}` per plan.md W8 table.
- [ ] **T8.2** Server-side validation: reject `decisionState === "resolved"` without `favoredValueKey` AND `strength`. Reject `favoredValueKey` not in the pair. Derive `direction` from `favoredValueKey === pair.valueA`.
- [ ] **T8.3** Stop the mutation from writing to the legacy top-level `transcripts.decision_code` column.
- [ ] **T8.4** Web: UI dropdown still presents the same 5 visual options; dispatch maps them to the new `{decisionState, favoredValueKey?, strength?}` shape at the site that calls the mutation.
- [ ] **T8.5** Tests: all four states × happy path × invalid payloads (mismatched key, missing strength, etc.). Assert the legacy column is NOT touched on success.
- [ ] **T8.6** Preflight passes.
- [ ] **T8.7** Commit: `feat(decision-cache): reshape manual override mutation input`.

**[CHECKPOINT W8]**

---

## Slice W9 — Migration script rewrite

**Estimated diff:** ~300 lines.
**Files:** `cloud/scripts/backfill-canonical-v2-migration.ts` (complete rewrite), `cloud/scripts/__tests__/backfill-canonical-v2-migration.test.ts` (complete rewrite).

- [ ] **T9.1** Delete the old `canonicalFromDecisionCode` function and its tests. No truth-table derivation.
- [ ] **T9.2** Import `resolveCanonicalDecision`, `buildRawDecisionEvidence`, `extractValuePair`, `extractCachedWinnerFirstDecision`, `extractValueStatementsFromSnapshot`, `extractLabelPrefixFromSnapshot` via relative path: `import { … } from '../apps/api/src/graphql/queries/domain/decision-model.js'` and `'../apps/api/src/graphql/queries/domain/decision-model-helpers.js'`. This matches the relative-path pattern used by other cross-workspace scripts (e.g. `cloud/scripts/job-choice-bridge-report.ts` if it already does this, otherwise set the precedent). Do NOT import via `@valuerank/api` — that package alias is not published.
- [ ] **T9.3** Per-row **classification** (addresses round 6 HIGH: resolver preserves stale-but-resolved rows otherwise):
  - Compute `hasGoodCanonical` = `existingCanonical != null` AND `decisionState ∈ {"resolved", "neutral", "refusal"}` AND `strength !== "unknown"` AND `direction !== "unknown"`.
  - If `hasGoodCanonical` → **preserve branch**: keep canonical verbatim; tag `preserved`.
  - Else → **re-derive branch**: build `DecisionModelInput` with `cachedDecision: null` (force raw re-derivation); call `resolveCanonicalDecision(input)`; use its return value. Tag `resolver-recovered` if the resolver produced a resolved/neutral/refusal canonical, else `synthesized-unknown` if it returned unknown.
- [ ] **T9.4** Refusal override: if `summary.decisionCode === "refusal"` AND resolver returned `decisionState === "unknown"` (historical rows pre-A9), override to refusal canonical. Tag `refusal-tagged`.
- [ ] **T9.5** Strip `decisionCode` + `decisionCodeSource` from summary. Write `cacheVersion: 2` on the resulting canonical.
- [ ] **T9.6** Edge cases: (a) `pairFromSnapshot` null → strip + bump + synthesize unknown canonical; tag `missing-snapshot-stripped`. (b) All preflight preservation guards fail AND resolver returns unknown AND no decisionCode refusal → tag `synthesized-unknown`.
- [ ] **T9.7** Categorized counts report: `preserved`, `resolver-recovered`, `refusal-tagged`, `synthesized-unknown`, `missing-snapshot-stripped`, `already-v2`, `errors`.
- [ ] **T9.8** Tests: (a) preserve branch — good canonical round-trips unchanged; (b) re-derive branch — stale `strength: "unknown"` becomes resolved via raw evidence; (c) refusal override — historical refusal row ends up `decisionState: "refusal"`; (d) missing-snapshot — stripped but no canonical recovery; (e) fresh post-A9 row with `decisionMetadata.refusal: true` round-trips correctly via the resolver (integration test that actually invokes `resolveCanonicalDecision`).
- [ ] **T9.9** Preflight: vitest runs green.
- [ ] **T9.10** Commit: `feat(decision-cache): migration classifies then delegates to resolver`.

**[CHECKPOINT W9]**

---

## Slice W10 — Script cleanup + SC-001 verification

**Estimated diff:** ~200 lines.
**Files:** delete `cloud/scripts/inspect-canonical-drift.ts`. Rewire `cloud/scripts/backfill-reparse-decisions.ts`, `cloud/scripts/reparse-decision-stdin.py`, `cloud/scripts/job-choice-bridge-report.ts`, `job-choice-bridge-report-lib.ts`, `__tests__/job-choice-bridge-report.test.ts`, `__tests__/job-choice-transform.test.ts`.

- [ ] **T10.1** Delete `inspect-canonical-drift.ts`. Also delete its test fixture if any.
- [ ] **T10.2** Rewire `backfill-reparse-decisions.ts` target filter to `canonicalDecision.decisionState === 'unknown'` (post-migration this is unambiguous — refusals are tagged `"refusal"`).
- [ ] **T10.3** Rewire `reparse-decision-stdin.py` input contract if it consumed `decisionCode`.
- [ ] **T10.4** Rewire `job-choice-bridge-report.ts` + `job-choice-bridge-report-lib.ts` to use `scaleCodeFromCanonical` helper. Update their tests.
- [ ] **T10.5** Run SC-001 verification: `git grep -n "decisionCode" cloud/apps/api/src cloud/apps/web/src cloud/workers cloud/scripts -- ':!cloud/scripts/analysis/**' ':!cloud/scripts/backfill-canonical-v2-migration.ts'`. Returns zero non-comment hits. (Negation assertions in test files are acceptable.)
- [ ] **T10.6** Full preflight sweep: `npx turbo lint test build --filter=@valuerank/shared --filter=@valuerank/db --filter=@valuerank/api --filter=@valuerank/web` and `pytest cloud/workers/tests/`.
- [ ] **T10.7** Commit: `chore(decision-cache): final script cleanup; SC-001 grep verification`.

**[CHECKPOINT W10]**

---

## Post-merge operational steps

These happen after the PR merges and deploys, not during implementation:

- [ ] **P1** Verify Railway deploy completes without error spike (15-min watch per SC-007).
- [ ] **P2** Run migration dry-run against prod: `DATABASE_URL=$PROD_URL npx tsx scripts/backfill-canonical-v2-migration.ts`. Review categorized counts.
- [ ] **P3** Run `--apply`: `DATABASE_URL=$PROD_URL npx tsx scripts/backfill-canonical-v2-migration.ts --apply`.
- [ ] **P4** SC-003 verification: `SELECT COUNT(*) FROM transcripts WHERE decision_metadata->'summaryCache'->'summary' ? 'decisionCode'` returns `0`.
- [ ] **P5** SC-004 verification: open 5 previously-dashed transcripts in the UI; each shows a resolved decision.
- [ ] **P6** Open follow-up mini-PR: drop the top-level `transcripts.decision_code` Postgres column.

---

## Review Reconciliation

- review: reviews/tasks.codex.execution-adversarial.review.md | status: pending | note: pending tasks checkpoint
- review: reviews/tasks.codex.dependency-order-adversarial.review.md | status: pending | note: pending tasks checkpoint
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: pending | note: pending tasks checkpoint
