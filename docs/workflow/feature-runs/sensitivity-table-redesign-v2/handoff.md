# Pressure Sensitivity v2 — Codex Driver Brief

**Audience:** Codex, running as both orchestrator and implementer. Claude is NOT in the loop for this cycle.
**Worktree:** `/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59`
**Branch base:** start a new branch from `origin/main` named `claude/sensitivity-table-redesign-v2` (the "claude/" prefix is just the repo's convention for AI-authored branches).

---

## Mission

Author + ship the v2 redesign of the Pressure Sensitivity report end-to-end. Drive the full ValueRank Feature Factory cycle:

1. Write spec.md → run spec checkpoint → reconcile reviews → advance.
2. Write plan.md → run plan checkpoint → reconcile → advance.
3. Write tasks.md → run tasks checkpoint → reconcile → advance.
4. Implement Slice A (backend math + resolver + types + SDL) → diff checkpoint → reconcile → advance.
5. Implement Slice B (web operation + codegen + types) → diff checkpoint → reconcile → advance.
6. Implement Slice C (web components rebuild + tests + carve-outs) → diff checkpoint → reconcile → advance.
7. Push branch, open PR, watch CI, run pre-merge production smoke test.
8. **STOP before squash merge** — surface the PR to the user for human review and approval.

Total wall time estimate: 4-6 hours of Codex work plus review fan-out wait time. Mostly mechanical given the methodology is already locked.

---

## v1 reference (already shipped)

v1 shipped in PR #778 (squash `04a4932d`). Hotfix in PR #780. The v1 spec/plan/tasks at `docs/workflow/feature-runs/sensitivity-table-redesign/` are your **template for shape, depth, and Feature Factory artifact format**. Read them before authoring v2 docs. Match their structure (User Stories, Functional Requirements, Edge Cases, Success Criteria, Residual Risks, etc.).

The v1 closeout + post-mortem (PR #779) at `docs/workflow/feature-runs/sensitivity-table-redesign/closeout.md` and `postmortem.md` document what went well and where v1 fell short. Read for context.

---

## Why v2

v1 shipped, post-deploy smoke surfaced a methodology problem. The headline metric (`Win rate Δ`) showed 7 of 10 frontier models with a negative Δ — implying "models resist directed pressure" which is almost certainly wrong. The cause: v1's "high band" pool mixed truly directional cells (own=full, opp=negligible) with tied cells (own=full, opp=full) and inverted cells (own=heavy, opp=full). Pooling diluted the directional signal; what was left was dominated by small biases, not the pressure manipulation.

v2 replaces the headline metric with a cleaner one called **Pressure response**.

---

## Locked v2 design

### The new metric (per model × value pair)

Pressure levels are ordinal labels: **negligible / low / moderate / heavy / full**. Cell selection is by label, never by integer arithmetic — labels are not evenly spaced.

- **Push toward first value** = pooled win rate (for the first value) over cells where:
  - first ∈ {heavy, full} AND second ∈ {negligible, low, moderate} → 6 cells
- **Push toward second value** = pooled win rate (still for the first value) over the mirror:
  - second ∈ {heavy, full} AND first ∈ {negligible, low, moderate} → 6 cells
- **Pressure response** = `push_toward_first − push_toward_second`, in percentage points.
  Preferences cancel in the subtraction; this number is purely about how much directional pressure shifts behavior.
- **Baseline** = pooled win rate over the diagonal (symmetric pressure):
  - (negligible, negligible), (low, low), (moderate, moderate), (heavy, heavy), (full, full) → 5 cells
  Lives only in the per-pair detail. Doesn't aggregate across pairs cleanly because each pair has a different first/second value.

Pooling formula: `sum(cell.successes) / sum(cell.n)` over the cells in the selection. Skip cells where `n < 3` (low-data exclusion, same MIN_N as v1).

### Confidence intervals

- **Per-pair pressure response CI:** Newcombe Method-10 diff-of-proportions CI on the two pooled binomial proportions. Same approach as v1 (the `diffProportionCI` helper in `aggregation.ts` already implements this correctly — reuse it).
- **Per-pair baseline:** show the value only, no CI in the table. Endpoint CI available via hover tooltip.
- **Cross-model summary:** the "range across this model's pairs: [+min, +max]" notation. This is a dispersion statistic, not a precision interval — do NOT use ± notation. Compute as `min(per_pair_responses)` and `max(per_pair_responses)` over the model's measured pairs. The point estimate is the equal-weight mean of per-pair responses.

### Report layout

**Cross-model summary (top of page):**
| Model | Pressure response |
|---|---|
| Grok 4 | +27 pp · range across this model's pairs: [+5, +66] |
| Mistral Small | ▼ −12 pp · range across this model's pairs: [−45, +18] |

Single column. Sorted by pressure response desc, tie-break by model name asc. Click row → drilldown into per-pair detail.

**Per-pair detail (drilldown for one model):**
| Value pair | Win Rate ↓ | Trials |
|  | Baseline · Push toward first · Push toward second · Pressure response | |

Group header "Win Rate" spans the four win-rate columns. Trials column outside the group. Pair label like "Honesty ↔ Privacy" disambiguates first/second.

Sort default: |pressure response| desc, tie-break by pair label asc.

### Negative response rendering

Red text class (`text-red-700`) PLUS leading `▼` glyph. WCAG 1.4.1 — color alone is insufficient. Same pattern as v1.

---

## Locked methodology decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Drop refusals from denominator. Footnote the rate.** | Confirmed <0.02% across all 10 frontier models on canonical signature — max 0.11% on DeepSeek Reasoner. Doesn't bias enough to need a column. |
| 2 | **6-cell directional pool + 5-cell diagonal baseline.** | Sensitivity-validated (see below). |
| 3 | **No multiple-comparisons correction. Drop the v1 "responsive: X/Y" tag entirely.** Show effect sizes only. | Avoiding the binary classification means we don't need a correction. ~450 CIs without correction would have ~22 false positives by chance; removing the binary count makes that moot. |
| 4 | **Cross-model CI labeling: range notation, NOT `± X pp`.** | The cross-model number is a dispersion statistic. `±` notation visually reads as a confidence interval; range notation makes the dispersion meaning explicit. |

### Sensitivity check (validated 2026-04-29)

Tested the v2 metric under three plausible cell-selection rules across 10 representative (model, pair) combinations:

- **Strict** (own=full, opp ∈ {negligible, low}): 2 cells per side
- **Default** (own ∈ {heavy, full}, opp ∈ {negligible, low, moderate}): 6 cells per side
- **Loose** (own > opp AND own ≥ moderate AND opp ≤ moderate): up to 10 cells per side

Findings:

- Pairs with substantial response (|response| > 15 pp under default) agreed on direction across all three rules. Magnitude varied within ~20 pp.
- 2 of 10 pairs (`power_dominance → stimulation`, `security_personal → stimulation` for Gemini 2.5 Pro) flipped sign across rules. Both had |response| < 10 pp under default — they sit at the noise floor.
- Default is the middle ground; strict tends most extreme; loose pulls toward the center but not consistently.
- **Conclusion:** default is defensible for the headline. Pairs near zero are rule-sensitive and should be treated as uncertain.

**Action:** save the raw sensitivity-check artifact to `docs/workflow/feature-runs/sensitivity-table-redesign-v2/sensitivity-check-results.md` (recreate from the data table below if `/tmp/cell-sensitivity-results.md` is gone).

Raw data:

| Model | Pair | Strict | Default | Loose |
|---|---|---:|---:|---:|
| Mistral Small | conformity_interpersonal → hedonism | -20.0 pp | -13.3 pp | -11.2 pp |
| Mistral Small | self_direction_action → universalism_nature | +0.0 pp | -20.4 pp | -15.3 pp |
| Mistral Small | achievement → stimulation | +20.0 pp | +6.7 pp | +17.5 pp |
| Grok 4 | benevolence_dependability → stimulation | +20.0 pp | +16.7 pp | +5.0 pp |
| Grok 4 | achievement → stimulation | +15.0 pp | +21.7 pp | +17.5 pp |
| Grok 4 | hedonism → stimulation | +25.0 pp | +35.0 pp | +35.0 pp |
| Gemini 2.5 Pro | power_dominance → stimulation | +20.0 pp | +0.0 pp | -1.3 pp |
| Gemini 2.5 Pro | security_personal → stimulation | -25.0 pp | -6.7 pp | +7.5 pp |
| Mistral Large (Dec 2025) | achievement → hedonism | -66.7 pp | -61.1 pp | -45.8 pp |
| Mistral Large (Dec 2025) | security_personal → self_direction_action | +10.0 pp | +21.3 pp | +28.0 pp |

Bake the conclusion into the spec's Residual Risks section verbatim.

---

## GraphQL migration

Breaking change. Atomic removal pattern (no deprecation overlap, no compat layer).

**Remove from schema entirely:**
- Per-pair: `winRateDelta` object, `qualifyingTrials` (top-level on pair)
- Per-model: `winRateDeltaSummary` object, `pairsPositive`

**Add:**

Per-pair:
```graphql
type PressureResponse {
  value: Float           # in proportion (0.0 to 1.0), frontend formats as pp
  ciLow: Float
  ciHigh: Float
  baselineRate: Float    # pooled win rate from diagonal cells
  pushTowardFirstRate: Float   # pooled win rate from directional pool
  pushTowardSecondRate: Float  # pooled win rate from mirror pool
  qualifyingTrials: Int  # sum of n across the cells used in any of the three pools
  reason: String         # 'directional-thin' | 'inverted-thin' | 'baseline-thin' | 'directional-and-inverted-thin' | null
}
```

Per-model:
```graphql
type PressureResponseSummary {
  mean: Float            # equal-weight mean of per-pair responses
  rangeMin: Float        # min of per-pair responses
  rangeMax: Float        # max of per-pair responses
  pairsMeasured: Int     # count of pairs with defined response
}
```

The cross-model `mean` is in proportion (0.0 = no shift, 1.0 = full shift). Frontend converts to pp for display.

`reason` is set when `value` is null:
- `'directional-thin'`: directional pool has zero qualifying cells
- `'inverted-thin'`: mirror pool has zero qualifying cells
- `'baseline-thin'`: diagonal has zero qualifying cells (rare)
- `'directional-and-inverted-thin'`: both directional pools fail
- `null`: response is defined

If `value` is null, the Δ cell renders `—` with hover text from `reason`.

**Verification command** (run during Slice A diff checkpoint):
```bash
grep -RE "winRateDelta|winRateDeltaSummary|pairsPositive" cloud/apps/api cloud/packages cloud/workers cloud/apps/web/schema.graphql --include='*.ts' --include='*.graphql'
```
Must return zero matches in backend code, schema, or non-generated frontend. (Generated codegen at `cloud/apps/web/src/generated/graphql.ts` may still reference until Slice B regenerates.)

---

## Implementation slicing

### Slice A — Backend math + resolver + Pothos types + SDL

Estimated diff: ~400 lines.

**aggregation.ts:**
- Add `pooledDirectionalReduction(grid, minN)` returning `{ value, ciLow, ciHigh, baselineRate, pushTowardFirstRate, pushTowardSecondRate, reason, qualifyingTrials }`. Implements:
  - Directional pool: cells where `ownLevel >= 4 && opponentLevel <= 3 && n >= minN`
  - Inverted pool: cells where `opponentLevel >= 4 && ownLevel <= 3 && n >= minN`
  - Baseline pool: cells where `ownLevel === opponentLevel && n >= minN`
  - Pool win rate = `sum(successes) / sum(n)` over the pool
  - `value = pushTowardFirstRate − pushTowardSecondRate` if both directional pools have qualifying cells
  - CI on `value` via existing `diffProportionCI(pushTowardSecondRate, totalTrialsInverted, pushTowardFirstRate, totalTrialsDirectional)`
- Reuse: `wilsonInterval`, `diffProportionCI`, `tBasedMeanCI` (already implemented for v1, no changes needed).
- Add `summarizePressureResponse(perPairResponses: number[]): { mean, rangeMin, rangeMax, pairsMeasured }`.
- Delete `pooledBandReduction` (the v1 directional reducer, now obsolete) and `summarizeWinRateDeltas`. Confirm no other callers via grep.

**aggregation.test.ts:**
- Test `pooledDirectionalReduction` against fixtures with known cell distributions:
  - Standard case: both directional pools defined → check value, ciLow, ciHigh against textbook Newcombe values.
  - Directional-thin → reason set, value null.
  - Inverted-thin → reason set, value null.
  - Baseline-thin → reason set, baselineRate null but value can still be defined.
  - All-cells-thin → reason set, all rates null.
- Test `summarizePressureResponse`:
  - Empty list → all nulls.
  - Single-pair input → mean = that value, rangeMin = rangeMax = that value.
  - Multi-pair input → mean is arithmetic average, rangeMin and rangeMax are correct.

**pressure-sensitivity.ts (resolver):**
- For each pair: call `pooledDirectionalReduction(grid, MIN_N)`. Map output to `pressureResponse` field.
- For each model: collect `perPairResponses` from pairs where `pressureResponse.value !== null`. Call `summarizePressureResponse`. Map to `pressureResponseSummary`.
- Sort models by `pressureResponseSummary.mean` desc (so `selectedModelId = models[0]` highlights most-responsive model).
- Remove all `winRateDelta`, `winRateDeltaSummary`, `pairsPositive` references.
- Keep all v1 carve-outs intact: `transcriptCapHit`, `source_run_collision` warning, refusal handling. Document refusal rate in the spec's Residual Risks.

**Pothos types (graphql/types/pressure-sensitivity.ts):**
- Add `PressureResponseShape` and `PressureResponseSummaryShape` matching the GraphQL schema above.
- Replace `winRateDelta: WinRateDeltaShape` with `pressureResponse: PressureResponseShape` on per-pair.
- Replace `winRateDeltaSummary: WinRateDeltaSummaryShape` with `pressureResponseSummary: PressureResponseSummaryShape` on per-model.
- Delete the obsolete `WinRateDeltaShape`, `WinRateDeltaSummaryShape`, top-level `qualifyingTrials` and `pairsPositive` fields.

**SDL regen:**
```bash
cd cloud/apps/api
LOG_LEVEL=silent DATABASE_URL=postgresql://x:x@localhost/x JWT_SECRET=placeholder-for-schema-emit-xxxxxxxxx npx tsx src/scripts/emit-schema.ts > ../../apps/web/schema.graphql
```

**Resolver tests (pressure-sensitivity.test.ts):**
- Verify per-pair output includes `pressureResponse` with correct shape, no `winRateDelta` or top-level `qualifyingTrials` fields.
- Verify per-model output includes `pressureResponseSummary`, no `winRateDeltaSummary` or `pairsPositive`.
- Verify model ordering by `pressureResponseSummary.mean` desc.

### Slice B — Web operation + codegen + derived types

Estimated diff: ~80 lines.

**pressureSensitivity.graphql:**
- Replace `winRateDelta { ... }` selections with `pressureResponse { value ciLow ciHigh baselineRate pushTowardFirstRate pushTowardSecondRate qualifyingTrials reason }`.
- Replace `winRateDeltaSummary { ... }` with `pressureResponseSummary { mean rangeMin rangeMax pairsMeasured }`.
- Remove top-level `qualifyingTrials` from per-pair (now nested inside `pressureResponse`).

**Codegen:**
```bash
cd cloud
npm run codegen --workspace @valuerank/web
```

**pressureSensitivity.ts (operations re-exports):**
- Add `PressureSensitivityPressureResponse = NonNullable<...['pressureResponse']>`.
- Add `PressureSensitivityPressureResponseSummary = NonNullable<...['pressureResponseSummary']>`.
- Remove obsolete `PressureSensitivityWinRateDelta`, `PressureSensitivityWinRateDeltaSummary` re-exports.

### Slice C — Web components rebuild + tests + carve-outs

Estimated diff: ~350 lines.

**PressureSensitivitySummary.tsx (cross-model):**
- Single data column "Pressure response": `{mean} pp · range across this model's pairs: [{rangeMin}, {rangeMax}]`.
- Drop the v1 `(thin)` annotation and `responsive: X/Y` annotation entirely.
- Negative mean → red text + leading `▼` glyph.
- Default sort: `pressureResponseSummary.mean` desc, tie-break by model name asc.

**PressureSensitivityDetail.tsx (per-pair):**
- Five columns under "Win Rate" group header:
  - Baseline (formatted as `XX%`, or `—` when `baselineRate` null)
  - Push toward first value (formatted as `XX%`)
  - Push toward second value (formatted as `XX%`)
  - Pressure response (formatted as `±X.X pp ± Y pp` with CI; or `—` with reason hover when value is null)
- Plus Trials column outside the group (reads `pressureResponse.qualifyingTrials`).
- Negative pressureResponse → red text + leading `▼`.
- Default sort: |pressureResponse.value| desc, tie-break by pair label asc.
- When `pressureResponse.value` is null, render `—` with hover text mapped from `reason`:
  - `'directional-thin'` → "No cells with N ≥ 3 trials where the prompt clearly pushes toward this value. Try adding more runs."
  - `'inverted-thin'` → mirror text.
  - `'directional-and-inverted-thin'` → "Neither directional pool has cells with N ≥ 3 trials. This pair needs more coverage."
  - `'baseline-thin'` → baseline-only message; pressure response can still be defined.

**Carve-outs (parallel to v1):**
- `PressureSensitivityCrossValueMap.tsx`: switch `pair.winRateDelta.value` → `pair.pressureResponse.value`. Update legend label from "Win rate Δ" to "Pressure response".
- `PressureSensitivitySanityCheck.tsx`: rename UI labels — keep field reads on `pressureResponse` (no internal threshold changes; thresholds stay v1's `Δ > 0.02` for `positive`, etc.).

**Shared formatting (`pressureSensitivityFormatting.ts`):**
- Update tooltip copy strings (see "Tooltip copy" below).
- Drop unused v1 helpers if any.

**Page intro copy (`PressureSensitivity.tsx`):**
- Rewrite to introduce "Pressure response" as the new headline metric. One paragraph. Reference the methods/limitations panels.

**Limitations panel content updates:**
- Update copy to describe the new metric. Add the cell-selection sensitivity disclosure: "Pairs with substantial response (>15 pp magnitude) are robust across plausible cell-selection choices. Pairs near zero are rule-sensitive and should be treated as uncertain."

**Tooltip copy (lock these strings):**

| Header | Tooltip text |
|---|---|
| Win Rate (group) | The percentage of trials where the model picked the value. Same formula used everywhere in ValueRank: picks ÷ (picks + non-picks + neutrals). All four columns under this header are versions of that calculation, just on different slices of the data. |
| Baseline | The model's underlying preference for this value, with no directional pressure from the prompt. Computed from cells where pressure is symmetric on both sides — the 5 diagonal cells where own and other are at the same label. In those cells the prompt has no directional advantage, so whatever the model picks reflects its own preferences. |
| Push toward first value | The model's win rate in the cells where the prompt clearly pushes toward this value: heavy or full pressure on this value, AND negligible / low / moderate pressure on the other value. 6 cells. A model that follows the prompt should have this much higher than the baseline. |
| Push toward other | The mirror. The model's win rate (still for this value) in the cells where the prompt clearly pushes toward the OTHER value. 6 cells. A model that follows the prompt should have this much lower than the baseline. |
| Pressure response (per-pair) | How much the prompt's direction moves the model. Push-toward-this minus push-toward-other, in percentage points. The model's underlying preference cancels out in the subtraction — both halves share the same baseline preference. So this number is purely about how much directional pressure shifts behavior. Positive = the prompt steers the model toward this value. Negative = the model goes against the prompt (uncommon and worth investigating). The 95% CI is trial-level uncertainty within this pair (Wilson-propagated diff of two pooled proportions). |
| Pressure response (cross-model) | The headline measure of how much the prompt's direction moves the model. For each value pair, we compute the gap between two specific situations: how often the model picks a value when the prompt clearly pushes toward it, vs. how often the model still picks it when the prompt clearly pushes the OTHER way. The model's preferences cancel in the subtraction, so this number is purely about how much the prompt's direction shifts behavior. We then average across all measured pairs. The "range across this model's pairs" annotation shows the smallest and largest per-pair values — wide range means the model behaves differently on different value pairs. |
| Trials | Total scored trials behind this row's win rates. Counts only trials inside the cells we used for the Baseline, Push toward, and Push toward other columns. Refusals, unparseable responses, and trials in cells we didn't use are excluded. |

**Tests:**
- `PressureSensitivitySummary.test.tsx`: column structure, default sort, range annotation rendering, negative styling, tooltip copy substring assertions.
- `PressureSensitivityDetail.test.tsx`: column structure, default sort, dash rendering with reason hover for each `reason` value, baseline column always renders.
- `PressureSensitivityCrossValueMap.test.tsx`: cell metric reads `pressureResponse.value`.
- Update `PressureSensitivitySanityCheck.test.tsx` for any field-name changes.
- `pressureSensitivityFormatting.test.ts`: tooltip copy snapshots if used.

**Final verification:**
```bash
grep -RE "winRateDelta|winRateDeltaSummary|pairsPositive" cloud --include='*.ts' --include='*.tsx' --include='*.graphql'
```
Must return zero matches anywhere (including generated codegen, since Slice B regenerated it).

---

## Workflow procedure (run these commands in order)

The ValueRank Feature Factory runner is at `docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py`. It dispatches adversarial reviews automatically and tracks state in `docs/workflow/feature-runs/<slug>/state.json`.

Slug for this feature: **`sensitivity-table-redesign-v2`**.

### Step-by-step

**0. Setup branch:**
```bash
cd /Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59
git fetch origin
git checkout -b claude/sensitivity-table-redesign-v2 origin/main
```

**1. Init the feature workflow state:**
```bash
python3 docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py init --slug sensitivity-table-redesign-v2 --scope-path docs/workflow/feature-runs/sensitivity-table-redesign-v2/
```

This creates `state.json`, `scope.json` if not present.

**2. Author spec.md** at `docs/workflow/feature-runs/sensitivity-table-redesign-v2/spec.md`. Match the structure of `docs/workflow/feature-runs/sensitivity-table-redesign/spec.md` (v1). Sections:
- Background (why v2, link to v1 limitation discovery)
- Discovery: Assumptions Carried In (skip discovery questions — methodology is locked; record the four locked decisions and the sensitivity-check finding here)
- Product Goal
- User Stories (P1 — view cross-model summary, P1 — drill into per-pair detail, P1 — header tooltips, P2 — see CI)
- Edge Cases (thin pools, baseline absent, all-zero responses, etc.)
- Functional Requirements (FR-001 through ~FR-020 — pattern after v1's spec)
- Success Criteria
- Non-Goals
- Open Questions (none — all locked)
- Dependencies
- Glossary (add: pressure response, baseline, directional pool, inverted pool, range across pairs)
- Residual Risks (include the cell-selection sensitivity finding verbatim from above)

**3. Run spec checkpoint:**
```bash
python3 docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py checkpoint --slug sensitivity-table-redesign-v2 --stage spec --max-artifact-chars 80000 --max-context-chars 80000 --max-total-chars 300000 --gemini-timeout-seconds 360 --gemini-retries 2
```

This dispatches Codex (feasibility + edge-cases) and Gemini (requirements) reviews in parallel. Output reviews land in `docs/workflow/feature-runs/sensitivity-table-redesign-v2/reviews/`.

**4. Reconcile reviews.** Read each review file. For each finding:
- If you agree → reconcile with status `accepted` and a note describing the spec edit.
- If you disagree → reconcile with status `rejected` and a note explaining why.
- If deferred → status `deferred`, note explaining where it's tracked.

```bash
python3 docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py reconcile --slug sensitivity-table-redesign-v2 --review <path-to-review-file> --status <accepted|rejected|deferred> --note "<note>"
```

Apply spec edits as you go. Commit edits with a message like `sensitivity-table-redesign-v2: spec round N reconciliation`.

**5. Repeat round 2-3 if substantive changes.** Re-run checkpoint after each round. Cap at 3 rounds.

**6. Advance past judge panel:**
The judge panel has a known deterministic Python recursion bug (documented in v1 postmortem). Bypass with:
```bash
python3 docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py advance --slug sensitivity-table-redesign-v2 --stage spec --reason "Judge panel hit deterministic schema_violation recursion bug (same as v1 PR #770 and PR #778). N rounds of adversarial reviews completed and reconciled. Advancing to plan stage."
```

**7. Author plan.md.** Match v1 plan structure: Summary, Review Reconciliation, Technical Context, Architecture Decisions (1 per major design choice), Approved Tooltip Copy (use the table above verbatim), Implementation Slices (A/B/C as outlined above), Residual Risks, Testing Strategy, Rollout, Open Items.

**8. Run plan checkpoint, reconcile, advance.** Same pattern as steps 3-6.

**9. Author tasks.md.** Match v1 tasks structure: tightly-scoped checklist per slice (A1, A2, ..., B1, B2, ..., C1, C2, ...).

**10. Run tasks checkpoint, reconcile, advance.** Same pattern.

**11. Run parallel-analysis recording:**
```bash
python3 docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py parallel --slug sensitivity-table-redesign-v2 --note "Slices A, B, C are sequential dependencies. Within Slice A the math helpers and resolver could parallelize but practical Codex dispatch keeps them in one diff for review coherence."
```

**12. Implement Slice A:** write/edit the files per the plan. Run:
```bash
cd cloud
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test?pgbouncer=true" JWT_SECRET="test-secret-that-is-at-least-32-characters-long" npm run test --workspace @valuerank/api -- pressure-sensitivity
npx turbo build --filter=@valuerank/api
```
Verify build clean and tests pass. Run the backend grep verification command.

Commit Slice A.

**13. Run Slice A diff checkpoint:**
```bash
python3 docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py checkpoint --slug sensitivity-table-redesign-v2 --stage diff --max-artifact-chars 80000 --max-context-chars 80000 --max-total-chars 300000 --gemini-timeout-seconds 360 --gemini-retries 2
```

Reconcile findings. Apply fix commits. Re-run if needed. Advance past diff.

**14. Implement Slice B,** verify build (api still clean, web codegen regenerated), commit. Run diff checkpoint, reconcile, advance.

**15. Implement Slice C,** verify web build clean, web tests pass, run final cross-tree grep verification. Commit. Run diff checkpoint, reconcile, advance.

**16. Push and open PR:**
```bash
git push -u origin claude/sensitivity-table-redesign-v2
gh pr create --repo chrislawcodes/valuerank --head chrislawcodes:claude/sensitivity-table-redesign-v2 --title "Pressure Sensitivity v2 — Pressure response metric replaces Win rate Δ" --body "<see PR body template below>"
```

**17. Watch CI:**
```bash
gh pr checks <PR-number> --repo chrislawcodes/valuerank --watch
```

If any check fails, fix the root cause, commit, push, watch again.

**18. Pre-merge production smoke test:** This is a new GraphQL schema. Production still has v1 schema, so we can't smoke-test the new shape pre-merge. Document this in the PR body and skip pre-merge smoke. Post-deploy smoke happens in step 20.

**19. STOP. Surface PR to user.** Comment in the PR with a summary of what landed, the link, and the line "Ready for human review and squash merge."

**Do NOT squash merge yourself.** This is the explicit user gate.

**20. (After user merges manually) Post-deploy smoke test:**
After Railway deploys main, run a production GraphQL query (use the API key from `.mcp.json`):

```graphql
{
  pressureSensitivity(domainId: "cmmqi1urq0000e4y3ot8sfm06", signature: "vnewtd") {
    transcriptCapHit
    models {
      modelId
      label
      pressureResponseSummary { mean rangeMin rangeMax pairsMeasured }
    }
  }
}
```

Confirm: at least one model has populated `pressureResponseSummary`, `transcriptCapHit` field is present, model ordering looks reasonable.

**21. Write closeout + post-mortem** at `docs/workflow/feature-runs/sensitivity-table-redesign-v2/closeout.md` and `postmortem.md`. Pattern after v1's. Open a small follow-up doc-only PR.

---

## Constraints

- **Do NOT modify:** CLAUDE.md, AGENTS.md, cloud/CLAUDE.md, cloud/AGENTS.md, cloud/agents.md, MEMORY.md, .gitignore. Don't touch v1 files at `docs/workflow/feature-runs/sensitivity-table-redesign/`. Don't touch any file outside `docs/workflow/feature-runs/sensitivity-table-redesign-v2/`, the listed code paths in cloud/, or the workflow state.
- **TypeScript strict mode:** no `any`, no `@ts-ignore`, no `eslint-disable`. Existing baseline of warnings is OK; don't introduce new ones.
- **Commits:** small focused commits per slice. Use conventional commit messages.
- **Branch:** never push to main directly. Open a PR.
- **Atomic schema removal:** v1 fields must be removed in lockstep with v2 fields landing. Slice A removes from backend SDL/types/resolver. Slice B regenerates codegen. Slice C completes the frontend cutover. Every interim commit may have build failures on the web side until Slice C — that's expected.
- **Stop at step 19** for human review. Do not squash merge. Do not write the closeout until after the human merges.

---

## Reference paths

**v1 artifacts (templates):**
- `docs/workflow/feature-runs/sensitivity-table-redesign/spec.md`
- `docs/workflow/feature-runs/sensitivity-table-redesign/plan.md`
- `docs/workflow/feature-runs/sensitivity-table-redesign/tasks.md`
- `docs/workflow/feature-runs/sensitivity-table-redesign/closeout.md`
- `docs/workflow/feature-runs/sensitivity-table-redesign/postmortem.md`

**Code paths to modify (Slice A):**
- `cloud/apps/api/src/services/pressure-sensitivity/aggregation.ts` (math helpers)
- `cloud/apps/api/src/graphql/queries/pressure-sensitivity.ts` (resolver)
- `cloud/apps/api/src/graphql/types/pressure-sensitivity.ts` (Pothos types)
- `cloud/apps/web/schema.graphql` (regenerated SDL)
- Existing tests at `cloud/apps/api/tests/services/pressure-sensitivity/aggregation.test.ts` and `cloud/apps/api/tests/graphql/queries/pressure-sensitivity.test.ts`.

**Code paths to modify (Slice B):**
- `cloud/apps/web/src/api/operations/pressureSensitivity.graphql`
- `cloud/apps/web/src/api/operations/pressureSensitivity.ts`
- `cloud/apps/web/src/generated/graphql.ts` (regenerated)

**Code paths to modify (Slice C):**
- `cloud/apps/web/src/components/models/PressureSensitivitySummary.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivityDetail.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivityCrossValueMap.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivitySanityCheck.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivityLimitations.tsx` (limitations panel content)
- `cloud/apps/web/src/components/models/pressureSensitivityFormatting.ts` (shared helpers)
- `cloud/apps/web/src/pages/PressureSensitivity.tsx` (intro copy)
- New/updated test files for each rebuilt component.

**Production endpoint and API key:** `.mcp.json` at the repo root (gitignored). Read `url` and `headers["X-API-Key"]` for production GraphQL calls.

**Refusal rate data (from earlier validation):** Across all 10 frontier models on signature `vnewtd`, total ~21 refusals out of ~113,000 trials (<0.02%). Worst single model: DeepSeek Reasoner at 12 refusals out of ~11,300 (0.11%). Bake into spec methods footnote.

---

## PR body template

```markdown
## Summary

Replaces v1's `Win rate Δ` headline metric with a cleaner metric called `Pressure response`. The v1 metric mixed directional, tied, and inverted cells, which produced misleading "negative" responses for most frontier models. The new metric isolates clearly directional cells and computes a clean before/after gap that cancels out the model's underlying value preference.

## What changed

**Backend:**
- New `pressureResponse` per-pair object: `{ value, ciLow, ciHigh, baselineRate, pushTowardFirstRate, pushTowardSecondRate, qualifyingTrials, reason }`.
- New `pressureResponseSummary` per-model object: `{ mean, rangeMin, rangeMax, pairsMeasured }`.
- Removed `winRateDelta`, `winRateDeltaSummary`, `pairsPositive`, top-level `qualifyingTrials` entirely.
- Pooled binomial directional + inverted + diagonal-baseline pools per (model, pair).
- Newcombe Method-10 CI on the directional−inverted diff (reuses v1 helper).

**Frontend:**
- Cross-model summary: single column showing pressure response with range-across-pairs annotation. Drops `± CI` notation and `responsive: X/Y` annotation.
- Per-pair detail: 5 columns (Baseline, Push toward first, Push toward other, Pressure response, Trials). Baseline column is new.
- Negative response renders red text + ▼ glyph (WCAG 1.4.1).
- All tooltip copy locked to plain-language descriptions.
- Carve-outs: cross-value heat map switches metric source. Sanity panel keeps existing thresholds, switches field reads.

**Methodology:**
- Cell-selection sensitivity validated across 3 plausible rules (strict / default / loose). Default 6-cell rule is robust for substantial-response pairs (|response| > 15 pp); rule-sensitive for pairs near zero. Documented in spec residual risks.
- Refusal rate confirmed <0.02% across all 10 frontier models. Footnoted in methods.
- Multiple-comparisons concern resolved by dropping binary "responsive" classification entirely.

## Test plan

- [ ] CI: lint + build + tests across shared/db/api/web
- [ ] Backend grep verification: zero matches for `winRateDelta`, `winRateDeltaSummary`, `pairsPositive` outside `cloud/apps/web/src/generated/`
- [ ] Frontend pressure-sensitivity tests pass
- [ ] Post-deploy smoke test (after Railway deploys): confirm `pressureResponseSummary` populated for at least one model, `transcriptCapHit` present, model ordering reasonable
- [ ] Manual: open `/models/pressure-sensitivity` in production, confirm new tables render, tooltips work on hover and keyboard focus

## Notes

- Schema is broken vs v1 atomically. Monorepo with no external GraphQL consumers, so no compat layer needed.
- v1 spec/plan/tasks at `docs/workflow/feature-runs/sensitivity-table-redesign/` left intact for historical reference.
- Sensitivity check methodology artifact at `docs/workflow/feature-runs/sensitivity-table-redesign-v2/sensitivity-check-results.md`.

🤖 Generated under Feature Factory orchestration. Human review required before squash merge.
```

---

## Tools available to Codex

- **Bash** with `-s workspace-write` (default for impl) or `-s danger-full-access` if network is required
- **Read / Write / Edit** for file changes
- **Glob / Grep** for code discovery
- **Run scripts:** `python3`, `npm`, `npx`, `tsc`, `gh`, `git`, `curl`
- **GraphQL queries to production:** via `curl` using `.mcp.json` credentials (note: previous attempts saw DNS blocks in the sandbox; if it happens again, document the blocker and proceed without prod data — most of the cycle doesn't need it)
- **Tests:** `npm run test`
- **Builds:** `npx turbo build --filter=...`

You do NOT have:
- Direct MCP tool access (use curl instead)
- Authority to push to main or merge PRs (push to feature branch and stop at step 19)

---

## Single-shot dispatch suggestion (for the human kicking this off)

When you (the human) are ready to start the cycle, dispatch Codex with:

```bash
codex exec -m gpt-5.4 -s danger-full-access "Read /Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/docs/workflow/feature-runs/sensitivity-table-redesign-v2/handoff.md and execute the entire workflow described in it. Stop at step 19 (PR opened, awaiting human review). Use gpt-5.4 (the heavier model) for orchestration since this is a multi-hour multi-stage cycle requiring careful spec/plan/tasks authoring."
```

Use `gpt-5.4` (heavy) for orchestration — the cycle requires careful judgment on spec/plan/tasks structure. Codex can dispatch nested codex/gemini calls for review fan-out via `run_factory.py` at gpt-5.4-mini.

If Codex hits a blocker it can't resolve, it should write a short note to `/tmp/v2-blocker.md` and stop, surfacing the blocker to the human rather than guessing.
