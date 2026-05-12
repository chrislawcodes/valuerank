---
reviewer: "codex"
lens: "feasibility-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/win-rate-exc-neutral/spec.md"
artifact_sha256: "006570fbd47340ccb5f569d369c2234fd9c7c3e40997b4b732f8ca1d202a7b95"
repo_root: "."
git_head_sha: "8c8e3ecb4692e3642b26b8b571017d0d04c6983b"
git_base_ref: "origin/main"
git_base_sha: "8c8e3ecb4692e3642b26b8b571017d0d04c6983b"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "High (Phase 2 safety): Accepted. FR-007 updated to require a conditional DB write (WHERE id=$id AND status='CURRENT'). Medium (PairwiseCellDrawer scope gap): Accepted. Added to non-goals. Medium (null conflation): Accepted. FR-006 updated to distinguish two null cases."
raw_output_path: "docs/workflow/feature-runs/win-rate-exc-neutral/reviews/spec.codex.feasibility-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec feasibility-adversarial

## Findings

- High: The Phase 2 safety rule is not actually enforceable with the current snapshot write path. `refreshDomainAnalysisSnapshot()` in [domain-analysis-cache.ts](/Users/chrislaw/valuerank/.claude/worktrees/epic-merkle-366062/cloud/apps/api/src/services/analysis/domain-analysis-cache.ts) writes the final `output` back to the same row by `id`, and `writeSnapshot()` only supersedes rows by `configSignature`/`inputHash`. Neither path does a compare-and-swap against a build generation or a still-CURRENT status before the late write. A stale Phase 2 can therefore overwrite or resurrect a snapshot after a newer build has already won. [CODE-CONFIRMED]
- Medium: The scope is incomplete if "all reports on the win rate page" is meant literally. `PairwiseCellDrawer` in [PairwiseCellDrawer.tsx](/Users/chrislaw/valuerank/.claude/worktrees/epic-merkle-366062/cloud/apps/web/src/components/domains/PairwiseCellDrawer.tsx) always queries the standard pair-detail resolver, and [pair-detail.ts](/Users/chrislaw/valuerank/.claude/worktrees/epic-merkle-366062/cloud/apps/api/src/graphql/queries/domain/analysis/pair-detail.ts) still computes `selectedValueWinRate` with `computePairwiseWinRate(...)` from [pairwise-math.ts](/Users/chrislaw/valuerank/.claude/worktrees/epic-merkle-366062/cloud/apps/api/src/utils/pairwise-math.ts) with no exc-neutral mode hook. The matrix can switch modes while the drilldown drawer stays on standard rates. [CODE-CONFIRMED]
- Medium: FR-006 assumes every `null` exc-neutral value means "not yet available," but the code already uses `null` to mean "no observations." `computePairwiseWinRate()` returns `null` when the denominator is zero, and the value/pair detail resolvers propagate that directly. The spec does not separate a true backfill gap from a legitimate zero-denominator result, so the required UI indicator will be misleading in at least the all-neutral case. [CODE-CONFIRMED]

## Residual Risks

- The spec still does not name every derivative surface that should obey the new mode, so any future drilldowns, exports, or secondary summaries can drift unless they are explicitly threaded with the same win-rate-mode state.
- The null/fallback story is still broad. Old snapshots, partially written snapshots, and genuinely empty comparisons can all surface as "no exc-neutral data," and the spec does not define a way to tell those cases apart in the UI.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: High (Phase 2 safety): Accepted. FR-007 updated to require a conditional DB write (WHERE id=$id AND status='CURRENT'). Medium (PairwiseCellDrawer scope gap): Accepted. Added to non-goals. Medium (null conflation): Accepted. FR-006 updated to distinguish two null cases.
