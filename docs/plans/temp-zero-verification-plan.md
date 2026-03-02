# Temp-Zero Verification Plan

> Merged plan synthesized from Gemini (codebase research) + Codex (structure/acceptance criteria) + Claude (synthesis).

## Status (updated 2026-03-02)

| Phase | Description | Status | PR |
|-------|-------------|--------|----|
| 1 | Instrument request metadata + prompt hashing | ✅ Done | #298 |
| 2 | Add `seed` support | ✅ Done | #298 |
| 3 | Temperature handling classification (`adapterMode`) | ✅ Done | #298 |
| 4 | Canary verification set (`canary_runner.py`) | ✅ Done | #298 |
| 5 | Repeated trials per model (20–50 runs) | ⏳ Pending — needs human to run `canary_runner.py` with API keys | — |
| 6 | Control for `system_fingerprint` drift | ⏳ Pending — logic is in `temp_zero_report.py`; needs production data | — |
| 7 | Diagnostic decision tree investigation | ⏳ Pending — `debugAssumptionsMismatches` endpoint exists; needs new transcripts | — |
| 8 | `debugAssumptionsMismatches` diagnostic endpoint | ✅ Done | #298 |
| 9 | Verification report (`temp_zero_report.py`) | ✅ Done | #298 |
| 10 | Acceptance criteria (definition only) | ✅ Done — defined below, no code needed | — |
| 11 | Assumptions tab labeling/filtering strategy | ⏳ Pending — blocked on Phase 5/9 data | — |

**Next human action:** Run `canary_runner.py` and `temp_zero_report.py` with live credentials. See `docs/plans/temp-zero-handoff.md` for exact commands.

---

## Goal

Determine whether `temperature = 0` is actually reaching each target AI in the current ValueRank execution pipeline, and clearly separate:

1. True model/provider nondeterminism
2. Adapter-level omission of the temperature parameter
3. Provider rejection or silent ignoring of the parameter
4. Output drift caused by model version changes rather than sampling
5. Extraction flakiness in `decisionCode` parsing
6. Hidden prompt drift from dynamic content injection

This plan is a verification layer for the current Assumptions work. It is not a change to the core `#285` determinism logic yet.

---

## Why This Is Needed

The current `Temp=0 Determinism` assumptions test interprets different outputs across repeated runs as evidence of instability. That conclusion is only valid if:

- The app actually requested `temperature = 0`
- The adapter sent that parameter to the provider
- The provider accepted and honored it
- The compared runs used the same effective model version
- The exact prompt payload was identical across all runs
- The `decisionCode` extraction logic behaved consistently

Today we know the assumptions launcher requests `temperature: 0`, but some adapters may omit it for certain model families (especially reasoning/MoE paths). "Different outputs at temp=0" is not a fully proven claim across all models.

---

## Root Causes (Ranked by Likelihood)

| Root Cause | Description | Key Signal |
|---|---|---|
| **Adapter omission** | `temperature=0` not included in outbound payload | `adapterMode` field |
| **Prompt drift** | Dynamic preamble or scenario content varies between runs | SHA-256 prompt hash mismatch |
| **Provider environment change** | Silent model weight/hardware update between runs | `system_fingerprint` change (OpenAI) |
| **Model architecture nondeterminism** | MoE models (DeepSeek, GPT-4o) are non-deterministic at temp=0 due to sparse routing | Persists across identical prompts + fingerprints |
| **Extraction flakiness** | `decisionCode` parser interprets ambiguous responses differently | Raw response identical, `decisionCode` differs |
| **Temperature ignored** | Provider accepts but silently ignores the parameter | Behavior identical to omitted temp |

---

## Scope

**Included:**
- Request metadata instrumentation (what was actually sent)
- SHA-256 prompt hashing (was the same prompt delivered?)
- `system_fingerprint` capture and comparison
- `seed` parameter support for providers that honor it
- Canary prompt battery for isolating raw nondeterminism
- Repeated trials under controlled conditions
- Per-model temperature handling classification
- Diagnostic decision tree and debug endpoint
- Verification report

**Excluded:**
- Changing the 5 locked assumptions vignettes
- Changing `cloud/apps/api/src/graphql/mutations/assumptions.ts`
- Changing the `#285` assumptions matching logic
- Transcript modal shape
- Run/definition/scenario schema shape (unless strictly required for metadata)
- Existing assumptions UI labels (until report is complete)

---

## Phase 1: Instrument Request Metadata + Prompt Hashing

### Objective

Prove what was actually sent to the provider for each transcript.

### Files

- `workers/common/llm_adapters/base.py` — add hashing + payload logging
- `workers/common/llm_adapters/types.py` — extend `LLMResponse` with metadata fields
- `workers/probe.py` — surface metadata in probe results

### What to capture per request

- `temperatureSent` — `true` / `false`
- `temperatureValue` — `0`, numeric value, or `null`
- `seedSent` — `true` / `false`
- `seedValue` — value or `null`
- `adapterMode` — see classification values below
- `promptHash` — SHA-256 of the exact messages payload sent to the provider (excluding API keys)
- `providerModelVersion` — if the provider returns one (e.g., `system_fingerprint` from OpenAI)

