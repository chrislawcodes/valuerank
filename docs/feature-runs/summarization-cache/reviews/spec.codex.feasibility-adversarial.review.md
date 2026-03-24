---
reviewer: "codex"
lens: "feasibility-adversarial"
stage: "spec"
artifact_path: "docs/feature-runs/summarization-cache/spec.md"
artifact_sha256: "e4656926d8881dc9974417202be02c00321f38483cf06f271ee3d4a8982e576b"
repo_root: "."
git_head_sha: "dd55b9051c188c024ef0cfbb215d93aaaceba09c"
git_base_ref: "origin/chore/agents-md-single-source-of-truth"
git_base_sha: "57b19139456a975e3209c989974fca1fc83ea75a"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Accepted as the near-term cache design: cache lookup happens before any legacy summarizedAt fallback, force reruns bypass old cache entries without deleting the last good one up front, and the transcript summary plus cache record are written together in one update after success."
raw_output_path: "docs/feature-runs/summarization-cache/reviews/spec.codex.feasibility-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec feasibility-adversarial

## Findings

1. High: The cache key is underspecified, so false hits are possible. `responseSha256`, `parserVersion`, and `modelId` only work if `parserVersion` is guaranteed to encode every parser dependency, prompt/template change, normalization rule, and post-processing rule that affects the summary. The spec does not prove that, and it also does not define a canonical `modelId` format. If handler and worker derive these values differently, the cache can silently reuse the wrong summary.

2. High: The spec omits concurrency and atomicity rules. Two summarize jobs for the same transcript can both miss the cache, both spawn workers, and then race to write `decisionMetadata.summaryCache` and the summary fields. Without a lock, compare-and-set write, or explicit last-write-wins policy, retries and recovery paths can still do duplicate work and leave the cache in an inconsistent state.

3. Medium: Storing the full summary inside `decisionMetadata` is risky without a size bound or pruning rule. `summary.decisionMetadata` is an unconstrained `Record<string, unknown>`, so a large worker payload can bloat the transcript row, slow reads and writes, or hit JSON/row-size limits. The “no schema migration” constraint does not remove that risk.

4. Medium: Cache-hit semantics are incomplete around timestamp and legacy state handling. The spec says a hit restores “prior summary fields,” but it does not say whether `summarizedAt` should be updated, preserved, or ignored on a cache hit. It also does not define what downstream code should see if `forceSummarize` bypasses the cache and the rerun fails. That leaves room for inconsistent legacy short-circuiting and stale summaries that are hard to diagnose.

## Residual Risks

- If `parserVersion` does not truly capture every parser and post-processing dependency, stale cache hits will still happen after code or prompt changes.
- If the handler must recompute the transcript hash from raw responses, the “before worker spawn” optimization still requires a nontrivial read and normalization pass.
- Blue-green or staggered deploys can temporarily desynchronize the shared parser-version value between services, which can make cache behavior inconsistent during rollout.
- Very large or malformed legacy `decisionMetadata` payloads can still make cache reads and writes expensive even when the cache logic itself is correct.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Accepted as the near-term cache design: cache lookup happens before any legacy summarizedAt fallback, force reruns bypass old cache entries without deleting the last good one up front, and the transcript summary plus cache record are written together in one update after success.
