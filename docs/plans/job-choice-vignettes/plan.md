# Job Choice Vignettes Plan

## Scope

Plan the `Job Choice` vignette family in [spec.md](/Users/chrislaw/valuerank/docs/plans/job-choice-vignettes/spec.md) with emphasis on methodological soundness, bridge review, and backward compatibility.

## Current State

The repo already has:

1. a live 45-vignette professional-domain `Jobs (...)` family
2. order-balancing infrastructure and normalization logic
3. analysis code that expects canonical numeric decisions

The biggest new challenge is not vignette generation. It is reliable interpretation of `label + explanation` responses without breaking the numeric downstream pipeline or accidentally measuring compliance with explicit value labels.

That matters for stability in particular because the current repeat-sample analysis computes variance, directional agreement, median signed distance, and neutral share only from canonical numeric `1..5` decisions. Unresolved `Job Choice` transcripts will otherwise fall out of stability entirely unless coverage loss is surfaced.

## Execution Order

### Phase 1: Lock the methodology

Already decided:

- source set is all live root vignettes in the professional domain
- reuse the existing matching `150 words + no reframe` preamble version
- remove titles but keep concrete activity and responsibility descriptions
- allow `label + explanation`
- do not assume label position is rigid
- use two balanced A-first/B-first batches for rollout
- use the locked five-vignette sentinel for bridge review
- treat `>3%` ambiguous or unparseable transcripts as a hard rollout blocker
- require sentinel migration to wait until the bridge study passes
- make the methodology-safe launch path a `Paired Batch`, not a generic single batch
- treat `Job Choice` as a new instrument with descriptive side-by-side comparison only
- use all active default models for the manual pilot and first full bridge
- require 95% human agreement on fallback-resolved parser cases before rollout

Still open before implementation:

- what bridge model set and sample size are sufficient

### Phase 2: Define the canonical metadata contract

Each new vignette and condition should answer:

- what value is canonical `A`
- what value is canonical `B`
- which value is shown first in the narrative
- which side is first in the response labels
- whether the stored result came from numeric input, exact label match, fallback resolution, or remained ambiguous
- what parser or mapping version produced the final score
- full parse-debug metadata sufficient to reproduce the mapping decision

This metadata contract must be finalized before implementation because the existing numeric-only downstream pipeline drops non-`1..5` values and will otherwise hide degradation.

### Phase 3: Create the new family

1. Duplicate all live root professional-domain vignettes into `Job Choice`.
2. Apply the chosen preamble version.
3. Rewrite the ten role archetypes to remove titles while preserving the substantive activity contrast.
4. Add the `job-choice` tag to each vignette.
5. Regenerate conditions.
6. Produce at least two bridge-ready rewritten label variants:
   - option-text-labeled response wording that directly restates each side of the job choice using the shortened core value phrase before `by`
   - `value A / value B` response wording

### Phase 4: Extend transcript interpretation

1. Preserve the current numeric-only path for legacy runs.
2. Add a text-label interpretation path for `Job Choice`.
3. Resolve exact matches deterministically first.
4. Record:
   - raw extracted label text
   - canonical mapped score
   - mapping source
   - ambiguity status
   - parse-debug metadata from the spec
5. Write a fixed adjudication protocol for contradictory or explanation-led responses.
6. Human-adjudicate all fallback-resolved bridge cases.
7. Fail closed on unresolved ambiguity.

In parallel, define how GraphQL, exports, assumptions summaries, and reports surface coverage loss so unresolved parses do not disappear silently from numeric analyses.

For the production `value A / value B` family, non-value-labeled responses such as `option A/B`, entity-name answers, or other off-scale wording should default to the ambiguous bucket unless they are covered by a pre-approved fallback rule.

Manual adjudication should reuse the existing transcript-decision override pattern where possible: ambiguous cells open transcript detail, and reviewers can assign a manual label/score through a dropdown with audit logging.

The manual adjudication dropdown should present both numeric and labeled forms together, for example `5 - Strongly support value A`, so reviewer overrides align with downstream stability scoring.

For CSV-based parser validation, export all fallback-resolved transcripts in the manual pilot and first bridge so humans can adjudicate every one of them.

### Phase 4.5: Stability compatibility review

Before bridge launch, explicitly verify how `Job Choice` transcripts enter repeat-sample stability analysis.

Required decisions:

1. stability continues to use canonical numeric `1..5` scores after orientation correction
2. parser-only and manually adjudicated stability views are both reportable during bridge review
3. stability cells expose contributing trial counts so reduced coverage is visible
4. ambiguous/unparseable transcripts remain inspectable from the stability UI rather than silently disappearing
5. analyst-facing reporting distinguishes parser-derived stability from reviewer-assisted stability

### Phase 4.6: UI launch distinction

Before rollout, make the launch choices explicit in the product:

1. primary action is `Start Paired Batch`
2. secondary, less prominent action is `Start Ad Hoc Batch`
3. only `Paired Batch` results are methodology-safe by default
4. `Ad Hoc Batch` results are visibly exploratory and excluded by default from bridge evidence, assumptions, and sentinel decisions

### Phase 4.7: Placeholder for future noisy-cell follow-up

Do not implement this now, but keep the design compatible with later targeted extra paired trials for noisy cells.

Compatibility requirements:

1. a future `Paired Batch` may target only selected conditions rather than the full vignette
2. later follow-up paired batches must stay distinguishable from the initial paired batch
3. stability reporting must be able to show whether evidence comes from the initial paired batch, follow-up paired batches, or both
4. parser metadata and manual adjudication provenance must remain trial-level so follow-up evidence can be audited cleanly