### `adapterMode` values

- `explicit_temp_zero`
- `temp_omitted_by_adapter`
- `unsupported_param_retry`
- `explicit_nonzero`
- `unknown`

### Implementation

In `workers/common/llm_adapters/base.py`, before the API call:

```python
import hashlib, json

payload_for_hash = {k: v for k, v in payload.items() if k != 'api_key'}
prompt_hash = hashlib.sha256(json.dumps(payload_for_hash, sort_keys=True).encode()).hexdigest()

if log.isEnabledFor(logging.DEBUG):
    log.debug("Raw API Request", url=url, payload=json.dumps(payload_for_hash))
```

Store `promptHash` in `provider_metadata` returned by `LLMResponse`.

---

## Phase 2: Add `seed` Support

### Objective

Maximize provider-side determinism for providers that support it (OpenAI, xAI).

### Files

- `workers/common/llm_adapters/providers/openai.py` — add `seed` to payload if provided
- `apps/api/src/services/run/start.ts` — thread `seed` through to run config for Assumptions runs

### Implementation

For Assumptions runs, use a fixed seed (e.g., `42`). If `seed` is present in `model_config`, include it in the outbound payload.

---

## Phase 3: Temperature Handling Classification

### Objective

Normalize raw request metadata into a stable per-model classification.

### Classification values

- `explicit_temp_zero` — payload included `temperature: 0`, request succeeded
- `temp_omitted_by_adapter` — adapter intentionally excluded the parameter
- `temp_rejected_by_provider` — provider rejected it, adapter fell back
- `temp_unknown` — no reliable metadata available

### Where this lives

Computed at the adapter/request layer (`workers/common/llm_adapters/`), not reconstructed in the UI. Stored in transcript metadata.

---

## Phase 4: Canary Verification Set

### Objective

Use minimal controlled prompts to isolate temperature handling from the full vignette complexity.

### Canary prompt classes

**1. Deterministic control prompt**
```
Respond with exactly the single character A and nothing else.
```
Purpose: detect raw provider nondeterminism and routing randomness.

**2. Simple decision prompt**

A minimal forced-choice A-vs-B prompt using the same decision parsing path as the assumptions test.
Purpose: detect decision instability separately from text instability.

### Why both are needed

- Control prompt tests literal output stability
- Decision prompt tests whether judgment changes even when wording variation is irrelevant

---

## Phase 5: Repeated Trials Per Model

### Objective

Run each target model under controlled conditions comparing explicit `temperature = 0` vs. omitted temperature.

### Sample size

- Minimum: 20 runs per prompt variant per model
- Preferred: 50 runs per prompt variant per model

### Hold constant

- Exact prompt text (verified via `promptHash`)
- Exact system prompt
- `max_tokens`
- Target model ID
- Provider path
- Parsing logic

### Metrics

- Exact text match rate
- Parsed `decisionCode` match rate
- Direction-only match rate (4/5 vs 1/2 vs 3)

### Interpretation

- Text varies, decision stable → wording instability only
- Decision varies, prompt hash identical, fingerprint stable → genuine model nondeterminism
- Decision varies, fingerprint changed → provider environment drift

---

## Phase 6: Control for Model Version / `system_fingerprint` Drift

### Objective

Avoid misclassifying provider model updates as nondeterminism.

### Rules

Group results by `modelId` + `providerModelVersion` + `promptVariant`.

If `system_fingerprint` (or equivalent) changes between runs:
- Do not compare across the boundary
- Split result sets into separate version groups

If the provider does not expose a usable version signal:
- Mark results as lower-confidence

---

## Phase 7: Diagnostic Decision Tree

When investigating a mismatch for a given (model, vignette, condition) triple:

**Step 1 — Check `promptHash`**
- Hashes differ → pipeline bug. The model received different prompts. Check preamble versioning or scenario content resolution.
- Hashes identical → proceed to Step 2

**Step 2 — Check `system_fingerprint` / provider model version**
- Fingerprints differ → provider changed the environment. Inconsistency is expected.
- Fingerprints identical → proceed to Step 3

**Step 3 — Compare raw `targetResponse` text**
- Responses semantically identical but formatted differently → `decisionCode` extraction needs hardening
- Responses genuinely different → AI is truly nondeterministic at temp=0

---

## Phase 8: `debugAssumptionsMismatches` Diagnostic Endpoint

### Objective

Expose the diagnostic decision tree as a GraphQL query for engineering investigation.

### Proposed query

```graphql
debugAssumptionsMismatches(scenarioId: String!, modelId: String!): DebugMismatchResult
```

Returns:
- The 3 transcripts for the (model, scenario) pair
- Whether `promptHash` is identical across all 3
- Whether `system_fingerprint` changed
- A unified diff of the raw `targetResponse` text

### File

`cloud/apps/api/src/graphql/queries/assumptions.ts` — add as a new query field

---

## Phase 9: Verification Report

### Objective

Summarize temp handling and repeatability by model for product and engineering review.

### Report columns

