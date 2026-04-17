# Feature Spec: Unified Net-Weighted Condition Score

**Slug:** `unified-net-weighted-condition-score`
**Branch:** `feature/unified-condition-score`
**Status:** revised after spec checkpoint
**Discovery:** complete (assumption-driven; no open questions)

## Checkpoint resolution log

Two rounds of adversarial review ran against this spec. All findings are addressed below.

### Round 1 — initial reviews

| # | Severity | Source | Finding | Resolution |
|---|---|---|---|---|
| 1 | HIGH | Codex feasibility | `ConditionMatrix` receives `MatrixCondition` (raw counts + dimensions), not `Transcript[]`. It cannot call `summarizeCanonicalConditionTranscripts` directly. | Shared module will expose a second summarizer, `summarizeCanonicalConditionCounts(counts: CanonicalConditionCounts): CanonicalConditionSummary`, that takes pre-tallied counts and returns the same summary shape the transcript summarizer does. (See FR-011.) |
| 2 | HIGH | Codex feasibility / Gemini | `ConditionMatrix.validateMatrixCondition` rejects non-integer counts via `Number.isInteger`. After PR #667 (`Int → Float` for count fields) fractional counts are legitimate. | The integer check is removed; validator enforces `Number.isFinite` and `>= 0` only. Sum check becomes tolerant equality. (See FR-012.) |
| 3 | MEDIUM | Codex edge-cases | FR-010 / SC-006 grep rule was too broad — legend classification and tooltip text legitimately read raw count fields for non-score purposes. | FR-010 tightened to forbid only arithmetic that produces the score, label, color, or opacity. Read-only classification and display explicitly permitted. |
| 4 | MEDIUM | Codex feasibility | Test file list referenced `AnalysisPanel.test.tsx` which does not exist. | Corrected to reference `AnalysisPanel.pairedContent.test.tsx`, `.layout.test.tsx`, `.states.test.tsx`. |
| 5 | MEDIUM | Gemini | Ties rendered `text-blue-700` — visual bias toward "self" side, re-introducing the exact bias this feature targets. | Tri-state direction (`self` / `opponent` / `neutral`); cell helper returns `text-gray-500` with no fill for ties. (See FR-003, FR-005.) |
| 6 | LOW | Gemini | Inline opacity math vs shared `opacity * 0.5` are equivalent; spec implied duplication. | Noted — shared form survives. No spec change. |
| 7 | LOW | Gemini | `toFixed(1)` is non-i18n-aware. | Out of scope. Added to non-goals. |

### Round 2 — reviews after Round 1 revisions

