---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflows/workflow-two-mode-implementation/plan.md"
artifact_sha256: "8090f0a202a24b90d3c0fb14c976a2e2d628f3cddc1f023c07016ff9844dcd90"
repo_root: "."
git_head_sha: "d5d05171abe1c55f411c5ca826872b49c50849cd"
git_base_ref: "origin/main"
git_base_sha: "c165a36bfd702090296714c081e0deed98c02892"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Accepted: regex anchored to end of line, line endings normalized before hash, markers_sha captured once at diff start. Handoff open-decisions made concrete (stage + active block + unresolved reviews). Deferred: rebase SHA ordering (merge-base on dangling ref fails naturally), git test harness (mocks used), documentation forking (self-contained guide is design intent), mypy (out of scope), CLAUDE.md path (reviewer incorrect — ~/.claude/CLAUDE.md is correct global path), indented checkpoints (top-level only by design)."
raw_output_path: "docs/workflows/workflow-two-mode-implementation/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

1.  **Git State Brittleness in Checkpoint Validation:** The plan relies on `git cat-file` and `git merge-base --is-ancestor` to validate the `last_diff_head_sha`. This logic is sound for the described failure modes (rebase, amended commits). However, it is difficult to test exhaustively. An automated test suite would need to programmatically manipulate Git history (e.g., perform `git rebase -i`, `git commit --amend`) to simulate these non-linear history events. Without such a test harness, validation of this core resiliency feature will be manual and prone to gaps, leaving a high risk of failure if a developer uses a slightly different Git workflow than anticipated.

2.  **SHA Calculation is Underspecified and Platform-Dependent:** The plan states the `markers_sha` is a `sha256` of the matched marker lines. It omits whether line endings should be normalized (LF vs. CRLF). If `tasks.md` is edited on Windows (CRLF) and the runner executes on Linux (LF), the SHA will mismatch, causing checkpoint progress to reset unexpectedly. This makes the feature's behavior dependent on the user's environment and complicates writing reliable, cross-platform tests.

3.  **Untestable Orchestrator Protocols:** Slice A specifies critical operational constraints for the Codex agent, such as "Gemini must be called serially" and a "retry once, then `block`" failure protocol. These rules exist only in a markdown document. There is no proposed technical mechanism to enforce or even monitor compliance. This makes the protocol untestable and effectively unenforceable. A misbehaving or buggy orchestrator could violate these rules silently.

4.  **Implicit Test Dependencies for State Advancement:** The plan mandates that checkpoint state only advances after `run_verify_checkpoint` succeeds. This is a critical transactional guarantee. However, testing the negative path (where `run_verify_checkpoint` fails and state does *not* advance) requires a reliable way to induce failure in that specific step. The plan does not describe a mechanism for this, making a key success criterion untestable without ad-hoc or manual intervention.

## Residual Risks

1.  **Documentation Drift Between Repositories:** The plan correctly identifies that `~/.claude/CLAUDE.md` is outside the repository and can drift from the canonical skill definitions. The stated mitigation is a note in a separate document, which is a human process, not a technical control. This remains a significant risk; the handoff protocol documented for one agent can easily become outdated if the other agent's skills or operational requirements change, leading to workflow failures that CI cannot prevent.

2.  **Regex Ambiguity in `tasks.md`:** The regex `^\s*([-*]|\d+\.|-\s+\[[ xX]\])\s+.*\[CHECKPOINT\]` is designed to find checkpoint markers in list items. It does not prevent matching on lines that are commented out within the markdown file (e.g., `<!-- - [ ] Old checkpoint [CHECKPOINT] -->`). This could lead to an incorrect `marker_count` and subsequent validation failures if developers comment out, rather than delete, old checkpoint lines.

## Token Stats

- total_input=2290
- total_output=686
- total_tokens=17016
- `gemini-2.5-pro`: input=2290, output=686, total=17016

## Resolution
- status: accepted
- note: Accepted: regex anchored to end of line, line endings normalized before hash, markers_sha captured once at diff start. Handoff open-decisions made concrete (stage + active block + unresolved reviews). Deferred: rebase SHA ordering (merge-base on dangling ref fails naturally), git test harness (mocks used), documentation forking (self-contained guide is design intent), mypy (out of scope), CLAUDE.md path (reviewer incorrect — ~/.claude/CLAUDE.md is correct global path), indented checkpoints (top-level only by design).
