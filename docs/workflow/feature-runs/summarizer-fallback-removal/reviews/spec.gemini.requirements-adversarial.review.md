---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/summarizer-fallback-removal/spec.md"
artifact_sha256: "a5fffec4f1942d2078eb8eeec1e93e27c139daa29469a650f6e6c542a3e696e0"
repo_root: "."
git_head_sha: "6aa2af3410351431f88a8a4bc12fda6deeef7c8e"
git_base_ref: "origin/main"
git_base_sha: "6aa2af3410351431f88a8a4bc12fda6deeef7c8e"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/summarizer-fallback-removal/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

### 1. Silent Failure in Kept Function Masks Errors (High Severity)
The specification requires keeping `classify_decision_with_llm` for future manual use. However, this function is designed to fail silently. It catches all `WorkerError`, `LLMError`, and generic `Exception` types and returns the string `"other"`, logging the error but not propagating it. This makes it impossible for a future caller to distinguish between a genuine "other" classification from the LLM and a complete failure of the LLM call (e.g., due to an invalid API key, model outage, or network issue). This flaw will hide critical errors from operators during the manual adjudication the spec anticipates.

**Evidence:** `[CODE-CONFIRMED]`
The `classify_decision_with_llm` function in `cloud/workers/summarize_llm.py` includes these blocks, which swallow exceptions:
```python
    except (WorkerError, LLMError) as err:
        log.error("Fallback LLM decision classification failed", err=err)
        return "other"
    except Exception as err:
        log.error("Unexpected error in fallback LLM decision classification", err=err)
        return "other"
```

### 2. Definition of "Unresolvable" Is Incomplete (Medium Severity)
The spec's definition of an "unresolvable" transcript (Assumption 2) is missing a key state: `decision_code = 'refusal'`. The summarizer code explicitly handles "refusal" as a valid, non-numeric outcome distinct from "other". Because a refusal is not a score, it cannot be used in quantitative analysis and should likely be brought to the user's attention alongside other unresolvable transcripts. By omitting refusals from the count, the UI warning will underreport the number of transcripts that require manual review, potentially leading researchers to trust incomplete analysis.

**Evidence:** `[CODE-CONFIRMED]`
The code in `cloud/workers/summarize.py` treats `"refusal"` as a special case, on par with `"other"`, indicating it is a known, non-scoring outcome. For example: `if scale_labels and decision_code not in {"other", "refusal"}:`. The spec's definition for unresolvable transcripts does not account for this state.

### 3. Weak Assumption in LLM Prompt (Low Severity)
The prompt built by `build_llm_decision_prompt` contains the instruction "Return exactly one token". This is a notoriously unreliable instruction for LLMs, which may return the requested number or word along with whitespace, punctuation, or other text. While the current parsing logic robustly handles this by stripping and splitting the response, the prompt itself is based on a weak assumption. Since this function is being kept for future use, the prompt should be improved to be more robust, for example by instructing the model that its *entire response* must be *only* the code, rather than using the technically brittle "one token" language.

**Evidence:** `[CODE-CONFIRMED]`
The function `build_llm_decision_prompt` in `cloud/workers/summarize_llm.py` contains the literal text: `"Return exactly one token:"`.

## Residual Risks

### 1. Increased Manual Adjudication Burden without Tooling
This feature removes the automated LLM fallback, which will increase the number of ambiguous transcripts. The spec correctly identifies this and surfaces a warning to the user. However, it explicitly defers the creation of any UI or tools for manual adjudication. This creates a significant operational risk: users will be notified of a problem (unresolvable transcripts) but will have no mechanism to fix it within the application, potentially rendering large datasets partially unusable without external data manipulation.

**Evidence:** `[UNVERIFIED]`
The spec states that implementing a manual LLM trigger or adjudication UI is out of scope.

### 2. Query Performance for Unresolvable Count
The definition of "unresolvable" requires querying the database on a combination of three different conditions (`decision_code`, `decisionState` in a JSONB field, `parseClass` in a JSONB field). If the `transcripts` table is large and the relevant fields are not indexed, calculating this count for the run detail page could introduce performance bottlenecks. The spec does not address the performance implications or schema requirements for this new query.

**Evidence:** `[UNVERIFIED]`
The spec defines the query logic but provides no context on database schema, indexing, or performance targets.

### 3. Data-State Complexity from `decisionCodeSource`
After this change, new ambiguous transcripts will be marked as `decisionSource: "deterministic"` with `parseClass: "ambiguous"`. However, existing transcripts resolved by the old mechanism will retain `decisionSource: "llm"`. This creates a permanent divergence in the data where the meaning of `decisionSource` is dependent on the timestamp of the summarization. This is not a bug, but it introduces complexity that could confuse future data analysis or development efforts if not properly documented.

**Evidence:** `[CODE-CONFIRMED]`
The spec notes that existing transcripts are not affected, and the code in `summarize.py` sets `decision_source = "deterministic"` by default.

## Token Stats

- total_input=990
- total_output=1133
- total_tokens=22373
- `gemini-2.5-pro`: input=990, output=1133, total=22373

## Resolution
- status: open
- note: