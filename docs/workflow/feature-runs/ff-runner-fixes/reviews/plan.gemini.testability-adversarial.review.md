---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/ff-runner-fixes/plan.md"
artifact_sha256: "dc061ea73545a86c8e1a615660bbab41b7247ccd464641c6a2d4090f1490c2e6"
repo_root: "."
git_head_sha: "b8d5934f8215b9d6e4bffd546f5abca8e9799c79"
git_base_ref: "origin/claude/friendly-aryabhata-9efbf7"
git_base_sha: "6f5ed232c83bbd0f51ac8419ac6fb9688b8b8fad"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/ff-runner-fixes/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

| Severity | Finding | Evidence |
| --- | --- | --- |
| MEDIUM | Contradictory reporting on invariant warning output creates ambiguity for monitoring. | `[UNVERIFIED]` |
| MEDIUM | The "Resolved Concerns" feature is not end-to-end testable. | `[UNVERIFIED]` |
| LOW | Integration testing is narrow, focusing on a single state without testing command sequences. | `[UNVERIFIED]` |
| LOW | The concern de-duplication strategy is acknowledged as brittle and not robustly testable against paraphrasing. | `[UNVERIFIED]` |

### MEDIUM: Contradictory reporting on invariant warning output creates ambiguity for monitoring.
The plan's risk mitigation section (Risk P3) states emphatically that invariant warnings will be emitted to `stderr` *always*, with no conditional routing. However, the `closeout.md` document (Deferred risks, R4) states that output goes to `stderr` *only when `--json` is set*. This contradiction suggests either the implementation diverged from the plan or the test assertions described in the plan (P3) are not accurately reflecting the final behavior. An operator scripting a monitoring solution against `stdout` based on the `closeout.md` document would silently miss all warnings produced in non-JSON mode, undermining the feature's value as a guardrail.

### MEDIUM: The "Resolved Concerns" feature is not end-to-end testable.
Slice 3 of the plan describes changes to `factory_pr_body.py` to render resolved concerns in a separate block. However, the plan and the `closeout.md` both confirm that the CLI flags (`--address`, `--defer`, `--dismiss`) required to change a concern's state to "resolved" were deferred. This creates a testability gap: while the rendering logic can be unit-tested with a manually crafted state file, there is no way to test the complete, user-facing workflow. An operator cannot run a command sequence to create a concern, mark it as resolved, and verify it renders correctly in the final PR body. This leaves a significant portion of the intended feature lifecycle unverified by any end-to-end test.

### LOW: Integration testing is narrow, focusing on a single state without testing command sequences.
The "Testing approach" section describes an integration test that loads a single fixture (`run-033-state-pre-fix.json`) and asserts `recommended_next_action` produces the correct output. This is a valuable regression test for a specific bug, but it does not qualify as a comprehensive integration test. It verifies the behavior at a single point in time on a static file. A more robust integration test would execute a sequence of state-mutating commands (e.g., `judge` -> `checkpoint`) to ensure the new `advance` logic correctly interacts with subsequent stages and that state transitions behave as expected. The current approach does not test the interplay between the `judge` command creating an `advance` verdict and the `checkpoint` command consuming it.

### LOW: The concern de-duplication strategy is acknowledged as brittle and not robustly testable against paraphrasing.
Slice 3 of the plan defines a concern `id` based on a hash of its stage, judge, and the first 48 characters of its reasoning. The `closeout.md` ("What remains open") correctly identifies that this approach cannot handle paraphrasing between review rounds, which would create duplicate concerns. From a testability perspective, this means it's impossible to write a test that asserts "semantically identical but textually different concerns are treated as the same." While the issue is deferred, it represents a known weakness in the current design that makes robust testing of the concern lifecycle impossible.

## Residual Risks

1.  **Monitoring Blind Spots**: Due to the unclear routing of invariant warnings (stderr vs. stdout), automated systems are at risk of monitoring the wrong output stream. If the behavior described in `closeout.md` is correct, any monitoring script that does not account for the `--json` flag will have a blind spot, potentially missing critical state contradictions.
2.  **Incomplete Feature Validation**: Because the concern lifecycle CLI was deferred, the user-facing output in the PR body related to "Resolved Concerns" has not been validated through any end-to-end testing path. Bugs in the rendering logic or state interpretation for this feature may exist undetected until the CLI is implemented.
3.  **Future Regex Drift**: The plan and closeout documents both acknowledge that the finding-detection regex may fail to parse new review formats. The reliance on a reactive invariant to detect this failure means that a broken review will be processed silently at first; the error will only be flagged later when a judge attempts to `advance` a stage that should have been blocked. This creates a window where actionable findings could be missed.

## Token Stats

- total_input=16303
- total_output=1026
- total_tokens=19799
- `gemini-2.5-pro`: input=16303, output=1026, total=19799

## Resolution
- status: open
- note: