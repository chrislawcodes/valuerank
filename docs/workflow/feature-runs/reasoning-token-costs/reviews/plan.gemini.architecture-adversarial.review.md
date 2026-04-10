---
reviewer: "gemini"
lens: "architecture-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/reasoning-token-costs/plan.md"
artifact_sha256: "712f25320f8547987a3e4325bb63f1a711beacc6b4067a874353ea7e6d8b595c"
repo_root: "."
git_head_sha: "489849cbced674725c5f8ada21de706c3bc0f223"
git_base_ref: "origin/main"
git_base_sha: "489849cbced674725c5f8ada21de706c3bc0f223"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/reasoning-token-costs/reviews/plan.gemini.architecture-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan architecture-adversarial

## Findings

### 1. (HIGH) Flawed Accumulation Logic in `probe.py`
The plan's proposed code change for `probe.py` contains a logic flaw that contradicts its own "Decision 2" and would lead to incorrect cost calculations in certain scenarios.

-   **Finding**: The plan suggests gating the token accumulation logic with `if response.output_tokens:`. If an API response returns `output_tokens: 0` but `reasoning_tokens: 500` (and `reasoning_tokens_included_in_output: False`), the proposed logic would fail to add the 500 reasoning tokens to `transcript.total_output_tokens`. This results in a continued under-counting of costs and directly violates the plan's stated "Decision 2: Reasoning tokens accumulation not gated on output_tokens".
-   **Evidence**: `[CODE-CONFIRMED]`. The provided context for `probe.py` shows that `response.output_tokens` is an `Optional[int]`. Gating the accumulation on a truthiness check (`if response.output_tokens:`) will cause the logic to be skipped if the value is `0` or `None`. This is a valid scenario where reasoning tokens could still be present and billed.
-   **Recommendation**: Modify the accumulation logic to be unconditional. It should process `output_tokens` and `reasoning_tokens`, treating `None` as 0, to ensure reasoning costs are always accounted for.

### 2. (MEDIUM) Unverified Assumptions about Provider API Responses
The plan's implementation relies on the existence and structure of new, likely undocumented, fields in the API responses of multiple providers.

-   **Finding**: The plan requires extracting `completion_tokens_details.reasoning_tokens` from xAI and OpenAI responses, and `thoughtsTokenCount` from Google's `usageMetadata`. The provided adapter code (`xai.py`, `openai.py`, `google.py`) does not currently access these fields, indicating this is a new dependency on an unverified data structure. If these fields are named differently, are nested elsewhere, or do not exist, the feature will silently fail to capture reasoning tokens.
-   **Evidence**: `[UNVERIFIED]`. The provided code context does not include API response fixtures that would confirm or refute the presence of these fields.
-   **Recommendation**: Before implementation, verify the existence and structure of these fields by consulting API documentation or inspecting live API responses. The adapter code should gracefully handle the absence of these fields and log the full `usage` object at a debug level to aid future validation.

### 3. (MEDIUM) Critical Unverified Assumption for `included_in_output` Flag
The accuracy of the entire solution depends on correctly setting the `reasoning_tokens_included_in_output` boolean flag for each provider, which is based on an unverified assumption about their billing models.

-   **Finding**: The plan asserts that for OpenAI/DeepSeek this flag is `True`, but for xAI/Google it is `False`. A mistake in this critical flag would lead to either double-counting or continued under-counting of tokens, silently corrupting the cost data.
-   **Evidence**: `[UNVERIFIED]`. This is an assumption about provider billing logic that cannot be validated from the provided codebase.
-   **Recommendation**: This core assumption must be validated empirically. For each relevant provider, run a test with a model known to use reasoning/thinking, capture the full `usage` object from the API response, and compare it with the final billed amount in the provider's dashboard to confirm whether reasoning tokens are additive or inclusive.

## Residual Risks

### 1. Streaming Responses Omitted from Scope
The plan explicitly modifies non-streaming `generate()` methods, leaving a significant functionality gap for streaming use cases.

-   **Risk**: The `deepseek.py` adapter contains a `generate_stream()` method for handling streaming responses. The plan explicitly omits this from the scope of changes. Consequently, any part of the system that utilizes streaming will not have accurate cost tracking for reasoning tokens.
-   **Evidence**: `[CODE-CONFIRMED]`. The context file `deepseek.py` shows a `generate_stream` function, and the plan artifact explicitly states, "Do NOT touch `generate_stream`."

### 2. Incomplete Cost Data on Early API Rejections
The plan attempts to capture reasoning tokens even in failure cases, but it may provide a false sense of completeness for certain API errors.

-   **Risk**: In `google.py`, the plan correctly tries to capture `thoughtsTokenCount` even when a prompt is blocked. However, if an API call is rejected by the provider before any significant processing occurs (e.g., an early prompt filter), the `usageMetadata` object may be incomplete or absent. The system would correctly record `reasoning_tokens=None`, but this could be misleading if it's interpreted as "zero reasoning occurred" rather than "reasoning measurement was not possible."
-   **Evidence**: `[UNVERIFIED]`. This risk depends on the specific behavior of each provider's API for different failure modes, which is not detailed in the provided context.

## Token Stats

- total_input=25586
- total_output=1117
- total_tokens=44343
- `gemini-2.5-pro`: input=25586, output=1117, total=44343

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
