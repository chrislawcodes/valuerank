# Plan: Remove `decisionCode` From the Codebase

**Slug:** `remove-decision-code`
**Target:** scorched-earth removal of `decisionCode` from write path, read path, external APIs, types, tests, Python worker emission, and DB summaryCache content. See `spec.md` for full scope.

## Architecture Decisions

### A1 — Single-source-of-truth: `canonicalDecision`

After this PR, `canonicalDecision` is the only stored representation of a transcript's decision. Every internal consumer reads from it directly. Consumers that need the 1–5 scale position derive it on demand via an internal helper (see A3). No consumer reads `decisionCode`.

### A2 — Migration uses the production resolver (single source of truth)

Rejected: deriving canonical from `decisionCode + orientationFlipped` via a truth table. A dry-run showed ~123k false-positive "drifts" because the truth table is wrong for paired-v2 / job-choice-v2 probes.

Rejected: re-implementing the canonical derivation inside the migration script. That creates a second untested copy of production logic.

**Chosen:** the migration imports and calls the production `resolveCanonicalDecision` from `cloud/apps/api/src/graphql/queries/domain/decision-model.ts`, the exact function that serves live reads. The migration's wrapper adds: (1) always strip `decisionCode` + `decisionCodeSource` from summary regardless, (2) tag refusals as `decisionState: "refusal"` if the resolver doesn't already, (3) bump `cacheVersion: 2`, (4) synthesize unknown canonicals for the edge case of no canonical + insufficient evidence. The actual canonical derivation is delegated to the production resolver. Zero logic duplication. Any future change to derivation lands automatically in migrations.

### A3 — `scaleCodeFromCanonical` helper with allowlist

A single pure helper exists for internal paths that need the 1–5 number (currently only `job-choice-bridge-report-lib.ts` for a legacy CSV report). JSDoc callers allowlist documents approved call sites. External API emitters (MCP / CSV / OData / GraphQL resolvers) MUST NOT use it. Adding a new caller requires updating the allowlist — visible in code review.

### A4 — `cacheVersion 1 | 2` tolerance bridge kept in this PR

After migration `--apply` lands in prod, zero v1 rows should exist. But during the rolling deploy window and before `--apply` runs, readers may see both versions. Keep the union in this PR. A follow-up mini-PR (opened after SC-003 verifies zero v1) tightens to literal `2`.

### A5 — Legacy column reads removed, writes narrowed

`transcripts.decision_code` (top-level Postgres column, distinct from `summaryCache.summary.decisionCode`) has THREE current write sites: manual-override mutation, summarization reprocess in `services/run/summarization.ts`, and the Python-worker initial write path. This PR removes all READS of that column and rewires them to `canonicalDecision`. It also stops the manual-override write (W8) and the reprocess write (W4). The initial-write site (where the column is first populated from worker output) remains; its removal comes with the column drop in the follow-up PR.

### A6 — `backfill-reparse-decisions.ts` kept, not deleted

The script's purpose is re-running the Python parser on ambiguous transcripts — orthogonal to `decisionCode` removal. Rewired to read `canonicalDecision.decisionState == "unknown"` to identify targets and write `canonicalDecision` on recovery.

### A7 — Direction derivable from `favoredValueKey` + pair (no orientation needed)

Verified in production code at `decision-model.ts` line 217: `favoredValueKey === pair.valueA ? 'favor_first' : 'favor_second'`. `orientationFlipped` governs probe scale layout, not pair mapping. Manual override mutation accepts `{favoredValueKey, strength}` and server derives `direction` without loading scenario orientation.

### A8 — Migration reads parser evidence from top-level `decision_metadata`

`matchedLabel`, `parseClass`, `parsePath`, `parserVersion` live on `transcripts.decision_metadata` top-level, NOT inside `summaryCache.summary`. The unknown-recovery case must fetch from the right location.

## Wave Breakdown (Slices)

Each slice is a `[CHECKPOINT]`-bounded unit, roughly ≤ 300 lines changed, and is independently verifiable. Slices are ordered so that each wave's tests pass without depending on later waves.

### W1 — Derivation helper (types already widened on this branch)

**Files:** New file `cloud/apps/api/src/graphql/queries/domain/scale-code-from-canonical.ts` + its test.

