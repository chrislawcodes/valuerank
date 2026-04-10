# Plan: Capture Reasoning Token Costs

## Review Reconciliation

- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/spec.gemini.edge-cases-adversarial.review.md | status: accepted | note: HIGH (Anthropic tool_use): rejected — anthropic.py explicitly out of scope; pre-existing gap not introduced here. MEDIUM (DeepSeek streaming): deferred — already documented as known gap in spec. LOW findings: rejected — unrelated/already-addressed.
- review: reviews/plan.gemini.architecture-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/diff.gemini.regression-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/diff.gemini.quality-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/diff.codex.correctness-adversarial.review.md | status: accepted | note: All three findings are UNVERIFIED and reflect documented design decisions: totalOutputTokens is intentionally billable-output not raw-output; True default is the intentional safe failure mode; estimated_cost correctly ignores reasoningTokens because output_tokens is pre-adjusted by accumulate_response.

## Architecture Decisions

### Decision 1: Adapter-level flag, probe-level adjustment

Adapters report raw API data via two fields on `LLMResponse`:
- `reasoning_tokens`: what the API returned
- `reasoning_tokens_included_in_output`: whether those tokens are already in `output_tokens`

`probe.py` owns the adjustment: when `included=False`, it adds `reasoning_tokens` to `total_output_tokens` at accumulation time.

**Why not adjust in the adapter?** Adapters should faithfully report what the API says. The "billed output" interpretation is a product concern that belongs one level up. Keeping adapters clean also makes unit testing simpler.

**Why not adjust in cost.py?** `create_cost_snapshot` receives the already-adjusted `total_output_tokens` from probe.py. This keeps cost.py unchanged in its calculation logic and avoids passing provider-context flags into a utility module. The `reasoning_tokens` arg to `create_cost_snapshot` is storage-only.

**Implication for TypeScript**: `probe-scenario.ts` recalculates cost from `totalOutputTokens`. Since probe.py has already added extra tokens to `totalOutputTokens` where needed, the TypeScript formula requires no change. It just needs to pass `reasoningTokens` through to the costSnapshot object.

### Decision 2: Reasoning tokens accumulation not gated on output_tokens

Accumulate reasoning tokens unconditionally in the turn loop. A response with 0 visible output but non-zero reasoning tokens (e.g., a filtered response from a thinking model) must still be counted.

### Decision 3: get-transcript.ts type + extraction update

The MCP costSnapshot type and `extractCostSnapshot()` function explicitly enumerate fields. Adding `reasoningTokens` requires updating both the type definition (line ~118) and the return statement (line ~138). This is a 4-line change.

---

## File-by-File Changes

### `cloud/workers/common/llm_adapters/types.py`

Add to `LLMResponse` dataclass (after `adapter_mode`):
```python
reasoning_tokens: Optional[int] = None
reasoning_tokens_included_in_output: bool = False
```

Add to `to_dict()` (with other optional fields):
```python
if self.reasoning_tokens is not None:
    result["reasoningTokens"] = self.reasoning_tokens
```

Do NOT emit `reasoning_tokens_included_in_output` in `to_dict()` — it's a processing hint, not storage data.

### `cloud/workers/common/cost.py`

Add to `CostSnapshot` dataclass (after `estimated_cost`):
```python
reasoning_tokens: Optional[int] = None
```

Add to `CostSnapshot.to_dict()`:
```python
if self.reasoning_tokens is not None:
    result["reasoningTokens"] = self.reasoning_tokens
```

Update `create_cost_snapshot` signature (add optional param, default None):
```python
def create_cost_snapshot(
    input_tokens: int,
    output_tokens: int,
    cost_input_per_million: float,
    cost_output_per_million: float,
    reasoning_tokens: Optional[int] = None,
) -> CostSnapshot:
```

Pass `reasoning_tokens=reasoning_tokens` in the `CostSnapshot(...)` constructor call. Calculation logic unchanged.

### `cloud/workers/common/llm_adapters/providers/xai.py`

After `usage = data.get("usage", {})`:
```python
completion_details = usage.get("completion_tokens_details") or {}
reasoning_tokens = completion_details.get("reasoning_tokens")
```

Add to `LLMResponse(...)` constructor: `reasoning_tokens=reasoning_tokens, reasoning_tokens_included_in_output=False`

### `cloud/workers/common/llm_adapters/providers/openai.py`

Same extraction as xAI. Add to `LLMResponse(...)`: `reasoning_tokens=reasoning_tokens, reasoning_tokens_included_in_output=True`

### `cloud/workers/common/llm_adapters/providers/deepseek.py` (generate only)

Same extraction in `generate()`. Add to `LLMResponse(...)`: `reasoning_tokens=reasoning_tokens, reasoning_tokens_included_in_output=True`

Do NOT touch `generate_stream`.

### `cloud/workers/common/llm_adapters/providers/google.py`

After `usage = data.get("usageMetadata", {})`:
```python
thoughts_tokens = usage.get("thoughtsTokenCount")
```

