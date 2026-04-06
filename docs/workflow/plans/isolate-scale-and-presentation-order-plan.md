# Isolating Scale vs. Presentation Order Effect Plan

## Background & Problem
Currently, the "Order Invariance" assumption test checks a "Baseline" condition against a "Flipped" condition. However, in the "Flipped" condition, both the **narrative presentation order** (which value formulation is read first) and the **scale choice order** (which value represents '1' vs '5') are flipped simultaneously.

This creates a confound: when an LLM shifts its score in the Flipped condition, we cannot determine if it is reacting to the new narrative reading order (a memory/attention bias) or the new position of the options on the response scale (a positional choice bias, like primacy bias).

## Proposed Solution: The 2x2 Factorial Block
To solve this without exploding trial costs, we will introduce a mathematically sound 2x2 factorial diagnostic that leverages our existing 5-vignette sentinel set and the existing `AssumptionScenarioPair` infrastructure.

### The 4 Required Variants
Instead of 2 variants, we need 4 to decouple the variables. The Baseline is not a "variant" in code logic — it is the source scenario. Three variant scenarios are created and stored per source:

1. **$P_A + S_A$ (Baseline / Source)**: Read Attribute A first, Scale maps 1 (A) to 5 (B). `variantType = null` (source scenario, no pair needed).
2. **$P_B + S_B$ (Fully Flipped)**: Read Attribute B first, Scale maps 1 (B) to 5 (A). `variantType = "fully_flipped"`.
3. **$P_A + S_B$ (Scale Flipped)**: Read Attribute A first, Scale maps 1 (B) to 5 (A). `variantType = "scale_flipped"`.
4. **$P_B + S_A$ (Presentation Flipped)**: Read Attribute B first, Scale maps 1 (A) to 5 (B). `variantType = "presentation_flipped"`.

### What Already Exists
Two of the four variants have already been run as part of the existing Order Invariance and Temp Zero assumption pipeline:

| Variant | Status | Trials Available |
| :--- | :--- | :--- |
| Baseline ($P_A + S_A$) | ✅ Already exists | N=5 per cell |
| Fully Flipped ($P_B + S_B$) | ✅ Already exists (as `variantType = "flipped"`) | N=5 per cell |
| Scale Flipped ($P_A + S_B$) | ❌ Does not exist | Must generate & run (N=5) |
| Presentation Flipped ($P_B + S_A$) | ❌ Does not exist | Must generate & run (N=5) |

**Net new trial cost: 200 trials per model.** Existing Baseline and Fully Flipped transcripts (200 trials) are reused at full N=5. All 4 variants are symmetric at N=5, so no `pickStableTranscripts` call site changes are needed.

### Sample Size & Diagnostic Scope
This test will be run as a **diagnostic probe**, not a definitive model-wide robustness estimate.
- **Conditions**: To maximize signal-to-noise ratio while minimizing tokens, we will use the 3 highest conflict/variance conditions (5x5, 1x5, 5x1) plus a neutral anchor (3x3). These 4 conditions are encoded as a convention in the backfill script — they are not persisted as a separate config record.
- **Vignettes**: The 5 standard Sentinel Vignettes (`LOCKED_ASSUMPTION_VIGNETTES`).
- **Replicate Trials**: We will run **N=5 replicates** per cell at **Temperature 0**, matching the existing pipeline. `trimOutliers: true` (the default) trims to the inner 3, which is meaningful at N=5 and consistent with how Baseline and Fully Flipped are already analyzed. If results look noisy after the first run, N can be topped up to 10 without re-running from scratch — the launch logic already tops up to a target floor.
- **Total Diagnostic Footprint**: `5 vignettes × 4 conditions × 4 variants × 5 replicates = 400 trials per model` (200 reused, 200 new).

### Infrastructure Changes Required

#### Data Model
`AssumptionScenarioPair.variantType` already exists as a `String` in the schema — no migration is needed to support new string values.

**Backward Compatibility — Migration Required**: Existing rows with `variantType = "flipped"` must be renamed to `"fully_flipped"` via a Prisma migration/data script before the new backfill script runs. All existing UI and query filters on `variantType === 'flipped'` must be updated to `variantType === 'fully_flipped'`. Broad-filtering is not acceptable — mixing variant types produces meaningless aggregated Match Rates.

#### Prisma Select Updates
`variantType` must be added to the `include` / `select` blocks in both:
- `assumptionsOrderInvariance` resolver (so normalization logic can inspect the variant type)
- `assumptionsOrderInvarianceReview` resolver (so the review UI can group correctly)

