---
reviewer: "codex"
lens: "execution-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/ci-test-quality/tasks.md"
artifact_sha256: "0a441d895cf14f6cec6ad43953b97c93c5b4d280c01f8338d6ac3664867726cd"
repo_root: "."
git_head_sha: "2c5aac580a13a7d49fc70672b5d33f584cdc9c62"
git_base_ref: "origin/main"
git_base_sha: "6396d4f22128d811613f066211f9318ead37f425"
generation_method: "codex-runner"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/ci-test-quality/reviews/tasks.codex.execution-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks execution-adversarial

## Findings

- **Medium [UNVERIFIED]** T-01 and T-02 do not fully close the test-discovery loop. The plan removes the `src/**/*.test.ts` glob and moves only two named tests, but it never requires a verification step that all remaining tests are now discovered from `tests/`. If any `src` tests are left behind, CI will silently stop running them.
- **Medium [UNVERIFIED]** T-03 weakens the CI gate by adding `--force` to the shared web build. That can hide a real build failure instead of fixing it, which makes the job look green while shipping broken output or stale artifacts.
- **Medium [UNVERIFIED]** T-06 changes return types to `Promise<void>`, but the plan only mentions updating tests in T-07. It does not require auditing call sites for code that may still depend on a return value or synchronous behavior. That makes the change riskier than a simple test cleanup.
- **Low [UNVERIFIED]** The task list skips `T-11` and `T-12` with no note. That makes it harder to tell whether two tasks were intentionally removed or accidentally omitted, which is a small but real execution risk for a multi-wave plan.

## Residual Risks

- **[UNVERIFIED]** The plan assumes the moved tests will still be covered by Vitest after the config change. If the new glob is wrong, coverage will drop without an obvious failure.
- **[UNVERIFIED]** The large-file split tasks may move flakiness around instead of fixing it if shared fixtures or setup logic are not extracted cleanly.
- **[UNVERIFIED]** The `waitFor` changes in T-09 and T-10 may reduce flakes, but they can also mask real async timing issues if the underlying state transitions are not asserted tightly enough.
- **[UNVERIFIED]** The global stub change in T-08 only names one file. If the same save/restore pattern exists elsewhere, the broader safety problem will remain.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: open
- note: 