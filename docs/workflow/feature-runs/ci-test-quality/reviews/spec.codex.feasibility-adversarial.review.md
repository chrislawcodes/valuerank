---
reviewer: "codex"
lens: "feasibility-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ci-test-quality/spec.md"
artifact_sha256: "1cc61fd22c02c9a7b5294adfdb3c89c71d680ba371b2142f8fdd97e952a9e0bf"
repo_root: "."
git_head_sha: "2c5aac580a13a7d49fc70672b5d33f584cdc9c62"
git_base_ref: "origin/main"
git_base_sha: "6396d4f22128d811613f066211f9318ead37f425"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/ci-test-quality/reviews/spec.codex.feasibility-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec feasibility-adversarial

## Findings

- MEDIUM - US-8 is internally unsafe as written. `vi.stubGlobal(...)` does not get reliably undone by `restoreAllMocks`, so the allowed cleanup path can leak patched globals into later tests. The spec should require `vi.unstubAllGlobals()` in `afterEach`, or explicitly require Vitest global unstubbing support.
- MEDIUM [UNVERIFIED] - US-1 assumes `--force` is enough to eliminate stale `dist/` output, but the spec never requires a clean of generated artifacts. If the build leaves old files behind, a cache-bypassed rebuild can still preserve stale exports or types. The acceptance test also only checks a new export, not removed or renamed exports.
- MEDIUM [UNVERIFIED] - US-2 drops the entire `src/**/*.test.ts` include pattern, but only names three files that should be removed or moved. If any other unique `src` tests exist, they will stop running with no warning. The spec needs an exhaustive inventory or a stronger guard before removing that glob.
- MEDIUM - US-5 uses file splitting and line count as the success signal for shard balance, but that does not prove the CI shards will be balanced. Vitest shards by file count, not LOC, so a few still-expensive files can end up on the same shard and keep the bottleneck. The spec needs a timing-based target, not just smaller files.
- MEDIUM - US-7 makes the helpers awaitable but keeps the error-swallowing behavior. That means `await trackXxxAccess(...)` can still resolve successfully even if the underlying write failed, so the new seam may not actually validate the access-tracking path. The spec should say what observable side effect the tests will assert.

## Residual Risks

- Web-test shard timing may still be uneven after the split if one or two files remain much slower than the rest.
- The API duplicate-test cleanup may expose additional legacy `src/` tests or path quirks that are not named in the spec.
- The CI cache changes may interact with other job setup details, such as Node version or package-manager differences, in ways this spec does not cover.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
