---
reviewer: "codex"
lens: "correctness-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/transcript-summarization-speedup/reviews/implementation.diff.patch"
artifact_sha256: "9f1cc7aea7d42c4618423274e469bc341d27ee9cd355adc4a07ac6ece4e03c64"
repo_root: "."
git_head_sha: "b3095605580880e5884d3d66c6b47cfaa3c8d9e8"
git_base_ref: "origin/main"
git_base_sha: "445c9ab175a57ca54a0094c51078af66a1f61bd0"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Accepted after rejecting mixed envelopes, preserving single-item compatibility, and keeping batch failure handling transcript-scoped so successful summaries still commit safely."
raw_output_path: "docs/workflow/feature-runs/transcript-summarization-speedup/reviews/diff.codex.correctness-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff correctness-adversarial

## Findings

1. **High**: `main()` switches to batch mode whenever the top-level dict contains a `transcripts` key, so a payload that accidentally includes that key will skip single-transcript validation and can silently drop the real transcript fields. For example, a malformed single job like `{"transcriptId": "...", "modelId": "...", "transcriptContent": {...}, "transcripts": []}` will now be treated as an empty batch and return success instead of failing fast. That is a correctness regression because the worker no longer rejects mixed or malformed envelopes.

2. **Medium**: `run_summarize_batch()` returns `success: False` for any partial failure, even though it already produced successful per-item summaries. If the queue layer treats that as a failed job and retries the batch, the transcripts that already succeeded will be processed again, which can duplicate downstream side effects. The new batch contract needs an explicit separation between “job completed with item errors” and “job failed and should be retried.”

## Residual Risks

- `SUMMARIZE_PARSER_VERSION` is now an unvalidated runtime override. A typo or unsupported value will silently change parser behavior instead of failing at startup.
- The new batch size ceiling is hard-coded in the worker. If the API-side limit changes and this constant is not updated in lockstep, valid batches will start being rejected here.
- The partial-failure response shape is new. Any caller that assumes old single-job semantics may mis-handle `summaries` or `BATCH_PARTIAL_FAILURE` without an explicit compatibility update.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Accepted after rejecting mixed envelopes, preserving single-item compatibility, and keeping batch failure handling transcript-scoped so successful summaries still commit safely.
