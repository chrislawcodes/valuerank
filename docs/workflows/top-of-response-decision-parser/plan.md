# Top-Of-Response Decision Parser Plan

## Scope

Implement the deterministic parser improvement from [spec.md](/Users/chrislaw/valuerank/docs/workflows/top-of-response-decision-parser/spec.md) inside the summarize worker and its unit tests.

The goal is to reduce fallback LLM usage by preferring top-of-response judgments without widening the parser so far that it starts hallucinating exact matches.

## Design Summary

The implementation should add a new deterministic leading-judgment layer before the broader whole-response scan.

This layer should:

- extract exactly two leading candidates from the response:
  the first non-empty line and the first sentence returned by `response_segments`
- treat sentence splitting as the current `response_segments` contract:
  split on newlines first, then on sentence-ending punctuation matched by `(?<=[.!?])\s+`
- strip a bounded start-anchored set of deterministic lead-ins:
  optional `my`, optional `final` or `overall`, one of `judgment|answer|response|decision|choice|rating|score`,
  optional `on the scale`, then optional `is`, `:`, or `=`, plus the wrappers `in short` and `overall`
- use a stricter leading numeric parser that accepts only explicit decision forms and bare numeric answers, not the broad whole-response fallback-number scan
- reuse exact scale-label matching on those leading candidates after lead-in stripping

If that layer does not resolve the answer safely, the current full-response deterministic logic and fallback LLM path should continue unchanged.

Numeric leading wins should take precedence over text-label matching when the same opening candidate contains both forms.

## Implementation Steps

1. Add a helper that derives leading deterministic candidates from the response text.
2. Add a helper that strips safe judgment lead-ins without destroying the rest of the sentence.
3. Add a new leading numeric parse attempt before the existing full-response numeric scan.
4. Add a new leading text-label parse attempt before the existing full-response text-label scan.
5. Record distinct `parsePath` values for leading deterministic wins so transcript metadata stays interpretable.
6. Keep `parseClass = exact` and `decisionSource = deterministic` for these leading deterministic wins.
7. Preserve current fallback behavior for unresolved transcripts.
8. Expand worker tests to cover:
   - leading numeric judgment with later distracting numbers
   - leading text-label judgment with a lead-in wrapper
   - numeric-plus-label leading candidates where numeric takes precedence
   - contextual leading numbers that should not be accepted by the leading parser
   - conflicting leading candidates staying unresolved
   - scenario-number or explanatory-number negatives in the opening line
   - late quoted labels still not counting as exact

## Likely File Changes

- `cloud/workers/summarize.py`
- `cloud/workers/tests/test_summarize.py`

## Constraints

- no schema changes
- no UI changes
- no DB migration
- no transcript backfill in this slice
- keep the parser conservative when confidence is not high

## Verification Suite

Required verification for the implementation:

```bash
cd /Users/chrislaw/valuerank/cloud
PYTHONPATH=/Users/chrislaw/valuerank/cloud/workers pytest workers/tests/test_summarize.py
```

If needed, also run the repo’s worker-targeted test wrapper for the same file.

## Review Reconciliation

- Runner note: the repo-owned feature workflow runner currently fails in this checkout because it expects `/Users/chrislaw/valuerank/scripts/sync-codex-skills.py`, which is missing. This feature still follows the same workflow artifact structure manually.
- review: `reviews/spec.codex.architecture.review.md` | status: accepted | note: Keep the feature bounded to deterministic summarize-worker parsing and preserve the existing fallback path.
- review: `reviews/spec.gemini.requirements.review.md` | status: accepted | note: The spec now defines the leading region, bounded lead-ins, numeric precedence, and contextual-number negatives explicitly.
- review: `reviews/plan.codex.architecture.review.md` | status: accepted | note: The plan stays confined to the worker and test file and uses the working `PYTHONPATH` verification command.
- review: `reviews/plan.gemini.testability.review.md` | status: accepted | note: The plan now names the precedence, contextual-number, and negative-number cases that the worker suite covers.
- review: `reviews/diff.codex.correctness.review.md` | status: accepted | note: The implementation keeps fallback intact, adds bounded leading parsing, and covers the new paths with worker tests.
- review: `reviews/diff.gemini.regression.review.md` | status: accepted | note: The `Rating: 4 or 5` ambiguity issue was fixed in the worker; the remaining bare-leading-number precedence is an intentional prompt-contract tradeoff for this slice.

## Ready-To-Implement Gate

Implementation can proceed after:

1. the spec is written and reviewed
2. the plan is written and reviewed
3. the bounded file scope remains limited to the worker and its tests
