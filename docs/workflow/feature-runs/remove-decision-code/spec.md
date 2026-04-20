# Spec: Remove `decisionCode` From the Codebase

**Slug:** `remove-decision-code`
**Status:** Authored — awaiting spec checkpoint

## Problem

Transcript decisions are currently stored in two overlapping, derivable-from-each-other formats inside `transcripts.decision_metadata.summaryCache.summary`:

- **Legacy `decisionCode`** — a string `"1" | "2" | "3" | "4" | "5" | "other" | "refusal"`, representing the scale position the model picked in the probe's 5-line support scale.
- **`canonicalDecision`** — `{favoredValueKey, strength, decisionState, cacheVersion}`, an order-independent canonical interpretation derived from the matched value label.

`canonicalDecision` is the authoritative interpretation (derived from `matchedLabel`, not from the 5-line position). `decisionCode` is **probe-format leakage** — it encodes the probe's scale layout rather than a semantic fact about the decision.

Writing both persistently creates a drift invariant that is easy to violate. A dry-run migration against prod revealed **123,726 transcripts** where the cached `canonicalDecision` appears to disagree with what a naive `decisionCode`-based derivation would produce. **Root cause analysis showed this "drift" was a false positive** — the naive truth table `decisionCode + orientationFlipped → value` is wrong for paired-v2 / job-choice-v2 probes. Those probes derive canonical from `matchedLabel` (the value text the model actually wrote), not from the 5-line scale position. So for those ~123k rows, the existing `canonicalDecision` is correct and the truth-table guess was wrong. The **actual** drift affects a much smaller set: the ~1,537 rows where recent backfill PRs updated `decisionCode` but left `canonicalDecision.strength = "unknown"` stale, and the `decisionCode = "refusal"` rows where the canonical never got the refusal tag. These are the only classes the migration must recover. Every past attempt at this collapse has failed, most recently stalling on exactly this false-positive drift signal. The only way out is to remove `decisionCode` entirely so nobody can derive from it, reference it, or drift against it again.

## Goal

Collapse transcript decisions to a single source of truth: `canonicalDecision`. Remove `decisionCode` from the entire codebase — write path, read path, external APIs, types, worker emission, tests — and from the DB (stripped by migration from `summaryCache.summary`). Break every dependency on the 1–5 string so no new one creeps in.

`canonicalDecision.cacheVersion` bumps from `1` to `2`. `decisionState` gains a `"refusal"` value, distinct from `"unknown"` (parser failure). After this PR, only `cacheVersion: 2` exists in code; `cacheVersion: 1` types are deleted.

## Scope Boundaries

### In Scope

