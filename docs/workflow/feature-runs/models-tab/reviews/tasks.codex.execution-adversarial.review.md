---
reviewer: "codex"
lens: "execution-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/models-tab/tasks.md"
artifact_sha256: "8b7f076f7c42784baccc12ba4ea84f4d3675c8f1e492a81f3ded60058b2b467a"
repo_root: "."
git_head_sha: "de250c0d1d4a72072cffae43adf8b1a9a2b2554e"
git_base_ref: "origin/main"
git_base_sha: "b26923fbe83c2c0ec86c80180073de00a4461626"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Active-model seeding added to A2 step 8: all active models appear in output even without snapshot data. Math helpers are specified in plan.md; tasks reference plan. Keyboard semantics are out of scope for V1."
raw_output_path: "docs/workflow/feature-runs/models-tab/reviews/tasks.codex.execution-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks execution-adversarial

## Findings

- [MEDIUM] The stability math is not pinned down enough to implement safely. Slice A says `computeStabilityScore` should use the "spec MAD formula," but the artifact never states the exact formula, normalization, or rounding rules. Slice C then uses hard thresholds (`< 75`, `>= 50`) on that score, so even a small interpretation mismatch will change which cells are shown as stable or low-stability.
- [MEDIUM] The plan leaves the core aggregation logic untested. The resolver has several failure-prone steps: snapshot dedupe, parse-error skipping, weighted pooling, and stability scoring. Lint, build, and codegen will not catch a wrong calculation or a bad edge case in malformed snapshots. This is the main correctness risk in the feature, so it needs explicit test coverage.
- [MEDIUM][UNVERIFIED] The web/API contract for value keys is split and underspecified. Slice B3 says to "use the string array directly or import from wherever domainAnalysis.ts gets it," instead of naming one shared source of truth. That creates a real drift risk between the API resolver, GraphQL query, and table headers if the value-key set changes. This depends on the current codebase layout, so it is unverified.

## Residual Risks

- The artifact still depends on `plan.md` for the exact SDL, query text, value labels, and tooltip wording. If that file disagrees with these tasks, the implementation can still drift.
- I could not verify any existing drawer, domain selector, or codegen patterns because no code context was provided. Any task that says "reuse existing hook/pattern" still has integration risk until the current code is checked.
- The feature has no explicit performance guardrails. If the snapshot table is large, the resolver's full scan, dedupe, and per-model aggregation could become slow without an index or query shape review.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Active-model seeding added to A2 step 8: all active models appear in output even without snapshot data. Math helpers are specified in plan.md; tasks reference plan. Keyboard semantics are out of scope for V1. 