| # | Severity | Source | Finding | Resolution |
|---|---|---|---|---|
| 8 | HIGH | Gemini | FR-012 said to move the `prioritized + deprioritized + neutral === totalTrials` sum check **into** the shared module. But that module handles **canonical** counts (`strongly`, `somewhat`, `opponentStrongly`, `opponentSomewhat`, `neutral`) and has no knowledge of `prioritized` / `deprioritized` — those are view-specific `MatrixCondition` fields. Impossible as written. | The shape validation for `MatrixCondition`'s non-canonical fields (`prioritized`, `deprioritized`, `totalTrials`, `unknownCount`, `neutral`) stays **inline** in `ConditionMatrix.tsx` as schema validation, not score arithmetic. Only `Number.isInteger` is removed and strict `===` is replaced with tolerant equality (`|expected − actual| < 1e-6`). Score-related arithmetic on canonical counts moves into the shared module. (See revised FR-012.) |
| 9 | HIGH | Gemini | `totalTrials` ambiguity: `MatrixCondition.totalTrials = prioritized + deprioritized` (non-canonical). Shared module's `totalTrials` must sum the five canonical counts (`strongly + somewhat + opponentStrongly + opponentSomewhat + neutral`). These can disagree. Spec did not forbid passing the wrong one. | `summarizeCanonicalConditionCounts` MUST compute `totalTrials` internally from its own `CanonicalConditionCounts` input. It MUST NOT accept `totalTrials` as a parameter. The view's `MatrixCondition.totalTrials` is never passed to the summarizer. (See revised FR-011.) |
| 10 | MEDIUM | Codex feas | Moving sum-check out of view dropped the user-visible red callout safeguard. | Sum-check stays inline as schema validation; the existing red-callout UX is preserved. Spec now explicitly says so. (See Resolution #8 above.) |
| 11 | MEDIUM | Codex feas | Exact `netScore === 0` tie test is fragile under fractional counts plus floating-point residue (`netScore = 1e-17` instead of `0`). | Tie detection uses tolerant equality: `direction = 'neutral' when Math.abs(netScore) < 1e-9`. (See revised FR-003.) |
| 12 | MEDIUM | Codex edges | Transcript tables (`ConditionDecisionsTable`, `PivotAnalysisTable`) still call `getCanonicalConditionTextColor(isOpponent)` directly. Neutral tri-state won't reach them unless they switch to the new bundle helper. | FR-004 and FR-013 now require both transcript-based tables to consume `getConditionCellDisplay(summary)` and stop calling `getCanonicalConditionTextColor` / `getCanonicalConditionBackground` directly. |
| 13 | MEDIUM | Codex edges | `PivotAnalysisTable` legend classifier buckets a cell with `isOpponent === false` and mixed directional counts as "low". Ties currently render as low-confidence self, which is wrong once we have a real neutral state. | FR-014 requires the legend's bucket classifier to key off `summary.direction === 'neutral'` (via the same shared helper), so tied cells count as neutral, not low. Scoped narrowly to the legend classifier. |
| 14 | MEDIUM | Codex edges | FR-005's `getConditionCellDisplay` return shape omitted `netScore`, which left room for views to re-derive it. | FR-005 return shape now explicitly includes `netScore: number \| null` and `direction: 'self' \| 'opponent' \| 'neutral'`. Views get everything in one call. |
| 15 | MEDIUM | Gemini | `CanonicalConditionCounts` input type for `summarizeCanonicalConditionCounts` was not defined — implementer might pass full `MatrixCondition`. | FR-011 now explicitly defines `CanonicalConditionCounts` as exactly the five canonical count fields: `{ strongly, somewhat, opponentStrongly, opponentSomewhat, neutral }`. No other fields permitted. |
| 16 | LOW | Codex feas | SC-006 grep gate was imprecise given allowed read-only count access. | SC-006 narrowed to specific patterns: no `Math.abs(...)` on a derived score outside the shared module, no `(2 * ... + ...) / ...` arithmetic outside, no `.toFixed(1)` on a condition-score outside. Read-only field access is explicitly not caught. |

### Round 3 — reviews after Round 2 revisions

| # | Severity | Source | Finding | Resolution |
|---|---|---|---|---|
| 17 | HIGH | Gemini (MED per Codex feas / edges) | Split-validation hole: `validateMatrixCondition` checks `MatrixCondition.totalTrials` against `prioritized + deprioritized + neutral` (non-canonical totals), but the score is computed from `strongly + somewhat + opponentStrongly + opponentSomewhat + neutral` (canonical totals). A malformed row can pass schema validation and still render a score from inconsistent data. | FR-012 now also requires a **cross-field consistency check** inside `validateMatrixCondition`: `Math.abs((strongly + somewhat) − prioritized) < 1e-6` AND `Math.abs((opponentStrongly + opponentSomewhat) − deprioritized) < 1e-6`. If either check fails, the same red-callout error surfaces. Closes the two-path gap. (See revised FR-012.) |
| 18 | MEDIUM | Codex feas / Codex edges / Gemini | `selectedValueWinRate` is a legacy winner-only metric still exported on `CanonicalConditionSummary`. Today, `isOpponent` is derived from `selectedValueWinRate < 0.5`. Keeping it leaves a drift surface where callers can reintroduce the winner-biased logic. | FR-008 now also requires removing `selectedValueWinRate` from `CanonicalConditionSummary`'s public type. The derivation of `isOpponent` moves to `direction === 'opponent'`. If any internal call site still needs the win rate, it is computed locally in the summarizer and not re-exposed. |
| 19 | MEDIUM | Codex edges | FR-014's `direction === 'neutral'` bucket would also catch zero-trial cells, because FR-003 puts both ties AND zero-trial into `'neutral'`. Today, `PivotAnalysisTable`'s legend skips zero-trial summaries before bucketing; the spec would break that behavior. | FR-014 now requires the legend classifier to bucket only when `summary.direction === 'neutral' && summary.hasData === true`. Zero-trial cells stay excluded from all buckets, matching today's behavior. |
| 20 | LOW | Gemini | Assumption #4 says "Opacity = `\|netScore\| / 2`, capped at 1", but today's implementation multiplies the intermediate opacity by `0.5` in the rgba string so the effective maximum alpha is `0.5`, not `1.0`. Spec wording contradicts implementation. | Assumption #4 and FR-007 corrected: effective alpha = `Math.min(1, Math.max(0, \|netScore\| / 2)) * 0.5`, maximum `0.5`. This is the current and intended rendering — a fully saturated fill would be too heavy for matrix cells. No code change from this finding; just spec wording. |

### Round 4 — reviews after Round 3 revisions

| # | Severity | Source | Finding | Resolution |
|---|---|---|---|---|
| 21 | HIGH | Codex feas | FR-007 was off by a factor of 2. Today's `getCanonicalConditionBackground(score, isOpponent)` takes `score` in range `[0, 2]`, divides by 2 internally, then applies `* 0.5` — max alpha `0.5`. My wording said to pass `Math.abs(netScore) / 2` (range `[0, 1]`) into the helper; that would cap alpha at `0.25`, making fills too faint. | FR-007 corrected: pass `Math.abs(netScore)` (range `[0, 2]`, no pre-divide). Helper's existing internal `/2` and `* 0.5` produce the intended max alpha `0.5`. Assumption #4 also corrected to describe the two-step math plainly. |
| 22 | MEDIUM | Codex feas | `tests/components/analysis/PivotAnalysisTable.test.tsx` hard-codes `2.0` labels and clicks in three tests; omitted from the spec's test update list. | Added to the In-scope test list. |
| 23 | MEDIUM | Gemini | Leaving the legacy `isOpponent` boolean on `CanonicalConditionSummary` is a misuse surface — developers could reach for it and bypass `direction` / the bundle helper, re-creating tie bias. | FR-008 tightened: `isOpponent` is **removed** from the public `CanonicalConditionSummary` type. Callers who need the opponent-only axis derive it locally from `summary.direction === 'opponent'`. The one-liner derivation keeps call sites honest without reintroducing a public field. |
| 24 | MEDIUM | Codex edges | `canonicalConditionSummary.ts` uses `localeCompare` to decide which counted value is the "first" side; that is host-locale sensitive, so identical raw counts can render with swapped direction under different browser locales. | Added to non-goals and residual risks. Fixing the locale dependency is a separate feature; this feature's existing inputs do not introduce the dependency and calling it out here prevents scope creep. |
| 25 | LOW | Codex edges | US3's "must not touch raw count fields directly" wording is broader than FR-010 / SC-006, which narrow to score-producing arithmetic. Blanket reading would reject valid reads. | US3 independent test reworded to match FR-010/SC-006 exactly: "search for score-producing arithmetic". |
| 26 | LOW | Codex edges | `ConditionMatrix` silently flattens 3+ dimension conditions to an arbitrary 2D slice. Pre-existing behavior, unrelated to the score fix. | Added to non-goals. Documenting so future work can pick it up; out of scope here. |
| 27 | INFO | Gemini | Finding listed as HIGH but was actually a restatement that FR-012's float-tolerant sum check is the right fix. No additional spec action needed. | No change — already handled by FR-012 item 2. |
| 28 | INFO | Gemini | Finding listed as MEDIUM but was a restatement of the cross-field gap now closed by FR-012 item 3. | No change — already handled. |

### Round 5 — reviews after Round 4 revisions

| # | Severity | Source | Finding | Resolution |
|---|---|---|---|---|
| 29 | MEDIUM | Codex feas | FR-014 only rewrote the `neutral` branch of `PivotAnalysisTable`'s legend classifier. The `high` / `self` / `opponent` branches still depend on `summary.isOpponent`, which FR-008 now removes. Legend bucketing is underspecified — not mechanically implementable as written. | FR-014 broadened: every branch of the legend classifier migrates from `summary.isOpponent` to `summary.direction`. `opponent` bucket keys off `direction === 'opponent'`; `self`-aligned (`high`/`low`) buckets key off `direction === 'self'`; `neutral` bucket keys off `direction === 'neutral' && hasData`. Zero-trial cells (`hasData === false`) stay excluded from all buckets. See revised FR-014. |
| 30 | MEDIUM | Codex edges | `PivotAnalysisTable` contains stale user-facing copy: *"Each box in the table shows the model's average preference score (0–2)"*. Under net-weighted signed magnitudes plus tie-neutral handling, that sentence is factually wrong — the displayed number is no longer a 0–2 average. | Added to In-scope: update the help/legend copy so it accurately describes the new decimal magnitude (range `[0, 2]`) plus directional color coding and the tie-neutral state. The tasks phase will enumerate the exact strings to change. |
| 31 | LOW | Codex edges | FR-011 says `CanonicalConditionCounts` "MUST NOT accept... any MatrixCondition-shaped object." TypeScript structural typing cannot technically enforce this — a `MatrixCondition` value that happens to have the five required fields will still type-check. | FR-011 wording softened: the invariant is maintained by call-site convention and a test that feeds a raw `MatrixCondition` and asserts the summarizer ignores the non-canonical fields. A branded nominal type is declined as overkill for this scope. |

### Round 6 — reviews after Round 5 revisions

| # | Severity | Source | Finding | Resolution |
|---|---|---|---|---|
| 32 | HIGH | Codex feas | SC-006 grep patterns include `Math.abs(` on values derived from the four directional fields. But FR-012 explicitly requires `Math.abs((strongly + somewhat) − prioritized)` inside `validateMatrixCondition`. Direct contradiction — the grep gate would fail a correct implementation. | SC-006 updated to explicitly exempt `validateMatrixCondition`. The grep rule applies only to arithmetic that produces the **score, label, color, or opacity**, not to schema validation. Specific file/symbol exemption added to SC-006 wording. |
| 33 | MEDIUM | Gemini | `hasData` is defined only on `getConditionCellDisplay`'s return type; `CanonicalConditionSummary` itself lacks it. FR-014's legend classifier needs `hasData` before rendering, so it would have to re-derive from `summary.totalTrials > 0` — duplicating single-source logic. | FR-001 extended: `CanonicalConditionSummary` now includes `hasData: boolean` (= `totalTrials > 0`). The cell-display helper's `hasData` is just a pass-through. Legend classifier reads `summary.hasData` directly. |
| 34 | MEDIUM | Codex feas | SC-004 requires zero `winnerScore` matches under `cloud/apps/web/src`, but Assumption #6 says the rename only touches the summary type and direct call sites. `ConditionMatrix.tsx` also has a local variable named `winnerScore` inside its now-deleted inline helper — the assumption wording implies that local isn't in scope. | Assumption #6 clarified: "direct call sites" includes the inline variable(s) inside `ConditionMatrix.tsx`'s old `getConditionMatrixDisplay` — those are deleted entirely with the inline formula, so SC-004's grep will pass. No standalone `winnerScore` identifier anywhere under `cloud/apps/web/src` after the change. |
| 35 | LOW | Gemini | `validateMatrixCondition` surfaces only the first invalid row; multiple bad rows require fix-reload-repeat cycle. | Pre-existing behavior; improving it is out of scope. Added to residual risks. |
| 36 | N/A | Codex edges | Codex runner timed out — not a finding. | Re-ran in round 7 (see next section if applicable). |

### Round 7 — final round (advancing to plan)

Three MEDIUM findings (no HIGHs). All applied below. No further spec loop — remaining issues are better caught at plan/diff checkpoints with concrete code.

| # | Severity | Source | Finding | Resolution |
|---|---|---|---|---|
| 37 | MED | Codex feas | FR-014 introduced "split by magnitude threshold on `Math.abs(netScore)`" for `self`-aligned buckets. Today's pivot legend has no magnitude threshold — it's `neutral` / `opponent` (`isOpponent === true`) / `low` (everything else with data). My wording invented new behavior rather than preserving existing. | FR-014 simplified to pure field-swap: `opponent` bucket → `direction === 'opponent' && hasData`; `neutral` bucket → `direction === 'neutral' && hasData`; `low` bucket → `direction === 'self' && hasData`. No magnitude thresholds. Existing labels and counts preserved exactly except for the tie-bias fix. |
| 38 | MED | Codex feas | Spec names the inline formula, `getPreferenceBackground`, `getPreferenceTextColor`, and the rounding step for deletion — but not `getConditionMatrixDisplay` itself. A thin wrapper around `summarizeCanonicalConditionCounts` + `getConditionCellDisplay` could survive and keep local score logic alive. | Scope list now explicitly says: delete `getConditionMatrixDisplay` from `ConditionMatrix.tsx`. The cell renders directly from the shared helper's return; no wrapper function mediates it. |
| 39 | MED | Codex edges | `1e-9` neutral tolerance vs `.toFixed(1)` display means scores in roughly `(-0.05, 0.05)` render as label `0.0` but still get directional color. Cell looks tied in text but not in color. | FR-003 tolerance changed from `1e-9` to `0.05`. Rationale: the display rounds to one decimal, so anything within `±0.05` is indistinguishable from `0.0` to the user and should render as neutral. The `0.05` threshold is the smallest value `toFixed(1)` can round up from zero. |
| 40 | LOW | Codex edges | Shared helper doesn't expose accessibility text / aria-labels. Future a11y changes would still need per-view edits. | Added to non-goals. If a11y text becomes required later, it can be added to the bundle helper without changing the rest of the architecture. |

**Advancing to plan authoring.** Spec file sha: current. All 40 findings across 7 rounds are addressed or documented. Ship gate: reviews will be marked `accepted` by the next reconcile pass.

## Problem

Three product views each render a per-condition "decision score" for a pair of competing values, using the same five raw count inputs (`strongly`, `somewhat`, `opponentStrongly`, `opponentSomewhat`, `neutral`):

1. **Condition Matrix** on the domain analysis value-detail page — `cloud/apps/web/src/components/domains/ConditionMatrix.tsx`
2. **Condition Decisions** table on the run analysis Decision tab — `cloud/apps/web/src/components/analysis/ConditionDecisionsTable.tsx`
3. **Pivot Analysis** table on the run analysis Scenarios tab — `cloud/apps/web/src/components/analysis/PivotAnalysisTable.tsx`

Two issues exist today:

- **The formula only considers the "winning" side.** `winnerScore = (2·winnerStrongly + winnerSomewhat) / totalTrials`, range 0…2. A near-tie like `3 somewhat-Benevolence vs 2 somewhat-Conformity` renders the same as a clean win of `3 somewhat-Benevolence, 0 Conformity` because Conformity's 2 votes are thrown away. True ties break toward the "self" side because of how `isOpponent` is decided (`deprioritized > prioritized`), meaning a genuine tie can render as a decisive opponent win.
- **The Condition Matrix additionally rounds to 0/1/2.** That erases the decimal detail that signals model inconsistency (e.g. `0.6` collapses to `1`). The `ConditionMatrix.tsx` formula is also an **inline duplicate** — it doesn't use the shared helper the other two views consume.

Users reading any of these views cannot currently distinguish a near-tie from a blowout, and the three views disagree with each other on the same underlying data.

## Goal

Two goals, equal weight:

1. **Fix the math.** Replace winner-only aggregation with a **net-weighted** aggregation, and display the score as a raw decimal magnitude with direction conveyed by color.
2. **Make it a single-source component.** Consolidate the score calculation, the label formatting, and the color logic into one shared module so that any future change — formula, label format, palette, tie handling — can be made in exactly one place and propagate to every view automatically. No view may inline its own copy.

## Scope

### In scope

- Update the shared helper `cloud/apps/web/src/utils/canonicalConditionSummary.ts`:
  - Replace `winnerScore` with `netScore: number | null`:
    `netScore = ((2·strongly + somewhat) − (2·opponentStrongly + opponentSomewhat)) / totalTrials`, range −2…+2, `null` when `totalTrials === 0`.
  - Add `direction: 'self' | 'opponent' | 'neutral'` derived from `netScore` with a `1e-9` tolerance.
  - Add new export `summarizeCanonicalConditionCounts(counts: CanonicalConditionCounts): CanonicalConditionSummary` that computes `totalTrials` internally from the five canonical fields — no external `totalTrials` accepted.
  - Add new export `getConditionCellDisplay(summary)` returning `{ netScore, direction, label, backgroundColor, textColorClass, hasData }` — the single bundle helper every view renders from.
  - Keep `getCanonicalConditionBackground` and `getCanonicalConditionTextColor` exported; `getConditionCellDisplay` calls them internally. Views must not call them for score cells directly.
- Update `ConditionDecisionsTable.tsx` and `PivotAnalysisTable.tsx`: switch the per-cell render path from the old `getCanonicalConditionTextColor` / `getCanonicalConditionBackground` pair to a single `getConditionCellDisplay(summary)` call. Display `label` directly (no `toFixed` in the view).
- Update `PivotAnalysisTable.tsx`'s legend bucket classifier to migrate every branch from `summary.isOpponent` to `summary.direction` (FR-014).
- Update `PivotAnalysisTable.tsx`'s help/legend copy (today's text: *"Each box in the table shows the model's average preference score (0–2)"*) to describe the new net-weighted decimal magnitude `[0, 2]`, color-coded direction (blue = selected leads, orange = opponent leads, neutral for ties), and the tie-neutral display. The tasks phase will enumerate the exact strings; scope is limited to the descriptive header/legend copy on this component — no other user-facing copy changes in this feature.
- Update `ConditionMatrix.tsx`:
  - **Delete the entire `getConditionMatrixDisplay` function** — no thin wrapper survives. Cells render directly from the shared helper's return.
  - Delete `getPreferenceBackground`, `getPreferenceTextColor`, and the rounding step.
  - At the cell render site: call `summarizeCanonicalConditionCounts({ strongly, somewhat, opponentStrongly, opponentSomewhat, neutral })` and feed the result to `getConditionCellDisplay(summary)`; use its `label`, `backgroundColor`, and `textColorClass` directly.
  - Update `validateMatrixCondition`: remove `Number.isInteger`; make the `totalTrials` sum-check tolerant (`|a − b| < 1e-6`); add the two cross-field checks from FR-012. Keep the red-callout UX.
