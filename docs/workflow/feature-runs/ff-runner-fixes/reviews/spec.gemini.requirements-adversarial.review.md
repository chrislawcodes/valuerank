---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ff-runner-fixes/spec.md"
artifact_sha256: "026757984d1f921d93c5a73e8885d9882a5c0c36b55f767bdabe655968cbeae0"
repo_root: "."
git_head_sha: "95c4e50c40146980f88be52ac1f48cf3170178fc"
git_base_ref: "origin/claude/friendly-aryabhata-9efbf7"
git_base_sha: "6f5ed232c83bbd0f51ac8419ac6fb9688b8b8fad"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Round-2 MEDIUM findings: #1 (dismiss backdoor) — accepted as known limitation; CLI is deferred anyway. #2 (post-judge drift) — accepted; manifest reseal annotation preserves audit trail; strict-mode require-re-review-on-drift is follow-up. #3 (warnings non-blocking) — intentional design; breaking workflow on warning defeats Fix 8's purpose; operator decides via status. LOW #4 (assumption 7 interaction) — addressed: assumption 7 rewritten to acknowledge runtime interaction. LOW #5 (id brittleness) — tracked as Risk R5."
raw_output_path: "docs/workflow/feature-runs/ff-runner-fixes/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

### 1. Unilateral Dismissal of Judge Findings Bypasses Review
**Severity**: MEDIUM
**Evidence**: `[UNVERIFIED]`

FR-004 introduces `checkpoint --dismiss <concern-id> --reason <text>`, which allows an orchestrator to unilaterally dismiss a concern raised by a judge. This creates a procedural backdoor that bypasses the core adversarial loop of the Feature Factory. While the dismissal is recorded in the PR body (FR-005a), it relies on human vigilance during code review to catch abuse. A malicious or lazy orchestrator could systematically dismiss valid, high-severity findings to force a feature through, defeating the purpose of the judge panel. This contradicts the spirit of a robust, audited workflow and is analogous to a developer force-merging a PR with failing checks.

### 2. Blind Acceptance of Post-Judge Artifact Drift
**Severity**: MEDIUM
**Evidence**: `[UNVERIFIED]`

FR-002 mandates that if a judge votes `advance` but the artifact has been edited (SHA has drifted), the runner should simply "reseal the manifest" and record the drift. This policy implicitly accepts all post-judge edits without review or validation. The judge panel's verdict is valid only for the specific artifact SHA they reviewed. Advancing with a different SHA breaks the chain of custody and invalidates their approval. The annotation `reason: "post-judge-edits-only"` (FR-002) is a weak assumption that dangerously trusts the nature of these untracked changes, which could range from trivial typo fixes to the introduction of new bugs or security flaws.

### 3. State Contradictions Are Downgraded to Non-Blocking Warnings
**Severity**: MEDIUM
**Evidence**: `[UNVERIFIED]`

FR-009 specifies that when the invariant self-check detects a state contradiction—the very problem that caused the bug in run-033—the runner MUST NOT abort. Instead, it logs a warning and continues. This prioritizes workflow liveness over correctness. In a fully automated run, there may be no operator present to see the `stderr` warning, allowing the runner to proceed in a known-bad state. This could lead to downstream errors, corrupted artifacts, or invalid conclusions. While `status` makes the warning discoverable later (FR-011), it does not prevent the immediate damage of operating on a faulty state. This approach is inconsistent with a safety-critical design.

### 4. False Assumption of Non-Interaction Between Fixes
**Severity**: LOW
**Evidence**: `[UNVERIFIED]`

Assumption 7 incorrectly claims, "The three fixes do not interact at runtime." This is false.
- Fix 2 (regex for findings) directly impacts the `healthy` status of a review reconciliation.
- Fix 8 (invariant self-check) explicitly reads the `recommended_next_action` (affected by Fix 1) and the stage health (affected by Fix 2, per FR-011b) to detect contradictions.
The fixes are clearly interdependent. Building and testing them as if they are isolated could lead to integration bugs and incomplete validation, as a fix for one might mask or alter the behavior of another.

### 5. Brittle Concern ID Generation Will Cause User Friction
**Severity**: LOW
**Evidence**: `[UNVERIFIED]`

FR-003 specifies that a concern's unique ID is derived from the first 48 characters of its reasoning. This is acknowledged as a risk (R5) but its impact is understated. This implementation is brittle and will likely cause near-term usability problems. A judge rephrasing the beginning of their finding between rounds—a common occurrence—will generate a new ID for the same underlying issue. This will pollute the `unresolved_concerns` list with duplicates, creating confusion and forcing the orchestrator to manually track and address multiple IDs for a single logical finding, adding the exact kind of friction this feature aims to remove.

## Residual Risks

The spec's "Residual Risks" section is well-considered. The following points expand on those risks or introduce new ones based on the findings above.

-   **Risk**: The `checkpoint --dismiss` command becomes a standard procedure for ignoring inconvenient findings, degrading the integrity of the judge panel. The verification for this (manual PR review of the "resolved concerns" block) is a weak, lagging control against an immediate, systemic bypass.
-   **Risk**: The manifest resealing feature (FR-002) is used to knowingly push un-reviewed changes. An annotation of drift is insufficient audit if the changes introduce a critical flaw, as the damage is already done when the advance occurs. The system lacks a "break-glass" ceremony for this action, treating it as routine.
-   **Risk**: An automated orchestrator, operating without direct human supervision, enters a contradictory state, logs an `invariant_warning`, and continues operating. The unattended warning leads to a cascade of failures or a subtly incorrect final artifact that is not caught until much later.
-   **Risk**: The complexity of the actionable finding regex (FR-006) leads to a ReDoS (Regular expression Denial of Service) vulnerability. A malicious or malformed review artifact could cause the `auto-reconcile` step to hang, halting the workflow.

## Token Stats

- total_input=21063
- total_output=1127
- total_tokens=25813
- `gemini-2.5-pro`: input=21063, output=1127, total=25813

## Resolution
- status: accepted
- note: Round-2 MEDIUM findings: #1 (dismiss backdoor) — accepted as known limitation; CLI is deferred anyway. #2 (post-judge drift) — accepted; manifest reseal annotation preserves audit trail; strict-mode require-re-review-on-drift is follow-up. #3 (warnings non-blocking) — intentional design; breaking workflow on warning defeats Fix 8's purpose; operator decides via status. LOW #4 (assumption 7 interaction) — addressed: assumption 7 rewritten to acknowledge runtime interaction. LOW #5 (id brittleness) — tracked as Risk R5.
