---
reviewer: "codex"
lens: "correctness-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/sensitivity-table-redesign/reviews/implementation.diff.patch"
artifact_sha256: "d6921ddf0431336acadb5fc3f9aa6a39ef9139ac754d6ac02103d6f89a887fb9"
repo_root: "."
git_head_sha: "3565133420c716ceba3bc46c0cb784ce7151b8ed"
git_base_ref: "origin/main"
git_base_sha: "4772ae79f8e1580ee31c0f10f32e6d86a842ef68"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "MEDIUM 1 (web client still wired to old shape) DEFERRED to Slice B which is the explicit dependency; Slice A backend grep is intentionally backend-only per tasks.md A6, frontend cleanup in Slice B/C. MEDIUM 2 (transcriptCapHit false-positive on exact-multiple page boundaries) RESOLVED by fetching TRANSCRIPT_PAGE_SIZE+1 rows and using page.length greater-than threshold to detect hasMore. Commit e83fdb36. MEDIUM 3 (model sort by signed mean) INTENTIONAL per spec FR-011 — cross-model sort default is Win rate Δ descending (signed). User can re-sort by clicking the column. Strongly negative model still appears in the table just lower in default order."
raw_output_path: "docs/workflow/feature-runs/sensitivity-table-redesign/reviews/diff.codex.correctness-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff correctness-adversarial

## Findings

1. **Medium [UNVERIFIED]** - The web client is still wired to the old pressure-sensitivity shape. [`pressureSensitivity.graphql`](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/web/src/api/operations/pressureSensitivity.graphql#L16) still requests `aggregateSensitivity`, `directionDelta`, `convictionDelta`, `netScoreDelta`, and `baselineWinRate`, and [`pressureSensitivity.ts`](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/web/src/api/operations/pressureSensitivity.ts#L25) still derives types from those removed fields. If that document is still used, the query will fail validation at runtime until the client artifacts are regenerated and updated.

2. **Medium** - [`fetchTranscriptsFromSourceRuns`](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/api/src/graphql/queries/pressure-sensitivity.ts#L185) can report `transcriptCapHit=true` even when no truncation happened. It infers `hasMore` from `page.rows.length === TRANSCRIPT_PAGE_SIZE`, so any final page that is exactly 5,000 rows long is treated as "more pages exist." If the total transcript count is an exact multiple of 5,000 and equals the fetch limit, the code logs a cap hit even though all rows were fetched.

3. **Medium [UNVERIFIED]** - The model ordering now sorts by `winRateDeltaSummary.mean` instead of an absolute effect-size metric. See [`pressure-sensitivity.ts`](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/api/src/graphql/queries/pressure-sensitivity.ts#L588). That means a model with large negative deltas will sort below a weakly positive one, even if it is just as strong in magnitude. If the report is still meant to rank sensitivity rather than direction, this reorders the results incorrectly.

## Residual Risks

- I did not run the web client or codegen, so the client breakage finding is based on the repo state in this worktree rather than end-to-end execution.
- The new statistical helpers are unit-tested, but they are more complex than the old aggregation code, so a spot-check against a known dataset would still be prudent.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: MEDIUM 1 (web client still wired to old shape) DEFERRED to Slice B which is the explicit dependency; Slice A backend grep is intentionally backend-only per tasks.md A6, frontend cleanup in Slice B/C. MEDIUM 2 (transcriptCapHit false-positive on exact-multiple page boundaries) RESOLVED by fetching TRANSCRIPT_PAGE_SIZE+1 rows and using page.length greater-than threshold to detect hasMore. Commit e83fdb36. MEDIUM 3 (model sort by signed mean) INTENTIONAL per spec FR-011 — cross-model sort default is Win rate Δ descending (signed). User can re-sort by clicking the column. Strongly negative model still appears in the table just lower in default order.