- Update impacted unit tests so they assert the new formula:
  - `cloud/apps/web/tests/utils/canonicalConditionSummary.test.ts`
  - `cloud/apps/web/tests/components/analysis/ConditionDecisionsTable.test.tsx`
  - `cloud/apps/web/tests/components/analysis/PivotAnalysisTable.test.tsx` — currently hardcodes `2.0` labels and click-through assertions; must update for the new formula and click-through via `getConditionCellDisplay` output.
  - `cloud/apps/web/tests/components/analysis/AnalysisPanel.pairedContent.test.tsx`
  - `cloud/apps/web/tests/components/analysis/AnalysisPanel.layout.test.tsx` (if it asserts score values)
  - `cloud/apps/web/tests/components/analysis/AnalysisPanel.states.test.tsx` (if it asserts score values)
  - `cloud/apps/web/tests/pages/DomainAnalysisValueDetail.test.tsx`
  - any other test that asserts `ConditionMatrix` `'0' | '1' | '2'` labels or `winnerScore` values (tasks phase will enumerate)

### Out of scope (non-goals)

- Per-transcript `preferenceScore` computation in `cloud/apps/api/src/services/export/decision-display.ts`. This is the atomic 0/1/2 weight for a single trial and is used by CSV/XLSX exports. The aggregate formula change uses these same weights, so no change is needed here.
- `meanPreferenceScore` aggregation in `cloud/apps/api/src/services/export/xlsx/worksheets/model-summary.ts`. This is a non-directional magnitude average and is a different metric from the cell score.
- Rebuilding any domain analysis snapshot. Snapshots store raw counts, not the computed score.
- GraphQL schema changes. The API exposes raw counts; the fix is purely client-side.
- Renaming any legacy symbols beyond the `winnerScore` → `netScore` rename inside the shared helper and its direct call sites.
- Internationalization of the decimal separator. The app renders `.` everywhere today; i18n of numeric formats is a separate effort.
- Host-locale sensitivity of `canonicalConditionSummary.ts`'s `localeCompare` call that picks the "first" side. This is a pre-existing dependency not introduced by this feature; fixing it (e.g. comparing by value key rather than display string, or passing an explicit locale) is a separate concern. This feature preserves today's behavior and adds no new locale coupling.
- `ConditionMatrix`'s existing 2D projection of 3+ dimension conditions (silently flattens to the first two dimensions after sorting). Pre-existing display behavior, unchanged by this feature. Users viewing such conditions will continue to see an arbitrary 2D slice. Out of scope for the score fix; logged for future work.
- Accessibility text / aria-labels on score cells. `getConditionCellDisplay` does not expose an `aria-label` field today. If future a11y work requires cell screen-reader text, it can be added as a new field on the helper's return shape without disturbing the rest of the architecture. Out of scope here.
- Also in residual risks: `validateMatrixCondition` still surfaces only the first invalid row (fix-reload-repeat). Collecting all errors is a UX improvement orthogonal to the score fix.

