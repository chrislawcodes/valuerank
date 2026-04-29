---
reviewer: "codex"
lens: "dependency-order-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/sensitivity-table-redesign/tasks.md"
artifact_sha256: "795c180d4cdf013269b43fb492d28a10bb30496a153e4baf1e7e8091d29fc5cf"
repo_root: "."
git_head_sha: "037325feb2617aa96b68cfb204a023144a68c88a"
git_base_ref: "origin/main"
git_base_sha: "4772ae79f8e1580ee31c0f10f32e6d86a842ef68"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "HIGH (Slice A grep impossible in dependency order) RESOLVED. Slice A grep is now scoped to backend only (apps/api, packages, workers, schema.graphql); the wide check covering apps/web/src and the generated codegen runs at the end of Slice C and as the final pre-PR gate. MEDIUM (Tooltip event mismatch) RESOLVED via C2 test rewrite to mouseEnter mouseLeave with timer plus focus blur."
raw_output_path: "docs/workflow/feature-runs/sensitivity-table-redesign/reviews/tasks.codex.dependency-order-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "partial"
coverage_note: "context exceeded max_context_chars and was narrowed"
---

# Review: tasks dependency-order-adversarial

## Findings

- HIGH [CODE-CONFIRMED]: Slice A’s grep checkpoint is ordered too early. The repo still contains the removed field names in non-generated frontend source today, including [pressureSensitivity.graphql](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/web/src/api/operations/pressureSensitivity.graphql), [pressureSensitivity.ts](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/web/src/api/operations/pressureSensitivity.ts), [PressureSensitivitySummary.tsx](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/web/src/components/models/PressureSensitivitySummary.tsx), [PressureSensitivityDetail.tsx](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/web/src/components/models/PressureSensitivityDetail.tsx), [PressureSensitivitySanityCheck.tsx](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/web/src/components/models/PressureSensitivitySanityCheck.tsx), and [PressureSensitivityCrossValueMap.tsx](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/web/src/components/models/PressureSensitivityCrossValueMap.tsx). That means the Slice A command cannot pass until Slices B/C run, so the checkpoint is impossible in the proposed dependency order. [CODE-CONFIRMED]
- MEDIUM [CODE-CONFIRMED]: The `HeaderTooltip` plan assumes `pointerover`/`pointerleave` will show and hide the tooltip immediately, but [Tooltip.tsx](/Users/chrislaw/valuerank/.claude/worktrees/great-noyce-ed9f59/cloud/apps/web/src/components/ui/Tooltip.tsx) only handles `onMouseEnter`/`onMouseLeave` and waits 200 ms before showing. As written, C1/C2 cannot pass without either changing the shared tooltip primitive or changing the tests to use mouse events plus timer control. [CODE-CONFIRMED]

## Residual Risks

- The field-removal grep still depends on there being no additional legacy references outside the files shown here. If other non-generated files exist with the old names, the checkpoint will still fail.
- The tooltip rewrite should still be smoke-tested in-browser after implementation, because the current flow depends on portal rendering and event bubbling through nested header controls.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: HIGH (Slice A grep impossible in dependency order) RESOLVED. Slice A grep is now scoped to backend only (apps/api, packages, workers, schema.graphql); the wide check covering apps/web/src and the generated codegen runs at the end of Slice C and as the final pre-PR gate. MEDIUM (Tooltip event mismatch) RESOLVED via C2 test rewrite to mouseEnter mouseLeave with timer plus focus blur.
