# Transcript Decision Model: Winner-First Storage

**Feature run:** `transcript-decision-model-winner-first`  
**Status:** spec  
**Last updated:** 2026-03-27

---

## What This Does

This feature defines a cleaner transcript decision model for paired vignette analysis.
The primary fact is the winning value key and the strength of the win. Presentation order
is kept as internal metadata so the system can count paired vignette orders correctly later,
but the visible reporting surfaces do not change.

The core rule is:

- store what the model favored
- store how strongly it favored it
- store which order the vignette used
- derive canonical direction only when analysis needs it

The user-facing analysis pages should keep the same labels, the same visible tables, and the
same report shapes they already have.

---

## Problem

Paired vignette analysis currently has too much meaning packed into direction labels.
That makes the data harder to reason about and easier to misread when the same pair is shown
in reverse order.

The practical risk is not that order should become a new report surface. The practical risk is
that order must remain available inside the analysis pipeline so the existing reports can pool
paired vignette runs safely.

The current need is:

- keep the winner as the primary transcript fact
- keep the current reports unchanged
- make paired counting stronger and less error-prone behind the scenes

The important invariant is that the canonical pair identity already exists in the
definition metadata. `methodology.pair_key` groups the two orientations of the
same vignette pair, and the canonical value order comes from the definition's
`dimensions` order. `presentation_order` only says which orientation was shown
first in a specific run.

---

## Goals

- Store the winning value key as the main transcript decision fact.
- Store the win strength as the main transcript decision fact.
- Store presentation order as internal metadata so paired counting can be normalized later.
- Derive canonical direction from the stored facts when analysis needs it.
- Keep the existing visible analysis surfaces unchanged.
- Compute order-aware counts on demand, not as a new reporting surface.
- Make paired vignette pooling resilient when the same condition appears in both orders.

---

## Non-Goals

- No new reporting surfaces.
- No new visible order columns, badges, or labels.
- No new order-effect dashboard.
- No change to the canonical glossary terms.
- No change to the meaning of existing report labels.
- No return to `decisionCode` as the primary analysis truth.

---

## Proposed Decision Shape

The transcript decision shape should treat the winner as primary and direction as derived.

| Field | Role | Notes |
|---|---|---|
| `favoredValueKey` | Primary | The value the model actually favored, or `null` when the outcome is neutral or unresolved |
| `strength` | Primary | Strong, lean, or neutral strength of the decision |
| `presentationOrder` | Internal metadata | Which value was shown first in the vignette; this lives in existing decision metadata, not a new visible report field |
| `direction` | Derived | Canonical first vs canonical second, computed when needed |

### Definitions

- `favoredValueKey` is the main meaning of the transcript decision.
- `strength` tells us how strong the win was.
- `presentationOrder` tells analysis which value appeared first.
- `direction` is a normalized label that helps aggregation, but it is not the core fact.
- Neutral outcomes have no winner. In that case, `favoredValueKey` is `null`,
  `strength` is `neutral`, and `direction` is `neutral`.
- Ambiguous, refused, or unparseable responses do not get forced into neutral.
  They remain unresolved and are carried as unknown so analysis can count them
  separately.

---

## How Counting Works

The system should count decisions in two layers:

1. **Transcript layer**
   - Parse the raw response into `favoredValueKey` and `strength`.
   - Keep the vignette order as metadata.

2. **Analysis layer**
   - Derive canonical direction only when the analysis needs it.
   - Convert transcript decisions into canonical buckets.
   - Pool paired vignette orders after normalization.
   - Use the existing `pair_key` plus canonical value order as the stable frame
     for pooling. Do not invent a second pairing key.

3. **Report layer**
   - Keep the existing visible tables and labels.
   - Do not surface order-aware counts as a new user-facing concept.
   - Use the stronger internal counting only to make the existing reports correct.

In practice, order-aware counts are for the backend and analysis helpers, not for new UI.

---

## Reporting Rules

- Existing reports must keep their current visible shape.
- Existing report labels must not change unless a separate product decision says they should.
- Order-aware counting may happen behind the scenes.
- If order-aware information is used in a report, it must be treated as internal normalization unless the report explicitly calls for order awareness.
- The UI should not invent a new order-reporting concept just because the backend stores presentation order.
- Any report that depends on order-aware counting must still render the same
  labels for the same canonical winner, but the totals may change if the prior
  path was mis-normalizing B-first runs.

---

## Why Presentation Order Still Matters

The same pair can be shown in two orders.

| Run | Shown first | Shown second |
|---|---|---|
| `A_first` | achievement | benevolence |
| `B_first` | benevolence | achievement |

If the model says "achievement" won, that is the same winner in both runs.
But the analysis still needs to know which order was used so it can normalize the result
and pool both runs safely.

So presentation order is not the headline result. It is supporting metadata that makes the
headline result reliable.

---

## Acceptance Criteria

- A transcript stores the winning value key as the primary decision fact.
- A transcript stores win strength as the primary decision fact.
- Presentation order is available to analysis as internal metadata.
- Canonical direction is derived, not treated as the primary stored fact.
- Existing analysis pages keep the same visible surfaces and labels.
- Existing paired vignette reports pool A-first and B-first runs correctly after normalization.
- Order-aware counts can be computed on demand without adding a new report surface.
- No user-facing report introduces a new order concept unless the product explicitly asks for it later.
- Legacy transcripts remain readable without a backfill. New winner-first
  metadata is added for newly summarized transcripts, and old rows continue to
  resolve through the existing compatibility path until consumers are migrated.
- `favoredValueKey` is constrained to the two values in the pair, or `null`
  for neutral/unresolved outcomes.

---

## Open Questions For Review

- Should presentation order live in transcript summary metadata or in a separate analysis payload, as long as analysis can read it?
- Which existing surfaces should use the stronger internal counting first if there are multiple candidates?
- Do we want any hidden diagnostics for order-aware counts, or should the feature stay completely behind the scenes for now?

---

## Notes For Reviewers

This PRD is intentionally conservative:

- it keeps the UI stable
- it treats order as supporting metadata, not a new product concept
- it moves the system toward winner-first transcript storage
- it leaves the visible reporting surfaces alone

The main thing to critique is whether the proposed split between primary transcript facts and derived direction is strong enough to prevent future paired-vignette bugs without making the model too hard to use.
