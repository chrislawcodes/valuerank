# Tasks: Capture Reasoning Token Costs

## Review Reconciliation

- review: reviews/plan.gemini.architecture-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted

---

## Wave 1 — Python foundation (~80 lines changed)

### Task 1.1 — Add reasoning_tokens to LLMResponse [P]

**File:** `cloud/workers/common/llm_adapters/types.py`

In the `LLMResponse` dataclass, add after `adapter_mode`:
```python
reasoning_tokens: Optional[int] = None
reasoning_tokens_included_in_output: bool = False
```

In `to_dict()`, add after the `adapter_mode` conditional block:
```python
if self.reasoning_tokens is not None:
    result["reasoningTokens"] = self.reasoning_tokens
```

Do NOT emit `reasoning_tokens_included_in_output` in `to_dict()`.

**Estimated diff:** ~8 lines

---

### Task 1.2 — Add reasoning_tokens to CostSnapshot [P]

**File:** `cloud/workers/common/cost.py`

In the `CostSnapshot` dataclass, add after `estimated_cost`:
```python
reasoning_tokens: Optional[int] = None
```

In `CostSnapshot.to_dict()`, add after `estimatedCost`:
```python
if self.reasoning_tokens is not None:
    result["reasoningTokens"] = self.reasoning_tokens
```

In `create_cost_snapshot`, add parameter (with default):
```python
def create_cost_snapshot(
    input_tokens: int,
    output_tokens: int,
    cost_input_per_million: float,
    cost_output_per_million: float,
    reasoning_tokens: Optional[int] = None,
) -> CostSnapshot:
```

In the `CostSnapshot(...)` constructor call, add: `reasoning_tokens=reasoning_tokens`

**Estimated diff:** ~10 lines

---

### Task 1.3 — xAI adapter: extract reasoning tokens

**File:** `cloud/workers/common/llm_adapters/providers/xai.py`

After `usage = data.get("usage", {})` (line ~96):
```python
completion_details = usage.get("completion_tokens_details") or {}
reasoning_tokens = completion_details.get("reasoning_tokens")
```

In the `LLMResponse(...)` constructor, add:
```python
reasoning_tokens=reasoning_tokens,
reasoning_tokens_included_in_output=False,
```

**Estimated diff:** ~6 lines

---

### Task 1.4 — OpenAI adapter: extract reasoning tokens

**File:** `cloud/workers/common/llm_adapters/providers/openai.py`

Same extraction as Task 1.3 (after `usage = data.get("usage", {})`, line ~110):
```python
completion_details = usage.get("completion_tokens_details") or {}
reasoning_tokens = completion_details.get("reasoning_tokens")
```

Add to `LLMResponse(...)`:
```python
reasoning_tokens=reasoning_tokens,
reasoning_tokens_included_in_output=True,
```

**Estimated diff:** ~6 lines

---

### Task 1.5 — DeepSeek adapter: extract reasoning tokens (generate only)

**File:** `cloud/workers/common/llm_adapters/providers/deepseek.py`

In `generate()` only (NOT `generate_stream`). After `usage = data.get("usage", {})` (line ~112):
```python
completion_details = usage.get("completion_tokens_details") or {}
reasoning_tokens = completion_details.get("reasoning_tokens")
```

Add to `LLMResponse(...)`:
```python
reasoning_tokens=reasoning_tokens,
reasoning_tokens_included_in_output=True,
```

Do NOT touch `generate_stream`.

**Estimated diff:** ~6 lines

---

### Task 1.6 — Google adapter: extract thinking tokens

**File:** `cloud/workers/common/llm_adapters/providers/google.py`

After each `usage = data.get("usageMetadata", {})` call, add:
```python
thoughts_tokens = usage.get("thoughtsTokenCount")
```

Add to ALL THREE `LLMResponse(...)` return sites in `generate()`:
```python
reasoning_tokens=thoughts_tokens,
reasoning_tokens_included_in_output=False,
```

The three sites are: prompt-blocked path (~line 144), no-candidates path (~line 165), normal path (~line 205).

**Estimated diff:** ~12 lines

---

### Task 1.7 — probe.py: accumulate and adjust reasoning tokens

**File:** `cloud/workers/probe.py`

**Step A:** Add field to `Transcript` dataclass (after `cost_snapshot`):
```python
total_reasoning_tokens: int = 0
```

**Step B:** Replace the token accumulation block (lines 327–332):

Current:
```python
if response.input_tokens:
    transcript.total_input_tokens += response.input_tokens
if response.output_tokens:
    transcript.total_output_tokens += response.output_tokens
if response.model_version and not transcript.model_version:
    transcript.model_version = response.model_version
```