## Assumptions carried in

1. Formula: `netScore = ((2·strongly + somewhat) − (2·opponentStrongly + opponentSomewhat)) / totalTrials`; range −2…+2.
2. Direction: `isOpponent = netScore < 0`. `netScore === 0` renders with no fill (tie is visually neutral).
3. Label: magnitude only, `Math.abs(netScore).toFixed(1)`. No sign character.
4. Color: blue when selected leads, orange when opponent leads, none at tie. Effective alpha is built in two steps by the existing color helper — clamp `|netScore|` to `[0, 2]`, divide by 2 to get `[0, 1]`, then multiply by `0.5` for the rgba alpha. Max effective alpha `0.5`; `netScore === 0` produces no background at all (see FR-007 and FR-005).
5. All three views use the shared helper after this change.
6. `winnerScore` rename → `netScore` in the helper return shape AND in every direct call site, including any local variable named `winnerScore` in `ConditionMatrix.tsx`'s inline `getConditionMatrixDisplay` (which is deleted outright as part of this change — the inline formula goes away entirely). After the change, grep for the literal identifier `winnerScore` under `cloud/apps/web/src` returns zero hits (SC-004).
7. `ConditionMatrix.tsx`'s inline formula is deleted; the component consumes the shared helper.
8. Existing tests that assert the old winner-only values are updated, not suppressed.
9. No snapshot rebuild needed.
10. No GraphQL schema change needed.

