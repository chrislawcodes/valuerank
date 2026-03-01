# Assumptions Tab Plan (Issues #285, #286, #287)

## Goal

Build an **Assumptions** tab that validates critical reliability assumptions and reports the exact match/difference percentage for each (or `INSUFFICIENT DATA` if runs are pending).

Covered assumptions:

1. `#285` Temperature-0 determinism
2. `#286` Order invariance
3. `#287` Job-title invariance

## Feature Goal (Why this exists)

Enable researchers and product stakeholders to determine whether model value-prioritization results are **trustworthy for interpretation** by verifying that outcomes are stable to:

- repeated identical runs (`temp=0` determinism),
- superficial ordering changes (order invariance),
- superficial role-label framing (job-title invariance).

If assumptions hold, users can treat value-priority outputs as robust signals.  
If assumptions fail, users can quickly identify where instability occurs and avoid over-interpreting those results.

## Feature Success Criteria

- All three assumptions are visible in one tab with exact percentage match rates.
- Each assumption is backed by transparent evidence tables that show the exact underlying batch decisions.
- Users can identify the exact models/vignettes causing failures in under one minute.
- Results are exportable/copyable for audits and PRD/research documentation.

---

## Level 1: Product Plan

## 1.1 Information architecture

- Top: 3 summary cards (one per assumption)
- Above execution: preflight review panel showing the exact vignette set that will be run
- In preflight review: estimated run cost before launch
- Middle: detailed blocks with tables and mismatch highlights
- Bottom: shared `?` methods disclosure

## 1.2 User outcomes

- Quickly see whether each assumption holds
- Review the exact vignette package before any trial is launched
- See an estimated run cost before approving execution
- Drill into exactly where assumptions fail:
  - From the summary card -> down to the vignette-specific table
  - From the table row -> down to the exact batch transcripts for that model/condition
  - From the transcript modal -> down to the exact prompt and response text
- Export or copy evidence table for review

## 1.3 Data semantics

- The UI displays the exact match percentage.
- `INSUFFICIENT DATA`: displayed when there is not enough paired data to conclude.

---

## Level 2: Technical Workstreams

## 2.1 Workstream A — Data collection and pairing

### 2.1.1 Canonical comparison key

Pairing is assumption-specific. Do not force one universal key shape.

Base identity fields for all assumptions:

- `assumptionKey`
- `modelId`
- `vignetteId`
- `runSignature`
- `promptHash`
- `parserVersion`

Issue-specific comparison keys:

- `#285` (trial repeat):
  - comparison group key: `(modelId, vignetteId, conditionKey)`
  - individual trial key within the group: `trialIndex`
- `#286` (condition pair): `(modelId, vignetteId, baselineScenarioId, flippedScenarioId)`
- `#287` (condition pair): `(modelId, vignetteId, titledScenarioId, genericScenarioId)`

### 2.1.2 Shared comparison metric

- Primary: `decisionCode` exact match
- Secondary debug field:
  - `prioritizedValue`

### 2.1.3 Pairing constraints

Pairing constraints are assumption-specific because prompt structure is intentionally changed in #286 and #287.

Shared hard constraints (all assumptions):

- same `modelId`
- same `modelVersion` (or provider snapshot identifier)
- same `signature` (temperature and run settings)
- same `parserVersion`

Assumption-specific constraints:

- `#285 temp_zero_determinism`:
  - must use identical prompt template and identical prompt payload
  - compare only within same `promptHash`
- `#286 order_invariance`:
  - must use approved baseline/flipped pair link
  - prompt structure is allowed to differ only by order/orientation fields
  - compare within same `promptFamily = order_invariance_v1`
- `#287 job_title_invariance`:
  - must use approved titled/generic pair link
  - prompt wording is allowed to differ by title framing rewrite
  - compare within same `promptFamily = job_title_invariance_v1`

Rows outside valid constraints are excluded and counted in `excludedComparisons` with explicit reason codes:

- `model_version_mismatch`
- `signature_mismatch`
- `parser_version_mismatch`
- `invalid_prompt_family`
- `missing_pair_link`