Add to all three `LLMResponse(...)` calls in `generate()`:
`reasoning_tokens=thoughts_tokens, reasoning_tokens_included_in_output=False`

(For prompt-blocked and no-candidates paths, `thoughts_tokens` may still be present in usageMetadata — pass it through as-is.)

### `cloud/workers/probe.py`

Add field to `Transcript` dataclass:
```python
total_reasoning_tokens: int = 0
```

Replace the existing token accumulation block (around line 327):
```python
if response.output_tokens:
    transcript.total_output_tokens += response.output_tokens

if response.input_tokens:
    transcript.total_input_tokens += response.input_tokens
```

With:
```python
if response.output_tokens:
    extra = response.reasoning_tokens if (
        response.reasoning_tokens and not response.reasoning_tokens_included_in_output
    ) else 0
    transcript.total_output_tokens += response.output_tokens + extra

if response.input_tokens:
    transcript.total_input_tokens += response.input_tokens

if response.reasoning_tokens:
    transcript.total_reasoning_tokens += response.reasoning_tokens
```

Note: reasoning tokens accumulate unconditionally (not gated on output_tokens).

Add to `Transcript.to_dict()` (after existing fields):
```python
if self.total_reasoning_tokens > 0:
    result["totalReasoningTokens"] = self.total_reasoning_tokens
```

Update `create_cost_snapshot` call:
```python
transcript.cost_snapshot = create_cost_snapshot(
    input_tokens=transcript.total_input_tokens,
    output_tokens=transcript.total_output_tokens,
    cost_input_per_million=cost_input,
    cost_output_per_million=cost_output,
    reasoning_tokens=transcript.total_reasoning_tokens or None,
)
```

### `cloud/apps/api/src/services/transcript/create.ts`

Add `reasoningTokens?: number` to `CostSnapshot` type:
```typescript
export type CostSnapshot = {
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  costInputPerMillion: number;
  costOutputPerMillion: number;
  reasoningTokens?: number;
};
```

Add `totalReasoningTokens?: number | null` to `ProbeTranscript` type.

### `cloud/apps/api/src/queue/handlers/probe-scenario.ts`

In the costSnapshot construction block (~line 659), add reasoning tokens:
```typescript
const reasoningTokens = output.transcript.totalReasoningTokens;
costSnapshot = {
  inputTokens,
  outputTokens,
  estimatedCost,
  costInputPerMillion,
  costOutputPerMillion,
  ...(reasoningTokens != null && reasoningTokens > 0 && { reasoningTokens }),
};
```

The cost formula (`estimatedCost` calculation) is unchanged — `outputTokens` already includes any extra reasoning tokens.

### `cloud/apps/api/src/mcp/tools/get-transcript.ts`

Update local `CostSnapshot` type (line ~118):
```typescript
type CostSnapshot = {
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  costInputPerMillion: number;
  costOutputPerMillion: number;
  reasoningTokens?: number;
};
```

Update `extractCostSnapshot()` return statement to include:
```typescript
...(typeof cs.reasoningTokens === 'number' && { reasoningTokens: cs.reasoningTokens }),
```

Update the output type in `TranscriptOutput.transcript.costSnapshot` (~line 71) to include `reasoningTokens?: number`.

---

## Risks

**High**: `reasoning_tokens_included_in_output` flag set wrong on any adapter → silent double-count (OpenAI/DeepSeek) or continued undercount (xAI/Google). Mitigation: acceptance criteria tests both directions explicitly.

**Low**: DeepSeek `completion_tokens_details.reasoning_tokens` field may not exist in actual API responses. Safe failure: field returns `None`, no regression.

**Low**: `probe.py` accumulation change touching the main turn loop. Mitigation: existing tests cover the token accumulation path; add new tests for reasoning token cases.

---

## Wave Breakdown

**Wave 1 — Python foundation** (~80 lines changed):
- `types.py`: Add reasoning_tokens fields to LLMResponse
- `cost.py`: Add reasoning_tokens to CostSnapshot, create_cost_snapshot
- Four provider adapters: xai, openai, deepseek (generate only), google
- `probe.py`: Add total_reasoning_tokens, fix accumulation logic, pass to create_cost_snapshot

[CHECKPOINT]

**Wave 2 — TypeScript API** (~30 lines changed):
- `create.ts`: Type updates
- `probe-scenario.ts`: Pass reasoningTokens in costSnapshot
- `get-transcript.ts`: Type + extraction update

[CHECKPOINT]

---

## Verification

After Wave 1:
- `python3 -m pytest cloud/workers/tests/test_cost_tracking.py -v`
- `python3 -m pytest cloud/workers/tests/test_llm_adapters.py -v`
- New test: `test_reasoning_tokens_xai` (included=False, adds to output)
- New test: `test_reasoning_tokens_openai` (included=True, no double-count)

After Wave 2:
- `npm run build --workspace @valuerank/api` — zero TypeScript errors
- `npm run test --workspace @valuerank/api`
