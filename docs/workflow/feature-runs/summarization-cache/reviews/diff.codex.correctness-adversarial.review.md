---
reviewer: "codex"
lens: "correctness-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/summarization-cache/reviews/implementation.diff.patch"
artifact_sha256: "ad1e6ba9a6c39f92459f1dc93aa39291dcfd557882468245a7a06bcb4d7f6be1"
repo_root: "."
git_head_sha: "dd55b9051c188c024ef0cfbb215d93aaaceba09c"
git_base_ref: "origin/chore/agents-md-single-source-of-truth"
git_base_sha: "57b19139456a975e3209c989974fca1fc83ea75a"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Accepted and fixed by keeping the transcript-response hash aligned with the worker and restoring the worker parser-version test layout so the module imports cleanly."
raw_output_path: "docs/workflow/feature-runs/summarization-cache/reviews/diff.codex.correctness-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff correctness-adversarial

## Findings

1. **High: the cache hash can collide for different transcripts** in `cloud/apps/api/src/queue/handlers/summarize-transcript.ts`. `computeTranscriptResponseSha256()` hashes `responses.join('\n').trim()`, which is not a safe serialization of the response list. Distinct inputs can produce the same hash, for example `["a", "b"]` and `["a\nb"]`, or any case where leading/trailing whitespace is significant. That can make the handler reuse a summary for the wrong transcript.

2. **Medium: cache invalidation only covers `targetResponse`, not the full transcript payload** in `cloud/apps/api/src/queue/handlers/summarize-transcript.ts`. The worker is invoked with `transcript.content`, but the cache key ignores everything except concatenated response text. If any other part of the transcript content changes, such as prompt text or other turn metadata, the cache can still hit and return a stale summary. That is a weak assumption unless the worker is guaranteed to depend on response text only.

## Residual Risks

- Cache correctness still depends on `SUMMARIZE_PARSER_VERSION` being kept in sync between the API and worker processes. The code now reads that value in both places separately, so a deploy skew can still produce mismatched cache behavior.
- The new short-circuit path still relies on existing run-completion bookkeeping staying consistent if a job is interrupted after transcript persistence but before counter updates.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Accepted and fixed by keeping the transcript-response hash aligned with the worker and restoring the worker parser-version test layout so the module imports cleanly.
