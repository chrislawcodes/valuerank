# Spec: Capture Reasoning Token Costs

**Slug:** reasoning-token-costs  

---

## Problem

LLM adapters don't capture reasoning/thinking tokens. For some providers, reasoning tokens are billed separately from `completion_tokens` but never counted, causing cost tracking to underreport.

**Observed gap:** xAI showed $0.84 actual vs $0.38 tracked for one Grok-4 run — a 2.2× undercount.

---

## Key Finding: Provider Billing Differs

| Provider | Does `completion_tokens` include reasoning? | Action |
|----------|----------------------------------------------|--------|
| xAI | **No** — reasoning tokens are separate | Add `completion_tokens_details.reasoning_tokens` to output for cost |
| Google | **No** — thinking tokens are separate from `candidatesTokenCount` | Add `usageMetadata.thoughtsTokenCount` to output for cost |
| OpenAI | **Yes** — `completion_tokens` already includes reasoning | Store for visibility only; do NOT add (double-count) |
| DeepSeek | **Yes** — same as OpenAI | Store for visibility only; do NOT add |

---

## Locked Decisions

1. Add `reasoning_tokens: Optional[int]` and `reasoning_tokens_included_in_output: bool = False` to `LLMResponse`. xAI and Google set `included=False` (must add to output). OpenAI and DeepSeek set `included=True` (already counted).
2. `probe.py` adds extra reasoning tokens to `total_output_tokens` at accumulation time for providers where `included=False`. This keeps the TypeScript cost formula unchanged.
3. Reasoning tokens accumulation is NOT gated on `output_tokens > 0` — a turn with 0 visible output but non-zero reasoning tokens must still be counted.
4. `costSnapshot` stores `reasoningTokens` separately for transparency.
5. `get-transcript.ts` MCP tool is updated to surface `reasoningTokens` from costSnapshot.
6. No DB schema migration — `costSnapshot` is a JSON blob in `content` JSONB.
7. DeepSeek `generate_stream` is out of scope (probe.py uses `generate()` only). **Known gap:** streaming path will not count reasoning tokens until addressed separately.
8. `anthropic.py` and `mistral.py` are out of scope.

---

## Scope

### Files Modified

**Python — cloud/workers/**

| File | Change |
|------|--------|
| `common/llm_adapters/types.py` | Add `reasoning_tokens: Optional[int]` and `reasoning_tokens_included_in_output: bool = False` to `LLMResponse`; emit `reasoningTokens` in `to_dict()` when not None |
| `common/cost.py` | Add `reasoning_tokens: Optional[int]` to `CostSnapshot`; emit in `to_dict()` when not None; update `create_cost_snapshot` to accept `reasoning_tokens` for storage (cost calculation unchanged — `output_tokens` already includes extra tokens when needed) |
| `common/llm_adapters/providers/xai.py` | Read `completion_tokens_details.reasoning_tokens`; set `reasoning_tokens_included_in_output=False` |
| `common/llm_adapters/providers/openai.py` | Read `completion_tokens_details.reasoning_tokens`; set `reasoning_tokens_included_in_output=True` |
| `common/llm_adapters/providers/deepseek.py` | Read `completion_tokens_details.reasoning_tokens` in `generate()` only; set `reasoning_tokens_included_in_output=True` (streaming path unchanged) |
| `common/llm_adapters/providers/google.py` | Read `usageMetadata.thoughtsTokenCount`; set `reasoning_tokens_included_in_output=False`; apply to all three `LLMResponse` return sites in `generate()` |
| `probe.py` | Add `total_reasoning_tokens: int = 0` to `Transcript`; accumulate reasoning tokens unconditionally (not gated on `output_tokens`); add extra tokens to `total_output_tokens` when `included=False`; emit `totalReasoningTokens` in `to_dict()` when > 0; pass to `create_cost_snapshot` |

**TypeScript — cloud/apps/api/**

| File | Change |
|------|--------|
| `src/services/transcript/create.ts` | Add `reasoningTokens?: number` to `CostSnapshot` type; add `totalReasoningTokens?: number \| null` to `ProbeTranscript` type |
| `src/queue/handlers/probe-scenario.ts` | Pass `reasoningTokens` from transcript into the costSnapshot object (math unchanged — `totalOutputTokens` already includes extra tokens) |
| `src/mcp/tools/get-transcript.ts` | Add `reasoningTokens?: number` to the costSnapshot type and extraction logic so the field is surfaced to MCP callers |

### Files NOT Modified

- `cloud/workers/common/llm_adapters/providers/anthropic.py`
- `cloud/workers/common/llm_adapters/providers/mistral.py`
- `cloud/workers/common/llm_adapters/providers/deepseek.py` — `generate_stream` method only
- `cloud/packages/db/` — no schema changes
- GraphQL schema files
- `CLAUDE.md`, `AGENTS.md`, `MEMORY.md`, `.gitignore`

---

## Implementation Assumptions

- **DeepSeek `completion_tokens_details` field**: DeepSeek uses the OpenAI-compatible API format. The spec assumes `completion_tokens_details.reasoning_tokens` is present in DeepSeek Reasoner responses. Implementation must verify against actual API docs or a live test response. If the field is absent, the adapter will safely return `reasoning_tokens=None` (no regression).
- **xAI `completion_tokens_details` format**: Same assumption — xAI uses OpenAI-compatible format, field is assumed present for reasoning models.
- **Google `thoughtsTokenCount`**: Standard field for Gemini 2.5 thinking models. Absent for non-thinking models → returns `None` safely.

---

## Acceptance Criteria

1. xAI: turn with `completion_tokens=100` and `completion_tokens_details.reasoning_tokens=400` → `LLMResponse.output_tokens=100`, `reasoning_tokens=400`, `included=False`.
2. OpenAI: turn with `completion_tokens=500` (400 reasoning included) → `LLMResponse.output_tokens=500`, `reasoning_tokens=400`, `included=True`.
3. `Transcript.total_output_tokens` after one xAI turn (100 visible, 400 reasoning, `included=False`) = 500.
4. `Transcript.total_output_tokens` after one OpenAI turn (500 completion, 400 reasoning, `included=True`) = 500 (no double-count).
5. `CostSnapshot.to_dict()` includes `reasoningTokens` only when not None.
6. `Transcript.to_dict()` includes `totalReasoningTokens` only when > 0.
7. probe-scenario.ts: xAI run with 100 visible + 400 reasoning output tokens produces cost billed at 500 output tokens.
8. probe-scenario.ts: OpenAI run with 500 completion tokens (400 reasoning included) produces cost billed at 500 output tokens (no double-count).
9. MCP `get_transcript` returns `reasoningTokens` from costSnapshot when present.
10. `npm run build --workspace @valuerank/api` passes.
11. Existing Python cost tests pass; new tests cover criteria 1–6.

---

## Deferred / Out of Scope

- DeepSeek `generate_stream` reasoning token capture (known gap; separate ticket)
- `extractStoredTranscriptTokenUsage` recovery path (does not affect primary flow)
- Anthropic and Mistral reasoning token support
- Backfilling existing transcripts
- GraphQL schema exposure of `reasoningTokens`
- UI changes
