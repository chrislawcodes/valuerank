# Spec: Summarizer LLM Fallback Removal + Unresolvable Transcript Status Warning

**Slug:** summarizer-fallback-removal
**Branch:** claude/practical-noyce-1db12d
**Status:** draft

---

## Background

The transcript summarizer (`cloud/workers/summarize.py`) automatically calls an LLM when
deterministic parsing fails. This incurs cost on every ambiguous transcript without user
awareness or control. Separately, ~2,076 active transcripts across the Software Approach
Choice, Job Choice, and Neighborhood Choice domains have been summarized but have no
resolvable decision score — this silent failure is invisible in the UI.

This feature removes the automatic LLM cost and surfaces the silent failures.

---

## Assumptions

1. LLM fallback removal: both `classify_decision_with_llm` call sites in
   `extract_decision_result` are removed and replaced with immediate `parse_class = "ambiguous"`
   classification. The function itself stays in `summarize_llm.py` for future manual use.
2. **Unresolvable** means: `summarized_at IS NOT NULL` AND one of:
   - `decision_code = 'other'`, OR
   - `decision_code IS NULL` AND `decisionState = 'unknown'` in the cached decision, OR
   - `parseClass = 'ambiguous'`
   Neutral transcripts (`decisionState = 'neutral'`) are **not** unresolvable — they score as 0.
3. The warning appears on the run detail page in the web UI, with total count and
   per-model breakdown.

---

## Non-Goals

- Implement a manual LLM fallback trigger in the UI (separate work item)
- Backfill or re-resolve existing ambiguous transcripts

---

## User Stories

### US-1 — Summarizer never auto-calls LLM (P1)

**As** a system operator,
**I need** the summarizer to classify ambiguous transcripts as `ambiguous` without calling an LLM,
**so that** LLM costs are only incurred when I explicitly choose to pay them.

**Acceptance scenarios:**

1. **Given** a transcript whose model response contains no parseable decision code or matching
   scale label, **when** the summarizer runs, **then** it produces `parseClass = "ambiguous"` and
   no LLM call is made.
2. **Given** a transcript where `decision_code = "other"` after numeric extraction and no scale
   labels are present, **when** the summarizer runs, **then** it produces `parseClass = "ambiguous"` and
   no LLM call is made.
3. **Given** a transcript that previously would have triggered LLM fallback, **when** the
   summarizer runs, **then** `decisionCodeSource` is `"deterministic"` (not `"llm"`).
4. **Given** the `classify_decision_with_llm` function, **when** reviewing the codebase,
   **then** it still exists in `summarize_llm.py` and can be called manually.

**Verification:** All existing `summarize.py` tests pass. No test in the suite calls
`classify_decision_with_llm` via the normal summarize path.

---

### US-2 — Run detail page shows unresolvable transcript warning (P1)

**As** a researcher reviewing a completed run,
**I need** the run detail page to prominently show a count of transcripts the summarizer
could not resolve,
**so that** I know to investigate or manually adjudicate them before trusting the analysis.

**Acceptance scenarios:**

1. **Given** a run with 12 unresolvable transcripts (e.g. 8 from `deepseek-reasoner`,
   4 from `gpt-5.1`), **when** I open the run detail page, **then** I see a warning with
   the total count (12) and a per-model breakdown.
2. **Given** a run where all transcripts resolved successfully, **when** I open the run
   detail page, **then** no unresolvable warning is shown.
3. **Given** a run that is still running (not all transcripts summarized), **when** I open
   the run detail page, **then** the warning reflects only the already-summarized transcripts
   that are unresolvable (not unsummarized ones).
4. **Given** the warning is visible, **when** I read it, **then** it tells me these
   transcripts need manual attention (not just a raw count).

---

### US-3 — MCP / API exposes unresolvable count for tooling (P2)

**As** an operator using the MCP tools or API,
**I need** the run summary to include the unresolvable transcript count,
**so that** I can surface this in scripts or dashboards without parsing the UI.

**Acceptance scenarios:**

1. **Given** a run with unresolvable transcripts, **when** I call `get_run_summary` or
   equivalent, **then** the response includes an `unresolvableCount` field (or equivalent)
   with the total and per-model breakdown.
2. **Given** a run with zero unresolvable transcripts, **when** I call the API,
   **then** `unresolvableCount` is 0 (not null or absent).

---

## Functional Requirements

- **FR-001:** `extract_decision_result` in `summarize.py` MUST NOT call `classify_decision_with_llm` under any code path triggered by the normal summarize job. (Supports US-1)
- **FR-002:** When text-label matching exhausts all strategies without a match, `extract_decision_result` MUST set `parse_class = "ambiguous"` and `parse_path = "text_label_ambiguous"`. (Supports US-1)
- **FR-003:** When `decision_code = "other"` after numeric extraction with no scale labels present, `extract_decision_result` MUST set `parse_class = "ambiguous"` and `parse_path = "numeric_ambiguous"`. (Supports US-1)
- **FR-004:** `classify_decision_with_llm` in `summarize_llm.py` MUST remain present and callable. (Supports US-1)
- **FR-005:** The run detail page MUST display a warning section when a run has one or more unresolvable transcripts. (Supports US-2)
- **FR-006:** The warning MUST include the total unresolvable count and a per-model breakdown. (Supports US-2)
- **FR-007:** The warning MUST include human-readable guidance (e.g. "These transcripts need manual attention before analysis results are reliable"). (Supports US-2)
- **FR-008:** Transcripts with `decisionState = "neutral"` MUST NOT be counted as unresolvable. (Supports US-2)
- **FR-009:** The API / MCP run summary SHOULD include an unresolvable count field. (Supports US-3)

---

## Success Criteria

- **SC-001:** Zero LLM calls are made by the summarize worker during a full run of 200 transcripts that all have ambiguous responses.
- **SC-002:** The run detail page renders the warning within normal page load time when a run has unresolvable transcripts.
- **SC-003:** A run with zero unresolvable transcripts shows no warning banner on the run detail page.
- **SC-004:** The summarize test suite passes after the fallback is removed. Any tests that previously verified LLM fallback behavior (decisionCodeSource = "llm", parseClass = "fallback_resolved") are updated to verify the new ambiguous classification instead.

---

## Edge Cases

- **Partial run:** Some transcripts still pending summarization. Warning shows only the already-summarized unresolvable ones; count updates as more transcripts are processed.
- **All models unresolvable:** Warning should still list per-model breakdown (not collapse to "all models").
- **Run has no scenarios / zero transcripts:** No warning shown.
- **Fallback was previously used:** Existing transcripts with `decisionCodeSource = "llm"` and `parseClass = "fallback_resolved"` are not affected by this change. The removal only affects future runs.

---

## Scope

**In scope:**
- `cloud/workers/summarize.py` — remove two `classify_decision_with_llm` call sites
- `cloud/apps/api/src/` — add `unresolvable` count to run data (GraphQL or MCP)
- `cloud/apps/web/src/` — add warning component to run detail page

**Out of scope:**
- `cloud/workers/summarize_llm.py` — no changes (function stays intact)
- Any data backfill of existing ambiguous transcripts
- Manual adjudication UI
