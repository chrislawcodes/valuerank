# Job Choice Vignettes Spec

## Goal

Create a next-generation `Job Choice` vignette family derived from the current live professional-domain `Jobs (...)` prompts, while keeping the existing professional-domain package and numeric pipeline intact.

This is a methodology redesign, not a cleanup. It changes prompt framing, response labeling, and order-balancing strategy for a new vignette family.

Until bridge evidence says otherwise, `Job Choice` should be treated as a new instrument rather than assumed comparable to the current professional-domain jobs family.

Until migration is explicitly approved, the current professional-domain sentinel package should remain operationally immutable. `Job Choice` must first exist as a separate bridge sentinel with its own IDs, pair links, telemetry, and rollback path.

## Source Set

- Include every live root vignette in the `professional` domain.
- Do not use tags to determine inclusion.
- In the current live data, that source set is 45 root vignettes, all from the `Jobs (...)` family.

## Intended Design

For each source vignette:

1. Copy it into a new domain called `Job Choice`.
2. Reuse the existing preamble version that matches `150 words + no reframe`.
3. Remove job titles, but keep concrete activities, responsibilities, and consequences.
4. Record canonical value order so the first-presented value is `A`.
5. Candidate response labels for the preferred new design are:
   - `Strongly support value A`
   - `Somewhat support value A`
   - `Neutral`
   - `Somewhat support value B`
   - `Strongly support value B`
6. Add the `job-choice` tag to each vignette.
7. Keep the legacy professional-domain family and legacy numeric path unchanged.

The `value A / value B` scale is provisional until the bridge study tests whether it improves measurement or merely increases compliance with explicit value framing.

For the option-text-labeled form, each side should use this pattern:

- vignette text: full sentence in the form `In one role, they would gain [value] <core value phrase> by <concrete activity or consequence>.`
- response label: shorter phrase that uses the part before `by`, for example `Strongly support taking the job with substantial recognition for expertise`

The response scale should not repeat the full sentence, but it should still preserve the scaled value phrase directly.

## Rollout Design

- Use two balanced batches everywhere for rollout:
  - Batch 1: A-first for both presentation and response labels
  - Batch 2: B-first for both presentation and response labels
- This is accepted as a balancing design even though it does not separately identify narrative-order and response-scale-order effects.
- Before rollout, the bridge study must use the full 2x2 order design on the locked five-vignette sentinel set so we can detect whether narrative-order and response-scale-order effects interact.
- The current order-effect safety tooling must either remain pointed at the legacy sentinel or be explicitly versioned for the new bridge sentinel. It must never silently interpret the new family as if it still had the old `presentation_flipped` / `scale_flipped` / `fully_flipped` semantics.

## Product Terms

- `Paired Batch`: the official methodology unit for `Job Choice`, consisting of one batch and its flipped counterpart.
- `Ad Hoc Batch`: an exploratory batch that does not need the paired counterpart.
- `Start Paired Batch`: the primary UI action for methodology-safe launches.
- `Start Ad Hoc Batch`: a less prominent UI action for debugging, inspection, and exploratory work.

Only `Paired Batch` launches should be treated as methodology-safe evidence for bridge review, official reporting, assumptions, or sentinel decisions.

This terminology should leave room for future follow-up `Paired Batch` launches on only a subset of conditions when repeated trials show that particular cells remain noisy.

During migration, pages or views that continue to show the current system should be labeled `Old V1` so users can clearly distinguish the legacy experience from the new `Job Choice` methodology.

## Response Contract

- The model may give `label + explanation`.
- We should strongly instruct use of the five labels, but not assume the label appears on the first line or in an exact rigid format.
- The preferred response scale is `value A` / `value B`, but the bridge study must compare it against an option-text-labeled alternative before we treat it as methodologically acceptable.
- For the `value A / value B` instrument, responses that use non-value-labeled wording such as `option A`, role/entity names, or other off-scale labels should default to `ambiguous` unless they satisfy an explicitly approved fallback rule.

For the option-text-labeled bridge arm, the preferred scale shape is:

- `Strongly support taking the job with ...`
- `Somewhat support taking the job with ...`
- `Neutral / Unsure`
- `Somewhat support taking the job with ...`
- `Strongly support taking the job with ...`

Each label should use the shortened core value phrase from the vignette sentence rather than repeating the full `by ...` clause.

## Methodology Goals

1. Reduce occupation-title confounds without erasing realism.
2. Keep the response scale closely tied to the intended values.
3. Preserve canonical ordinal interpretation downstream.
4. Balance first-position bias operationally.
5. Keep the redesign isolated from legacy runs so old analyses do not silently change meaning.
6. Preserve interpretability of repeat-sample stability metrics rather than letting parsing loss silently masquerade as stability.

## Main Risks

### Title removal may erase realism

If titles are stripped too aggressively, prompts may become vague or slogan-like. Manual review should use a consistent checklist, but that checklist is advisory rather than an automatic blocker by itself.

The core hidden assumption to validate is that titles are a removable framing confound rather than part of the construct. Title removal is acceptable only if the rewritten prompt still represents the same underlying work-path tradeoff at comparable stakes and plausibility.

### Text-label parsing may become part of the measurement problem

Because responses may include explanation and may not place the label in a fixed position, parsing quality must be treated as auditable measurement infrastructure, not as an invisible convenience step.

The more dangerous failure mode is not ambiguity alone. It is wrong-but-decisive fallback mapping. Bridge validation must therefore include human adjudication of fallback-resolved cases.

This risk directly affects stability calculations because the current repeat-sample pipeline only operates on canonical numeric `1..5` decisions. Any unresolved `Job Choice` transcript that never receives a canonical score will otherwise drop out of variance, directional-agreement, and neutral-share calculations.

### Two-batch balancing does not identify separate order mechanisms

The two-batch design balances average order bias but does not separate narrative-order effects from response-scale-order effects. That tradeoff is accepted for rollout.

It is not accepted for bridge validation. The bridge study must still use 2x2 randomization on the sentinel set.

### Future noisy-cell follow-up should remain possible

We may later want targeted additional paired trials for cells that remain noisy after the initial methodology-safe pass.

Nothing in the `Job Choice` design should assume that:

- every methodology-safe launch is the first and only paired batch
- every methodology-safe launch must cover the full vignette rather than selected conditions
- repeat stability is evaluated only from a single launch wave

Future follow-up paired batches should remain able to:

- target only selected conditions or cells
- preserve pairing between baseline and flipped variants
- record which trials came from the initial paired batch versus a later follow-up paired batch
- enter downstream stability analysis without losing auditability

### Multiple changes are bundled together

The new family changes:

- preamble handling
- title framing
- response labels
- order balancing

This is acceptable as a new family, but we should not overclaim which single change caused any observed improvement.

The bridge study must isolate at least:

- title removal
- response-label wording
- order effects

so that any later claims are grounded in evidence rather than bundle-level intuition.

### Value-labeled responses may contaminate the construct

Using `value A / value B` may cause the system to measure compliance with explicit value framing rather than underlying job-choice preference. That risk must be tested directly rather than assumed away.

## Bridge Study Before Rollout

Before full rollout, run a manual pilot first, then a bridge study on the current locked five-vignette sentinel set.

### Manual Pilot Before Bridge

The first step should be a small manual pilot:

- one vignette
- one paired batch
- manual transcript review

The purpose of the manual pilot is to shake out:

- title-removal rewrite problems
- parser failure patterns
- adjudication UX problems
- any obvious instability or ambiguity problems

The manual pilot is not sufficient evidence for rollout, sentinel migration, or methodology claims. It is a preparatory checkpoint before the full bridge study.

The manual pilot should still be launched as real product data, not as throwaway sandbox data, so that future same-signature paired batches can be combined with it when appropriate.

For this feature, we should preserve compatibility with the product's current same-signature baseline semantics. In practice that means future pooling should depend on the operational signature tuple already used by the product:

- vignette ID
- vignette version
- preamble version ID
- temperature

The displayed trial signature label is useful product language, but it is not the sole eligibility rule for pooling.

To keep pilot evidence reusable:

- launch pilot work as baseline-compatible `Paired Batch` data
- avoid special test-only run types that would make the batch ineligible for same-signature pooling
- keep future follow-up paired batches on the same vignette/version/preamble/temperature tuple if we want them to combine cleanly
- preserve repeated-trial structure so later stability analysis can distinguish initial and follow-up evidence

The bridge study should compare:

- current jobs family
- rewritten `Job Choice` family with option-text-labeled responses
- rewritten `Job Choice` family with `value A / value B` responses
- full 2x2 order behavior on the rewritten family

For the option-text-labeled bridge arm, the response scale should restate each side of the choice directly, for example:

- `Strongly support taking the job with ...`
- `Somewhat support taking the job with ...`
- `Neutral / Unsure`
- `Somewhat support taking the job with ...`
- `Strongly support taking the job with ...`

Those labels should be written to point clearly at the primary value expressed by each side of the vignette, while staying symmetric enough that one side is not advantaged just because its label is shorter, warmer, or more concrete. The recommended form is to use the value-bearing phrase before `by`, not the full sentence.

The bridge must not be a vague "small-run comparison." It should be predeclared and reviewable before any rollout decision.

It should also produce a durable release artifact that answers:

- what failed
- where it failed
- for which models, vignettes, conditions, variants, and batches it failed
- whether the failure was ambiguity, wrong-but-decisive fallback parsing, realism loss, or discrimination loss

### Stability Impact Requirements

The new methodology should preserve stability interpretability by keeping the downstream stability math on canonical numeric `1..5` scores after orientation correction, while making any loss of analyzable coverage explicit.

Bridge reporting must therefore distinguish at least:

- parser-only stability metrics based only on parser-resolved transcripts
- adjudicated stability metrics after manual overrides are applied
- coverage loss for transcripts excluded from stability because no canonical score was available

For bridge review, stability reporting should include:

- trial count contributing to each stability cell before adjudication
- trial count contributing to each stability cell after adjudication
- count and share of transcripts removed from stability due to ambiguity
- directional-agreement, median signed distance, and neutral-share comparisons between parser-only and adjudicated views

We should not interpret an apparent increase in stability as a methodological win unless analyzable coverage remains acceptable. Fewer scored transcripts can mechanically make the surviving subset look more stable.

### Manual Review Checklist

For each of the five sentinel vignettes, capture notes on:

1. The two options are still concretely distinguishable after title removal.
2. The core day-to-day activity or responsibility of each option is still legible.
3. The intended value contrast is still recognizable without the job title doing the work.
4. Neither option now reads as unnaturally vague, generic, or placeholder-like.
5. The rewritten prompt still feels like a real job-choice decision rather than a direct value slogan.
6. Stakes and severity feel comparable to the source version.
7. Plausibility is preserved after title removal.
8. Status or prestige cues are not shifted in an unbalanced way.
9. Reading complexity and specificity remain reasonably symmetric across both sides.
10. One side does not name the target value more directly than the other.

Each bridge vignette should receive second-reviewer signoff, not just single-reviewer notes.

### Reporting Requirements

Bridge reporting should always include:

- predeclared bridge models, sample counts, and adjudication procedure
- per-model and per-vignette breakdowns, not only pooled rates
- exact label match rate
- fallback-resolved parse rate
- ambiguous or unparseable rate
- human-adjudicated agreement rate for fallback-resolved cases
- neutral rate
- parser-only versus adjudicated stability metrics, with coverage denominators
- transcript exemplars for ambiguous and fallback-resolved buckets
- coverage-loss reporting for transcripts excluded from numeric downstream analysis
- explicit statement of the allowed comparison claim:
  - directional agreement only
  - rank-order similarity
  - descriptive side-by-side only
- manual checklist notes for all five sentinel vignettes
- reviewer identities or roles and adjudication notes for disagreements

For the first bridge sequence, the evidence plan is:

- manual pilot: one vignette, one paired batch, all active default models
- first full bridge: locked five-vignette sentinel set, all active default models

The bridge comparison claim for rollout should be `descriptive side-by-side only`. `Job Choice` should be treated as a new instrument rather than requiring strong cross-family equivalence.

### Ambiguity Adjudication UX

When a bridge-study cell contains ambiguous or unparseable transcripts, the reviewer should be able to:

1. click the affected cell to open the underlying transcripts
2. inspect the full transcript content
3. manually assign the intended label through a dropdown
4. persist that override as a manual decision with auditability

Manual overrides should be treated as adjudication artifacts, not invisible cleanup. The system should preserve both the original parser outcome and the manual override source.

For stability analysis, manual overrides should flow into the canonical numeric decision path only after being clearly marked as manual so bridge reviewers can separate intrinsic instrument stability from reviewer-assisted stability.

### Hard Blockers

- If ambiguous or unparseable transcripts exceed 3% of all bridge transcripts, do not proceed to full rollout until there is a fix and re-review.
- If fallback-resolved cases do not meet a 95% human-adjudicated agreement target, do not proceed to full rollout.
- If the bridge does not predeclare models, sample counts, reviewers, and stop rules, it is not valid evidence for rollout.
- If the bridge fails to isolate title removal, label wording, and order effects, it is not valid evidence for rollout.
- If downstream consumers cannot surface degraded coverage from ambiguous or failed parses, it is not safe to roll out because the current numeric pipeline will bias toward the analyzable subset.

### Advisory Blockers

These require explicit human review and likely revision, but are not hard numeric gates yet:

- rewritten prompts feel too abstract after title removal
- new family appears to show weaker value discrimination than the current jobs family

## Sentinel Migration

Move the locked five-vignette assumptions sentinel to `Job Choice` only after all of the following exist:

1. a separate `Job Choice` bridge sentinel with explicit vignette IDs
2. regenerated or newly created condition-pair links for the new sentinel
3. a clear family-switch contract for assumptions launches, temp=0 confirmation, and order-invariance review
4. explicit UI/reporting labels that distinguish old `Jobs (...)` from new `Job Choice`
5. a rollback switch that returns the assumptions stack to the legacy professional sentinel
6. a passed bridge study against a predeclared comparison claim

