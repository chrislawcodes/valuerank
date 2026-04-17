# Tasks: Summarizer LLM Fallback Removal + Unresolvable Transcript Status Warning

## Wave 1 — Remove LLM fallback from summarizer (~30 lines changed)

**Files:** `cloud/workers/summarize.py`, `cloud/workers/tests/test_summarize.py`

### Task 1.1 — Remove import
In `cloud/workers/summarize.py` line 27, remove `classify_decision_with_llm` from the import.
Do NOT remove other imports or modify `summarize_llm.py`.

### Task 1.2 — Replace text-label LLM fallback (lines 125-137)
In `extract_decision_result`, replace the `else:` branch at line 125 that calls
`classify_decision_with_llm(transcript_content, scale_labels)` with:
```python
parse_class = "ambiguous"
parse_path = "text_label_ambiguous"
```

### Task 1.3 — Replace numeric LLM fallback (lines 138-147)
Replace the body of `elif decision_code == "other":` that calls
`classify_decision_with_llm(transcript_content)` with:
```python
parse_class = "ambiguous"
parse_path = "numeric_ambiguous"
```

### Task 1.4 — Update tests in `cloud/workers/tests/test_summarize.py`
1. Remove all `@patch("summarize.classify_decision_with_llm")` decorators and their
   `mock_classify` arguments (lines 583, 608, 633, 658, 1140, 1159, 1182).
2. Lines 517, 531, 544, 557, 571 import `classify_decision_with_llm` from `summarize` —
   change to import from `summarize_llm` instead.
3. `test_uses_llm_fallback_when_deterministic_is_other` (~line 635): assert
   `decisionSource == "deterministic"`, `parseClass == "ambiguous"`,
   `parsePath == "numeric_ambiguous"`. Remove `mock_classify.assert_called_once()`.
4. `test_uses_llm_for_resolved_text_label_scale` (~line 884): assert
   `decisionSource == "deterministic"`, `parseClass == "ambiguous"`,
   `parsePath == "text_label_ambiguous"`.
5. `test_uses_llm_for_unresolved_text_label_scale` (~line 890): same update.
6. Add new test: numeric ambiguous path — `extract_decision_code` returns `"other"` with
   no scale labels → assert `parseClass == "ambiguous"`, `parsePath == "numeric_ambiguous"`.
7. Add new test: text-label ambiguous path — scale labels present but all matching fails →
   assert `parseClass == "ambiguous"`, `parsePath == "text_label_ambiguous"`.

### Task 1.5 — Verify Wave 1
```bash
cd cloud/workers && python3 -m pytest tests/test_summarize.py -v
```
Exit code must be 0 (all tests pass). Then confirm no LLM references remain:
```bash
grep -n "classify_decision_with_llm" cloud/workers/summarize.py
grep -n "decisionSource.*llm\|fallback_resolved" cloud/workers/tests/test_summarize.py
```
Both grep commands should return no matches.

[CHECKPOINT] — commit Wave 1 changes

---

## Wave 2 — Shared service + GraphQL field (~100 lines changed)

**Files:** `cloud/apps/api/src/services/unresolvable-count.ts` (new), `cloud/apps/api/src/graphql/types/run.ts`

### Task 2.1 — Create shared unresolvable count service
Create `cloud/apps/api/src/services/unresolvable-count.ts` with a single exported function:

```typescript
export interface UnresolvableByModel { modelId: string; count: number; }
export interface UnresolvableCount { total: number; byModel: UnresolvableByModel[]; }

export async function getUnresolvableCount(runId: string): Promise<UnresolvableCount> {
  const rows = await db.$queryRaw<Array<{ model_id: string; unresolvable: bigint }>>`
    SELECT model_id,
      COUNT(*) FILTER (
        WHERE summarized_at IS NOT NULL
        AND decision_code_source IS DISTINCT FROM 'manual'
        AND (
          decision_code = 'other'
          OR (decision_code IS NULL
            AND decision_metadata->'summaryCache'->'summary'->'canonicalDecision'->>'decisionState' = 'unknown')
          OR decision_metadata->>'parseClass' = 'ambiguous'
        )
      ) as unresolvable
    FROM transcripts WHERE run_id = ${runId} GROUP BY model_id
  `;
  const byModel = rows
    .map((r) => ({ modelId: r.model_id, count: Number(r.unresolvable) }))
    .filter((r) => r.count > 0);
  return { total: byModel.reduce((s, r) => s + r.count, 0), byModel };
}
```

### Task 2.2 — Add GraphQL types and field
In `cloud/apps/api/src/graphql/types/run.ts`:

1. Add two Pothos object types (near RunProgress):
```typescript
const UnresolvableByModel = builder.simpleObject('UnresolvableByModel', {
  fields: (t) => ({ modelId: t.string(), count: t.int() }),
});
const UnresolvableCount = builder.simpleObject('UnresolvableCount', {
  fields: (t) => ({
    total: t.int(),
    byModel: t.field({ type: [UnresolvableByModel] }),
  }),
});
```

2. Add field to the Run type after `summarizeProgress`:
```typescript
unresolvableTranscriptCount: t.field({
  type: UnresolvableCount,
  nullable: true,
  description: 'Count of summarized transcripts that could not be scored',
  resolve: async (run) => {
    if (run.transcriptCount == null || run.transcriptCount === 0) return null;
    return getUnresolvableCount(run.id);
  },
}),
```

Import `getUnresolvableCount` at top of `run.ts`.

### Task 2.3 — Verify Wave 2
```bash
cd cloud && npm run lint --workspace @valuerank/api && npm run build --workspace @valuerank/api && npm run test --workspace @valuerank/api
```

[CHECKPOINT] — commit Wave 2 changes

---

## Wave 3 — Warning banner in RunDetail (~70 lines changed)

**Files:** `cloud/apps/web/src/api/operations/runs.ts`, `cloud/apps/web/src/pages/RunDetail/RunDetail.tsx`

### Task 3.1 — Add field to GraphQL operation
In `cloud/apps/web/src/api/operations/runs.ts`, find the run detail query/fragment.
Add to the selection set:
```graphql
unresolvableTranscriptCount {
  total
  byModel { modelId count }
}
```
Update the TypeScript type to include:
```typescript
unresolvableTranscriptCount?: { total: number; byModel: { modelId: string; count: number }[] } | null;
```

### Task 3.2 — Add banner function in RunDetail.tsx
Add `getUnresolvableBanner` following the `getStalledModelsBanner` pattern (amber border/bg):
```typescript
function getUnresolvableBanner(
  data: { total: number; byModel: { modelId: string; count: number }[] } | null | undefined
): React.ReactNode {
  if (data == null || data.total === 0) return null;
  return (
    <div className="border border-amber-400 bg-amber-50 rounded-lg p-4 mb-4">
      <p className="font-medium text-amber-800">
        {data.total} transcript{data.total !== 1 ? 's' : ''} could not be scored —
        manual adjudication required before analysis results are reliable.
      </p>
      {data.byModel.length > 0 && (
        <ul className="mt-2 text-sm text-amber-700 list-disc list-inside">
          {data.byModel.map((m) => (
            <li key={m.modelId}>{m.modelId}: {m.count}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

### Task 3.3 — Render banner
In `RunDetail.tsx`, render `getUnresolvableBanner(run.unresolvableTranscriptCount)` in the
banners area, after any existing banners and before the main content.

### Task 3.4 — Add tests
Test the banner via the rendered `RunDetail` component (React Testing Library + mocked
GraphQL response), not by testing `getUnresolvableBanner` directly. The function should NOT
be exported; instead, test it through the component:
- Render `RunDetail` with mocked run data where `unresolvableTranscriptCount.total === 3`
  and `byModel: [{ modelId: 'openai:gpt-4o', count: 3 }]` → assert banner shows
  "3 transcripts could not be scored" and per-model breakdown
- Render with `unresolvableTranscriptCount.total === 0` → assert no warning text present
- Render with `unresolvableTranscriptCount === null` → assert no warning text present

### Task 3.5 — Verify Wave 3
```bash
cd cloud && npm run lint --workspace @valuerank/web && npm run build --workspace @valuerank/web && npm run test --workspace @valuerank/web
```

[CHECKPOINT] — commit Wave 3 changes

---

## Wave 4 (P2) — MCP run summary (~40 lines changed)

**Files:** `cloud/apps/api/src/mcp/tools/get-run-summary.ts`, `cloud/apps/api/src/services/mcp/formatters.ts`

### Task 4.1 — Add unresolvable to RunSummary type
In `cloud/apps/api/src/services/mcp/formatters.ts`, add to `RunSummary`:
```typescript
unresolvable: { total: number; byModel: { modelId: string; count: number }[] };
```

### Task 4.2 — Populate unresolvable in get-run-summary
In `cloud/apps/api/src/mcp/tools/get-run-summary.ts`:
1. Import `getUnresolvableCount`
2. Call it with the run ID
3. Add `unresolvable` to the response — truncate `byModel` to top 10 by count if more
   than 10 models to stay within the 5KB token budget

### Task 4.3 — Verify Wave 4
```bash
cd cloud && npm run lint --workspace @valuerank/api && npm run build --workspace @valuerank/api && npm run test --workspace @valuerank/api
```

[CHECKPOINT] — commit Wave 4 changes

---

## Parallel analysis
No parallel opportunities. Wave 3 depends on Wave 2 (GraphQL field must exist before
adding to the web operation). Waves are sequential.
