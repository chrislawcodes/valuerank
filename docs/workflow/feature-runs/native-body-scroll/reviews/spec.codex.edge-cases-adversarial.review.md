---
reviewer: "codex"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/native-body-scroll/spec.md"
artifact_sha256: "c3f28ca0cc81fd899d8e67bc9eebaf846d20cb5f095d8d57ec9c784738f9d68a"
repo_root: "."
git_head_sha: "f08458578d016a539c10d9e5a66642e94f706aa1"
git_base_ref: "origin/main"
git_base_sha: "abe39ae0d4893c5db5b2ece4889efdfd4cbc4d91"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/native-body-scroll/reviews/spec.codex.edge-cases-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

- MEDIUM [UNVERIFIED] `NavTabs.tsx` uses `sticky top-14`, which hard-codes the header height as 56px. That only works if the header never changes height across breakpoints, content states, or future controls. Any height drift will make the nav overlap the header or leave a gap.
- MEDIUM [UNVERIFIED] The spec assumes `flex-1` on `<main>` is enough to preserve all `h-full flex flex-col` descendants after removing the scroll container. That is not proven in the artifact, and pages that depended on `<main>` as the bounded scroll ancestor can regress into double scroll or mis-sized layouts.
- MEDIUM Body-only scroll locking is not sufficient on some mobile browsers, especially iOS Safari. `document.body.style.overflow = 'hidden'` can still allow background rubber-banding or scroll leakage, so the drawer can fail to fully freeze the page in the edge case that matters most for touch users.

## Residual Risks

- Sticky positioning can fail if any ancestor of the header or nav has an overflow, transform, or containment rule that changes the sticky containing block.
- Content targeted by hash links, focus jumps, or validation errors may land under the sticky header/nav unless the layout adds matching scroll padding elsewhere.
- The wheel-hook edge detection is only specified at a high level. If the hook is reused outside the intended table scrollers, it could still intercept wheel input in places the spec does not account for.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
