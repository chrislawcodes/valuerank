# Plan: Summarizer LLM Fallback Removal + Unresolvable Transcript Status Warning

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: HIGH finding valid: updated SC-004 to acknowledge LLM fallback tests need updating. MEDIUM deferred: classify_decision_with_llm cleanup is out of scope; known risk noted. LOW rejected: decisionState is verified in DB and TS layer; the spec assumption is correct.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: HIGH TEST-2 fixed: extracted shared service. HIGH TEST-1 known risk noted. MEDIUM TEST-3 fixed: explicit test requirements added. LOW TEST-4 accepted.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: Runner timed out. Orchestrator reviewed: no blocking findings. summaryCache branch verified against production data.
- review: reviews/plan.codex.architecture-adversarial.review.md | status: accepted | note: HIGH (hard failures) deferred per spec scope. MEDIUM (formatters.ts) fixed in plan. MEDIUM (consistency) rejected — different purposes.

## Architecture Overview

Two independent changes with no shared ownership at the file level. They can be
implemented sequentially (Python → TS/TSX) but the slices don't conflict.

### Change A — Summarizer (Python)

`cloud/workers/summarize.py`, function `extract_decision_result`, lines 125–147.

Two call sites call `classify_decision_with_llm`:
1. **Text-label fallback** (line 126): when all text-label matching strategies exhaust
   without a match. Replace with `parse_class = "ambiguous"`, `parse_path = "text_label_ambiguous"`.
2. **Numeric fallback** (line 139): when `decision_code == "other"` with no scale labels.
   Replace with `parse_class = "ambiguous"`, `parse_path = "numeric_ambiguous"`.

Remove the `classify_decision_with_llm` import from `summarize.py` (it still lives in
`summarize_llm.py`). Do NOT remove the function from `summarize_llm.py`.

Update existing tests that assert `decisionSource = "llm"` or `parseClass = "fallback_resolved"`.
These tests should now assert `parseClass = "ambiguous"` for those inputs.

Also remove any `@mock.patch('summarize.classify_decision_with_llm')` patches — after the import
is removed from `summarize.py`, the patch target will no longer exist and those mocks will fail.

### Change B — Shared unresolvable count service (TypeScript/API)

`cloud/apps/api/src/services/unresolvable-count.ts` (new file)

Extract the unresolvable count DB query into a standalone service function:
```typescript
getUnresolvableCount(runId: string): Promise<{ total: number; byModel: { modelId: string; count: number }[] }>
```

**Unresolvable definition** (matches spec Assumption #2):
```sql
summarized_at IS NOT NULL
AND decision_code_source IS DISTINCT FROM 'manual'
AND (
  decision_code = 'other'
  OR (
    decision_code IS NULL
    AND decision_metadata->'summaryCache'->'summary'->'canonicalDecision'->>'decisionState' = 'unknown'
  )
  OR decision_metadata->>'parseClass' = 'ambiguous'
)
```

Notes:
- `decision_code_source IS DISTINCT FROM 'manual'` excludes manually adjudicated transcripts.
  Manual override spreads existing metadata (preserving original `parseClass`) while setting
  `decisionCodeSource = 'manual'` on the column, so without this filter, manually resolved
  ambiguous rows would still be counted.
- The JSON path `decision_metadata->'summaryCache'->'summary'->'canonicalDecision'->>'decisionState'`
  is required to cover existing new-format transcripts (202k rows where `decision_code` column
  is NULL). This is a known risk of the untyped JSONB pattern already established in this codebase.

### Change C — GraphQL Run type (TypeScript/API)

`cloud/apps/api/src/graphql/types/run.ts`

Add a new field `unresolvableTranscriptCount` to the `Run` GraphQL type using `getUnresolvableCount`.

New GraphQL types needed: `UnresolvableCount { total: Int!, byModel: [UnresolvableByModel!]! }`
where `UnresolvableByModel { modelId: String!, count: Int! }`.

The field is `nullable: true` and returns `null` when the run has no transcripts. Returns
`{ total: 0, byModel: [] }` when all transcripts are resolved.

Pattern: follow the existing `summarizeProgress` field (line 295) for the resolver shape.

### Change D — RunDetail warning banner (TypeScript/React)

`cloud/apps/web/src/pages/RunDetail/RunDetail.tsx` and supporting files.

1. Add `unresolvableTranscriptCount` to the runs GraphQL operation
   (`cloud/apps/web/src/api/operations/runs.ts` or equivalent).
2. Add a new banner component (similar to the existing `getStalledModelsBanner` pattern)
   that renders an amber/yellow warning when `total > 0`.
3. Render the banner in `RunDetail.tsx` between existing banners and the run content.

Banner content: "N transcripts could not be scored — manual adjudication required." with a
per-model breakdown list below.

New tests required: add a component test that mocks a GraphQL response with non-zero
`unresolvableTranscriptCount` and asserts the banner renders with the correct count and
per-model breakdown.

### Change E — MCP get_run_summary (P2, TypeScript/API)

`cloud/apps/api/src/mcp/tools/get-run-summary.ts`
`cloud/apps/api/src/services/mcp/formatters.ts`

Add an `unresolvable` key to the MCP response object by calling `getUnresolvableCount`.
The `RunSummary` type in `formatters.ts` also needs an `unresolvable` field added.

---

## Wave Breakdown

| Wave | Scope | Files | Est. Diff |
|---|---|---|---|
| 1 | Remove LLM fallback; update tests | `summarize.py`, `test_summarize.py` | ~30 lines |
| 2 | Add shared service + GraphQL field | `unresolvable-count.ts` (new), `run.ts` | ~100 lines |
| 3 | Add warning banner to RunDetail | `runs.ts` (operation), `RunDetail.tsx` | ~70 lines |
| 4 (P2) | Add to MCP run summary | `get-run-summary.ts`, `formatters.ts` | ~40 lines |

---

## Risks

- **Test churn (Wave 1):** Any test that mocked `classify_decision_with_llm` or asserted
  `decisionSource = "llm"` will fail until updated. This is expected per SC-004.
- **Raw SQL in GraphQL (Wave 2):** The `summarizeProgress` field already sets the pattern for
  raw SQL in GraphQL resolvers. The new field follows the same pattern — no new pattern introduced.
- **Query performance (Wave 2):** The `unresolvableTranscriptCount` query runs on every run
  detail page load. With the `transcripts(run_id)` index already in place, this is a single
  indexed scan per run. Acceptable.
- **Stale UI count (Wave 3):** The run detail page polls. The count will update on the next
  poll cycle after new transcripts are summarized. No special refresh logic needed.

---

## Non-Changes

- `cloud/workers/summarize_llm.py` — untouched
- DB schema — no migrations needed
- Existing transcripts with `decisionCodeSource = "llm"` — not affected

---

## Validation Plan

Wave 1:
```bash
cd cloud && npm run test --workspace @valuerank/api
python3 -m pytest cloud/workers/tests/test_summarize.py -v
```

Wave 2:
```bash
cd cloud && npm run lint --workspace @valuerank/api
npm run build --workspace @valuerank/api
npm run test --workspace @valuerank/api
```

Wave 3:
```bash
cd cloud && npm run lint --workspace @valuerank/web
npm run build --workspace @valuerank/web
npm run test --workspace @valuerank/web
```
