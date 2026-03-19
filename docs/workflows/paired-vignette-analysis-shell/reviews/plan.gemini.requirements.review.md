# Gemini Review

## Scope

Reviewed `docs/workflows/paired-vignette-analysis-shell/spec.md` and `docs/workflows/paired-vignette-analysis-shell/plan.md` with a requirements and architecture lens.

## Findings

1. High: pooled mode needed an explicit data-definition contract for summary metrics. The initial wording said paired mode should "pool" evidence, but it did not define whether summaries are combined counts, weighted averages, or some other shared adapter output. The spec and plan now need to state the pooled adapter is the single source of truth for charts, summaries, and drilldown.
2. High: the mode needs URL-backed state, not just local page state. The initial plan left URL vs page state open, which would make the shared analysis shell hard to link to and reload reliably.
3. Medium: the route and entry-point story was still too open. The shell should have a canonical shareable route for single and paired mode, while legacy validation entry points remain clearly labeled as secondary.
4. Medium: provenance labeling for paired drilldown needs visual rules, not just a promise to show badges. The plan should explicitly say which charts remain pooled and which need hover or drilldown detail for version-specific data.

## Residual Risks

- Existing chart components may still assume a flat single-vignette scope and need a shared adapter.
- Paired mode may feel cramped if version-specific details are forced into the same chart without a dedicated drilldown path.
- Data fetching for paired mode will likely need parallel requests or a cached combined view to avoid making the toggle feel slower than single mode.