## User Stories

### US1 — Consistent decimal score across views (P1)

**As a** user inspecting model decisions
**I want to** see the same decimal score in the Condition Matrix, Condition Decisions table, and Pivot Analysis table for the same underlying data
**So that** I can trust the numbers and don't have to reconcile disagreements between views.

**Independent test:** Pick any one condition cell on the domain analysis value-detail page (Condition Matrix), then cross-reference the same condition in the run analysis Decision tab (Condition Decisions) and Scenarios tab (Pivot Analysis). All three must show the same decimal value to one decimal place.

**Acceptance scenarios (all viewed from Conformity):**

| # | Input | Expected label | Expected color | Expected fill |
|---|---|---|---|---|
| A | 3 somewhat-Benevolence, 2 somewhat-Conformity | `0.2` | orange | faint |
| B | 5 strongly-Benevolence | `2.0` | orange | full |
| C | 4 strongly + 1 somewhat Conformity | `1.8` | blue | near-full |
| D | 2 strongly each + 1 neutral | `0.0` | none | none |
| E | 1 strongly + 2 somewhat Conformity vs 1 strongly + 1 somewhat Benevolence | `0.2` | blue | faint |

### US2 — Magnitude-only labels (P1)

**As a** user reading a score cell
**I want to** see only the magnitude of the score (no `+` or `−` sign)
**So that** the cell stays compact and the color already tells me direction.