## 2.2 Workstream B — Scoring engine

### 2.2.1 Core metrics

- `matchRate = matched / total`
- `differenceRate = 1 - matchRate`
- `modelMinMatchRate = min(matchRate by model)`

### 2.2.2 Insufficient Data

`INSUFFICIENT DATA`: displayed if the comparisons are below the minimum required for that assumption. We do not enforce global pass/fail thresholds; we report the exact percentages directly for users to interpret.

### 2.2.3 Minimum N gates

- #285: at least `5 vignettes x all models x all conditions x 3 batches`
- #286: at least `5 vignettes x all models x all conditions x 1 batch`
- #287: at least `5 vignettes x all models x all conditions x 1 batch`

Note: #286 and #287 use 5 vignettes (previously drafted as 10). The reduction is intentional — the locked 5-vignette package provides full coverage of the 10-value space with disjoint pairs (same rationale as #285). A larger set would add content-creation cost without adding value-space coverage.

## 2.2a Workstream B2 — Vignette identification and creation

This workstream is a prerequisite to all three issues. It must complete before any probe runs are scheduled.

### 2.2a.1 Shared selection principles

These apply to vignettes selected for any assumption test:

- **Genuine tradeoff**: the vignette must present a real tension between two values with no procedural escape — a model that refuses to engage or answers neutrally contributes nothing to the test.
- **Avoid near-neutral scenarios**: vignettes where the expected decision is close to `3` (neutral) do not discriminate model behavior and inflate apparent match rates artificially. Prefer vignettes where at least one model consistently gives a clear decision (`1`, `2`, `4`, or `5`).
- **Coverage breadth**: the selected set must span at least four distinct value pairs. Do not pick five vignettes that all test the same tension.
- **Source pool**: draw only from vignettes in the target domain that have already been run in production and have a known decision distribution. Do not use vignettes with missing judge outputs or flagged parsing errors.

### 2.2a.2 Storage and linking

Assumption vignette configuration needs two layers because the selected unit is a vignette family, but execution happens at the scenario-condition level.

**A. Vignette family selection record (one per selected vignette family):**

| Field | Description |
|-------|-------------|
| `assumptionKey` | `temp_zero_determinism`, `order_invariance`, or `job_title_invariance` |
| `vignetteId` | ID of the selected vignette family / production definition |
| `selectionReviewedBy` | User ID of the reviewer who approved the vignette for use |
| `selectionReviewedAt` | Timestamp of vignette-family approval |
| `selectionRationale` | Stored explanation for why this vignette is in the package |

