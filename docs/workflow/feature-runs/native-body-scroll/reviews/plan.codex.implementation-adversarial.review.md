---
reviewer: "codex"
lens: "implementation-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/native-body-scroll/plan.md"
artifact_sha256: "1e68d19888b3818780fe6bac52687a9a625bc106c31196eb0884153d60fdd267"
repo_root: "."
git_head_sha: "f08458578d016a539c10d9e5a66642e94f706aa1"
git_base_ref: "origin/main"
git_base_sha: "abe39ae0d4893c5db5b2ece4889efdfd4cbc4d91"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "MEDIUM (h-full in overflow): rejected — virtualized lists have own internal scroll constraint; h-full in taller main is correct. MEDIUM (class-name only): rejected — pre-existing behavior, unchanged by this PR. MEDIUM (scroll root change): deferred — no other scroll-state code found in codebase."
raw_output_path: "docs/workflow/feature-runs/native-body-scroll/reviews/plan.codex.implementation-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan implementation-adversarial

## Findings

- [UNVERIFIED] MEDIUM: The plan assumes `min-h-screen` plus `flex-1` on `<main>` still gives pages like Runs, Analysis, and SurveyResults a reliable height context for nested `h-full` layouts. That is not guaranteed once the container can grow with content, so the migration can still break sizing in overflowed states even though the plan treats it as preserved.
- [UNVERIFIED] MEDIUM: The wheel-hook rewrite narrows horizontal-scroll detection to Tailwind class names only: `overflow-x-auto` and `overflow-x-scroll`. Any horizontal scroller implemented with inline styles, CSS modules, or a different utility will silently lose wheel-to-horizontal behavior, and the plan does not include an audit or tests to prove those are the only cases in the app.
- [UNVERIFIED] MEDIUM: Switching the scroll root from `<main>` to `body` can break any other code that reads or observes main scroll state, assumes `<main>` is the scrolling boundary, or uses `main` as a root for sticky/visibility logic. The plan only updates layout, the wheel hook, and drawer locking, so this class of regression is left unaddressed.

## Residual Risks

- `sticky top-14` remains coupled to the header height. If the header height changes at any breakpoint, the nav will overlap the header or leave a gap.
- Body-only scroll lock can still cause visible layout shift when the scrollbar disappears, and some browsers may need extra handling to preserve scroll position cleanly.
- The simplified horizontal wheel behavior still assumes every horizontal container should absorb wheel input the same way. Nested vertical scrollers inside horizontal regions may need follow-up handling.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: MEDIUM (h-full in overflow): rejected — virtualized lists have own internal scroll constraint; h-full in taller main is correct. MEDIUM (class-name only): rejected — pre-existing behavior, unchanged by this PR. MEDIUM (scroll root change): deferred — no other scroll-state code found in codebase.