Replace with:
```python
if response.input_tokens:
    transcript.total_input_tokens += response.input_tokens
if response.output_tokens:
    extra = response.reasoning_tokens if (
        response.reasoning_tokens and not response.reasoning_tokens_included_in_output
    ) else 0
    transcript.total_output_tokens += response.output_tokens + extra
if response.reasoning_tokens:
    transcript.total_reasoning_tokens += response.reasoning_tokens
if response.model_version and not transcript.model_version:
    transcript.model_version = response.model_version
```

**Step C:** Add to `Transcript.to_dict()` (after `modelVersion`):
```python
if self.total_reasoning_tokens > 0:
    result["totalReasoningTokens"] = self.total_reasoning_tokens
```

**Step D:** Update the `create_cost_snapshot` call (lines 343–348):
```python
transcript.cost_snapshot = create_cost_snapshot(
    input_tokens=transcript.total_input_tokens,
    output_tokens=transcript.total_output_tokens,
    cost_input_per_million=cost_input,
    cost_output_per_million=cost_output,
    reasoning_tokens=transcript.total_reasoning_tokens or None,
)
```

**Estimated diff:** ~15 lines

---

### Task 1.8 — Python tests

**File:** `cloud/workers/tests/test_cost_tracking.py` (and/or a new `test_reasoning_tokens.py`)

Add tests covering:
1. `LLMResponse` with `reasoning_tokens=400, included=False` — to_dict emits reasoningTokens
2. `LLMResponse` with `reasoning_tokens=None` — to_dict does NOT emit reasoningTokens
3. `CostSnapshot` with `reasoning_tokens=300` — to_dict emits reasoningTokens
4. `create_cost_snapshot` with `reasoning_tokens=300` stores it in the snapshot (does not affect estimated_cost formula — output_tokens passed in is already adjusted)
5. Probe accumulation with xAI-like response (included=False): `total_output_tokens = output_tokens + reasoning_tokens`
6. Probe accumulation with OpenAI-like response (included=True): `total_output_tokens = output_tokens` (no double-count)
7. Reasoning token accumulation not gated: response with `output_tokens=0, reasoning_tokens=100` → `total_reasoning_tokens=100`

**Estimated diff:** ~60 lines

---

## [CHECKPOINT] after Wave 1

**Verify:**
```bash
cd /Users/chrislaw/valuerank/.claude/worktrees/confident-jang/cloud/workers
python3 -m pytest tests/test_cost_tracking.py tests/test_llm_adapters.py -v
python3 -m pytest tests/ -v  # full suite
```

All tests must pass. Fix any failures before proceeding to Wave 2.

---

## Wave 2 — TypeScript API (~30 lines changed)

### Task 2.1 — Update TypeScript CostSnapshot and ProbeTranscript types

**File:** `cloud/apps/api/src/services/transcript/create.ts`

In `CostSnapshot` type (line ~50), add:
```typescript
reasoningTokens?: number;
```

In `ProbeTranscript` type (line ~38), add:
```typescript
totalReasoningTokens?: number | null;
```

**Estimated diff:** ~4 lines

---

### Task 2.2 — Pass reasoningTokens in probe-scenario.ts

**File:** `cloud/apps/api/src/queue/handlers/probe-scenario.ts`

In the costSnapshot construction block (~lines 651–665), after extracting `inputTokens` and `outputTokens`:
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

The `estimatedCost` formula is unchanged — `outputTokens` already includes any extra reasoning tokens added by probe.py.

**Estimated diff:** ~5 lines

---

### Task 2.3 — Surface reasoningTokens in get-transcript.ts MCP tool

**File:** `cloud/apps/api/src/mcp/tools/get-transcript.ts`

**Step A:** Update the local `CostSnapshot` type (~line 118):
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

**Step B:** Update `extractCostSnapshot()` return statement to include:
```typescript
...(typeof cs.reasoningTokens === 'number' && { reasoningTokens: cs.reasoningTokens }),
```

**Step C:** Update `TranscriptOutput.transcript.costSnapshot` type (~line 71) to include `reasoningTokens?: number`.

**Estimated diff:** ~8 lines

---

## [CHECKPOINT] after Wave 2

**Verify:**
```bash
cd /Users/chrislaw/valuerank/.claude/worktrees/confident-jang/cloud
npm run build --workspace @valuerank/api
npm run test --workspace @valuerank/api
npm run lint --workspace @valuerank/api
```

Zero TypeScript errors. All API tests pass.
