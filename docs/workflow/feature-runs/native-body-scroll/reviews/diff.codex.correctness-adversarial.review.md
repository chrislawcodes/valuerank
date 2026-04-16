---
reviewer: "codex"
lens: "correctness-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/native-body-scroll/reviews/implementation.diff.patch"
artifact_sha256: "5a5fc78dd9a4fae1432450312ff9d80771a1e1f63ac3c8e7ca6fe38d7f795854"
repo_root: "."
git_head_sha: "99973c909a487332913c5daab45738abdde7b2e2"
git_base_ref: "origin/main"
git_base_sha: "abe39ae0d4893c5db5b2ece4889efdfd4cbc4d91"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "MEDIUM (class-name only): rejected — pre-existing behavior, original hook was also class-based by design. MEDIUM (redirect on mixed-axis): deferred — theoretical, no overflow-x-auto elements with vertical overflow coexist in codebase; edge detection mitigates. MEDIUM (main no longer bounded): rejected — this is the intended change (body scroll architecture)."
raw_output_path: "docs/workflow/feature-runs/native-body-scroll/reviews/diff.codex.correctness-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff correctness-adversarial

## Findings

- [UNVERIFIED] MEDIUM: `useHorizontalScrollOnWheel` no longer identifies the actual scrollable ancestor by computed overflow. It now only matches literal `overflow-x-auto` / `overflow-x-scroll` class tokens, so any container whose horizontal scrolling comes from responsive variants, conditional class composition, or non-Tailwind CSS will be skipped. In those cases the wheel-to-horizontal behavior will silently stop working.
- [UNVERIFIED] MEDIUM: The same hook now redirects wheel input for any matched `overflow-x-*` element, even if that element also scrolls vertically. The previous behavior only redirected on horizontal-only containers, so this change can steal normal vertical scrolling inside mixed-axis panels and tables until the horizontal edge is reached.
- [UNVERIFIED] MEDIUM: Removing `min-h-0 overflow-auto` from the layout `main` changes the app shell from a bounded scroll region to body-level scrolling. Any page content that depended on `main` being the scroll container or on flex children being allowed to shrink can now overflow the viewport or lose internal scrolling.

## Residual Risks

- The drawer scroll lock was simplified to body-only, so it still needs browser coverage on pages with different root-scroll behavior, especially mobile Safari.
- The new wheel hook should be smoke-tested on layouts with nested horizontal and vertical scrollers, since it now depends on exact class names and edge detection instead of computed scrollability.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: MEDIUM (class-name only): rejected — pre-existing behavior, original hook was also class-based by design. MEDIUM (redirect on mixed-axis): deferred — theoretical, no overflow-x-auto elements with vertical overflow coexist in codebase; edge detection mitigates. MEDIUM (main no longer bounded): rejected — this is the intended change (body scroll architecture).