**What:** The type widening (`CachedWinnerFirstDecision.cacheVersion: 1 | 2` + `decisionState` gains `"refusal"`) was already landed in a prior commit on this branch (`ab7dcd53`). Verify those are in place and the existing tests still pass. This slice only creates `scaleCodeFromCanonical(canonical, pair, orientationFlipped): '1'|'2'|'3'|'4'|'5'|'refusal'|'unknown'` with JSDoc callers-allowlist. Write unit tests covering all combinations.

**Estimated diff:** ~80 lines.

### W2 — TS write path + cache-hit validator (must precede Python to avoid contract break)

**Files:** `cloud/apps/api/src/queue/handlers/summarize-persistence.ts`, `summarize-transcript.ts`, `summarize-types.ts`, `cloud/apps/api/tests/queue/handlers/summarize-transcript.test.ts`.

**What:**

1. **`SummaryCacheSummary` type**: drop `decisionCode` and `decisionCodeSource` keys from the written shape. Also drop them from `buildSummaryCacheRecord()` at `summarize-persistence.ts:18-46` — that function hardcodes both fields into every persisted summaryCache record.
2. **`isSummaryCacheSummary` validator** (critical): today at `summarize-types.ts:102-104` it requires both `decisionCode` AND `decisionCodeSource` to be present strings for a cache row to be considered valid. Update to NOT require these fields. Otherwise every post-migration row will be rejected as malformed and the cache-hit path will silently miss on every transcript.
3. **`isWinnerFirstSummaryCache` validator**: today it only accepts `cacheVersion: 1`. Update to accept both `1` and `2` so migrated rows read correctly.
4. **`buildWinnerFirstSummaryCache` writer** (critical): today at `summarize-transcript.ts:116` it hard-codes `cacheVersion: 1` on every fresh write. If we leave this, every summarize job after the migration reintroduces a v1 row and the migration never converges. Change to write `cacheVersion: 2` on all fresh caches. Also write `canonicalDecision` without `decisionCode` / `decisionCodeSource` siblings.
5. **Tolerant reads**: TS silently ignores any extraneous `decisionCode` / `decisionSource` / `decisionCodeSource` keys the Python worker still emits during the deploy window (default object-spread behavior).
6. **Tests**: assert fields are absent from the written summary; assert the validator accepts the new v2 shape; assert the writer emits `cacheVersion: 2`; assert the validator rejects malformed shapes (missing canonical, wrong types).

**Terminology note:** the Python worker emits the field as `decisionSource`; the TS layer maps it to `decisionCodeSource` when writing to `summaryCache.summary`. This slice removes both: the TS no longer accepts `decisionSource` from the worker contract, and no longer writes `decisionCodeSource` to the cache.

**Why this comes before Python (W3):** if Python stops emitting first but TS still requires the fields, summarize jobs break in prod between waves. TS-first means both orderings of deploy are safe.

**Estimated diff:** ~180 lines.

### W3 — Python worker: stop emitting `decisionCode` / `decisionSource`

**Files:** `cloud/workers/summarize.py`, `cloud/workers/summarize_extract.py`, `cloud/workers/stats/decision_model.py`, `cloud/workers/tests/test_summarize.py`.

**What:** Remove `decisionCode` and `decisionSource` keys from the worker's output dict (note: worker field is `decisionSource`, not `decisionCodeSource`). Keep internal scale-position detection — the parser still needs it to pick the best candidate label for `matchedLabel`. Python tests that previously asserted on `decisionCode` rewire to assert on `matchedLabel` / `parsePath` / `canonicalDecision` shape. **Risk call-out per Gemini's testability review:** `test_summarize.py` has dozens of edge-case tests keyed on `decisionCode`; those need careful rewriting. Budget time for this — not a pure mechanical rename. A sanity test for every parser branch (exact/leading/relaxed/distinctive-tail) must still exist and cover the same formats.

**Estimated diff:** ~200 lines.

### W4 — Read path rewires (analysis + services + shared resolver signature)

**Files:** `apps/api/src/services/unresolvable-count.ts`, `services/analysis/aggregate/variance.ts`, `aggregate-logic.ts`, `aggregate-preparation.ts`, `aggregate-transcript-builder.ts`, `aggregate-fingerprint-payload.ts`, `aggregate-helpers.ts`, `contracts.ts`, `queue/handlers/analyze-basic-data.ts`, `graphql/queries/domain/analysis/value-detail.ts`, `condition-transcripts.ts`, `domain-analysis-aggregation.ts`, `types-detail.ts`, `graphql/queries/models-consistency.ts`, `graphql/queries/domain/decision-model.ts`, `decision-model-types.ts`, `services/decision-model-shadow-validation.ts`, `cli/decision-model-shadow-validation.ts`, `services/run/summarization.ts`, plus their test files.

**What:**

1. **Remove `decisionCode` from the shared resolver signature.** `TranscriptDecisionModelInput` (at `decision-model-types.ts:93`) currently has a `decisionCode: string | null` field that the resolver body does NOT use. Remove the field from the type. Update every call site that passes it (most notably `types-detail.ts:122` which passes `transcript.decisionCode`). This is a single-source-of-truth fix — the resolver derives canonical from parser evidence, not from the redundant code.
2. **Replace every read of `decisionCode` / `decisionCodeSource`** with reads against `canonicalDecision.decisionState` / `.strength` / `.favoredValueKey`. Aggregation keys group by canonical, not scale position.
3. **Update `services/run/summarization.ts`** (the reprocess path at line 234) to stop writing `decisionCode: null` to the legacy top-level column. This is another write-site to that column beyond manual override; removing the read of the column is not enough — we also need to stop writing stale clears. The actual column drop still defers to the follow-up PR.

**Estimated diff:** ~300 lines.

### W5 — External APIs (MCP, CSV, OData)

**Files:** `apps/api/src/mcp/tools/get-run-results.ts`, `get-transcript-summary.ts`, `get-unsummarized-transcripts.ts`, `services/mcp/formatters.ts`, `services/export/decision-display.ts`, `services/export/xlsx/types.ts`, `routes/export/runs.ts`, plus their tests.

**What:** Remove `decisionCode` field from every response shape. No null-emitting compat — field is gone. Any internal derivation needed (e.g. aggregation bucket labels) goes through `scaleCodeFromCanonical` only if the caller is on the allowlist. Update tests to assert field absence.

**Estimated diff:** ~250 lines.

### W6 — GraphQL schema + generated types

**Files:** `apps/api/src/graphql/types/transcript.ts`, `run.ts`, `apps/web/src/generated/graphql.ts` (regenerated), `apps/web/src/api/operations/domainAnalysis.ts`, `runs.ts`.

**What:** Remove `decisionCode` field from `Transcript` and `Run`-adjacent GraphQL types. Regenerate web TS types. Update any residual operation fragments that select `decisionCode`.

**Estimated diff:** ~150 lines + generated-file churn.

### W7 — Web consumers

**Files:** `apps/web/src/components/runs/TranscriptRow.tsx`, `TranscriptList.tsx`, `TranscriptViewer.tsx`, `RunResults.tsx`, `apps/web/src/pages/RunDetail/useRunDetailHandlers.ts`, `apps/web/src/hooks/useRunMutations.ts`, `apps/web/src/utils/transcriptDecisionModel.ts`, `apps/web/src/pages/DomainAnalysisValueDetail.tsx`, plus their tests.

**What:** Rewire every web component that referenced `transcript.decisionCode` or `content.summary.decisionCode` to read `transcript.canonicalDecision.*`. Update display logic. Delete dead fallback branches that tried the 1–5 scale when canonical was missing.

**Estimated diff:** ~250 lines.

### W8 — Manual override mutation reshape

**Files:** `apps/api/src/graphql/mutations/run/maintenance.ts`, `apps/api/tests/graphql/mutations/run.test.ts`, `apps/web/src/hooks/useRunMutations.ts` (mutation variables), `apps/web/src/components/runs/TranscriptRow.tsx` (override dispatch site).

**What:** Change the mutation's GraphQL input type from `{decisionCode}` to `{decisionState, favoredValueKey?, strength?}` (addresses Gemini's LOW finding that `{favoredValueKey, strength}` alone cannot express all four decisionStates):

| `decisionState` input | Required fields | Resulting canonical |
|---|---|---|
| `"resolved"` | `favoredValueKey` + `strength` (must be `"strong"` or `"lean"`) | `{favoredValueKey, direction: derived, strength, decisionState: "resolved"}` |
| `"neutral"` | none | `{favoredValueKey: null, direction: "neutral", strength: "neutral", decisionState: "neutral"}` |
| `"unknown"` | none | `{favoredValueKey: null, direction: "unknown", strength: "unknown", decisionState: "unknown"}` |
| `"refusal"` | none | `{favoredValueKey: null, direction: "refusal", strength: "unknown", decisionState: "refusal"}` |

Server derives direction from `favoredValueKey` vs definition's value pair (`direction = favoredValueKey === pair.valueA ? favor_first : favor_second`); rejects `favoredValueKey` that matches neither. Does NOT write to the top-level `transcripts.decision_code` column. UI dropdown still presents the same visual options; mapping to new input shape is internal to the dispatch site.

