---
reviewer: "gemini"
lens: "risk-boundary-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/transcript-summarization-speedup/plan.md"
artifact_sha256: "6aff1465978c906f09c70b6caa915e7566062a6143f0070746b55296b52f2817"
repo_root: "."
git_head_sha: "b3095605580880e5884d3d66c6b47cfaa3c8d9e8"
git_base_ref: "origin/main"
git_base_sha: "445c9ab175a57ca54a0094c51078af66a1f61bd0"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Accepted after bounding the batch size to the existing PgBoss worker batchSize, sending JSON over stdin instead of argv, and keeping batch processing transcript-by-transcript at the DB update layer."
raw_output_path: "docs/workflow/feature-runs/transcript-summarization-speedup/reviews/plan.gemini.risk-boundary-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan risk-boundary-adversarial

## Findings

1.  **Critical Flaw in Partial-Failure Handling:** The plan states, "A retryable failure inside an otherwise successful batch remains a failure for that transcript," but fails to specify a mechanism for this. A PgBoss job is a single transactional unit. If the job handler completes successfully (even after committing some summaries), the job is removed from the queue. The plan does not describe how a single failed transcript within that batch would be re-queued for a later attempt without re-processing all other successful transcripts from the same batch. This creates a high risk of silently dropping failed transcripts.

2.  **Undefined Batch Limits Introduce Resource Risks:** The plan proposes batching without defining a maximum batch size. This introduces unbounded resource consumption. A large batch could exhaust the Python worker's memory or exceed OS limits on command-line argument length, leading to unpredictable process failures. The assumption that any number of transcripts that fit in a PgBoss batch can be handled by a single Python invocation is weak and untested.

3.  **Ambiguous Rate-Limiting Logic:** The plan redefines rate-limiting from per-transcript to "one batch work unit." This is a critical semantic shift. If the current system is limited to (e.g.) 60 calls per minute, the new system would allow `60 * batch_size` summaries per minute, likely violating third-party LLM provider rate limits and causing cascading failures. The rate-limiting mechanism must be made aware of the batch's internal size.

4.  **Increased Complexity and Risk in API Handler:** To maintain backward compatibility, the API handler must now parse both single and batch responses from the worker. This adds branching logic and increases the surface area for bugs. A flaw in detecting the response type could lead to misinterpreting a valid response, potentially breaking both the old and new workflows.

## Residual Risks

1.  **Error Attribution is Obfuscated:** The plan notes the change in metric granularity but understates the operational risk. A single top-level Python failure now represents an entire batch of transcript failures. This makes it significantly harder to debug. It becomes impossible to distinguish between a single "poison pill" transcript consistently failing the batch versus a transient network failure affecting the whole batch without manual log inspection.

2.  **Brittleness of Deterministic ID Mapping:** The plan's correctness hinges on the worker returning a result for every transcript ID it was sent. The residual risk is that a non-obvious failure mode within the Python script (e.g., an exception during processing of a single item that's caught internally) could cause it to silently drop a transcript from the final batch response. The API handler would have no way of knowing this transcript was never processed unless it explicitly cross-references every sent ID against every received ID, a validation step not mentioned in the plan.

3.  **Increased "Blast Radius" of a Single Failure:** The plan correctly identifies that a top-level failure affects the whole batch. The unstated consequence is that the impact of a single malformed or problematic transcript is magnified. Previously, a single bad transcript job would fail and be isolated. Now, it will cause N-1 other healthy transcripts in its batch to fail and be retried, increasing system load and delaying processing.

## Token Stats

- total_input=1245
- total_output=680
- total_tokens=15023
- `gemini-2.5-pro`: input=1245, output=680, total=15023

## Resolution
- status: accepted
- note: Accepted after bounding the batch size to the existing PgBoss worker batchSize, sending JSON over stdin instead of argv, and keeping batch processing transcript-by-transcript at the DB update layer.
