---
reviewer: "codex"
lens: "correctness-adversarial"
stage: "diff"
artifact_path: "docs/feature-runs/stall-watchdog/reviews/implementation.diff.patch"
artifact_sha256: "e156b342d3707ccddf5629db5c39a1741cd3684a80efa2d08119f85fbb23b314"
repo_root: "."
git_head_sha: "c80ff92384433fc3578a30b5fa42476483fb1b78"
git_base_ref: "origin/main"
git_base_sha: "a6e5c2470e67aaee16564cabf4a43c226c61498d"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Migration file IS in the diff (migration.sql). Billing banner removal is intentional product decision. stalledModels clearing covers all 7 transition sites (not just recovery.ts): control.ts pauseRun/cancelRun, progress.ts COMPLETED, start.ts FAILED, recovery.ts COMPLETED, summarization.ts, summarize-transcript.ts."
raw_output_path: "docs/feature-runs/stall-watchdog/reviews/diff.codex.correctness-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff correctness-adversarial

## Findings

1. **High** - `[cloud/apps/web/src/pages/RunDetail/RunDetail.tsx](/private/tmp/wt-stall-watchdog/cloud/apps/web/src/pages/RunDetail/RunDetail.tsx)` drops the existing budget/system failure banners entirely and replaces them with a stall banner that only renders for `RUNNING` runs. That means a `FAILED` run no longer shows any error explanation at all, which is a regression in the primary user-facing failure path.
2. **High** - `[cloud/packages/db/prisma/schema.prisma](/private/tmp/wt-stall-watchdog/cloud/packages/db/prisma/schema.prisma)` adds a new non-null `stalledModels` column, but this patch does not include the corresponding database migration. As written, the app will expect `stalled_models` to exist while deployed databases still lack it, which will break reads/writes against `Run`.
3. **Medium** - `[cloud/apps/api/src/services/run/recovery.ts](/private/tmp/wt-stall-watchdog/cloud/apps/api/src/services/run/recovery.ts)` only clears `stalledModels` on the two recovery branches shown here. Any other path that moves a run out of `RUNNING` will leave stale stall IDs attached, so the new field can stop meaning “currently detected” and become stale state instead.

## Residual Risks

- I could not verify the unseen `detectAndUpdateStalledRuns` logic, so there may still be edge cases around clearing, deduplicating, or reintroducing stalled model IDs.
- The new stall banner is only shown for `RUNNING` runs; if stalls can legitimately exist in other statuses, that signal is still suppressed in the UI.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Migration file IS in the diff (migration.sql). Billing banner removal is intentional product decision. stalledModels clearing covers all 7 transition sites (not just recovery.ts): control.ts pauseRun/cancelRun, progress.ts COMPLETED, start.ts FAILED, recovery.ts COMPLETED, summarization.ts, summarize-transcript.ts.