**B. Scenario condition execution record (one per condition, and one pair link per condition for #286/#287):**

| Field | Description |
|-------|-------------|
| `assumptionKey` | `temp_zero_determinism`, `order_invariance`, or `job_title_invariance` |
| `vignetteId` | Parent vignette family / production definition |
| `sourceScenarioId` | ID of the original/baseline scenario condition |
| `conditionKey` | Stable condition identifier (for example `3x4`) |
| `variantScenarioId` | ID of the paired variant (null for #285, required for #286/#287) |
| `variantType` | `none` for #285, `flipped_order` for #286, `generic_framing` for #287 |
| `equivalenceReviewedBy` | User ID of the reviewer who signed off on semantic equivalence (#286/#287 only) |
| `equivalenceReviewedAt` | Timestamp of equivalence sign-off (#286/#287 only) |

For `#286` and `#287`, the pairing link must be stored for each of the `25` conditions before runs are scheduled. The computation engine uses `sourceScenarioId`/`variantScenarioId` to build pairs and should reject unpaired scenarios as `missing_pair`.

### 2.2a.3 Issue #285 — Selection procedure (no content creation)

#285 requires only selection from existing production vignettes. No new content is written.

For `#285`, the operational test unit is the **definition** (the vignette family), not a single scenario row.
Each selected definition contributes its full `5 x 5` condition grid (`25` production scenarios total), and every exact scenario is rerun identically at `temp=0`.

**Locked #285 production set (professional domain):**

1. `cmlsmyn9l0j3rxeiricruouia` — `Jobs (Self Direction Action vs Power Dominance)`
2. `cmlsn0pnr0jg1xeir147758pr` — `Jobs (Security Personal vs Conformity Interpersonal)`
3. `cmlsn216u0jpfxeirpdbrm9so` — `Jobs (Tradition vs Stimulation)`
4. `cmlsn2tca0jvxxeir5r0i5civ` — `Jobs (Benevolence Dependability vs Universalism Nature)`
5. `cmlsn384i0jzjxeir9or2w35z` — `Jobs (Achievement vs Hedonism)`

**Why this 5-definition package was chosen:**

- It covers all 10 current production values exactly once across 5 disjoint pairs, so the determinism check is not concentrated in one part of the value space.
- The pairs do not overlap, which makes failures easier to diagnose. If one vignette family shows mismatches, the signal is easier to attribute to that tradeoff rather than shared value reuse.
- Together they span the main kinds of professional tradeoffs in the jobs domain: autonomy vs hierarchy, stability vs social pressure, tradition vs novelty, dependability vs environmental concern, and ambition vs enjoyment.
- All 5 come from the same live professional `Jobs (...)` prompt family, so template structure, response scale, and compensation control are consistent. That keeps the test focused on repeatability rather than prompt-format drift.
- Each selected definition has a complete `25`-scenario matrix, so the package tests determinism across equal, low, high, and asymmetric conditions using a uniform method.
- The total run size stays practical while still credible: `5 definitions x 25 conditions x 3 repeats = 375 prompts per model`.

**Execution rule for #285:**

1. Pull the five locked production definitions above from the `professional` domain.
2. For each definition, include all `25` scenarios in its existing `5 x 5` condition grid. Do not subsample to midpoint-only conditions.
3. Filter out any scenario rows with missing judge outputs or known parsing failures in prior runs, and log any exclusions explicitly.
4. For every `(modelId, scenarioId)`, run `3` identical `temp=0` repeats using the same prompt payload and run signature.
5. Tag each selected definition family with `assumptionKey = 'temp_zero_determinism'`.
6. No paired variant is needed; `variantScenarioId` is null.

**Rejection criteria:** if any locked definition is found to have incomplete scenario coverage (fewer than `25` active scenarios) or unresolved parser issues that materially reduce the grid, pause #285 and replace the full definition with another production definition that preserves the same no-overlap package principle.

### 2.2a.4 Issue #286 — Selection and variant creation procedure

#286 requires selecting vignettes and generating an order-flipped variant for each. The value tradeoff does not change — only which value appears as the "first" option in the prompt.

**What "flipping the order" means in the 5×5 condition grid:**

Each condition (e.g. `3x4`) represents value A at intensity 3 and value B at intensity 4. Flipping the order is a **purely presentational swap** — the scenario body text is not rewritten. The same scenario is rendered with the two value slots exchanged in the prompt template, and the decision scale is inverted accordingly (`orientationFlipped = true`). No new scenario content is authored for #286; only a rendering flag and pair link are stored. The condition key structure is preserved.

For methodological consistency, `#286` should reuse the exact same 5 vignette families selected for `#285`. This keeps the content package fixed across the two checks so that `#286` isolates order effects only.

**Locked #286 production set (same as #285):**

1. `cmlsmyn9l0j3rxeiricruouia` — `Jobs (Self Direction Action vs Power Dominance)`
2. `cmlsn0pnr0jg1xeir147758pr` — `Jobs (Security Personal vs Conformity Interpersonal)`
3. `cmlsn216u0jpfxeirpdbrm9so` — `Jobs (Tradition vs Stimulation)`
4. `cmlsn2tca0jvxxeir5r0i5civ` — `Jobs (Benevolence Dependability vs Universalism Nature)`
5. `cmlsn384i0jzjxeir9or2w35z` — `Jobs (Achievement vs Hedonism)`

**Steps:**

1. Pull the five locked production definitions above from the `professional` domain.
2. For each definition, include all `25` scenarios in its existing `5 x 5` condition grid.
3. For every baseline scenario, review the text for **positional language**: phrases like "the first option," "option A," "on the left," or any wording that anchors meaning to position. The jobs-domain templates should already be position-neutral, but this review remains required before creating the flipped set.
4. Generate the flipped variant by swapping the two value slots in the prompt template (i.e., swap `valueA` and `valueB`). The scenario body text stays semantically identical; only slot assignment and response orientation change.
5. Verify the normalization anchor: confirm that the system records which slot (`valueA` or `valueB`) corresponds to which semantic value, so that a decision of `5` in the flipped variant can be correctly mapped back to its semantic equivalent in the baseline.
6. Store the pair link (`sourceScenarioId` → `variantScenarioId`) with `variantType = 'flipped_order'`.
7. One reviewer must confirm the flipped variant is semantically equivalent before the pair is approved.

**Rejection criteria:** discard any vignette where the value slot swap changes the apparent stakes of the tradeoff.

### 2.2a.5 Issue #287 — Selection and rewrite procedure

#287 requires selecting professionally-framed vignettes and writing a semantically equivalent generic version for each. This is the most labor-intensive step and requires editorial judgment.

**Content creation scope:** 5 vignettes × 25 conditions = **125 individual scenario rewrites**. Each condition in the 5×5 grid has distinct generated scenario text (different intensity levels produce different narrative content), so each must be rewritten independently. This is the largest single labor item in the project and must be staffed and scheduled before Phase 4 can begin.

For comparability across the Assumptions tab, `#287` should also reuse the same 5 vignette families selected for `#285`. The only intended change is removal of role-title framing, not a change to the underlying content package.

**Locked #287 production set (same as #285):**

1. `cmlsmyn9l0j3rxeiricruouia` — `Jobs (Self Direction Action vs Power Dominance)`
2. `cmlsn0pnr0jg1xeir147758pr` — `Jobs (Security Personal vs Conformity Interpersonal)`
3. `cmlsn216u0jpfxeirpdbrm9so` — `Jobs (Tradition vs Stimulation)`
4. `cmlsn2tca0jvxxeir5r0i5civ` — `Jobs (Benevolence Dependability vs Universalism Nature)`
5. `cmlsn384i0jzjxeir9or2w35z` — `Jobs (Achievement vs Hedonism)`

These five were validated as workable rewrite candidates because their professional titles can be removed while preserving the same value conflict in plain language.

**Steps:**

1. Pull the five locked production definitions above from the `professional` domain.
2. For each definition, include all `25` scenarios in its existing `5 x 5` condition grid.
3. For each baseline scenario, write a **generic rewrite** following these rules:
   - Remove all job titles, organization names, and industry-specific terminology.
   - Replace role-specific framing with neutral human framing (e.g., "a doctor deciding..." → "a person deciding...").
   - Preserve "work path" framing where possible so the scenario remains close to the original professional-domain context without relying on job labels.
   - Preserve the exact same value tension at the same stakes level. The two values in conflict must be identical.
   - Do not add or remove information that would make one choice clearly more or less defensible.
   - The generic version should be plausible as a standalone scenario — it should not feel like a professional scenario with the nouns removed.
4. Use the approved rewrite pattern established in editorial review:
   - start from "A person is choosing between two work paths. Both options offer the same pay and practical benefits, but the day-to-day experience is very different."
   - describe each option in terms of the underlying benefit/tradeoff rather than the original job title
   - keep the response scale anchored to the semantic choice, not to removed job labels
5. Store the rewrite as a new scenario in the DB with `variantType = 'generic_framing'` and a link back to the source.

**Equivalence validation (required before approval):**

Each source/generic pair must be reviewed by a second person who did not write the rewrite, using this checklist:

- [ ] Both versions present the same two values in conflict
- [ ] The stakes and severity feel comparable across both versions
- [ ] Neither version contains information that makes one choice clearly dominant in a way the other does not
- [ ] The generic version is plausible as a real scenario (not obviously artificial)
- [ ] The decision distribution from pilot runs (if available) is not dramatically different between versions

A pair fails equivalence review if any item is unchecked. Rewrite and re-review before including in the test set. **Do not include unreviewed pairs in any probe run.**

**Rejection criteria:** discard pairs where removing the job title makes the scenario completely nonsensical or grammatically incoherent, rather than just changing the moral weight. (We *want* to test if the job title changes the moral weight—that is the point of the test).

### 2.2a.6 Approval gate

Before any assumption run is scheduled, the full vignette set for that assumption must be approved:

1. The UI must show a preflight review view listing the exact selected vignettes, included conditions, pair links (for #286/#287), and rationale before the user can launch runs.
2. The preflight review must display an estimated run cost for the pending batch before approval. Compute this by rendering the exact prompts that will be sent, estimating input tokens from those rendered prompts, applying the selected model price snapshot, and adding expected output-token allowance using the standard assumptions-run response budget.
3. Author documents the selected/created vignettes with IDs and rationale.
4. A second reviewer validates the selected vignette families and records `selectionReviewedBy` / `selectionReviewedAt` for all assumptions.
5. For `#286` and `#287`, the reviewer must also mark `equivalenceReviewedBy` and `equivalenceReviewedAt` on each scenario-level pair link.
6. No probe run is dispatched until all required review fields are complete and the preflight review has been explicitly confirmed.

This gate applies to all three issues. Partial sets (some pairs reviewed, some not) are not acceptable — a partial run produces a biased SUFFICIENT DATA result.

---

## 2.2b Workstream B3 — Database schema

The assumption metadata defined in 2.2a.2 requires two new tables. These must be designed and migrated before any backend computation work begins.

### `assumption_vignette_selection`

One row per vignette family approved for an assumption test.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `cuid` | Primary key |
| `assumptionKey` | `varchar` | `temp_zero_determinism`, `order_invariance`, `job_title_invariance` |
| `definitionId` | `varchar` FK → `definitions.id` | The selected vignette family |
| `rationale` | `text` | Stored explanation for inclusion |
| `selectionReviewedBy` | `varchar` FK → `users.id` | Reviewer who approved the family |
| `selectionReviewedAt` | `timestamp` | Approval timestamp |
| `createdAt` | `timestamp` | |

### `assumption_scenario_pair`

One row per scenario condition within a selected vignette family. For #285, `variantScenarioId` is null. For #286/#287, both scenario IDs are required and equivalence review fields must be populated before runs are dispatched.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `cuid` | Primary key |
| `selectionId` | `varchar` FK → `assumption_vignette_selection.id` | Parent vignette family record |
| `assumptionKey` | `varchar` | Denormalized from parent for query convenience |
| `conditionKey` | `varchar` | e.g. `3x4` — stable condition identifier |
| `sourceScenarioId` | `varchar` FK → `scenarios.id` | Baseline/production scenario |
| `variantScenarioId` | `varchar` FK → `scenarios.id`, nullable | Flipped/generic variant (null for #285) |
| `variantType` | `varchar` | `none`, `flipped_order`, `generic_framing` |
| `equivalenceReviewedBy` | `varchar` FK → `users.id`, nullable | Required for #286/#287 before runs |
| `equivalenceReviewedAt` | `timestamp`, nullable | |
| `createdAt` | `timestamp` | |

### Run tagging

Probe runs dispatched for assumption tests are tagged using the existing `run.config` JSON field with an additional `assumptionKey` property. No new run table is required — the assumption pairing logic joins on `run.config->>'assumptionKey'` when building the comparison matrix.

---

## 2.3 Workstream C — API and frontend integration

### 2.3.1 API payload contract

```ts
type AssumptionKey =
  | 'temp_zero_determinism'
  | 'order_invariance'
  | 'job_title_invariance';

type AssumptionStatus = 'COMPUTED' | 'INSUFFICIENT_DATA';

interface AssumptionSummary {
  key: AssumptionKey;
  title: string;
  status: AssumptionStatus;
  statusReason:
    | 'computed_successfully'
    | 'insufficient_pairs';
  matchRate: number | null;
  differenceRate: number | null;
  comparisons: number;
  excludedComparisons: number;
  modelsTested: number;
  vignettesTested: number;
  worstModelId: string | null;
  worstModelMatchRate: number | null;
}

interface AssumptionPreflight {
  key: AssumptionKey;
  vignettes: Array<{
    vignetteId: string;
    title: string;
    conditionCount: number;
    variantType: 'none' | 'flipped_order' | 'generic_framing';
    variantCount: number;
    rationale: string;
  }>;
  projectedPromptCount: number;
  projectedComparisons: number;
  estimatedInputTokens: number | null;
  estimatedOutputTokens: number | null;
  estimatedCostUsd: number | null;
  pricingSnapshotId: string | null;
  requiresReviewConfirmation: boolean;
}

interface AssumptionDifferenceRow {
  assumptionKey: AssumptionKey;
  modelId: string;
  vignetteId: string;
  conditionKey: string;
  sourceScenarioId: string;
  variantScenarioId: string | null;
  decisions: Array<{
    label: string; // e.g., 'batch_1', 'batch_2', 'batch_3', 'baseline', 'flipped', 'generic'
    trial: number | null;
    transcriptId: string | null;
    decision: string | null;
    content: unknown | null;
  }>;
  isMatch: boolean;
  mismatchType: 'decision_flip' | 'missing_pair' | 'invalid_mapping' | 'missing_trial' | null;
}
```

### 2.3.2 UI components

- `AssumptionsPreflightReview`
- `AssumptionsSummaryCards`
- `AssumptionDetailTable`
- `AssumptionTranscriptModal`: A drill-down view triggered by clicking a row in the `AssumptionDetailTable`. It displays the exact batch transcripts for the selected row, grouped as `Batch 1`, `Batch 2`, and `Batch 3`, and shows the raw prompt/response text inline.
- `AssumptionsMethodsDisclosure`

### 2.3.3 UI state rules

- Show loading skeletons while computing
- Disable launch/run action until the preflight review has been explicitly confirmed
- Show the estimated run cost in the preflight panel before the launch action
- Show exact summary metric values directly (e.g. `98% match rate`).
- `INSUFFICIENT DATA` = gray status chip
- Show “excluded rows” note under each table

---

## Level 3: Issue-by-Issue Execution Plan

## 3.1 Drill-Down Architecture (All Issues)

For all three tests, users need the ability to inspect the exact prompt and response that caused a mismatch or generated the statistics.

1. **Table interaction**: Clicking any row in the `AssumptionDetailTable` opens a modal or drill-down pane (`AssumptionTranscriptModal`).
2. **Transcript fetching**: The frontend fetches the transcripts for the specific row using `(modelId, vignetteId, conditionKey, sourceScenarioId, variantScenarioId)` and/or the explicit `transcriptId` values returned in that row.
3. **Display**: For `#285`, the modal shows the three batch transcripts directly in one view, labeled `Batch 1`, `Batch 2`, and `Batch 3`, with decision code and raw prompt/response text for each batch.

## 3.2 Issue #285 — Temp=0 determinism

### 3.2.1 Test design

- Inputs: 5 fixed vignettes
- Conditions: all conditions
- Batches: 3 repeated runs
- Scope: all production models in the selected domain/signature

### 3.2.2 Task breakdown

1. Add `assumption_runs` metadata marker: `assumptionKey='temp_zero_determinism'`.
2. Generate/run 3 batches with identical config.
3. Build batch matrix: `(model, vignette, condition) -> [batch1, batch2, batch3]`.
4. Flag mismatch if any batch differs.
5. Group display rows by vignette so each vignette renders as its own table.

### 3.2.3 Table design

- Render one table per vignette (not one global table).
- Columns: `Model`, dynamic `Attribute A` name, dynamic `Attribute B` name, `Batch 1`, `Batch 2`, `Batch 3`
- `Attribute A` / `Attribute B` column titles come from the actual vignette pair names.
- Cells under `Attribute A` / `Attribute B` show the condition levels for that row (for example `3` and `4` from `3x4`).
- Batch columns show only the decision code for that batch.
- Each row is clickable and opens the batch transcript modal (implemented in Phase 2 alongside the table — see 3.1).
- Include copy icon at title upper-right

### 3.2.4 Expected signals

- We expect exact determinism (`matchRate = 1.00`, no mismatches).
- UI displays exact `matchRate` regardless and lets users interpret.

### 3.2.5 Test matrix

- Unit:
  - trial-pair comparator catches 1-of-3 mismatch
  - missing trial marks row `INSUFFICIENT DATA`
- Integration:
  - API returns sorted trial columns consistently
  - UI highlights mismatch rows correctly

## 3.3 Issue #286 — Order invariance

### 3.3.1 Test design

- Inputs: 5 existing vignettes
- Condition A: baseline order
- Condition B: attributes/options reversed (presentational swap only — same scenario content)
- Additional mapping check: reverse A/B orientation in option labels
- Scope: all models, temp=0

### 3.3.2 Task breakdown

1. Create variant generator for “flipped order” (rendering flag only — no scenario rewrite required).
2. Create orientation-mapping metadata:
   - `semanticLeft`, `semanticRight`, `renderedLeft`, `renderedRight`
   - `orientationFlipped: boolean`
3. Normalize decisions back to semantic orientation using explicit transform.
4. Compare baseline vs flipped after normalization.
5. Produce mismatch reason: `decision_flip` vs `invalid_mapping`.

Normalization rule (must be implemented exactly):

- Decision scale: `1..5`, where `1 = strongly favors rendered right`, `5 = strongly favors rendered left`.
- If `orientationFlipped = false`, normalized decision = raw decision.
- If `orientationFlipped = true`, normalized decision = `6 - rawDecision`.
- Mapping table:
  - `1 -> 5`
  - `2 -> 4`
  - `3 -> 3`
  - `4 -> 2`
  - `5 -> 1`

Canonical anchor:

- Baseline semantic orientation is authoritative and stored on the scenario pair.
- All variant responses are transformed into baseline semantic orientation before comparison.

### 3.3.3 Table design

- Columns: `Model`, `Vignette`, `Condition`, `Baseline`, `Flipped`, `Normalized Match`, `Reason`
- Each row is clickable and opens the batch transcript modal (implemented in Phase 3 alongside this table).
- Summary chips:
  - `% unchanged`
  - `# sensitive models`
  - `# sensitive vignettes`

### 3.3.4 Expected signals

- We expect normalized match >=98% generally.
- UI displays exact normalized match rate.

### 3.3.5 Test matrix

- Unit:
  - mapping normalization works for reversed labels
  - invalid orientation metadata is detected
- Integration:
  - baseline/flipped pairs are correctly matched by key
  - summary percentages equal raw counts

## 3.4 Issue #287 — Job-title invariance

### 3.4.1 Test design

- Inputs: 5 professional-domain vignettes
- Condition A: titled version (original)
- Condition B: generic job wording
- Scope: all models, temp=0

### 3.4.2 Task breakdown

1. Create no-title rewrite templates with same value tradeoff.
2. Store pair-link metadata: `sourceScenarioId`, `genericScenarioId`.
3. Run both conditions with identical model config.
4. Compare titled vs generic decisions.
5. Aggregate by:
   - model
   - vignette template

### 3.4.3 Table design

- Columns: `Model`, `Vignette`, `Condition`, `Titled`, `Generic`, `Changed?`
- Each row is clickable and opens the batch transcript modal (implemented in Phase 4 alongside this table — see 3.1).
- Summary metrics:
  - `% changed`
  - most title-sensitive model
  - most title-sensitive vignette family

### 3.4.4 Expected signals

- We expect change rate <=5% generally.
- UI displays exact change rate.

### 3.4.5 Test matrix

- Unit:
  - pairing logic rejects non-equivalent scenario links
- Integration:
  - table renders both condition decisions
  - “changed” totals reconcile with summary

---

## Level 4: Delivery Plan and Checklists

## 4.1 Phase plan

1. Phase 1: Assumptions tab shell + shared schema scaffolding (route, page shell, shared result types, preflight UI container)
2. Phase 2: #285 read-only results — batch matrix, summary card, detail table, `AssumptionTranscriptModal` for batch rows using existing qualifying runs
3. Phase 3: #285 end-to-end execution — preflight confirmation, approval gate wiring, locked-package launch action, run tagging, and query scoping to dedicated temp=0 confirmation runs
4. Phase 4: #286 end-to-end — orientation-flip variant generator, normalization engine, summary card, detail table, `AssumptionTranscriptModal` for baseline/flipped rows, built on the #285 execution pipeline
5. Phase 5: #287 end-to-end — generic rewrite storage, pairing logic, summary card, detail table, `AssumptionTranscriptModal` for titled/generic rows, built on the same execution pipeline
6. Phase 6: Assumptions tab UI polish (`?` methods disclosure, copy/export consistency across all three tables)
7. Phase 7: QA signoff and release

Note: The `AssumptionTranscriptModal` is implemented per-issue in the phase that delivers that issue's table (Phases 2, 4, and 5), not deferred to a separate drill-down phase.

Sequencing note: do not continue expanding #286 or #287 beyond read-only placeholders until #285 has a true launch path. The temp=0 check is the simplest assumption and must establish the actual execution lifecycle (preflight -> approval -> dispatch -> tagged runs -> scoped readback) before the framing-variant checks reuse that infrastructure.

## 4.2 Backend checklist

- Add assumptions computation module
- Add API fields for summaries + difference rows
- Add strict pairing validation and exclusion counts
- Add deterministic ordering for tables and summaries
- Add telemetry (`assumptionKey`, run counts, mismatch rate)
- Implement server-side prompt template rendering for preflight cost estimation: render the exact prompts that will be sent, count input tokens from those rendered strings (not averages), apply the current model price snapshot, and add expected output-token allowance using the standard assumptions-run response budget. This is required by 2.2a.6 and is non-trivial — it requires the template renderer to be callable from the cost-estimation path before any probe jobs are dispatched.

## 4.3 Frontend checklist

- Add Assumptions tab route + tab switcher entry
- Add summary cards section
- Add three detail table blocks
- Add methods disclosure content behind `?`
- Ensure copy icon position is top-right of table title across sections

## 4.4 QA checklist

- Unit coverage for rate computations and boundary values
- Integration coverage for API payload shape
- E2E:
  - load tab
  - open methods disclosure
  - verify highlighted mismatches
  - verify copy/export behavior
- Regression:
  - no breakage in Domain Analysis existing tables

## 4.5 Release checklist

- Create baseline run snapshot (store run IDs + date + model version IDs)
- Run full assumption dataset
- Snapshot exported evidence CSVs
- Capture metric outcomes in release note
- Enable tab in production
- Configure living-check cadence:
  - rerun when model version changes
  - rerun when assumption vignette set changes
  - monthly scheduled rerun for drift monitoring
- Automated drift-monitoring reruns may bypass manual preflight UI confirmation only when they reuse an already approved vignette package with valid stored review metadata.
- If the vignette package, pairing logic version, or approval metadata changes, the next run must go back through manual preflight review and explicit confirmation.
- Even when preflight UI confirmation is bypassed for automation, the system must still compute and log a fresh run-cost estimate using the current pricing snapshot for auditability.

---

## Risks and mitigations

- Model/provider drift across test windows:
  - enforce run window and model-version pinning
- Prompt/template drift:
  - store prompt hash and scenario template hash
- False positives from missing pairs:
  - separate `missing_pair` from true `decision_flip`
- Low sample overconfidence:
  - hard `INSUFFICIENT DATA` gate until minimum N met
