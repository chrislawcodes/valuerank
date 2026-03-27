---
reviewer: "codex"
lens: "execution-adversarial"
stage: "tasks"
artifact_path: "docs/feature-runs/transcript-decision-model-winner-first/tasks.md"
artifact_sha256: "bdda2d57690125fde7316b228e360315ec4854a13409a157e1284d4d7e2af30b"
repo_root: "."
git_head_sha: "0e47504311b8d1449e7d178bd56e0d23e9a87cf5"
git_base_ref: "origin/fix/conditions-matrix-paired-transcripts"
git_base_sha: "0e47504311b8d1449e7d178bd56e0d23e9a87cf5"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Accepted: the cache now carries an explicit decisionState plus freshness keys, the canonical frame is anchored to the transcript snapshot, and stale-looking rows fall back instead of silently masquerading as valid data."
raw_output_path: "docs/feature-runs/transcript-decision-model-winner-first/reviews/tasks.codex.execution-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks execution-adversarial

## Findings

- **High** - Slice 1’s cache validity contract is too weak. The only freshness keys are `responseSha256`, `parserVersion`, and `modelId`, but the resolver’s canonical frame also depends on `methodology.pair_key` and the transcript’s definition `dimensions` order. That means a cache can be syntactically valid and still map the wrong winner after a definition snapshot change or pair-order change. The task needs an explicit transcript/definition fingerprint in the cache contract, not just parser-level freshness.
- **High** - The plan allows “malformed” and “stale” caches to fall back, but it never requires semantic validation of the cached fields themselves. A JSON object can be valid and fresh yet contradictory, for example `decisionState=unknown` with a populated `favoredValueKey`, or `decisionState=neutral` with a non-neutral `strength` or `presentationOrder`. That would silently accept a bad envelope instead of rejecting it.
- **Medium** - Slice 2 is under-scoped if the B-first inversion lives in shared transcript-decision mapping rather than the card component. The artifact itself keeps `tests/utils/transcriptDecisionModel.test.ts` in the verification set, which signals a shared contract, but the file list only names `PairedRunComparisonCard.tsx` and its test. If the bug is in the shared utility, this slice will patch the display while leaving other consumers wrong.

## Residual Risks

- The backfill-free rollout still depends on every old-row shape being handled forever by the compatibility path. Any future cleanup that narrows that parser would re-break existing transcripts.
- The task does not call for an explicit compatibility audit of other readers of `decisionMetadata.summaryCache.summary`. If any exist outside the API resolver, they may still assume the old shape.
- There is no explicit smoke test against real persisted rows after the cache format change, so any gap between the unit tests and production JSON shapes could still slip through.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Accepted: the cache now carries an explicit decisionState plus freshness keys, the canonical frame is anchored to the transcript snapshot, and stale-looking rows fall back instead of silently masquerading as valid data.
