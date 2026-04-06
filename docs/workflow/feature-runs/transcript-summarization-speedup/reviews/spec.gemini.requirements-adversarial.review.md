---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/transcript-summarization-speedup/spec.md"
artifact_sha256: "22e940acd9360f3a08934acb478f1b6d1ae9f786695dd524c1981cd67064795f"
repo_root: "."
git_head_sha: "b3095605580880e5884d3d66c6b47cfaa3c8d9e8"
git_base_ref: "origin/main"
git_base_sha: "445c9ab175a57ca54a0094c51078af66a1f61bd0"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Accepted after defining the transcript-scoped batch payload, preserving single-item compatibility, and constraining phase 1 to the existing PgBoss batch boundary with no new pool."
raw_output_path: "docs/workflow/feature-runs/transcript-summarization-speedup/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

1.  **Ambiguous Partial Failure Handling:** The spec requires "deterministic and safe" error handling but does not define the behavior when a batch partially succeeds before failing (e.g., 5 of 10 transcripts are processed, and the 6th causes a crash). It's unclear if the entire batch job is marked for retry, leading to redundant processing of the first 5, or if partial progress is saved. This ambiguity makes the atomicity of the operation a major unaddressed assumption. A single "poison pill" transcript could repeatedly fail an entire batch, blocking other valid transcripts from being processed—a significant degradation from the current single-job isolation.

2.  **Undefined Worker I/O Contract:** The spec defines the input payload to the Python worker (`transcripts[]`) but completely omits the output contract. It does not specify the data structure for returning successful summaries or, more importantly, for reporting errors. A robust contract should define how to return a mix of successes and failures (e.g., `{ "results": [...], "errors": [...] }`), mapping each back to its source transcript ID. Without this, "deterministic" result mapping is an intention, not a specification.

3.  **Unspecified Payload Transport Mechanism:** The mechanism for passing the batch payload from the Node.js handler to the `python3` process is not defined. If the payload is passed as a command-line argument, it is vulnerable to `ARG_MAX` limits on the operating system, which could cause failures on large batches that would not occur otherwise. This represents a hidden scalability limit.

4.  **Missing Resource Management Strategy:** The spec correctly identifies Python startup as overhead but ignores the new resource risks: increased memory and execution time per-process. A large batch of transcripts could exhaust the memory of the Python process or exceed a process-level execution timeout that was tuned for single-transcript jobs. This introduces a new class of scaling-related failures not present in the current architecture.

5.  **No Defined Logging and Observability Strategy:** The spec does not address how logging will be handled within a batch context. Correlating log messages (warnings, errors, timing) back to a specific transcript ID within a single process handling multiple items is non-trivial. Without a defined strategy (e.g., prefixing all logs with the transcript ID), debugging production issues will become significantly more difficult and time-consuming.

## Residual Risks

1.  **Work Amplification on Retries:** The most severe risk, stemming from the ambiguous partial failure policy, is that the system could perform significant redundant work. If a batch of 20 transcripts fails on the last one and the entire batch is retried without caching partial results, the cost-saving goal of the feature is inverted into a 19x cost multiplier for that workload.

2.  **No Escape Hatch or Kill Switch:** The spec does not mention a feature flag or configuration toggle to disable batching. If a fundamental flaw in the batching logic is discovered in production, the only way to mitigate it would be a full rollback or hotfix. This lack of an operational control makes deploying the change unnecessarily risky.

3.  **V1 Payload Detection is Brittle:** The worker must distinguish between old single-transcript payloads and new batch payloads. The implicit strategy seems to be checking for the existence of a `transcripts[]` key. This is brittle and could misinterpret a single-transcript payload that happens to contain a field with that name, creating a confusing edge case failure. A more robust approach would be to include an explicit version or type field in the payload, such as `"payload_type": "batch"`.

## Token Stats

- total_input=1175
- total_output=762
- total_tokens=15325
- `gemini-2.5-pro`: input=1175, output=762, total=15325

## Resolution
- status: accepted
- note: Accepted after defining the transcript-scoped batch payload, preserving single-item compatibility, and constraining phase 1 to the existing PgBoss batch boundary with no new pool.