**Estimated diff:** ~220 lines.

### W9 — Migration script (COMPLETE REWRITE: delegate to production resolver)

**Files:** `cloud/scripts/backfill-canonical-v2-migration.ts` (**rewrite — replace existing contents**), `cloud/scripts/__tests__/backfill-canonical-v2-migration.test.ts` (**rewrite — replace existing contents**).

**What:** The existing script on this branch uses `canonicalFromDecisionCode(decisionCode, pair, orientationFlipped)` — a naive truth table. That approach is **rejected** per architecture decision A2. This slice is a complete rewrite:
- Delete the old `canonicalFromDecisionCode` export entirely and its tests.
- **Import** `resolveCanonicalDecision` (and `buildRawDecisionEvidence`, `extractValuePair`, `extractCachedWinnerFirstDecision`) from `@valuerank/api` (via relative path resolution at the workspace level, since scripts sit outside the api workspace).
- For each row: build the same `DecisionModelInput` the live resolver receives at read time, call `resolveCanonicalDecision`, and write the returned canonical back to `summaryCache.summary`. Bump `cacheVersion: 2`. Strip `decisionCode` + `decisionCodeSource`.
- If the resolver returns `decisionState: "unknown"` for a row whose existing `summary.decisionCode === "refusal"`, override the returned canonical's `decisionState` to `"refusal"` (strength unchanged, favored keys nulled) — this is the only extra step beyond the resolver output, because the resolver doesn't know about the legacy refusal signal.
- For rows with no existing canonical AND the resolver also returns unknown, synthesize `{cacheVersion: 2, decisionState: "unknown", strength: "unknown", favoredValueKey: null, opposedValueKey: null, direction: "unknown"}`.
- For rows where `pairFromSnapshot` returns null (malformed): still strip + bump; write synthesized unknown canonical.
- Write fresh unit tests: (a) happy-path recovery via resolver, (b) refusal tagging override, (c) preserve-when-resolved (resolver returns same canonical), (d) missing-snapshot stripping, (e) malformed canonical synthesis. The tests should mock the resolver to verify we call through to it correctly — NOT re-test the resolver's logic (which has its own tests).

