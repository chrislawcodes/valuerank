---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ff-codex-reintegration/spec.md"
artifact_sha256: "16effc541de3cc35fdd5ef8aa7458c1fc6730903c9395db4307b96eefc07ec98"
repo_root: "."
git_head_sha: "80a77301dc580237a047b7093138f47ab77402ee"
git_base_ref: "origin/main"
git_base_sha: "80a77301dc580237a047b7093138f47ab77402ee"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/ff-codex-reintegration/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

### Severity: HIGH

1.  **Skipped Check Masquerades as Success**: Per FR-009a, the boolean compatibility shim for the `check_implementation_rule` return tuple `(status, message)` maps `"skipped"` to `False`. This is dangerous. It means a failure to even *run* the check (e.g., in a shallow-clone CI environment where a branch base cannot be found) is treated the same as `"ok"` (below threshold). This violates the "honest skip" principle of Fix 5, creating a silent hole in the quality gate. A skipped check should be neutral or require explicit acknowledgement, not be treated as a pass.
2.  **Runner Can Hang Indefinitely**: FR-002 specifies invoking `codex exec` via `subprocess.run`. However, nowhere in the spec is the use of a `timeout` argument mentioned. Since `codex exec` involves network calls to an LLM, it is subject to hangs, network latency, or unexpected remote issues. Without a timeout, the entire `dispatch-codex` command and thus the FF runner can hang indefinitely, blocking the workflow entirely.

### Severity: MEDIUM

1.  **Performance Degradation in Core Workflow**: FR-008a and FR-008b introduce expensive `git diff` re-computation logic within the `check_implementation_rule` function, which is called during the `deliver` step. This logic runs for each dispatch entry if the branch base is null or has drifted. On a branch with many dispatches, or with old dispatch SHAs, these repeated `git` operations could introduce significant, noticeable latency to a core workflow command, degrading the operator experience. This hidden performance cost is not acknowledged.
2.  **Brittle "Magic Number" Threshold**: The 50-line drift threshold for freshness (FR-008) is an arbitrary, hardcoded value. A legitimate, small post-Codex change (e.g., running a formatter, adding comments, minor refactoring) could easily exceed this limit, causing the implementation WARN to fire incorrectly (a false positive). Conversely, a significant manual edit could fall just under the limit. The lack of configurability for this threshold makes the check brittle and likely to require future adjustments.
3.  **[UNVERIFIED] Incomplete UI Rename**: The plan for Fix 4 relies on `find-replace` and `grep` (SC-005) to rename the banner string from `repair_X_checkpoint` to `run_X_checkpoint`. This approach may fail to identify and update instances where the banner string is constructed dynamically or imported from a different module. This could lead to a confusing user experience where the old "repair" terminology still appears in some contexts, undermining the goal of the change.
4.  **Rebase Incompatibility**: The freshness check in Fix 2 (FR-008) uses `git merge-base --is-ancestor <entry.head_sha> HEAD` to validate the dispatch. This check will fail if the feature branch has been rebased, as rebasing creates new commit SHAs. Since rebasing is a common practice in many git workflows, this makes the freshness check fragile and liable to fail on legitimate, clean branches, incorrectly triggering the implementation rule WARN.

### Severity: LOW

1.  **Toothless Validation on Escape Hatch**: The `advance` subcommand's only validation is a 20-character minimum on the reason string (FR-013). The spec acknowledges this is a weak check for a command that intentionally bypasses manifest health checks. It allows for meaningless reasons (e.g., `"aaaaaaaaaaaaaaaaaaaa"`) to be recorded, weakening the audit trail and increasing the risk of an operator carelessly pushing a broken state forward.
2.  **Asymmetric Naming Convention**: Fix 4 renames the happy-path banner to `run_X_checkpoint` but deliberately leaves the CLI subcommand named `repair` (FR-017). While the intent is to distinguish the "run" action from the "repair" command, this creates a terminological asymmetry that could be confusing to operators, who see one term in the runner's output but must use a different one to act in certain situations.

## Residual Risks

Even if all the above findings are addressed, the following risks will remain:

1.  **Brittle Dependency on CLI Tooling**: The entire workflow's reliability is tightly coupled to the specific behavior and command-line interface of external tools, primarily `git` and `codex exec`. Unannounced changes to these tools, or subtle differences in their behavior across versions or environments (e.g., git version, reflog availability), can still break the runner in unexpected ways.
2.  **Heuristic Limitations**: The core implementation rule remains a line-count heuristic. It is a crude proxy for contribution size and cannot distinguish between simple boilerplate and complex logic. A large, simple change could trigger the WARN, while a small, complex, and incorrect manual change could pass unnoticed.
3.  **Operator Error**: The workflow provides powerful escape hatches (`advance`, `--override-implementation-rule`). The integrity of the process still fundamentally relies on the operator being diligent, providing meaningful reasons for overrides, and correctly interpreting the runner's output (e.g., noticing a "skipped" message in noisy CI logs). Careless use of these tools can still subvert the quality gates.

## Token Stats

- total_input=6100
- total_output=1152
- total_tokens=23538
- `gemini-2.5-pro`: input=6100, output=1152, total=23538

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