- **Write path — TS.** `summarize-persistence.ts`, `summarize-transcript.ts`, `summarize-types.ts`: stop writing `decisionCode` / `decisionCodeSource` to `summaryCache.summary`.
- **Write path — Python.** `workers/summarize.py`, `workers/summarize_extract.py`, `workers/stats/decision_model.py`: stop emitting `decisionCode` / `decisionCodeSource` in the output dict. Internal scale-position detection (used for `matchedLabel` resolution) stays.
- **Read paths — TS.** Every internal consumer (~27 files) rewired to read `canonicalDecision` instead of `decisionCode`. Analysis/aggregation groups by canonical. Services/exports derive on emission via one shared helper. **Explicit targets include** (not exhaustive): `apps/api/src/services/unresolvable-count.ts` (today filters on `decisionCodeSource`), `apps/api/src/services/analysis/aggregate/*`, `apps/api/src/queue/handlers/analyze-basic-data.ts`, `apps/api/src/graphql/queries/domain/analysis/value-detail.ts`, `apps/api/src/graphql/queries/domain/analysis/condition-transcripts.ts`, `apps/api/src/graphql/queries/models-consistency.ts`, `apps/api/src/mcp/tools/get-unsummarized-transcripts.ts`. The implementation must run the full grep inventory first and rewire every hit.
- **External APIs.** MCP `get-run-results`, MCP `get-transcript-summary`, CSV export, OData export: `decisionCode` field is **removed** from the response shape. No null-emitting compat layer. Clients that referenced it fail loudly — intentional.
- **Read paths — Web.** `TranscriptRow.tsx`, `TranscriptList.tsx`, `TranscriptViewer.tsx`, `RunResults.tsx`, `useRunDetailHandlers.ts`, `transcriptDecisionModel.ts`, `DomainAnalysisValueDetail.tsx` — rewired to read canonical.
- **GraphQL schema.** Remove `decisionCode` from `transcript.ts` and `run.ts` type definitions. Regenerate `apps/web/src/generated/graphql.ts`. No deprecation directive — hard break.
- **Canonical types.** `decision-model-types.ts`: `CachedWinnerFirstDecision.cacheVersion` stays as `1 | 2` union **in this PR** (reader tolerance bridge); tightens to literal `2` in a separate mini-PR after migration applies. `decisionState` adds `"refusal"`. `isCachedWinnerFirstDecision` accepts both v1 and v2 shapes + the new refusal state.
- **Manual override mutation.** Reshaped to accept `{favoredValueKey, strength}`. Server derives `direction` from `favoredValueKey` against the definition's value pair (rejects `favoredValueKey` that matches neither value in the pair). Updates `canonicalDecision` directly. No `decisionCode` in request or response. (Derivation avoids the redundant-client-field failure mode.)
- **Shared derivation helper.** One function `scaleCodeFromCanonical(canonical, pair, orientationFlipped): '1' | '2' | '3' | '4' | '5' | 'refusal' | 'unknown'` for the rare internal path that needs the number (e.g. if we ever re-add a legacy export). NOT exposed via external APIs.
- **Migration.** `cloud/scripts/backfill-canonical-v2-migration.ts` rewritten with a **four-case processor** (ordered; first match wins):
  1. **Missing snapshot / missing pair.** If `pairFromSnapshot(definitionSnapshot)` returns `null`, the row cannot be case-2 or case-3 upgraded (we don't know the value pair). **Still strip `decisionCode` + `decisionCodeSource`** and bump `cacheVersion` to `2`, synthesizing an unknown canonical if none exists. This achieves the "scorched-earth" goal even for malformed rows — no `decisionCode` residue lingers. Reported in the final counts as `missing-snapshot-stripped`.
  2. **Refusal tagging.** If `summary.decisionCode === "refusal"` and existing `canonicalDecision.decisionState !== "refusal"`, set `decisionState: "refusal"`, `strength: "unknown"`, `direction: "refusal"`, `favoredValueKey: null`, `opposedValueKey: null`. Preserves the semantic distinction between model refusal and parser failure.
  3. **Unknown-canonical recovery.** If existing `canonicalDecision.decisionState === "unknown"` OR `canonicalDecision.strength === "unknown"`, AND **all** of the following preconditions hold — source these fields from `transcripts.decision_metadata` **top-level** (not `summaryCache.summary`, which does not carry parser evidence):
     - `decisionMetadata.parseClass` is `"exact"` or `"fallback_resolved"`
     - `decisionMetadata.matchedLabel` is a non-empty string
     - `resolveValueKeyFromText(matchedLabel, valueStatements, labelPrefix)` (imported from `cloud/apps/api/src/graphql/queries/domain/decision-model-helpers.ts`) returns a value key that matches `pair.valueA` or `pair.valueB`
     - `parseJobChoiceStrengthFromText(matchedLabel)` (same file) returns a non-null strength (`"strong"`, `"lean"`, or `"neutral"`)

     — then build the canonical via `buildCanonicalDecisionFromPair(pair, direction, strength)` from the same helpers file. Direction is derived as `favoredValueKey === pair.valueA ? 'favor_first' : 'favor_second'` (no `orientationFlipped` needed — direction is a property of the pair mapping, not the scale layout). Strength `"neutral"` collapses to `decisionState: "neutral"` and nulls out favored/opposed keys.

     If ANY precondition fails (parseClass wrong, matchedLabel absent, value-key resolve returns null, or strength parse returns null), **do not partially upgrade** — fall through to case 4 (preserve verbatim). Partial upgrades are worse than no upgrade.

     `valueStatements` and `labelPrefix` are extracted from the row's `definitionSnapshot` via the existing `extractValueStatementsFromSnapshot` / `extractLabelPrefixFromSnapshot` helpers (same file).

     **Note:** `matchedLabel` is display text like "Strongly support taking the job with personal security in everyday life", not a bare value key — the migration must run it through the same text-resolution pipeline the write path uses.
  4. **Preserve otherwise.** All other rows: keep `canonicalDecision` verbatim. This is the majority of rows, including all ~123k rows where my earlier naive drift inspection flagged false positives.

  In all cases (except case 1): bump `cacheVersion: 1 → 2`, strip `decisionCode` + `decisionCodeSource` from summary. Synthesize `{decisionState: "unknown", strength: "unknown", direction: "unknown", favoredValueKey: null, opposedValueKey: null, cacheVersion: 2}` for the rare row with no existing canonical at all. Dry-run default; `--apply` to write.
- **Reader tolerance bridge.** `isCachedWinnerFirstDecision` keeps `cacheVersion: 1 | 2` union in this PR so live v1 rows read correctly until the migration runs. Writers emit v2 only. Tightening to literal `cacheVersion: 2` is a separate mini-PR opened after `--apply` lands and SC-003 verifies zero v1 rows remain.
- **Top-level column reads.** Every call site that **reads** `transcripts.decision_code` (the legacy Postgres column) is rewired to read `canonicalDecision` instead. Call sites that **write** that column continue writing in this PR (kept for the follow-up PR that drops the column entirely). Specific files: `apps/api/src/graphql/mutations/run/maintenance.ts`, `apps/api/src/services/export/decision-display.ts`, plus any file caught by `grep -rn "transcripts.decision_code\|\.decisionCode.*column" cloud/apps`.
- **Tests.** All TS + Python tests updated. Expect `decisionCode` to appear in tests only as assertions that it is absent from produced output / stripped from fixtures. Rough estimate: ~45 test files touched, most via narrow edits.
- **Script inventory.** Each script that references `decisionCode` gets one of these treatments:
  - **Delete** — purpose is purely to manipulate `decisionCode` with no other useful function:
    - `cloud/scripts/inspect-canonical-drift.ts` (diagnostic, no longer needed)
  - **Keep and rewire** — has a useful purpose beyond `decisionCode`:
    - `cloud/scripts/backfill-reparse-decisions.ts` (+ `cloud/scripts/reparse-decision-stdin.py`) → **kept**. Its real purpose is re-running the Python parser on transcripts where the current canonical is unresolved. Rewired to read `canonicalDecision.decisionState` to identify targets and to write `canonicalDecision` back instead of `decisionCode`. This preserves the operational ability to recover ambiguous transcripts when the parser improves.
    - `cloud/scripts/job-choice-bridge-report.ts` + `job-choice-bridge-report-lib.ts` → read `canonicalDecision` via `scaleCodeFromCanonical` helper when the report needs the 1–5 number.
    - `cloud/scripts/__tests__/job-choice-bridge-report.test.ts` + `__tests__/job-choice-transform.test.ts` → fixtures updated.
  - **Leave analysis scripts** in `cloud/scripts/analysis/` (process_transcripts.py, extract_cross_model_data.py, fetch-all-transcripts.js) — these are one-off data extraction scripts that read historical data; they live outside the deploy path. They are **explicitly carved out** of SC-001's grep scope (see SC-001). Flagged in the PR body; owners can clean up async.
  - **New** — `cloud/scripts/backfill-canonical-v2-migration.ts` + tests (the rewritten migration).

### Out of Scope

- **Drop the top-level `transcripts.decision_code` Postgres column.** Separate follow-up PR, opened immediately after this one lands. The column is already unread outside legacy migration code.
- **Change the Python parser's internal resolution logic.** The exact/leading/relaxed/distinctive-tail paths are preserved verbatim. Only the emission into the worker's output dict changes.
- **Change the UI manual-override dropdown options.** Still five human-readable choices. Only the wire format sent to the server changes.
- **Any change to the `transcripts.decision_metadata.matchedLabel` / `parseClass` / `parsePath` / `responseExcerpt` fields.** Those are parser evidence and stay as-is.
- **Tightening `cacheVersion` to literal `2`.** This PR keeps `1 | 2` tolerant reads. A separate mini-PR after `--apply` verifies zero v1 rows remain and tightens to literal `2`.
- **Drop writes to `transcripts.decision_code` column.** This PR removes reads of that legacy column; writes remain. The follow-up PR that drops the column removes the writes too.

## User Scenarios

### US1 — No Dashes in the UI for Parseable Decisions (Priority: P1)

**As** an analyst viewing domain analysis, **I need** every transcript whose parser matched a real value to show that value in the UI, **so that** I do not see false "unknown" dashes for decisions the system actually resolved.

**Why P1.** This is the bug the collapse fixes. ~1,537 transcripts today display as unknown because the stale `canonicalDecision.strength = "unknown"` wins over a valid `decisionCode = "5"` that nobody reads cleanly.

**Independent test.** Pick five transcripts from the drift ledger (IDs visible via current dry-run output). After migration, open each in the UI. Each shows a resolved decision with favored value + strength label.

**Acceptance:**

1. Given a transcript whose `canonicalDecision.strength` today is `"unknown"` but whose `decisionMetadata.matchedLabel` resolves to a valid value key via `resolveValueKeyFromText(matchedLabel, valueStatements, labelPrefix)` AND whose `parseClass` is `"exact"` or `"fallback_resolved"` AND whose `parseJobChoiceStrengthFromText(matchedLabel)` returns a non-null strength, when the migration runs in `--apply` mode, then `canonicalDecision` is rewritten with the recovered `{favoredValueKey, opposedValueKey, direction, strength, decisionState: "resolved"}` via `buildCanonicalDecisionFromPair(pair, direction, strength)` and `cacheVersion` is bumped to `2`. Rows that do not satisfy ALL those preconditions are preserved verbatim (the unknown stays unknown — no partial upgrades).
2. Given a transcript summarized **after** this PR lands, when the API writes `summaryCache.summary`, then `decisionCode` and `decisionCodeSource` are not present and `canonicalDecision` is populated with the parser-derived interpretation.
3. Given any external client that referenced `transcript.decisionCode`, when they call `mcp__valuerank__get_run_results` or download a CSV export after this PR, then the response does not contain `decisionCode` and the client fails at the point of reference (or silently drops it if they use optional chaining — intentional).
4. **Operational verification of the dashed-UI fix.** Take 5 specific transcript IDs from the current prod drift ledger (captured in the PR body as expected-to-fix). After `--apply` lands in prod, open each in the UI. Each MUST render a resolved decision. If any still shows a dash, this is a signal that the GraphQL resolver path is ALSO reading stale canonical bypassing its own unknown-recomputation logic — in which case a follow-up fix to the resolver is required and this PR's success is downgraded to "field removed, drift reduction pending."

### US2 — Reviewer Applies a Manual Override (Priority: P2)

**As** a reviewer correcting a miscategorized transcript, **I need** the override mutation to accept `{favoredValueKey, strength}` and have the server derive direction, **so that** I cannot submit an inconsistent payload and there is no redundant client field to maintain.

**Why P2.** Safety-critical but rare path. Used by the Analysis UI's override dropdown.

**Independent test.** Invoke the mutation with a `favoredValueKey` that matches neither value in the definition's pair. Assert the request is rejected with a validation error naming the unknown key.

**Acceptance:**

1. Given a definition has value pair `(A, B)`, when the mutation is called with `{favoredValueKey: A, strength: "strong"}`, then it succeeds and sets `canonicalDecision` to `{favoredValueKey: A, direction: "favor_first", strength: "strong", decisionState: "resolved"}`.
2. Given the same definition, when the mutation is called with `{favoredValueKey: B, strength: "lean"}`, then direction is derived as `"favor_second"`.
3. Given `favoredValueKey: "SomeOtherValue"` not in the pair, when the mutation is called, then it is rejected with a validation error.
4. Given `strength: "neutral"`, the mutation sets `decisionState: "neutral"`, `direction: "neutral"`, `favoredValueKey: null`.

### US3 — External Consumer Breaks Loudly (Priority: P2)

**As** an external script or MCP client that hard-codes `response.decisionCode`, **I need** to be told clearly that the field is gone, **so that** I migrate to `canonicalDecision.favoredValueKey` / `.strength` rather than silently reading stale data.

**Why P2.** The "stamp it out" intent — we want callers to surface now, not months later when a null is silently consumed.

**Independent test.** Run the MCP integration test or the CSV export fixture before and after this PR. Expect the output shape to NOT contain `decisionCode`. Any old test assertion on `decisionCode` fails.

**Acceptance:**

1. The MCP response schema for `get-run-results` and `get-transcript-summary` has no `decisionCode` field.
2. The CSV export column list does not include `decisionCode`.
3. The OData `$metadata` does not expose a `decisionCode` field on the transcript entity.

## Edge Cases

- **Refusal rows.** Today's `decisionCode = "refusal"` rows have `canonicalDecision.decisionState = "unknown"`. The migration's **refusal-tagging case** upgrades them to `decisionState: "refusal"` so analytics can distinguish refusal from parser failure. No Python re-parse needed — the `decisionCode == "refusal"` signal is sufficient evidence.
- **Rows with no canonical at all.** Rare, but exist. Migration synthesizes `{cacheVersion: 2, decisionState: "unknown", strength: "unknown", favoredValueKey: null}` so the validator does not reject them.
- **In-flight summarize jobs during deploy.** A Python worker that started before this PR deployed may emit `decisionCode` in its output. The write path drops it on the floor (the TS persistence code ignores the field). Safe.
- **Resolver-path responsibility for the US1 fix.** Production's `resolveCanonicalDecision` in `cloud/apps/api/src/graphql/queries/domain/decision-model.ts` already falls through to re-derive from `matchedLabel` when the cached canonical is `decisionState: "unknown"`. In principle, US1 should already be fixed at read time, not write time. The fact that ~1,537 rows still render as dashes suggests either (a) the GraphQL resolver that serves `Transcript.canonicalDecision` does NOT call through `resolveCanonicalDecision` (and instead returns the raw cached field), OR (b) those rows have `parseClass` or `matchedLabel` values that fail the re-derivation preconditions. The migration directly rewrites the cached canonical so the dashes go away regardless of which branch is broken. The implementation slice that rewires internal reads MUST verify the GraphQL `Transcript` resolver goes through the canonical-aware helper (not a raw DB field pluck) — otherwise US1 is not actually fixed.
- **Rolling deploy window.** For the ~5-minute deploy window, some API instances write v2 rows while old instances still try to read v1-tolerant code that no longer exists. Mitigation: a transient "unknown" display is acceptable; no data corruption.
- **Old cache entries keyed by response hash.** The cache key is the response SHA — removing `decisionCode` from the written value does not invalidate cache lookups.
- **Python tests that fixture `decisionCode`.** Updated to either remove or expect its absence in output.
- **MCP `get-unsummarized-transcripts`.** Uses `decisionCode` today for filter logic. Migrated to use `canonicalDecision.decisionState`.
- **CSV consumer that regex-matches `decisionCode` column header.** Fails loudly (column missing) — intentional per Q1.

## Functional Requirements

- **FR-001.** The TypeScript write path MUST NOT include `decisionCode` or `decisionCodeSource` keys in the object written to `summaryCache.summary`. *(Supports US1.)*
- **FR-002.** The Python summarize worker's output dict MUST NOT contain `decisionCode` or `decisionCodeSource` keys. It MUST contain `canonicalDecision`. *(Supports US1.)*
- **FR-003.** The `CachedWinnerFirstDecision` type MUST keep `cacheVersion: 1 | 2` (transitional union — tightened in a follow-up mini-PR), and MUST include `"refusal"` in the `decisionState` union. `isCachedWinnerFirstDecision` MUST accept both the v1 and v2 shapes plus the new refusal state. *(Supports US1 and the deploy-window tolerance.)*
- **FR-004.** The GraphQL schema for `Transcript` and `Run` related types MUST NOT expose `decisionCode`. *(Supports US3.)*
- **FR-005.** The MCP tools `get-run-results`, `get-transcript-summary`, and `get-unsummarized-transcripts` MUST NOT emit a `decisionCode` field in their response payloads. *(Supports US3.)*
- **FR-006.** The CSV and OData exports MUST NOT include a `decisionCode` column. *(Supports US3.)*
- **FR-007.** The manual-override mutation MUST accept `{favoredValueKey, strength}` as required fields. The server MUST derive `direction` from `favoredValueKey` against the definition's value pair and store it in `canonicalDecision`. A `favoredValueKey` matching neither value MUST be rejected with a validation error. `strength: "neutral"` MUST produce `{decisionState: "neutral", direction: "neutral", favoredValueKey: null}` regardless of the input key. The mutation MUST NOT write to the legacy top-level `transcripts.decision_code` column. *(Supports US2.)*
- **FR-008.** A shared helper `scaleCodeFromCanonical(canonical, pair, orientationFlipped)` MUST exist for any internal code path that needs the 1–5 number. It MUST NOT be called by any external API emitter (MCP / CSV / OData), GraphQL resolver, or web component. It is ONLY callable from `cloud/scripts/job-choice-bridge-report-lib.ts` and its tests (documented in a JSDoc allowlist comment on the helper). Adding a new caller requires updating the allowlist, making future misuse visible in code review. *(Supports the shared-derivation invariant; addresses the Gemini LOW residual-risk finding about re-introduction pathways.)*
- **FR-009.** The migration script MUST visit every transcript with a non-null `summaryCache`, apply the three-case processor described in the scope (refusal-tag → unknown-recovery → preserve), strip `decisionCode` and `decisionCodeSource`, and write `cacheVersion: 2`. It MUST run as dry-run by default and MUST support `--apply`, `--domain=<name>`, and `--limit=<n>` flags. *(Supports US1.)*
- **FR-010.** After `--apply` runs against prod, `SELECT COUNT(*) FROM transcripts WHERE decision_metadata->'summaryCache'->'summary' ? 'decisionCode'` MUST return `0`. *(Acceptance check.)*
- **FR-011.** The unit test suite MUST pass without the `any` type, `@ts-ignore`, or `eslint-disable` directives being added to paper over the removal. *(Code quality.)*
- **FR-012.** All existing tests that assert on `decisionCode` MUST be updated — either rewired to assert on `canonicalDecision`, or replaced with an assertion that `decisionCode` is absent. No test deleted purely to make the removal pass. *(Test coverage.)*

## Success Criteria

- **SC-001.** `git grep -n "decisionCode" cloud/apps/api/src cloud/apps/web/src cloud/workers cloud/scripts -- ':!cloud/scripts/analysis/**' ':!cloud/scripts/backfill-canonical-v2-migration.ts'` returns zero non-comment hits after the PR merges. Exclusions: the migration script itself (which strips `decisionCode`), the `cloud/scripts/analysis/**` tree (one-off historical data extraction; not on the deploy path), and negation assertions in tests. `cloud/packages` is also **excluded** because the Prisma schema and generated DB types still reference `decisionCode` as part of the top-level column — that column is removed by the follow-up PR.
- **SC-002.** The production dry-run of the rewritten migration reports categories: `refusal-tagged`, `unknown-recovered`, `unknown-recovery-skipped-insufficient-evidence` (unknown row where preconditions failed → preserved instead), `preserved-with-strip`, `already-v2` (no-op), `synthesized-unknown` (no existing canonical, wrote a v2 unknown), `missing-snapshot-stripped` (malformed `definition_snapshot`, canonical not upgraded but decisionCode still stripped + cacheVersion bumped), `errors` = 0. `drifted` does NOT appear (not a category anymore).
- **SC-003.** After `--apply` against prod: `SELECT COUNT(*) FROM transcripts WHERE decision_metadata->'summaryCache'->'summary' ? 'decisionCode'` returns `0` — **every** row is stripped, including `missing-snapshot-stripped` ones (which only skip the canonical upgrade, not the strip). This is a single absolute check, no exceptions, no residual.
- **SC-004.** A domain analysis page that today shows false dashes (e.g. the known software-approach-choice transcripts in the drift ledger) renders resolved decisions for those rows.
- **SC-005.** All preflight gates pass: lint + build + tests for shared, db, api, web; Python worker pytest.
- **SC-006.** CI passes on the PR branch without skipped or quarantined tests related to this change.
- **SC-007.** Deploy to prod produces no error spike for 15 minutes post-deploy in the API or worker logs.

## Assumptions Recorded in Discovery

1. User confirms scorched-earth intent: break every dependency on the 1-5 code so it fails loudly. No soft deprecation anywhere.
2. Manual override mutation will be reshaped to accept `{favoredValueKey, strength, direction}` and update `canonicalDecision` directly.
3. Python worker keeps internal parsing logic intact; only stops emitting `decisionCode`/`decisionCodeSource` in its output dict.
4. Migration strips `decisionCode` + `decisionCodeSource` from `summaryCache.summary`, bumps `cacheVersion` 1 to 2, preserves `canonicalDecision` verbatim; no truth-table derivation.
5. A derivation helper `scaleCodeFromCanonical(canonical, pair, orientationFlipped)` exists internally for any code path that needs the 1-5 number; it is never called by external APIs.

## Key Entities

- **`CachedWinnerFirstDecision`** — the in-cache canonical shape; `cacheVersion: 1 | 2` (reader tolerance bridge — tightens to `2` in follow-up), `decisionState ∈ {"resolved", "neutral", "unknown", "refusal"}`, `favoredValueKey: DomainAnalysisValueKey | null`, `strength: DecisionStrength`.
- **`RawDecisionEvidence`** — parser output untouched (`matchedLabel`, `parseClass`, `parsePath`, `parserVersion`, `responseExcerpt`).
- **`CanonicalDecision`** — API-level shape returned to consumers. Keeps its existing field set including `direction`, `favoredValueKey`, `opposedValueKey`, `strength`, `normalizationApplied`, `normalizationReason`, `source`. No `decisionCode`; consumers that need the 1–5 scale number call `scaleCodeFromCanonical` internally (and only from the allowlist in FR-008). `direction` is STORED in the canonical (derivable from `favoredValueKey + pair`, but stored redundantly so readers don't have to re-derive).
- **Manual override payload** — new GraphQL input `{favoredValueKey, strength}`. Server derives direction and opposedValueKey. Server does NOT write to the legacy `transcripts.decision_code` column.

## Dependencies

- Prisma client unchanged for this PR. (Column drop deferred to follow-up PR.)
- Railway rolling deploy — acceptable ~5-minute window of transient "unknown" display on in-flight summaries written by pre-deploy instances.

## Post-Merge Operational Steps

1. Run migration dry-run against prod. Verify categorized counts are reasonable.
2. Run migration `--apply` against prod.
3. Run FR-010 verification query — expect 0.
4. Verify prod UI on a previously-dashed transcript — expect resolved.
5. Immediately open follow-up PR to drop the top-level `transcripts.decision_code` Postgres column.
