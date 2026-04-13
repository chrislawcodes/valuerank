# Closeout: Capture Reasoning Token Costs

## What shipped

PR: chrislawcodes/valuerank#582

LLM adapters (OpenAI, xAI, Google, DeepSeek) now extract reasoning/thinking tokens from API responses and include them in cost tracking. The probe worker accumulates these correctly per provider's billing model, and the data flows through to the TypeScript API and MCP tool.

## Files changed

**Python workers:**
- `cloud/workers/common/llm_adapters/types.py` — added `reasoning_tokens`, `reasoning_tokens_included_in_output` to `LLMResponse`
- `cloud/workers/common/llm_adapters/providers/xai.py` — extracts `completion_tokens_details.reasoning_tokens`, `included=False`
- `cloud/workers/common/llm_adapters/providers/openai.py` — extracts same field, `included=True`
- `cloud/workers/common/llm_adapters/providers/deepseek.py` — extracts same field (generate only), `included=True`
- `cloud/workers/common/llm_adapters/providers/google.py` — extracts `usageMetadata.thoughtsTokenCount`, `included=False`
- `cloud/workers/common/cost.py` — added `reasoning_tokens` to `CostSnapshot`
- `cloud/workers/probe.py` — added `Transcript.accumulate_response()`, added `total_reasoning_tokens`, adjusted `to_dict`

**TypeScript API:**
- `cloud/apps/api/src/services/transcript/create.ts` — added `totalReasoningTokens` to `ProbeTranscript`, `reasoningTokens` to `CostSnapshot`; persists `totalReasoningTokens` in content JSON
- `cloud/apps/api/src/queue/handlers/probe-scenario.ts` — passes `reasoningTokens` through to costSnapshot
- `cloud/apps/api/src/mcp/tools/get-transcript.ts` — surfaces `totalReasoningTokens` and `costSnapshot.reasoningTokens`

**Tests:**
- `cloud/workers/tests/test_cost_tracking.py` — 5 new tests in `TestReasoningTokenTracking`

## Bugs found and fixed during review

1. **Zero-output billing gate** (Codex diff review): Extra reasoning tokens were only added inside `if response.output_tokens:`, missing zero-output cases like Google blocked responses. Fixed by using `base_output = response.output_tokens or 0`.

2. **Turn 1 vs followup inconsistency** (Gemini CRITICAL diff review): Codex initially fixed only the followup turns loop. Turn 1 (initial prompt) still had the old gated logic. Fixed manually.

3. **Duplicated accumulation logic** (Gemini HIGH diff review): Both blocks shared identical 7-line accumulation logic. Fixed by extracting `Transcript.accumulate_response()`.

4. **Two-step serialization** (Gemini LOW): `Transcript.to_dict()` used a clunky set-then-delete pattern for `totalReasoningTokens`. Fixed to single conditional.

5. **Type mismatch** (Gemini MEDIUM): `ProbeTranscript.totalReasoningTokens?: number | null` — Python never emits null, only positive or absent. Fixed to `totalReasoningTokens?: number`.

6. **Missing persistence** (Codex MEDIUM): `totalReasoningTokens` was not stored in content JSON, so it was inaccessible without a costSnapshot. Fixed by adding it to content in `createTranscript`.

7. **Unsafe default** (Gemini HIGH): `reasoning_tokens_included_in_output` defaulted to `False`. If a future adapter forgets to set the flag, this would double-bill. Changed default to `True` (under-tracks rather than over-bills).

## Residual risks (accepted)

- Provider API field stability: relies on `completion_tokens_details.reasoning_tokens` (OpenAI/xAI/DeepSeek) and `usageMetadata.thoughtsTokenCount` (Google) — these could change without notice
- `totalOutputTokens` semantic change: now "billable output tokens" not "raw completion tokens" — consumers that sum `turns[].outputTokens` won't see the adjustment, but the transcript aggregate is correct
- Per-turn vs total inconsistency: per-turn `outputTokens` is the raw provider value; `totalOutputTokens` is billing-adjusted — documented design choice
- Provider billing assumptions not verified against live API docs; based on empirical xAI cost discrepancy and provider documentation review

## Experiment measurement

This was a direct implementation (no A/B experiment). The diff checkpoint reviews showed:
- Multiple rounds of review found and fixed real bugs (commits `90020288`, `c82f1150`, `c8194965`, `4caeb0d9`, `b7d8463a`)
- Reviews changed code: YES (7 distinct fixes across Wave 1 and 2 — listed above)