#### Normalization Logic Fix
`normalizeDecision(decision, !isBaselineScenario)` is incorrect for the 2x2 design. A `presentation_flipped` scenario has the same scale direction as the Baseline ($S_A$) and must **not** have its score inverted. The correct rule is:

```
Score_normalized = (variantType === 'scale_flipped' || variantType === 'fully_flipped')
  ? (6 - score)
  : score
```

This requires `variantType` to flow through from the pair record to the normalization call site.

#### `pickStableTranscripts` Call Sites
`pickStableTranscripts` already accepts a `requiredCount` parameter. The two hardcoded `5` call sites in `order-invariance.ts` (lines ~829, ~832) must be updated to `3`.

#### Review Panel Grouping
`assumptionsOrderInvarianceReview` currently groups all pairs by `sourceScenario.definitionId`, making `conditionPairCount` 3× inflated when 3 variant types exist per vignette. The review UI must be updated to group or pivot by `variantType`, showing a separate review card per variant type per vignette, not a single aggregated card.

#### Launch Mutation Payload
`LaunchOrderInvariancePayload` is hardcoded with `baselineRunsStarted` and `flippedRunsStarted`. For 4 variants, this must be replaced with a per-variant count map (e.g., `runsByVariantType: Record<string, number>`).

#### Analysis UI Adjustments
The Order Effect Panel (`OrderEffectPanel.tsx`) will be updated to display dual-metric output. The current semantics of "Baseline" vs "Flipped" are baked into the component — a redesign is required. The new UI will be wrapped in a feature flag (`ENABLE_2X2_ORDER_EFFECT_UI`) until data is validated.

#### Export Files
If "variant type survives exports" is required, `export/csv.ts` (line ~23) and `export/xlsx/worksheets/raw-data.ts` (line ~34) do not currently export `Run.config` or transcript tags. These files must be updated if export coverage is in scope for this feature.

#### Generation & Review Flow for New Variants
The two new variants (`scale_flipped`, `presentation_flipped`) are created and approved using the **same preflight review flow** as the original fully-flipped vignettes:

1. **Backfill script** (`cloud/scripts/backfill-2x2-order-effect-pairs.ts`) generates the new scenario text for each variant and writes an `AssumptionScenarioPair` row with the appropriate `variantType`. This script must be **idempotent** — it detects existing pairs and skips to avoid duplicates.
2. **Preflight review** — the existing Preflight Review UI in the Order Effect panel shows each new variant pair to a user. Review happens **at the vignette level**: one approve/reject per vignette per variant type covers all condition pairs (5x5, 1x5, 5x1, 3x3) for that vignette. This means **10 review cards** total (5 vignettes × 2 new variant types). The reviewer confirms the prompt text is correct — that the right things are flipped and nothing else changed.
3. **Launch is gated on approval** — the existing `launchOrderInvariance` mutation already requires `equivalenceReviewStatus: 'APPROVED'` before dispatching runs. No new gating logic is needed; the gate just extends to cover all 3 variant types.
4. **Runs are dispatched** targeting N=5 replicates at Temperature 0, matching the existing pipeline.

- Add a system tag `assumption:order-effect:2x2-sentinel` to all associated runs.
- Inject `variant_type: "<value>"` into the `Run.config` JSON object so it survives exports and database snapshots.

#### Execution Engine
The existing `Launch Order-Effect Runs` button will trigger the probe worker to execute the 2 new variant types for the locked Sentinel conditions (Baseline and Fully Flipped data already exist and are reused). Launch logic must group runs by `variantType` bucket (not assume one "flipped" bucket). The N=5 replicate target is unchanged from the existing pipeline — no call site changes to `pickStableTranscripts` are needed.

### Analysis & Metrics
The effect size for each axis will be the **Mean Absolute Difference (MAD)** of normalized scores on the 1-5 scale (where $S_B$-direction scores are computationally inverted back to $S_A$ direction using the normalization rule above before comparison).

- **Presentation Order Effect (Δ_P)**: Mean Absolute Difference between scores in ($P_A$) vs ($P_B$), holding $S$ constant. Computed by pairing `baseline` vs `presentation_flipped`, and `scale_flipped` vs `fully_flipped`, then averaging.
- **Scale Position Effect (Δ_S)**: Mean Absolute Difference between scores in ($S_A$) vs ($S_B$), holding $P$ constant. Computed by pairing `baseline` vs `scale_flipped`, and `presentation_flipped` vs `fully_flipped`, then averaging.