### Phase 5: Bridge study

Start with a manual pilot before the full bridge.

Manual pilot:

1. one vignette
2. one paired batch
3. all active default models
4. manual transcript review for parsing, ambiguity, and rewrite quality
5. launch it as real baseline-compatible data, not throwaway test-only data
6. no rollout or migration decision made from this step alone

If the manual pilot looks acceptable, continue to the full bridge using the locked five-vignette sentinel set.

Bridge study should include:

1. manual prompt review using the checklist from the spec
2. second-reviewer signoff on each bridge vignette rewrite
3. explicit bridge arms that isolate:
   - title removal
   - response-label wording
   - order effects
4. a full 2x2 order design on the rewritten bridge set
5. predeclared bridge models, sample counts, reviewers, and stop rules
6. reporting of:
   - exact label match rate
   - fallback-resolved parse rate
   - ambiguous or unparseable rate
   - human-adjudicated fallback accuracy
   - neutral rate
   - parser-only stability metrics
   - adjudicated stability metrics
   - stability coverage before and after adjudication
   - qualitative discrimination assessment
   - explicit bridge comparison claim and whether it passed
   - per-model and per-vignette confusion and coverage breakdowns
   - transcript exemplars for ambiguous and fallback cases
   - manual checklist notes

Treat this report as a release artifact, not an informal note.

Bridge review output should also distinguish:

- parser-derived outcomes
- manually adjudicated outcomes

so reviewers can see how much of the bridge result depends on manual cleanup.

Bridge signoff should not treat an apparent stability improvement as persuasive if it is mainly caused by dropping ambiguous transcripts from the denominator.

### Phase 6: Rollout or fix

- If ambiguous or unparseable rate is above 3%, stop and fix before rollout.
- If fallback-resolved bridge cases do not meet 95% agreement against human adjudication, stop and fix before rollout.
- If prompts feel too abstract or discrimination looks weaker, review and likely revise before rollout.
- If the bridge study supports only descriptive side-by-side reporting, treat `Job Choice` as a new instrument and defer sentinel migration.
- If the bridge study passes its predeclared comparison claim, proceed in stages:
  1. hidden family creation
  2. bridge-sentinel canary only
  3. limited-vignette expansion
  4. full 45-vignette rollout
  5. sentinel migration only after telemetry and regression suites stay clean

Rollback must be able to restore the assumptions stack to the legacy professional sentinel without rewriting historical data.

## Same-Signature Reuse Requirement

Pilot and bridge batches should be reusable as real evidence when later paired batches share the same operational signature.

For planning purposes, treat the reusable same-signature tuple as:

1. vignette ID
2. vignette version
3. preamble version ID
4. temperature

Implications:

1. do not create a separate throwaway test mode if we want pilot batches to combine with future evidence
2. keep methodology-safe pilot and bridge work baseline-compatible so same-signature pooling remains available
3. preserve repeated-trial structure so later stability calculations can combine same-signature evidence without collapsing away batch provenance

## Manual Review Rubric

For each sentinel vignette:

1. Are the options still concretely distinguishable?
2. Is each option’s day-to-day activity still legible?
3. Is the intended value contrast still recognizable without the title?
4. Does either option now read as generic or placeholder-like?
5. Does the prompt still feel like a real job-choice judgment?
6. Are stakes and severity preserved?
7. Is plausibility preserved?
8. Are prestige or status cues balanced rather than accidentally shifted?
9. Is lexical valence and specificity reasonably symmetric?
10. Does either side name the target value more directly than the other?

This rubric should structure both primary review and second-reviewer equivalence signoff.

## Open Methodology Decisions

- What bridge model set and sample size are sufficient?
- Where should bridge evidence, adjudication notes, and reviewer signoff live?

## Open Product And Engineering Decisions

- What explicit family labels appear in UI, exports, assumptions views, and reporting so old `Jobs (...)` and new `Job Choice` are not conflated?
- How will downstream coverage loss be surfaced anywhere the numeric pipeline currently drops non-`1..5` values?
- What feature flag or configuration switch governs sentinel family selection?
- How are old sentinel IDs mapped to new sentinel IDs for telemetry and historical continuity?
- Which regression and smoke suites are required before limited rollout and before sentinel migration?
- How should the manual adjudication dropdown present the five value-labeled options, and where should the original parser outcome remain visible to the reviewer?
- Where should parser-only versus adjudicated stability views live in the UI and exports so analysts do not confuse them?
- What visual treatment makes `Start Ad Hoc Batch` available but clearly less prominent than `Start Paired Batch`?
- If we later add noisy-cell follow-up, what term should distinguish the initial paired batch from a follow-up paired batch without confusing users?

## Page Naming Placeholder

Where the new methodology replaces an existing page or view, keep the current experience available with an `Old V1` label until migration is complete.

## Verification Later

Implementation-time verification should include:

```bash
cd /Users/chrislaw/valuerank
rg -n "decisionCode|orientationFlipped|presentation_flipped|scale_flipped|fully_flipped" cloud/apps/api/src cloud/workers
```

```bash
cd /Users/chrislaw/valuerank/cloud
npm test --workspace=@valuerank/api -- --run tests/graphql/queries/order-invariance.test.ts
npm test --workspace=@valuerank/api -- --run tests/services/analysis/aggregate.test.ts
pytest workers/tests/test_summarize.py
```