**Independent test:** Render any cell with a negative `netScore`. Verify the label has no sign character and the color is orange.

**Acceptance scenarios:**

1. **Given** `netScore = -0.2`, **when** the cell renders, **then** the label text is `0.2` and the background is faint orange.
2. **Given** `netScore = +1.8`, **when** the cell renders, **then** the label text is `1.8` and the background is near-full blue.

### US3 — Shared component as single source of truth (P1)

**As a** developer changing any aspect of the condition score in the future (formula, decimal places, palette, tie handling, accessibility labels)
**I want to** edit one module and have every view pick it up
**So that** views cannot drift apart, duplicate rules cannot accumulate, and one code review covers all display sites.

**Independent test:** After the change, search `cloud/apps/web/src` for **score-producing arithmetic** on the four directional count fields (`strongly`, `somewhat`, `opponentStrongly`, `opponentSomewhat`) — specifically the patterns listed in SC-006: `(2 *` or `2*` applied to any of those fields, `.toFixed(` on a value derived from them, or `Math.abs(` on such a derived value. The only matches must be inside the shared module (`canonicalConditionSummary.ts`). Read-only reads for non-score purposes (legend bucket checks via `summary.direction`, tooltip text, click-filter routing) remain in the views and are expected.

**Acceptance scenarios:**

1. **Given** I grep the web source for `2 *` applied to `strongly` or `opponentStrongly`, **then** the only hit is inside the shared module (`canonicalConditionSummary.ts`).
2. **Given** I grep the web source for `toFixed(1)` on a condition-score value, **then** the call site either lives in the shared module or consumes a pre-formatted string produced by the shared module.
3. **Given** I change the score formula, the decimal precision, or the color palette in the shared module, **when** I reload any of the three views, **then** all three show the change with no per-view edits.
4. **Given** a new view wants to render this score, **then** it can import the shared module and render a cell without re-deriving any logic.

## Functional Requirements

- **FR-001:** `canonicalConditionSummary.ts` MUST expose on the `CanonicalConditionSummary` type:
  - `netScore: number | null` — `null` only when `totalTrials === 0`.
  - `direction: 'self' | 'opponent' | 'neutral'` — per FR-003.
  - `hasData: boolean` — `true` iff `totalTrials > 0`. Provided on the summary itself so the legend classifier (FR-014) can read it without re-deriving, preserving the single-source goal. The cell-display helper's `hasData` (FR-005) is a pass-through of this field.
- **FR-002:** `netScore` MUST be computed as `((2·strongly + somewhat) − (2·opponentStrongly + opponentSomewhat)) / totalTrials`.
- **FR-003:** Direction tri-state derived from `netScore` using a **display-aligned tolerance of `0.05`** — the smallest value that `toFixed(1)` would round up from zero. This ensures that any `netScore` whose label renders as `0.0` also classifies as neutral (no color). Concrete rules:
  - `Math.abs(netScore) < 0.05` → `direction: 'neutral'`
  - `netScore >= 0.05` → `direction: 'self'`
  - `netScore <= -0.05` → `direction: 'opponent'`
  The shared module MUST expose this tri-state explicitly (`direction: 'self' | 'opponent' | 'neutral'`). The legacy `isOpponent` boolean is **not** re-exposed on the public summary (see FR-008). Callers that only care about the opponent-only axis compute `summary.direction === 'opponent'` inline. (The previous drafts used a `1e-9` tolerance, which was too tight: a cell with `netScore = 0.04` would render label `0.0` in text but still carry directional color — a visual inconsistency between label and background. Aligning tolerance with display precision eliminates that class of mismatch.)
- **FR-004:** `ConditionMatrix`, `ConditionDecisionsTable`, and `PivotAnalysisTable` MUST obtain `netScore`, `direction`, the formatted cell label, the background color, and the text color class from the shared module via **one call** to `getConditionCellDisplay`. No view may recompute any of those five artifacts locally. In particular, the two transcript-based tables MUST stop calling `getCanonicalConditionTextColor` / `getCanonicalConditionBackground` directly at the cell render site; those calls are replaced by the bundle helper.
- **FR-005:** The shared module MUST expose a single cell-render helper with the exact return shape:

  ```ts
  getConditionCellDisplay(summary: CanonicalConditionSummary): {
    netScore: number | null;                           // null when totalTrials === 0
    direction: 'self' | 'opponent' | 'neutral';         // tri-state from FR-003
    label: string;                                     // '—' when totalTrials === 0, else Math.abs(netScore).toFixed(1)
    backgroundColor: string | undefined;               // undefined when direction === 'neutral' OR totalTrials === 0
    textColorClass: string;                            // 'text-gray-500' for neutral / no-data, 'text-blue-700' for self, 'text-orange-700' for opponent
    hasData: boolean;                                  // false when totalTrials === 0
  }
  ```

  This is the only public surface a view renders from. For `direction === 'neutral'` the helper MUST return `backgroundColor: undefined` and `textColorClass: 'text-gray-500'` — no visual bias toward either side.