**Cell aggregation**: Within each cell (vignette × condition × variantType), the 5 replicate scores are aggregated using `computeMajorityVote` with `trimOutliers: true` (trims to inner 3), consistent with the existing pipeline. The MAD is then computed across cells.

**Operational Threshold**: Any model demonstrating a Scale Effect (Δ_S) > **0.50** on the 1-5 scale will be flagged as having positional anchoring bias. A secondary warning at Δ_S > **1.00** indicates severe anchoring. *Note: the 0.50 threshold is a reasonable starting point (one-tenth of the scale range) and should be recalibrated after the first diagnostic run if results cluster unexpectedly.*

**Out of Scope**: "Enforce dual-prompt averaging for future trials on flagged models" is a separate cross-cutting execution project and is **not in scope** for this feature. The diagnostic output should flag the model; the enforcement mechanism will be designed separately.

## Expected Report Output
The Order Effect Panel will display a diagnostic model leaderboard. By decoupling the variables, we can diagnose the specific failure mode of each LLM.

| LLM Model | N= | Presentation Effect (Δ_P) | Scale Effect (Δ_S) | Diagnostic Interpretation |
| :--- | :--- | :--- | :--- | :--- |
| **GPT-4o** | 240 | 0.05 | 0.02 | **Robust**. Minimal variance observed across permutations. |
| **Claude-3.5-Sonnet** | 240 | 0.40 | 0.10 | **Evidence of Recency Bias**. Noticeable score shift when reading order changes, but unaffected by scale endpoints. |
| **Llama-3-70B** | 240 | 0.20 | 1.80 | **Evidence of Positional Anchoring**. Massive scale effect (Δ > 1.0) indicating the model ignores the prompt and heavily favors picking the left-most scale option. |

## Implementation Order
To avoid breaking existing data while building the new system, work must proceed in this sequence:

1. **Data contract decision** — Confirm the 4 in-scope conditions, finalize `variantType` string values, confirm export scope.
2. **Migration** — Rename `variantType = 'flipped'` → `'fully_flipped'` in existing DB rows; update all code filters.
3. **Backfill script** (`cloud/scripts/backfill-2x2-order-effect-pairs.ts`) — Generate and store the 2 new variant scenario pairs (`scale_flipped`, `presentation_flipped`) per source; verify idempotency.
4. **Preflight review** — User reviews and approves the 10 new variant cards (5 vignettes × 2 new variant types) at the vignette level via the existing review UI.
5. **Launch orchestration** — Update `assumptions.ts` mutation to group by `variantType` and update payload shape. N=5 target is unchanged. Launch dispatches only the 2 new variants (200 trials); existing data is reused.
6. **Analysis resolvers** — Update `order-invariance.ts` to add `variantType` to selects, fix `normalizeDecision`, implement 2x2 MAD grouping. No `pickStableTranscripts` call site changes needed.
6. **Web API types** — Update `order-invariance.ts` client types to match new GraphQL contract.
7. **`OrderEffectPanel.tsx`** — Redesign review cards and leaderboard columns; add variant-aware transcript drilldown.
8. **Tests** — Write from scratch (no existing order-invariance tests in the repo).

## Verification Plan

### Automated Tests
*(Note: No existing order-invariance tests exist in the repo. All tests below must be created from scratch.)*
- Unit tests for `backfill-2x2-order-effect-pairs.ts` asserting that prompts are textually identical except for the intended manipulations, and polarity is preserved.
- Unit tests for the updated `normalizeDecision` logic asserting that `scale_flipped` and `fully_flipped` scores are inverted, and `presentation_flipped` and `baseline` scores are not.
- GraphQL integration tests verifying `assumptionsOrderInvariance` correctly computes separate Δ_P and Δ_S metrics using the 2x2 grouping.
- Component rendering tests for the new `OrderEffectPanel` dual-metric display with all 4 variant states populated.

### Manual Verification
1. Open the Assumptions -> Order Effect panel.
2. Verify the preflight review UI presents the 3 new pivot variants per vignette for approval (not a single merged card).
3. Click "Launch Order-Effect Runs" and confirm via the database that exactly **200** new trial records are created per selected model (`5 vignettes × 4 conditions × 2 new variants × 5 replicates`). The 200 trials for Baseline and Fully Flipped already exist and are not re-run.
4. Verify the readback UI shows separate "Presentation Effect (Δ_P)" and "Scale Effect (Δ_S)" columns.
5. For a known model, manually verify one cell: query the 3 replicate transcripts for a single (vignette, condition, variantType) cell and confirm the median matches the value shown in the panel.
