---
reviewer: "codex"
lens: "execution-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/sensitivity-table-redesign/tasks.md"
artifact_sha256: "795c180d4cdf013269b43fb492d28a10bb30496a153e4baf1e7e8091d29fc5cf"
repo_root: "."
git_head_sha: "037325feb2617aa96b68cfb204a023144a68c88a"
git_base_ref: "origin/main"
git_base_sha: "4772ae79f8e1580ee31c0f10f32e6d86a842ef68"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "HIGH (Tooltip uses onMouseEnter Leave with 200ms delay) RESOLVED. C2 tests rewritten to use mouseEnter mouseLeave with vi.advanceTimersByTime 200 plus focus and blur (immediate path). MEDIUM (cross-value heat map cell title hardcodes netScore Δ) RESOLVED. C6 now does a full text sweep including the cell title at line 103, legend, color scale. MEDIUM (sanity panel labels) RESOLVED. C6 now does a full label rewrite including Directional sanity check, measurable Direction Δ, table header, and Below 70% positive direction copy."
raw_output_path: "docs/workflow/feature-runs/sensitivity-table-redesign/reviews/tasks.codex.execution-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "partial"
coverage_note: "context exceeded max_context_chars and was narrowed"
---

# Review: tasks execution-adversarial

## Findings

1. **[HIGH][CODE-CONFIRMED]** The new `HeaderTooltip` work is specified around `pointerOver` / `pointerLeave`, but the existing shared tooltip primitive only listens for `onMouseEnter` / `onMouseLeave` and waits 200ms before opening ([Tooltip.tsx](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/web/src/components/ui/Tooltip.tsx#L44), [Tooltip.tsx](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/web/src/components/ui/Tooltip.tsx#L99), [Tooltip.tsx](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/web/src/components/ui/Tooltip.tsx#L140)). As written, Slice C2’s pointer-event assertions will fail or need extra timer plumbing that the task does not call out.

2. **[MEDIUM][CODE-CONFIRMED]** Slice C6 is too narrow for the cross-value heat map. The current component still hardcodes `|netScore Δ|` in the visible cell title, so swapping only `pair.netScoreDelta.value` to `pair.winRateDelta.value` leaves users looking at the new metric under the old label ([PressureSensitivityCrossValueMap.tsx](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/web/src/components/models/PressureSensitivityCrossValueMap.tsx#L103)). That is a user-facing mismatch, not just a comment cleanup.

3. **[MEDIUM][CODE-CONFIRMED]** Slice C6 also under-specifies the sanity-check panel rename. The current panel still renders `Directional sanity check`, `measurable Direction Δ`, a `Direction Δ` table header, and `Below 70% positive direction` copy ([PressureSensitivitySanityCheck.tsx](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/web/src/components/models/PressureSensitivitySanityCheck.tsx#L14), [PressureSensitivitySanityCheck.tsx](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/web/src/components/models/PressureSensitivitySanityCheck.tsx#L45), [PressureSensitivitySanityCheck.tsx](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/web/src/components/models/PressureSensitivitySanityCheck.tsx#L84)). Changing only the field accessors to `winRateDelta` would leave the old terminology visible to users.

## Residual Risks

- `tBasedMeanCI` still depends on a custom Student-t quantile approximation. That math is easy to get slightly wrong at low degrees of freedom, so the numeric fixtures need to stay strict.
- Slice C7a’s endpoint-interval hover for Low/High pressure cells is still underspecified. If the implementation falls back to a text-only tooltip, the view will be less useful than the spec intends.
- The plan still has a sharp edge around `pairsMeasured = 0` versus “insufficient” rendering. Make sure the implementation never shows a summary row that should have gone to the insufficient footer.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: HIGH (Tooltip uses onMouseEnter Leave with 200ms delay) RESOLVED. C2 tests rewritten to use mouseEnter mouseLeave with vi.advanceTimersByTime 200 plus focus and blur (immediate path). MEDIUM (cross-value heat map cell title hardcodes netScore Δ) RESOLVED. C6 now does a full text sweep including the cell title at line 103, legend, color scale. MEDIUM (sanity panel labels) RESOLVED. C6 now does a full label rewrite including Directional sanity check, measurable Direction Δ, table header, and Below 70% positive direction copy.