- **FR-006:** The cell label produced by the shared module MUST be `Math.abs(netScore).toFixed(1)` when `totalTrials > 0`, or `—` when `totalTrials === 0`.
- **FR-007:** The shared module's `getConditionCellDisplay` helper MUST pass `Math.abs(netScore)` (raw magnitude, range `[0, 2]`, **no pre-divide**) into `getCanonicalConditionBackground(score, isOpponent)`. That helper's existing internal math — clamp to `[0, 2]`, divide by `2` to get `[0, 1]`, multiply by `0.5` for the rgba alpha — produces an effective alpha in `[0, 0.5]`. A `netScore` of `±2` produces alpha `0.5`; `netScore` of `0` bypasses the background entirely (see FR-005: `direction === 'neutral'` → `backgroundColor: undefined`).
- **FR-008:** Three legacy fields MUST be removed from the `CanonicalConditionSummary` public type: `winnerScore`, `selectedValueWinRate`, and `isOpponent`. No TypeScript `any` suppressions MAY be used to hide any removal. Callers that want the opponent-only axis derive it locally as `summary.direction === 'opponent'`. If internal summarizer logic still needs to compute a win rate during aggregation, it stays a local variable inside the summarizer and is not re-exposed on the returned summary.
- **FR-009:** The old `ConditionMatrix` helpers `getPreferenceBackground` and `getPreferenceTextColor` MUST be deleted; the shared helpers `getCanonicalConditionBackground` and `getCanonicalConditionTextColor` are the only color helpers that remain.
- **FR-010:** Arithmetic that computes the cell's `netScore`, rendered label, background color, or opacity MUST NOT reference raw count fields (`strongly`, `somewhat`, `opponentStrongly`, `opponentSomewhat`) outside the shared module. Read-only reads of those fields for unrelated UI purposes — legend bucket classification, tooltip text, click-filter decisions — are explicitly permitted.
- **FR-011:** The shared module MUST expose a counts-based summarizer in addition to the existing transcripts-based one:

  ```ts
  export type CanonicalConditionCounts = {
    strongly: number;
    somewhat: number;
    opponentStrongly: number;
    opponentSomewhat: number;
    neutral: number;
  };

  export function summarizeCanonicalConditionCounts(
    counts: CanonicalConditionCounts,
  ): CanonicalConditionSummary;
  ```

  The input type `CanonicalConditionCounts` declares **only** these five fields. TypeScript's structural typing means a caller could in principle pass a broader object (e.g. a `MatrixCondition` that happens to include these five fields plus others); the summarizer MUST ignore any unlisted properties and compute `totalTrials` internally as `strongly + somewhat + opponentStrongly + opponentSomewhat + neutral`. It MUST NOT accept or read any external `totalTrials`, `prioritized`, `deprioritized`, or `unknownCount` from its argument, even if those fields are present. Call sites MUST pass a plain object literal constructed from the five canonical fields — a unit test MUST assert that passing a full `MatrixCondition` produces the same summary as passing only the five canonical fields (equivalent to asserting the summarizer truly ignores extras). A branded nominal type was considered and declined as scope creep. Both summarizers (`summarizeCanonicalConditionTranscripts` and `summarizeCanonicalConditionCounts`) MUST return the identical `CanonicalConditionSummary` shape so every downstream helper (`getConditionCellDisplay`, `getCanonicalConditionBackground`, `getCanonicalConditionTextColor`) is view-agnostic.

- **FR-012:** `ConditionMatrix`'s `validateMatrixCondition` MUST continue to validate the full `MatrixCondition` schema inline. This is non-canonical shape validation, not score arithmetic, and the existing user-visible red callout for malformed data MUST be preserved. Four specific changes are required:
  1. Remove the `Number.isInteger` check. Fractional counts are legitimate after PR #667 (`Int → Float`); the validator accepts any `Number.isFinite(value) && value >= 0`.
  2. Replace the strict `condition.totalTrials !== expectedTotal` equality with a floating-point tolerant check: `Math.abs(condition.totalTrials − expectedTotal) >= 1e-6`.
  3. **Cross-field consistency check (closes the two-path validation gap):** additionally require
     - `Math.abs((strongly + somewhat) − prioritized) < 1e-6`
     - `Math.abs((opponentStrongly + opponentSomewhat) − deprioritized) < 1e-6`

     If either fails, `validateMatrixCondition` returns a descriptive error naming the divergent field pair, and the red callout fires with that message. This ensures the canonical counts that feed the score agree with the non-canonical counts that feed other UI elements (e.g. the `prioritized`/`deprioritized` totals shown elsewhere in the matrix).
  4. `validateMatrixCondition` returns an error (not `null`) in any of the above failure modes; the existing consumer of the error message keeps displaying it unchanged.

  No score, label, color, or opacity arithmetic happens in this function — it is schema validation only. All score-producing arithmetic on canonical counts lives in `summarizeCanonicalConditionCounts`.

- **FR-013:** `ConditionDecisionsTable` and `PivotAnalysisTable` MUST route every per-cell style decision (background color, text color class, cell label) through the return value of `getConditionCellDisplay(summary)`. Direct calls to `getCanonicalConditionTextColor(summary.isOpponent)` or `getCanonicalConditionBackground(summary.winnerScore, summary.isOpponent)` at a score-cell render site MUST be deleted. (These helpers may remain exported from the shared module, but only the bundle helper calls them internally.)

