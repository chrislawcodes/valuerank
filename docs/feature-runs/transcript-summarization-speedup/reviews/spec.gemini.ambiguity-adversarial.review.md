---
reviewer: "gemini"
lens: "ambiguity-adversarial"
stage: "spec"
artifact_path: "docs/feature-runs/transcript-summarization-speedup/spec.md"
artifact_sha256: "22e940acd9360f3a08934acb478f1b6d1ae9f786695dd524c1981cd67064795f"
repo_root: "."
git_head_sha: "b3095605580880e5884d3d66c6b47cfaa3c8d9e8"
git_base_ref: "origin/main"
git_base_sha: "445c9ab175a57ca54a0094c51078af66a1f61bd0"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Accepted after defining the batch payload schema, keeping forceSummarize job-scoped and pre-resolved before batching, and making batch results transcript-scoped."
raw_output_path: "docs/feature-runs/transcript-summarization-speedup/reviews/spec.gemini.ambiguity-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec ambiguity-adversarial

## Findings

1.  **Partial Failure Handling is Undefined (High Severity):** The spec's most critical omission is the failure mode for a batch. If a batch contains 10 transcripts and one fails to summarize, what happens to the other 9?
    *   **Ambiguity:** Does the entire Python process exit with an error, causing all 10 jobs to fail and be retried? This would be a significant regression, as a single "poison pill" transcript could block all others in its batch indefinitely.
    *   **Weak Assumption:** The spec assumes error handling will "remain deterministic and safe" without specifying *how* the system will differentiate between a single transcript's failure and a catastrophic failure of the entire batch process. The mechanism for reporting partial success is not described.

2.  **Batch Error Reporting Mechanism is Missing (Medium Severity):** The spec states results must be "mapped back deterministically" but fails to define the return payload structure from the Python worker.
    *   **Omitted Case:** There is no schema for how the worker should report a mix of successful summaries and errors within the same batch. To handle partial failures correctly, the API layer needs a structured response detailing the outcome for each individual transcript ID (e.g., `{ "success": [...], "errors": [...] }`). This is not mentioned.

3.  **Fault Isolation is Weaker (Medium Severity):** The proposed design reduces robustness. A single malformed transcript that causes the Python process to crash (e.g., due to a memory error or unhandled exception) will cause the entire batch of work to be lost. The current one-process-per-transcript model naturally isolates such faults. The spec does not address this new risk or propose a mitigation (e.g., the API handler re-trying a failed batch one-by-one, which would negate the performance benefit).

4.  **Payload Compatibility Logic is Assumed (Low Severity):** The worker must handle both single and batch payloads. The spec does not state *how* the worker will distinguish between them. It's likely assuming a simple check for the existence of the `transcripts[]` key, but this should be explicitly defined to avoid ambiguity. For example, what should happen if a single-transcript payload accidentally contains a key named `transcripts`?

5.  **Verification Strategy is Absent (Low Severity):** The spec requires that "summary semantics must not change" and "compatibility behavior must remain intact" but provides no acceptance criteria or requirements related to testing. There is no mention of regression tests, golden file comparisons, or other methods to prove these statements are true.

## Residual Risks

1.  **Performance Regression on Failure:** If partial batch failure is not handled gracefully, the system could spend more time on retries than it saves on process startup costs. A single recurring failure could cause the same batch of 9 healthy transcripts to be re-processed repeatedly, negating the goal of the feature.
2.  **Silent Data Loss:** Without a clearly defined error and success reporting schema from the worker, there's a risk that the API handler misinterprets the results of a partial failure, potentially marking a failed summary as successful or vice-versa.
3.  **Undetected Semantic Drift:** Without a required testing strategy to verify output, subtle changes in summary content, decision metadata, or V1 compatibility could be introduced and go unnoticed, violating a key requirement.

## Token Stats

- total_input=1175
- total_output=720
- total_tokens=14807
- `gemini-2.5-pro`: input=1175, output=720, total=14807

## Resolution
- status: accepted
- note: Accepted after defining the batch payload schema, keeping forceSummarize job-scoped and pre-resolved before batching, and making batch results transcript-scoped.
