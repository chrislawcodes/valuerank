---
reviewer: "codex"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/condition-weighted-winrate/spec.md"
artifact_sha256: "2e70c988fa01de7cf2f7b819ddd93a5c1c21ebcaa401f388655c8d4bdfd48747"
repo_root: "."
git_head_sha: "d0a9b73555aebe903a25a4bc3f3e1863d9d2dfba"
git_base_ref: "origin/main"
git_base_sha: "d0a9b73555aebe903a25a4bc3f3e1863d9d2dfba"
generation_method: "codex-runner"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/condition-weighted-winrate/reviews/spec.codex.edge-cases-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

- High [CODE-CONFIRMED]: The equal-run pooling change is unsafe unless the spec also enforces identical condition coverage. `aggregateAnalysesLogic()` accepts arbitrary `analyses[]` and the spec changes pooled `overall.mean`/`overall.stdDev` to `weight: 1` per run without adding any guard or fallback for asymmetric runs. If a targeted 10-condition run is pooled with a 100-condition run, the result will be biased.

- Medium [CODE-CONFIRMED]: The spec misses a live trial-weighted path in the paired-comparison UI pipeline. `aggregate-logic.ts` still builds `visualizationData.modelScenarioMatrix` from transcript-level decisions, and `PairedRunComparisonCard.tsx` consumes that matrix first in `buildValueCounts()`. Removing raw count rendering does not remove the underlying trial weighting that drives blended counts and the sensitivity fallback.

- Medium [CODE-CONFIRMED]: Decision 7 conflicts with Fix A. `analysisSemantics.utils.ts` uses `isNonNegativeInteger()` not only for preference counts but also for `parseAggregateMetadata()` and `parseRawReliabilitySummaryEntry()`, where those fields must remain integer-only. If someone follows Decision 7 literally, the spec would silently weaken unrelated validation.

- Medium [CODE-CONFIRMED]: The new `scenarioId` grouping has no rule for missing or blank IDs, even though other stats helpers in `basic_stats.py` already normalize missing `scenarioId` to `"unknown"`. That can collapse malformed transcripts into one synthetic condition and distort `conditionCount` and per-condition averages.

- Medium [UNVERIFIED]: FR-004’s `1e-9` tolerance looks too strict if each condition fraction is rounded to 6 decimals before summing. Rounding per condition can easily produce aggregate drift on the order of `1e-6`, so the test invariant may be flaky unless the spec relaxes the tolerance or checks unrounded totals.

## Residual Risks

- The backfill plan is still underspecified for live data safety. The spec mentions atomic writes and cache invalidation, but it does not lock down the exact rollout and rollback mechanism.

- Any downstream consumer outside the provided snippets that still assumes integer `count` fields or still reads trial-weighted scenario matrices will need an audit. Those call sites are not visible in the supplied code.

- `conditionCount` is only described as optional for zero-downtime deployment. If the backfill and the read path are not deployed in the right order, partial rollout could produce mixed old/new semantics for a while.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: open
- note: 