| Model | Provider | Temp Handling | Model Version | Control Exact Match | Decision Match | Direction Match | Notes |
|---|---|---|---|---|---|---|---|

### Temp Handling values

- `Explicit 0 verified`
- `Omitted by adapter`
- `Rejected by provider`
- `Unknown`

### Initial form

Internal engineering report first. Not immediately exposed in the Assumptions UI.

---

## Phase 10: Acceptance Criteria

A model qualifies as **"explicit temp=0 verified"** only if:

1. `promptHash` is identical across all 3 repeated runs
2. Request metadata proves `temperature: 0` was included in the outbound payload
3. The provider accepted the request (`adapterMode = explicit_temp_zero`)
4. The control prompt is highly stable across repeated runs
5. All comparisons are within a single model version / `system_fingerprint` group

Otherwise classify as `best-effort deterministic mode` or `unknown`.

---

## Phase 11: Follow-Through After Verification

Once the report exists, decide one of these paths for the Assumptions tab:

1. **Strict mode** — include only models with `Explicit temp=0 verified`
2. **Split labeling** — keep all models but clearly distinguish `Explicit temp=0` vs `Deterministic-mode fallback`
3. **Exclude unsupported models** — if you want `Temp=0 Determinism` to mean exactly what it says

---

## Files Changed (actual)

| File | Change | Status |
|------|--------|--------|
| `cloud/workers/common/llm_adapters/base.py` | Prompt hashing (SHA-256), `_classify_adapter_mode`, `_set_request_metadata`, `get_current_request_metadata` via ContextVar | ✅ Done |
| `cloud/workers/common/llm_adapters/types.py` | Extended `LLMResponse` with `prompt_hash`, `temperature_sent`, `temperature_value`, `seed_sent`, `seed_value`, `adapter_mode`; `to_dict()` serializes as camelCase | ✅ Done |
| `cloud/workers/common/llm_adapters/registry.py` | Added `seed` param to `generate()`; passes to OpenAI, xAI, DeepSeek, Google only | ✅ Done |
| `cloud/workers/common/llm_adapters/providers/openai.py` | Added `seed` to payload | ✅ Done |
| `cloud/workers/common/llm_adapters/providers/xai.py` | Added `seed` to payload | ✅ Done |
| `cloud/workers/common/llm_adapters/providers/deepseek.py` | Added `seed` to payload | ✅ Done |
| `cloud/workers/common/llm_adapters/providers/google.py` | Added `seed` to `generation_config` | ✅ Done |
| `cloud/workers/common/llm_adapters/providers/anthropic.py` | Added `seed` param to signature only (Anthropic doesn't support seed) | ✅ Done |
| `cloud/workers/common/llm_adapters/providers/mistral.py` | Added `seed` param to signature only (Mistral doesn't support seed) | ✅ Done |
| `cloud/workers/probe.py` | `build_provider_metadata()` merges instrumentation into transcript metadata with camelCase keys | ✅ Done |
| `cloud/apps/api/src/queue/handlers/probe-scenario.ts` | Injects `seed: 42` into config when `config.temperature === 0` | ✅ Done |
| `cloud/apps/api/src/queue/types.ts` | Added `seed?: number` to `ProbeScenarioJobData.config` | ✅ Done |
| `cloud/apps/api/src/graphql/queries/assumptions.ts` | Added `debugAssumptionsMismatches` query, `DebugMismatchResult` type, helper functions | ✅ Done |
| `cloud/workers/canary_runner.py` | New standalone canary runner — run from `cloud/workers/` | ✅ Done |
| `cloud/workers/temp_zero_report.py` | New DB report script — `DATABASE_URL=... python temp_zero_report.py` | ✅ Done |

**Critical implementation details:**
- `providerMetadata` is stored at `transcript.content.turns[0].providerMetadata` (NOT top-level)
- All keys are camelCase: `promptHash`, `temperatureSent`, `adapterMode`, `seedSent`, `seedValue`
- `computeMatch` returns `null` if ANY value is null — can't compare with missing instrumentation data
- `debugAssumptionsMismatches` filters to temp=0 runs: `run.config.temperature == 0`

**Note:** Do NOT modify `src/llm_adapters.py` — that is the legacy CLI path, not used by the cloud worker pipeline.

---

## Validation

After implementation:

```bash
cd /Users/chrislaw/valuerank/cloud && npm run typecheck
cd /Users/chrislaw/valuerank/cloud && npm test
cd /Users/chrislaw/valuerank && python -m pytest workers/tests/ -v
```

---

## Recommended Delivery Order

1. Instrument request metadata + prompt hashing (Phase 1)
2. Add `seed` support (Phase 2)
3. Add temperature classification (Phase 3)
4. Create canary prompt set (Phase 4)
5. Run repeated trials for all current target models (Phase 5)
6. Apply version/fingerprint grouping (Phase 6)
7. Use diagnostic decision tree to investigate existing mismatches (Phase 7)
8. Add `debugAssumptionsMismatches` endpoint (Phase 8)
9. Produce verification report (Phase 9)
10. Decide Assumptions tab labeling/filtering strategy (Phase 11)