Until then, treat `Job Choice` as a new instrument and keep the current professional sentinel live.

## Implementation Constraints

- Do not break the legacy numeric decision path.
- Do not silently reinterpret old professional-domain transcripts.
- Do not mutate old results in place.
- Store enough parsing metadata to distinguish exact matches, fallback-resolved parses, and ambiguous cases.
- Do not claim cross-family comparability without a predeclared bridge criterion.
- Do not allow ambiguous or failed `Job Choice` parses to disappear silently from downstream analysis; coverage loss must be visible in GraphQL, exports, and reporting.
- Do not report stability metrics for `Job Choice` without exposing the transcript coverage that contributed to those metrics.
- Do not present `Ad Hoc Batch` results as methodology-safe by default.
- Do not hardcode `Paired Batch` to mean exactly one full-vignette launch if that would block future targeted follow-up paired batches for noisy cells.

## Required Parse Metadata

The parsing contract must record enough detail to reproduce and debug a mapped decision. Minimum fields:

- `matched_text`
- `match_offset` or equivalent location info
- `parser_rule_id`
- `candidate_matches`
- `normalized_score`
- `raw_score`
- `parse_failure_reason`
- `parse_source`
- `parser_version`
- stable pointer or hash to the raw model response used for parsing

Without these fields, bridge-review buckets are not reproducible and silent parser regressions will be hard to root-cause.

## Parse Classification Rule

For the production `value A / value B` family, parse outcomes should be classified as:

- `exact_match`: one of the five value-labeled responses is identified directly
- `fallback_resolved`: a pre-approved fallback rule maps the response to a canonical score
- `ambiguous`: the response does not clearly use the value-labeled scale, uses off-scale wording such as `option A/B` or entity labels, or contains conflicting cues
- `unparseable`: no credible decision signal can be extracted

This means non-value-labeled responses are not treated as acceptable alternate labels by default.

## Required Telemetry

At minimum, the system must expose:

- per-model / per-vignette / per-batch counts for exact-match, fallback-resolved, ambiguous, unparseable, and neutral outcomes
- parse-failure reason histograms
- sampled exemplars for fallback and ambiguous buckets
- coverage metrics showing how many transcripts were excluded from numeric downstream analysis
- separate telemetry for legacy `Jobs (...)` vs new `Job Choice`
- migration telemetry linking old sentinel IDs to any new sentinel IDs and recording when the family switch occurred
- counts of manually adjudicated transcripts by model, vignette, and parse-failure reason

## Required Test Areas

Implementation later should include:

- backward-compatibility tests proving the legacy professional `Jobs (...)` family still launches, summarizes, aggregates, exports, and drives assumptions unchanged
- parser-corpus tests for late-label, quoted-label, mixed-case, contradictory-label, explanation-first, explanation-only, multiple-label, and wrong-family wording responses
- end-to-end tests proving ambiguous or failed `Job Choice` parses remain visible as degraded coverage rather than disappearing silently
- end-to-end tests proving ambiguous cells can open transcript detail and persist a manual relabel via dropdown
- sentinel-migration tests for temp=0 launch, assumptions review, order-invariance review, and historical data continuity
- full-family smoke coverage across all 45 vignettes before any default-family or sentinel switch

## Files Likely To Change Later

- [cloud/apps/api/src/graphql/assumptions-constants.ts](/Users/chrislaw/valuerank/cloud/apps/api/src/graphql/assumptions-constants.ts)
- [cloud/apps/api/src/graphql/mutations/assumptions.ts](/Users/chrislaw/valuerank/cloud/apps/api/src/graphql/mutations/assumptions.ts)
- [cloud/apps/api/src/graphql/queries/order-invariance.ts](/Users/chrislaw/valuerank/cloud/apps/api/src/graphql/queries/order-invariance.ts)
- [cloud/apps/api/src/services/assumptions/order-effect-service.ts](/Users/chrislaw/valuerank/cloud/apps/api/src/services/assumptions/order-effect-service.ts)
- [cloud/apps/api/src/queue/handlers/analyze-basic.ts](/Users/chrislaw/valuerank/cloud/apps/api/src/queue/handlers/analyze-basic.ts)
- [cloud/apps/api/src/services/analysis/aggregate/update-aggregate-run.ts](/Users/chrislaw/valuerank/cloud/apps/api/src/services/analysis/aggregate/update-aggregate-run.ts)
- [cloud/apps/api/src/services/run/start.ts](/Users/chrislaw/valuerank/cloud/apps/api/src/services/run/start.ts)
- [cloud/workers/summarize.py](/Users/chrislaw/valuerank/cloud/workers/summarize.py)
