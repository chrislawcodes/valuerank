---
reviewer: "codex"
lens: "correctness-adversarial"
stage: "diff"
artifact_path: "docs/workflows/aggregate-timeout-refactor/reviews/implementation.diff.patch"
artifact_sha256: "a1c02c0f05ea1438a2df0dbc3f3479ff89fd8a948cca80e306a07332850890c1"
repo_root: "."
git_head_sha: "8a6a690305a367479fd3897aa807a0fd38a30c4f"
git_base_ref: "origin/main"
git_base_sha: "8a6a690305a367479fd3897aa807a0fd38a30c4f"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "The final persist now revalidates under the advisory lock, source queries are deterministically ordered, and claimed runs are marked RUNNING/COMPLETED so the aggregate no longer looks final mid-recompute."
raw_output_path: "docs/workflows/aggregate-timeout-refactor/reviews/diff.codex.correctness-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff correctness-adversarial

## Findings

- High: `updateAggregateRun` now snapshots the source state before it acquires the advisory lock, and `persistAggregateRun` only checks that cached fingerprint/token pair later. That leaves a correctness gap: any scenario/run/transcript change between `prepareAggregateRunSnapshot()` and the later claim/persist path can be published even though the aggregate no longer reflects the live source state. The old implementation read the source rows while holding the lock, so this is a regression in consistency.
- Medium-High: The new fingerprint is order-sensitive, but the queries feeding it do not specify `orderBy` for `scenarios`, `runs`, or `transcripts`. Because `computeAggregateFingerprint()` hashes arrays as returned, the same logical database state can produce different `sourceFingerprint` values, causing false stale-claim rejections and unnecessary retries.
- Medium: When an existing aggregate run is claimed, `claimAggregateRun()` only rewrites `config`; it does not mark the run `RUNNING` or suppress the old `CURRENT` analysis result until final persist. During the worker window, external readers can still see a `COMPLETED` aggregate as if it were final even though it is mid-recompute and carrying a transient claim token.

## Residual Risks

- If other writers already serialize source mutations with the same advisory lock, the stale-snapshot race is narrower, but the code still does not revalidate the live source rows under the lock.
- If the database/ORM returns rows in a stable order in practice, the fingerprint-flapping risk is reduced, but the implementation still relies on unspecified ordering.
- Abandoned claims still depend on later cleanup or a subsequent successful recompute; a crash after claiming can leave the aggregate in a claimed state until something else supersedes it.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: The final persist now revalidates under the advisory lock, source queries are deterministically ordered, and claimed runs are marked RUNNING/COMPLETED so the aggregate no longer looks final mid-recompute.
