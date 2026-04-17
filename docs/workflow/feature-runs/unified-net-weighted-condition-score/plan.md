# Plan: Unified Net-Weighted Condition Score

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: All findings addressed in spec.md Round-7 revisions (Checkpoint resolution log). Advancing to plan authoring.
- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: All findings addressed in spec.md Round-7 revisions (Checkpoint resolution log). Advancing to plan authoring.
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: All findings addressed in spec.md Round-7 revisions (Checkpoint resolution log). Advancing to plan authoring.
- review: reviews/plan.codex.architecture-adversarial.review.md | status: accepted | note: Round-6 final: all findings documented in plan.md Review Reconciliation block. Codex runner failed twice; architecture and implementation lenses were covered in Rounds 3 and 4 respectively.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: Round-6 final: all findings documented in plan.md Review Reconciliation block. Codex runner failed twice; architecture and implementation lenses were covered in Rounds 3 and 4 respectively.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: Round-6 final: all findings documented in plan.md Review Reconciliation block. Codex runner failed twice; architecture and implementation lenses were covered in Rounds 3 and 4 respectively.
- review: reviews/plan.codex.implementation-adversarial.review.md (Round 2) | status: accepted | note: HIGH (grep `selectedValueWinRate` unsatisfiable) fixed — gate narrowed to the 4 in-scope files + shared-type file; whole-tree grep would false-positive on legitimate vignette/generated code. MEDIUM (zero-trial placeholder regression) fixed — Slices 2 and 3 now explicitly preserve existing `hasData` forks; bundle helper only renders has-data branch.
- review: reviews/plan.codex.architecture-adversarial.review.md (Round 2) | status: accepted | note: HIGH (grep gate) addressed via the same narrowing above. HIGH (`analysisSemantics.utils.ts` still requires integer counts) accepted as out-of-scope — that file is part of `analysis-v2`, not touched by this feature; fractional counts are forward-compat only per spec non-goals. If a future run migrates analysis-v2 to floats, that's a separate task. MEDIUM (subset-input defense coerces to 0, weaker than `unknownCount` tracking) accepted — the counts helper input is by definition pre-tallied canonical data with no un-canonicalizable residue; coercing missing-field to 0 matches the existing transcript summarizer's "missing data is zero trials" semantics rather than introducing a new error mode.
- review: reviews/plan.codex.architecture-adversarial.review.md (Round 3) | status: accepted | note: HIGH (locale dep on `localeCompare`) explicitly deferred per spec non-goals — direction assignment already has this property in production, this feature does not regress it. MEDIUM (helpers exported, bypass possible) accepted — widened grep gate (full src tree) plus convention is the agreed enforcement; making them non-exports breaks the bundle helper's own imports.
- review: reviews/plan.codex.implementation-adversarial.review.md (Round 3) | status: accepted | note: MEDIUM (no-data placeholder fragmented across views) **fixed** — bundle helper now owns the no-data branch; returns `{ label: '—', textColorClass: 'text-gray-500', backgroundColor: undefined }` for `hasData: false`. All three views drop their inner hasData fork. MEDIUM (ConditionMatrix keeps local `hasData` gate) **fixed** — outer `condition === undefined` check stays (that's "cell not in grid"), inner "condition has no trials" fork is dropped.
- review: reviews/plan.gemini.testability-adversarial.review.md (Round 3) | status: accepted | note: HIGH (single-source for no-data) **fixed** per above. MEDIUM (deferred copy) **fixed** — draft copy inlined in Slice 3 scope. MEDIUM (no inconsistent-extras test) **fixed** — added explicit test case to Slice 1 tests.
- review: reviews/plan.codex.architecture-adversarial.review.md (Round 4) | status: accepted | note: Review runner FAILED — the Codex process didn't produce valid output. No content to reconcile. Not re-running: Round 3 already exercised this lens and prior findings (locale, export-helper) are accepted/deferred.
- review: reviews/plan.codex.implementation-adversarial.review.md (Round 4) | status: accepted | note: MEDIUM (grep gate misses `getConditionMatrixDisplay`/`getPreferenceBackground`/`getPreferenceTextColor` wrappers) **fixed** — added SC-006.4 grep gate targeting these three names across full src tree.
- review: reviews/plan.gemini.testability-adversarial.review.md (Round 4) | status: accepted | note: MED #1 (no help-text test) **fixed** — added substring test. MED #2 (no zero-trial placeholder test for ConditionMatrix) **fixed** — added to Slice 2 tests. MED #3 (prefer runtime mock over grep) **accepted** — grep is sufficient for a convention enforced across a 3-file surface; runtime spy would add test fragility without meaningful uplift. LOW #4 (null/NaN input) **accepted** — inputs to `summarizeCanonicalConditionCounts` come from either (a) `MatrixCondition`, which `validateMatrixCondition` already filters via `Number.isFinite && >= 0`, or (b) the shared type which enforces `number`. Introducing null/NaN requires going around the validator and the type system, which is out of scope.
- review: reviews/plan.codex.architecture-adversarial.review.md (Round 5) | status: accepted | note: Runner FAILED (no content). Round 3 already covered this lens. Advancing to tasks phase after 5 rounds.
- review: reviews/plan.codex.implementation-adversarial.review.md (Round 5) | status: accepted | note: Runner FAILED (no content). Round 4 already covered this lens. Advancing to tasks phase after 5 rounds.
- review: reviews/plan.gemini.testability-adversarial.review.md (Round 5) | status: accepted | note: HIGH (leaky abstraction re-raise) same concern from Round 2+3 MED — helpers stay exported, grep gates enforce convention. MEDIUM (defensive-behavior spec/plan discrepancy) accepted — coerce-to-0 for missing keys is an implementation detail of Slice 1, documented here. 0 unaddressed HIGH findings across all 5 plan rounds.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: HIGH (neutral-tie branch missing from bundle helper) fixed in tasks.md; MEDIUM (1.5 test flip) fixed via S2-T5; MEDIUM (Details click) fixed via S3-T6.
- review: reviews/tasks.codex.dependency-order-adversarial.review.md | status: accepted | note: MEDIUM (existing 1.5 rejection test stale) fixed via S2-T5 flip. MEDIUM (help-text showDetails gate) fixed via S3-T6 click. LOW (no direct totalTrials mismatch regression in Slice 2) fixed — S2-T5 adds off-by-1 totalTrials test that must fire the red callout.
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: MEDIUM (non-finite value coverage) fixed via S1-T6 null/NaN defense test. MEDIUM (tolerance boundary coverage) fixed via S2-T5 four boundary tests. LOW (static test-file list vs grep-derived) accepted — list was derived from the grep at plan authoring time; additional files added inline if Slice 3 dispatch surfaces them.
- review: reviews/diff.codex.correctness-adversarial.review.md | status: accepted | note: MEDIUM #1 (tie cells visually same as empty except label) accepted as intended per FR-007/FR-008 — the spec-sanctioned visual distinction between tie and no-data is the label character ('0.0' vs '—'), both with gray text and no fill. Help copy 'Gray boxes mean the model's preferences canceled out (a tie)' refers to the gray text color, not a gray background fill. LOW #2 (0.05 boundary: direction='neutral' but label rounds to '0.1') accepted as acknowledged edge case — the strict '> 0.05' tolerance was chosen to match toFixed(1) magnitude precision; netScore values landing exactly at 0.05 are vanishingly rare in real data and the canonicalConditionSummary tests cover the boundary behavior at the direction level.
- review: reviews/diff.codex.regression-adversarial.review.md | status: accepted | note: MEDIUM #1 (0.05 boundary label mismatch) accepted — same disposition as correctness LOW: strict '> 0.05' tolerance matches toFixed(1) magnitude precision; the real-world probability of netScore landing exactly at 0.05 is vanishingly small, and canonicalConditionSummary tests cover boundary direction. MEDIUM #2 (broadened neutral bucket in legend) accepted — this is the intended FR-014 migration: legend counts now key off summary.direction + summary.hasData rather than the old brittle 'neutral count > 0 with no strong/lean' check. The semantic shift is documented in plan.md and reflected in the new help copy.
- review: reviews/diff.gemini.quality-adversarial.review.md | status: accepted | note: HIGH (potential logic change in analysis summary) FALSE POSITIVE — reviewer flagged 'unseen abstraction' but summary.direction was landed in Slice 1 (commit 3664de01) with 17 unit tests in canonicalConditionSummary.test.ts covering tri-state classification and boundary tolerances. The bucket-classifier change is the intentional FR-014 migration. MEDIUM (blind refactoring to unseen abstraction) FALSE POSITIVE — same root cause: getConditionCellDisplay was landed in Slice 1 with full test coverage; the 'tie gray' behavior was specified in plan.md and implemented + tested in Slice 1. Reviewer was reviewing the Slice 3 diff only and lacked Slice 1 context. LOW (hasData vs totalTrials inconsistency) accepted as minor stylistic nit — the two fields are equivalent by construction (hasData === totalTrials > 0); using both does not affect behavior. Acceptable code smell; not worth a follow-up refactor.

## Architecture overview

Every downstream view converges on one shared surface: `canonicalConditionSummary.ts` becomes the single source of truth for score, direction, label, and color. Views import the bundle helper `getConditionCellDisplay(summary)` and render directly from its return — no inline math, no per-view color helpers.

```
canonicalConditionSummary.ts (shared)
  summarizeCanonicalConditionTranscripts(transcripts) ──┐
  summarizeCanonicalConditionCounts(counts) ────────────┤
                                                         ▼
                                       CanonicalConditionSummary
                                     { netScore, direction, hasData,
                                       strongly, somewhat, …,
                                       totalTrials, unknownCount }
                                                         │
                                                         ▼
                                           getConditionCellDisplay
                                     { netScore, direction, label,
                                       backgroundColor, textColorClass,
                                       hasData }
                                                         │
              ┌──────────────────────┬──────────────────┴────────────┐
              ▼                      ▼                               ▼
       ConditionMatrix        ConditionDecisionsTable        PivotAnalysisTable
       (counts path)          (transcripts path)             (transcripts path)
```

Three legacy surface fields are removed: `winnerScore`, `selectedValueWinRate`, `isOpponent`. Callers that need the opponent axis inline `summary.direction === 'opponent'`.

## Slice strategy

Three slices, each independently verifiable. Slice 1 is the biggest (all the shared-module surgery) and unblocks slices 2 and 3. Slices 2 and 3 are structurally similar (update a view to consume the new helper) and can land in either order.

### Slice 1 — Shared module rewrite (`canonicalConditionSummary.ts`)

Scope:
- Replace `winnerScore` computation with `netScore` (signed, range `[-2, +2]`, `null` on zero trials).
- Add `direction` field with `0.05` tolerance tri-state (per FR-003).
- Add `hasData: boolean` field to `CanonicalConditionSummary` (per FR-001).
- Remove `winnerScore`, `selectedValueWinRate`, `isOpponent` from the public summary type (per FR-008). Internal aggregation may keep a local win rate if needed; it is not re-exposed.
- Add `summarizeCanonicalConditionCounts(counts: CanonicalConditionCounts): CanonicalConditionSummary` (per FR-011). `CanonicalConditionCounts` declares exactly the 5 canonical count fields; the summarizer computes `totalTrials` internally and ignores any superset fields.
- Add `getConditionCellDisplay(summary)` bundle helper returning `{ netScore, direction, label, backgroundColor, textColorClass, hasData }` (per FR-005). Internal calls to `getCanonicalConditionBackground` and `getCanonicalConditionTextColor` stay there.
  - **Label formatting rule**: for `hasData === true`, `label = Math.abs(netScore).toFixed(1)` (positive decimal, direction via color). A raw negative `netScore` must never surface as `-2.0` or `-0.0`.
  - **No-data rule (unified placeholder)**: for `hasData === false`, the helper returns `{ label: '—', backgroundColor: undefined, textColorClass: 'text-gray-500', … }`. The em-dash and gray-500 class become the single source of truth across all three views — today the three views show `-` / `—` / `—` in `text-gray-400` / `text-gray-500` / `text-gray-500`. This is a small, intentional UX alignment win that falls out of the refactor. Views stop forking on `summary.hasData` at the label site and render `display.label` + `display.textColorClass` + `display.backgroundColor` directly.
- Keep `getCanonicalConditionBackground` and `getCanonicalConditionTextColor` exported (used internally by the bundle helper; may still be used outside the three target views for now — convention enforced by the widened FR-013 grep gate).
- **Rewrite the shared-module test file** `tests/utils/canonicalConditionSummary.test.ts` (253 lines, ~31 references to removed fields). Existing assertions on `selectedValueWinRate`, `isOpponent`, `winnerScore` must all be replaced with the new surface (`netScore`, `direction`, `hasData`). This is part of Slice 1's scope — not deferred — because the Slice 1 diff would fail immediately without it.

Tests (rewritten `canonicalConditionSummary.test.ts`):
- Five US1 acceptance scenarios produce correct `netScore`, `direction`, `label` (absolute magnitude, no sign), `backgroundColor`, `textColorClass`.
- Zero-trial case: `hasData === false`, `netScore === null`, `direction === 'neutral'`, and through the bundle helper: `label === '—'`, `backgroundColor === undefined`, `textColorClass === 'text-gray-500'`.
- Inconsistent-extras case (per plan-review MED): `summarizeCanonicalConditionCounts({strongly: 2, somewhat: 3, opponentStrongly: 1, opponentSomewhat: 0, neutral: 0, prioritized: 999, deprioritized: 999, totalTrials: 999})` must return the same summary as the canonical-only input — non-canonical fields are ignored even when they contradict the canonical counts.
- Fractional-count case: e.g. `strongly: 5.5, somewhat: 2.3, opponentStrongly: 1.2, opponentSomewhat: 0.5, neutral: 0.5` → finite `netScore`, non-crash.
- Superset-input-ignored case: passing a `MatrixCondition` with extras (prioritized, deprioritized, totalTrials, unknownCount) yields the same summary as passing only the 5 canonical fields.
- **Subset-input defense (per plan-review MED)**: passing an object missing one of the 5 keys (e.g. `neutral: undefined`) must not crash; the summarizer treats missing/non-finite as `0` (same defensive posture as `summarizeCanonicalConditionTranscripts`).
- **Direction tolerance boundary (per plan-review MED)**: `netScore = 0.04999` → `direction === 'neutral'`; `netScore = 0.05` → `direction === 'self'` (or the documented boundary inclusion per FR-003 — test both sides of the cutoff so the comparator direction is locked in).
- Label-sign case: contrive counts producing `netScore = -1.8` → `label === '1.8'` (no minus), `textColorClass` reflects opponent direction.

Verification:
- `npm run test --workspace @valuerank/web -- canonicalConditionSummary`
- `npx tsc --noEmit` from `cloud/apps/web/` to catch any downstream type breakage (will flag consumers until slices 2 and 3 land — expected).

### Slice 2 — `ConditionMatrix.tsx` migration (counts-based consumer)

Scope:
- Delete `getConditionMatrixDisplay`, `getPreferenceBackground`, `getPreferenceTextColor` from `ConditionMatrix.tsx` (per FR-013 + scope-list).
- At the cell render site, call:
  ```ts
  const summary = summarizeCanonicalConditionCounts({
    strongly, somewhat, opponentStrongly, opponentSomewhat, neutral,
  });
  const display = getConditionCellDisplay(summary);
  ```
  **Drop the inner `hasData` fork** at the label site. The outer `condition === undefined` check (cell missing from the matrix grid, distinct from "cell exists but has 0 trials") stays — that guards `summarizeCanonicalConditionCounts` from being called with undefined. Once a summary exists, render `display.label` / `display.textColorClass` / `display.backgroundColor` unconditionally. The bundle helper's no-data branch now owns the `—` / `text-gray-500` styling that used to be inline. Result: placeholder changes from `-` (hyphen, gray-400) to `—` (em-dash, gray-500) for zero-trial cells — matches the other two views.
- Update `validateMatrixCondition`:
  - Remove `Number.isInteger` from `isValidCount` — accept any `Number.isFinite && >= 0`.
  - Replace `condition.totalTrials !== expectedTotal` with `Math.abs(condition.totalTrials - expectedTotal) >= 1e-6`.
  - Add the two cross-field checks (per FR-012.3):
    - `Math.abs((strongly + somewhat) - prioritized) < 1e-6`
    - `Math.abs((opponentStrongly + opponentSomewhat) - deprioritized) < 1e-6`
  - Error message names the divergent field pair; existing red-callout render site consumes the error unchanged.

Tests:
- `tests/pages/DomainAnalysisValueDetail.test.tsx` — assert cells render decimal labels (`0.2`, `2.0`, `1.8`, `0.0`) with correct color classes, not `0 | 1 | 2`.
- Add a test that feeds a fractional `MatrixCondition` (e.g. `prioritized: 10.5, deprioritized: 9.5, neutral: 0`) and asserts it renders without the red callout.
- Add a test that feeds a cross-field inconsistent `MatrixCondition` (`prioritized: 10, strongly + somewhat: 5`) and asserts the red callout fires with the divergent-field error.
- Add a test that asserts a zero-trial `MatrixCondition` renders the unified placeholder: `—` in `text-gray-500`, no background color, no decimal label.

Verification:
- `npm run test --workspace @valuerank/web -- DomainAnalysisValueDetail`
- `npx tsc --noEmit` should now be clean for `ConditionMatrix.tsx`.

### Slice 3 — Transcript-based views (`ConditionDecisionsTable.tsx`, `PivotAnalysisTable.tsx`)

Scope:
- In both files, replace the per-cell render path:
  ```ts
  // OLD
  const bg = getCanonicalConditionBackground(summary.winnerScore, summary.isOpponent);
  const textClass = getCanonicalConditionTextColor(summary.isOpponent);
  const label = summary.winnerScore.toFixed(1);
  // NEW
  const display = getConditionCellDisplay(summary);
  // use display.backgroundColor, display.textColorClass, display.label
  ```
  **Simplify no-data branches**: `ConditionDecisionsTable.tsx`'s outer `hasResolvedCanonicalEvidence` gate and `PivotAnalysisTable.tsx`'s outer `hasScore && summary != null` gate are about whether a summary object exists at all. Once a summary exists, remove the inner `summary.winnerScore == null ? '—' : ...` ternary — the bundle helper's no-data branch now returns the `—` placeholder directly. The end visual for zero-trial cells is identical to today in these two views (already `—` / gray-500).
- `PivotAnalysisTable.tsx` also:
  - Migrate legend bucket classifier (per FR-014): `opponent`/`neutral`/`low` all key off `summary.direction` + `summary.hasData`. No magnitude threshold on `Math.abs(netScore)` (per Round-7 correction).
  - Update the stale help/legend copy (per Round-5 finding): replace *"Each box in the table shows the model's average preference score (0–2)"* with the following draft copy (minor edits in tasks phase allowed if they improve clarity):

    > *Each box shows a net-weighted preference score from 0.0 to 2.0. Color indicates which side the model preferred: blue for the first value, orange for the opposing value. Gray boxes mean the model's preferences canceled out (a tie). Empty boxes mean no data.*

    Placement: same location as current help text. This is the exact string the legend classifier's color bucket labels should match against in any visual-regression check.

Tests:
- `tests/components/analysis/ConditionDecisionsTable.test.tsx` — update hardcoded label assertions from old winner-only decimals to new net-weighted decimals.
- `tests/components/analysis/PivotAnalysisTable.test.tsx` — update hardcoded `2.0` labels and click-through assertions; add a tie-bucket test (mixed-count tie → `neutral` bucket, not `low`); add a zero-trial test (`hasData === false` → excluded from all buckets).
- `tests/components/analysis/AnalysisPanel.pairedContent.test.tsx` — update any score-value assertions to match the new formula.
- Add a test that the PivotAnalysisTable help-text legend contains the new draft copy (checking for substring *"net-weighted preference score"* is sufficient to catch a copy revert).
- `tests/components/analysis/AnalysisPanel.layout.test.tsx` and `.states.test.tsx` — update only if they assert score values.

Verification:
- `npm run test --workspace @valuerank/web -- ConditionDecisionsTable PivotAnalysisTable AnalysisPanel`
- Full preflight on `@valuerank/web`: lint + test + build.

## Checkpoint boundaries

Three slices, one diff checkpoint per slice plus the final closeout. Tasks file will enumerate the codex dispatch for each slice.

| Slice | Checkpoint | Reviewers |
|-------|-----------|-----------|
| 1 (shared module) | diff | Codex feas-adversarial + Codex edge-cases + Gemini requirements |
| 2 (ConditionMatrix) | diff | Codex feas-adversarial + Gemini requirements |
| 3 (transcript tables) | diff | Codex feas-adversarial + Codex edge-cases + Gemini requirements |
| Final | closeout | single pass |

Slice 2 omits the edge-cases lens because the adjacent slice 3 (same render pattern) covers the display edge cases. If slice 2's diff review surfaces anything non-trivial we'll add the edge-cases lens back.

## Grep gates (ship checks)

Before opening the PR, these greps MUST return the expected results:

| Gate | Command | Expected |
|------|---------|----------|
| SC-004 | `grep -rn "winnerScore" cloud/apps/web/src` | 0 matches |
| SC-004 (narrowed) | `grep -n "selectedValueWinRate" cloud/apps/web/src/utils/canonicalConditionSummary.ts cloud/apps/web/src/components/domains/ConditionMatrix.tsx cloud/apps/web/src/components/analysis/ConditionDecisionsTable.tsx cloud/apps/web/src/components/analysis/PivotAnalysisTable.tsx` | 0 matches. **Scope rationale:** `selectedValueWinRate` legitimately remains in the GraphQL schema, generated types, `domainAnalysis.ts` operation, and `DomainAnalysisValueDetail.tsx` vignette header — all captured in Out-of-scope. The feature removes the field from the **`CanonicalConditionSummary` type**, not from the codebase. A whole-tree grep would fail on unrelated, out-of-scope code. |
| SC-004 (type-level) | `grep -nE "selectedValueWinRate\|isOpponent\|winnerScore" cloud/apps/web/src/utils/canonicalConditionSummary.ts` | 0 matches (shared summary type is clean). |
| SC-006.1 | `grep -nE "\(2 ?\*" cloud/apps/web/src/components/domains/ConditionMatrix.tsx cloud/apps/web/src/components/analysis/ConditionDecisionsTable.tsx cloud/apps/web/src/components/analysis/PivotAnalysisTable.tsx` | 0 matches |
| SC-006.2 | `grep -nE "\.toFixed\(" cloud/apps/web/src/components/domains/ConditionMatrix.tsx cloud/apps/web/src/components/analysis/ConditionDecisionsTable.tsx cloud/apps/web/src/components/analysis/PivotAnalysisTable.tsx` | 0 matches (labels come from bundle helper) |
| SC-006.3 exemption | `grep -n "Math.abs" cloud/apps/web/src/components/domains/ConditionMatrix.tsx` | only inside `validateMatrixCondition` |
| SC-006.4 | `grep -nE "getConditionMatrixDisplay\|getPreferenceBackground\|getPreferenceTextColor" cloud/apps/web/src` | 0 matches (removed in Slice 2 — no wrapper can survive) |
| FR-013 | `grep -rnE "getCanonicalConditionTextColor\|getCanonicalConditionBackground" cloud/apps/web/src --include="*.tsx" --include="*.ts" \| grep -v canonicalConditionSummary.ts` | 0 matches outside the shared module (routed through bundle helper). Scope widened from `components/analysis/` to the full `src` tree so any future bypass in `components/domains/`, `pages/`, or `hooks/` is caught. |

## Risks and mitigations

| Risk | Mitigation |
|------|-----------|
| Consumers of `isOpponent` / `selectedValueWinRate` / `winnerScore` outside the 3 target files | `tsc --noEmit` in slice 1 surfaces them immediately; fix forward or add to slice 3's scope if trivial. |
| Legend-copy change accidentally flips wording that describes the unchanged `ConditionDecisionsTable` help text | Limit copy edits to `PivotAnalysisTable.tsx`. Keep a grep check that `ConditionDecisionsTable.tsx`'s existing help-text strings are unchanged in the diff. |
| Floating-point residue on fractional counts flips direction near `0` | FR-003's `0.05` tolerance is aligned with display precision; unit test covers `netScore = 0.04` → `direction = 'neutral'`. |
| Cross-field validator fires on legitimately-aligned data due to float arithmetic | Tolerance `1e-6` is orders of magnitude larger than typical float residue on single-digit additions. Unit test covers clean and dirty cases. |
| A downstream test asserts the old labels and was missed | `tasks.md` enumerates every test touched by slice 3 by running `grep -rn "winnerScore" cloud/apps/web/tests` before Codex dispatch. |

## Out-of-scope (deferred)

All non-goals from spec.md carry forward unchanged. Notable items worth calling out:

- `localeCompare` host-locale dependency in `getCanonicalBucket` — separate fix.
- `ConditionMatrix` 3+ dimension flattening — pre-existing display limit.
- `validateMatrixCondition` first-error-only reporting — pre-existing UX.
- Accessibility / aria-label strings on score cells — can be added to the bundle helper later without architectural changes.
- Win-rate-based copy elsewhere in the app (e.g. "Win rate" label from `selectedValueWinRate` removal aftermath) — captured as a follow-up cleanup task.
