---
reviewer: "codex"
lens: "regression-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/native-body-scroll/reviews/implementation.diff.patch"
artifact_sha256: "5a5fc78dd9a4fae1432450312ff9d80771a1e1f63ac3c8e7ca6fe38d7f795854"
repo_root: "."
git_head_sha: "99973c909a487332913c5daab45738abdde7b2e2"
git_base_ref: "origin/main"
git_base_sha: "abe39ae0d4893c5db5b2ece4889efdfd4cbc4d91"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/native-body-scroll/reviews/diff.codex.regression-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff regression-adversarial

## Findings

- [MEDIUM][UNVERIFIED] `cloud/apps/web/src/components/layout/Layout.tsx` changes the shell from a fixed-height layout with an internal scroll region to page-level scrolling. Removing `overflow-auto min-h-0` from `<main>` means long pages will now scroll the whole document, so `Header` and `NavTabs` will no longer stay pinned and any code that assumed `<main>` was the scroll root can break.
- [MEDIUM][UNVERIFIED] `cloud/apps/web/src/hooks/useHorizontalScrollOnWheel.ts` now hijacks wheel input based on a literal `overflow-x-auto` / `overflow-x-scroll` class match instead of actual scroll behavior. That means a container that also needs vertical scrolling can still get its vertical wheel gestures redirected sideways, which is a regression from the old “horizontal-only” check.

## Residual Risks

- [UNVERIFIED] `cloud/apps/web/src/components/models/ModelValueDetailDrawer.tsx` now only locks `body`. If any route still scrolls through a different ancestor, the background can remain scrollable under the drawer.
- [UNVERIFIED] The wheel hook now depends on exact Tailwind class names. Any horizontally scrollable container styled through other CSS paths will lose the wheel-to-horizontal behavior and fall back to normal page scrolling.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