- **FR-014:** `PivotAnalysisTable`'s cell-bucket classifier MUST migrate from the removed `summary.isOpponent` to `summary.direction`, preserving today's exact bucket semantics (no new thresholds introduced):
  - `opponent` bucket: `direction === 'opponent' && hasData` (maps from today's `isOpponent === true`)
  - `neutral` bucket: `direction === 'neutral' && hasData` (maps from today's "all-neutral" guard — but now correctly includes mixed-count ties thanks to FR-003's tri-state)
  - `low` bucket: `direction === 'self' && hasData` (maps from today's fall-through "else" branch)
  - Zero-trial cells (`hasData === false`) are excluded from all buckets — preserving today's pre-classification guard

  No magnitude threshold on `Math.abs(netScore)` is introduced; today's legend has no such threshold, and this feature doesn't add one. Bucket labels and ordering remain as-is. The one behavioral change vs today: ties with mixed directional counts move from `low` to `neutral` (intended — that's the bias fix).

## Success Criteria

- **SC-001:** All three target views render the same `toFixed(1)` label for the same raw count tuple (verified by unit tests covering at least the five acceptance scenarios in US1).
- **SC-002:** No test is suppressed or marked `.skip` as part of this change.
- **SC-003:** Preflight Gate passes for `@valuerank/web` (lint + test + build); no other workspace needs to change.
- **SC-004:** `grep "winnerScore"` returns zero matches in `cloud/apps/web/src` after the change.
- **SC-005:** The Condition Matrix on the domain analysis value-detail page visibly displays decimals (e.g. `0.2`) instead of integer labels (`0`, `1`, `2`) for the five acceptance scenarios.
- **SC-006:** Each of the three view components contains zero **score-producing** arithmetic on canonical count fields after the change. Verified by grep against three narrow patterns inside the three view files, with one explicit exemption:

  **Grep patterns that MUST return zero hits** outside the shared module:
  1. No `(2 *` or `2*` applied to `strongly`, `somewhat`, `opponentStrongly`, or `opponentSomewhat`.
  2. No `.toFixed(` called on a value whose source is one of those four fields.
  3. No `Math.abs(` applied to a value derived from those four fields in the same expression.

  **Exemption:** `validateMatrixCondition` in `ConditionMatrix.tsx` is permitted to contain `Math.abs(...)` expressions on canonical count fields (per FR-012's cross-field consistency checks and the tolerant `totalTrials` equality). These are schema validation, not score arithmetic — they do not compute the label, color, opacity, or `netScore`. The grep gate MUST scope out this function specifically (e.g. `grep -v` the line range of `validateMatrixCondition`, or limit the grep to `getConditionMatrixDisplay` and sibling render-path code).

  Read-only field access for non-score purposes (legend bucket classification via `summary.direction` / `summary.hasData`, tooltip text from `summary.unknownCount`, click-filter routing from `summary.conditionName`) is explicitly permitted and not caught by the above patterns. Future score or color changes can be made by editing only the shared module.

## Edge cases

- **Zero trials:** `totalTrials === 0` → `netScore` is `null`, `direction` is `'neutral'`, label `—`, no background, `text-gray-500`.
- **True tie with non-zero trials:** `Math.abs(netScore) < 0.05` → `direction` is `'neutral'`, label `0.0`, no background, `text-gray-500` (no color bias toward either side).
- **Near-tie from rounding or fractional inputs:** the `0.05` tolerance in FR-003 absorbs two cases simultaneously: (a) floating-point residue on fractional counts producing e.g. `netScore = 1e-17`, and (b) genuine near-ties like `netScore = 0.04` that would otherwise display label `0.0` while still carrying directional color. Both render as `'neutral'` with a plain `0.0` label.
- **All neutrals, no strong/somewhat:** `strongly = somewhat = opponentStrongly = opponentSomewhat = 0`, `neutral > 0` → `netScore = 0` exactly, same render path as tie.
- **Fractional counts (run-count normalization):** upstream pipeline can emit fractional counts (e.g. `10.5`) — confirmed legitimate after PR #667 (`Int → Float`). Neither the counts summarizer nor `validateMatrixCondition` may reject them. `toFixed(1)` handles display.
- **Selected side blowout:** `strongly = totalTrials`, everything else 0 → `netScore = +2`, label `2.0`, full-opacity blue.
- **Opponent blowout:** `opponentStrongly = totalTrials`, everything else 0 → `netScore = -2`, label `2.0`, full-opacity orange.
- **MatrixCondition sum inconsistency (defensive, three gates):** `validateMatrixCondition` surfaces the red callout if any of the following diverges by `>= 1e-6`:
  1. `totalTrials` vs `prioritized + deprioritized + neutral` (non-canonical schema check)
  2. `prioritized` vs `strongly + somewhat` (cross-field canonical/non-canonical)
  3. `deprioritized` vs `opponentStrongly + opponentSomewhat` (cross-field canonical/non-canonical)

  This closes the two-path gap where the score denominator (canonical) and the schema validator (non-canonical) could disagree.
- **Legend bucket for a tie with mixed counts:** e.g. `strongly = opponentStrongly = 1`, `somewhat = opponentSomewhat = 0`, `neutral = 0`. `netScore = 0`, `direction = 'neutral'`, `hasData = true`. The `PivotAnalysisTable` legend classifier (FR-014) counts this in the `neutral` bucket, not `low`.
- **Legend bucket for a zero-trial cell:** `totalTrials = 0`, `direction = 'neutral'`, `hasData = false`. Legend classifier skips this cell entirely — it does not count in any bucket (matches today's behavior).
- **Multiple invalid matrix rows:** pre-existing `validateMatrixCondition` surfaces only the first offending row's error message and halts render. If multiple rows are malformed, users see a fix-reload-repeat cycle. This is unchanged by the feature — fixing it (collect-all-errors) is out of scope. Documented so future work can pick it up.

## Constitution check

Relevant rules from `cloud/CLAUDE.md`:

- File size: all touched files remain under 400 lines. `ConditionMatrix.tsx` should shrink.
- No `any`: shared helper return type already typed; no suppression needed.
- Strict null checks: `netScore` nullable on zero trials; call sites already guard via `totalTrials > 0`.
- Logging: no new logs required.
- Terminology: `winnerScore` is a purely internal name; rename is consistent with glossary.

Verdict: **PASS**.

## Artifacts

- Workflow root: `docs/workflow/feature-runs/unified-net-weighted-condition-score/`
- This spec: `spec.md`
- Runtime state: `state.json`
- Scope paths (registered via `init`):
  - `cloud/apps/web/src/utils/canonicalConditionSummary.ts`
  - `cloud/apps/web/src/components/domains/ConditionMatrix.tsx`
  - `cloud/apps/web/src/components/analysis/ConditionDecisionsTable.tsx`
  - `cloud/apps/web/src/components/analysis/PivotAnalysisTable.tsx`