**Data source mapping** (explicit, addresses architecture review's Medium finding):
- The migration reads `matchedLabel`, `matchedText`, `responseExcerpt`, `parseClass`, `parsePath`, `parserVersion` from `transcripts.decision_metadata` **top-level** (not from `summaryCache.summary`). For the unknown-recovery case 3, the text candidate for `resolveValueKeyFromText` follows the same fallback chain as the production resolver at `decision-model.ts:184`: `matchedLabel ?? matchedText ?? responseExcerpt`. Using only `matchedLabel` would miss rows that have other evidence.
- `valueStatements` and `labelPrefix` are extracted from `transcripts.definition_snapshot` via `extractValueStatementsFromSnapshot` / `extractLabelPrefixFromSnapshot` (imported from `cloud/apps/api/src/graphql/queries/domain/decision-model-helpers.ts`).
- `pair` is extracted via `pairFromSnapshot(definitionSnapshot)`; returns null → case 1 (missing-snapshot-stripped).
- `orientationFlipped` is read from the joined `scenarios` table.

**Preserve-case validation** (addresses implementation review's Medium finding about locking in malformed canonicals): in case 4 (preserve verbatim), validate the existing `canonicalDecision` has required keys of correct types. If not — missing `favoredValueKey`/`strength`/`decisionState` keys or wrong types — treat as no-existing-canonical and synthesize a v2 unknown canonical (category: `synthesized-unknown`) rather than preserving the corrupt object.

**Operational sequencing** (addresses architecture review's HIGH finding about W9 runtime vs wave order): W9 only *creates* the script. The `--apply` run happens post-deploy, AFTER the write paths (W2+W3) have removed `decisionCode` emission. No race is possible because by the time `--apply` runs, no code path can write v1 rows anymore.

**Runs operationally:** dry-run default; `--apply` writes. Batched fetches (kept from current implementation) for throughput. Reports categorized counts per SC-002. Post-deploy verification per SC-003.

**Estimated diff:** ~300 lines.

### W10 — Script + final cleanup + SC-001 grep verification

**Files:** Delete `cloud/scripts/inspect-canonical-drift.ts`. Rewire `cloud/scripts/backfill-reparse-decisions.ts`, `cloud/scripts/reparse-decision-stdin.py`, `cloud/scripts/job-choice-bridge-report.ts`, `job-choice-bridge-report-lib.ts`, `__tests__/job-choice-bridge-report.test.ts`, `__tests__/job-choice-transform.test.ts`.

**What:** Final cleanup of scripts that referenced `decisionCode`. Run the SC-001 grep and verify zero hits in scoped paths. Update any stragglers.

**`backfill-reparse-decisions.ts` target filter** (addresses implementation review's Medium finding about refusal conflation): after migration, rows with `canonicalDecision.decisionState === "unknown"` are genuine parser failures only — refusals have been tagged as `decisionState: "refusal"` by the migration's case 2. So filtering on `decisionState === "unknown"` as the reparse target is now unambiguous. The rewired script uses that filter.

**Estimated diff:** ~200 lines.

## Risk Callouts

### R1 — Web/GraphQL resolver may bypass canonical-aware helper

Spec notes: production `resolveCanonicalDecision` in `decision-model.ts` already re-derives when cached canonical is `unknown`. The persistence of ~1,537 UI dashes implies either the GraphQL resolver for `Transcript.canonicalDecision` does a raw DB field pluck instead of going through `resolveCanonicalDecision`, OR the affected rows have `parseClass`/`matchedLabel` values that fail re-derivation preconditions. W6 MUST verify the resolver path before closing.

### R2 — Python / TS deploy race

Python workers that started before the new PR deployed may still write `decisionCode` in their output. TS persistence (W3) must silently drop extraneous keys rather than error. Safe by construction — TS already only cherry-picks the keys it wants.

### R3 — Migration against 278k rows

The script batches fetches (500 rows/batch, ~1–2k rows/sec observed in dry-run). Expected wall-clock ~3 minutes. Run dry-run against prod BEFORE `--apply`. Post-apply verification is SC-003 (SQL COUNT = 0) plus UI spot-check per US1 AC-4.

### R4 — Rolling deploy: brief mixed-version reader

During the ~5-minute Railway rolling deploy window, old readers may see v2 rows written by in-flight summaries; new readers may see v1 rows (before migration runs). Mitigated by A4: both tolerated for reads in this PR.

### R5 — Test fixture sprawl (~45 files)

Many tests hard-code `decisionCode` in fixtures. Bulk rewire via deliberate file-by-file updates in each wave, not a mass regex sweep. Final check: `git grep "decisionCode" cloud/apps/api/tests cloud/apps/web/tests` — remaining matches must all be negation assertions.

### R6 — External API break without heads-up

Per discovery Q1, external clients (MCP / CSV / OData) break with no grace period. Intentional. PR body flags this prominently.

## Dependencies Between Waves

- **W1** (helper) — no dependencies. Can land first.
- **W2** (TS write path) — depends on W1 for helper existence (only for allowlist references). Must land **before W3** so the TS layer tolerates Python emitting or not emitting the removed fields during deploy.
- **W3** (Python worker) — depends on W2. Python deploys can then safely stop emitting `decisionCode` / `decisionSource`.
- **W4** (read rewires) — depends on W1.
- **W5** (external APIs) — depends on W4.
- **W6** (GraphQL schema) — depends on W4 (server) and feeds W7 (web).
- **W7** (web) — depends on W6.
- **W8** (manual override) — depends on W4 and W6.
- **W9** (migration script creation) — depends on W1. Can be authored anytime after W1.
- **W10** (script cleanup + grep) — runs last; depends on W1-W9 being complete for the SC-001 grep to actually pass.

**Deploy-time ordering** (distinct from wave order):

1. Merge PR (all waves land simultaneously in one commit series).
2. Railway deploys — rolling; both old and new instances briefly coexist.
3. Post-deploy: run migration `--apply` against prod. Only at this point are v1 rows removed from the DB.
4. Post-deploy: operational verification per SC-003 (zero v1 rows) + SC-004 (UI spot-check on known-dashed transcripts).
5. Immediately open follow-up mini-PR to drop the top-level `transcripts.decision_code` column.

This sequencing means: no fresh v1 rows can be written after the deploy (W2+W3 prevent that). The migration only cleans up historical v1 rows. No race is possible between migration and live writes.

## Observability

Every slice's diff checkpoint runs the standard adversarial triad (Codex correctness + regression, Gemini quality) per the feature-factory lens set. The migration slice (W9) additionally requires a successful prod dry-run output captured in the PR body before merge.

## Rollback Plan

- **Code rollback:** single `git revert <merge-sha>` reverts all 10 waves. Works because the migration does not add new columns and does not require schema changes.
- **Data rollback:** the migration cannot be un-stripped (decisionCode is gone from the DB). This is intentional — the field is replaced by `canonicalDecision`, which contains all the information needed to re-derive `decisionCode` via `scaleCodeFromCanonical` if ever needed. If we had to fully undo, we would re-run the Python parser on the raw transcript content via `backfill-reparse-decisions.ts` to repopulate canonical evidence.

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: Round 3 accepted. HIGH SC-003 verification flaw -> SC-003 simplified to absolute 'zero rows with decisionCode' since case 1 now also strips. MEDIUM unresolvable-count.ts missed -> added to Explicit targets list in Scope. MEDIUM strength parse fallback -> unknown-recovery case 3 now requires parseJobChoiceStrengthFromText non-null as a precondition; partial upgrades forbidden (preserve instead). MEDIUM resolver already bypasses stale canonical -> new edge case acknowledges this and requires the implementation to verify the GraphQL resolver goes through the canonical-aware helper; US1 acceptance criterion 4 added as operational UI verification with specific transcript IDs from the drift ledger.
- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: Round 3 accepted. HIGH US1 preserve-vs-recover contradiction -> US1 acceptance criterion 1 fully rewritten to match the four-case processor: unknown-recovery runs when all preconditions hold, otherwise preserve. MEDIUM matchedLabel data source -> migration spec now says parser evidence is read from transcripts.decision_metadata TOP-LEVEL, not summaryCache.summary. MEDIUM missing-snapshot decisionCode residue -> case 1 changed to STRIP decisionCode + bump cacheVersion even when canonical upgrade is skipped, tagged as missing-snapshot-stripped. SC-003 now absolute: zero rows with decisionCode, no exceptions.
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: Round 3 accepted. HIGH migration code doesn't match spec -> expected; spec describes target; tasks.md implementation will rewrite backfill-canonical-v2-migration.ts from naive truth table to four-case processor. MEDIUM SC-003 missing-snapshot residue -> SC-003 now zero-rows absolute since case 1 also strips. MEDIUM manual override direction needs orientationFlipped -> NOT a bug. Direction is derivable from favoredValueKey plus pair alone without orientation; verified in production code at decision-model.ts line 217 ('favoredValueKey === pair.valueA ? favor_first : favor_second'). orientationFlipped only affects SCALE layout, not pair mapping. Spec explicitly states this in the four-case processor. LOW scaleCodeFromCanonical as legacy pathway -> mitigated by FR-008 allowlist; long-term goal is to rewrite job-choice-bridge-report to canonical aggregation, tracked as deferred. LOW unknown-recovery direction determination -> same as MEDIUM, derivable from favoredValueKey + pair.
- review: reviews/plan.codex.architecture-adversarial.review.md | status: accepted | note: Plan round 4 accepted. HIGH buildSummaryCacheRecord hardcodes decisionCode/decisionCodeSource -> W2 step 1 now explicitly names buildSummaryCacheRecord at summarize-persistence.ts:18-46 as a required update site in addition to the type shape itself.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: Plan round 4 accepted. MEDIUM W8 opposedValueKey + manualOverride provenance -> server derives opposedValueKey too (spec Key Entities section covers it); manual override provenance stays in decisionMetadata.manualOverride object which is untouched by this PR. MEDIUM decisionCodeSource broader retirement -> W2 step 1 extended to buildSummaryCacheRecord explicitly; W4 reads from types-detail.ts covered via the GraphQL type removal in W6; W8 drops the decisionCodeSource=manual write in favor of the existing manualOverride provenance object.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: Plan round 4 accepted. HIGH Python-TS numeric-only contract concern -> resolver body verified to NOT consume decisionCode for any derivation path; decisionCode on TranscriptDecisionModelInput is vestigial. Numeric parser branches identify a number internally for matchedLabel resolution but the final derivation goes through parsePath plus matchedLabel, not the raw number. Safe to remove without breaking numeric-only paths. HIGH migration script duplicates production logic -> ACCEPTED and MAJOR architectural improvement: A2 rewritten to delegate to production resolveCanonicalDecision; W9 and T9 rewritten to import and call it directly. Zero logic duplication. MEDIUM manual override test plan -> T8.5 expanded in a follow-up task to enumerate invalid-payload cases explicitly.
