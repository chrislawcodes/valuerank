---
reviewer: "gemini"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflows/workflow-two-mode-implementation/spec.md"
artifact_sha256: "6a9162c44c522b4ba324a736f6fa0cbea04fa1ce681afae46f22ef5b043f0e15"
repo_root: "."
git_head_sha: "d5d05171abe1c55f411c5ca826872b49c50849cd"
git_base_ref: "origin/main"
git_base_sha: "c165a36bfd702090296714c081e0deed98c02892"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Token handoff trigger: accepted — spec now says milestone/human-initiated. Global config state flaw: rejected — CLAUDE.md holds protocol instructions only; block note (transient state) goes in workflow.json via block command. Undefined checkpoint mechanism and first-checkpoint base: accepted — spec now defines checkpoint_progress struct with SHA and explicit first-run behavior. tasks.md mutability: accepted — marker_count stored for drift detection. Advisory checkpoints and model brittleness: deferred — out of scope."
raw_output_path: "docs/workflows/workflow-two-mode-implementation/reviews/spec.gemini.edge-cases-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

### High Severity

1.  **Protocol Stored in User-Local, Not Project-Local, Config:** The spec requires the "Handoff to Codex Orchestrator" protocol to be added to `~/.claude/CLAUDE.md`. This is a critical flaw. Workflow protocols must be versioned with the project repository to ensure that any developer or CI/CD environment can execute the workflow reproducibly. Storing it in a user's home directory makes the protocol non-portable and inaccessible to other agents or humans operating in different environments. This undermines the goal of a robust, shared workflow.
2.  **State Handoff Relies on Unstructured Strings:** The handoff mechanism for both Claude-to-Codex and Codex-to-Claude relies on a free-text `reason` string within the `workflow.json` `block` note (e.g., `"Claude session ended at <phase>. Open decisions: <list>"`). This is extremely brittle. A minor formatting change, an unexpected character in the open decisions list, or a different phrasing by the AI could break the parsing logic of the receiving agent. State handoff should use a dedicated, structured object in `workflow.json` (e.g., `handoff_state: { from: "claude", to: "codex", open_decisions: ["decision1", "decision2"] }`) to be robust.
3.  **Checkpoint State Vulnerable to Git History Rewrites:** The `[CHECKPOINT]` mechanism relies on storing a `last_diff_head_sha` to use as a git diff base. If a developer or agent amends a commit or rebases the branch, that SHA can become invalid or detached. The spec only accounts for a *missing* SHA, not an *invalid* one. An attempt to diff against a nonexistent commit SHA will cause the runner to error out, halting the workflow. The fallback logic must explicitly handle git errors by reverting to a full branch diff.

### Medium Severity

1.  **Documentation Forking Creates Staleness Risk:** The spec mandates that the `CODEX-ORCHESTRATOR.md` guide should *copy* the "Escalation Protocol" from `SKILL.md`. This creates two sources of truth. When the authoritative protocol in `SKILL.md` is updated, the copy in the Codex guide will become stale, leading to inconsistent behavior. The guide should reference the section in `SKILL.md` and instruct Codex to read it directly, not copy it.
2.  **Ambiguous Handoff Triggers:** The trigger for Claude to hand off to Codex is defined as "at natural milestones" or "when context feels long". These triggers are subjective and non-deterministic, which will lead to inconsistent application of the two-mode workflow. The protocol requires concrete, machine-verifiable triggers (e.g., "after a `[CHECKPOINT]` review is completed," "after N tasks are completed").
3.  **Weak Checkpoint Integrity Check:** The runner validates `tasks.md` changes by comparing the current number of `[CHECKPOINT]` markers against a stored `marker_count`. This check is too weak. It would not detect the reordering, renaming, or modification of checkpoint sections, only their addition or deletion. A more robust integrity check would be to store a hash of the file content or of the checkpoint lines themselves.

### Low Severity

1.  **Failure Recovery is Under-Specified:** The Codex guide's instruction to "retry once, then `block`" for a failed command is a blanket policy. It doesn't distinguish between transient errors (like network timeouts), which might benefit from more retries with backoff, and deterministic errors (like a failing unit test), where any retry is futile. This can lead to inefficient or ineffective error handling.
2.  **No Mechanism to Revisit Checkpoints:** The `checkpoint_progress` index is only specified to advance. The spec omits any mechanism to "rewind" or "reset" to a previous checkpoint. This imposes a strictly linear workflow, which is unrealistic; development often requires revisiting and reworking previous steps. Without a way to move backward, the agent's only recourse would be to manually revert commits and state, which is error-prone.

## Residual Risks

1.  **Orchestrator Drift:** The entire workflow's integrity depends on AI agents correctly interpreting and following markdown documents (`CODEX-ORCHESTRATOR.md`, `CLAUDE.md`, `SKILL.md`). Future model versions may interpret the instructions differently, causing "behavioral drift" that breaks the workflow in subtle ways. The system lacks a mechanism to continuously verify that agent behavior conforms to the documented protocols.
2.  **Git State Corruption:** While the spec addresses some state management, it's vulnerable to manual `git` operations. An agent or human performing a `git reset` or `git rebase` outside the workflow's purview can invalidate checkpoint SHAs and desynchronize the workflow state from the repository state without the runner's knowledge, leading to unpredictable diffs and potential loss of work.
3.  **Partial Adoption:** Because adding `[CHECKPOINT]` markers to `tasks.md` is "advisory only" and not enforced, there is a significant risk that the feature goes unused. The primary benefit of scoped diffs will not be realized if agents or humans forget or choose not to add the markers, diminishing the value of the implementation effort.

## Token Stats

- total_input=2353
- total_output=1157
- total_tokens=16992
- `gemini-2.5-pro`: input=2353, output=1157, total=16992

## Resolution
- status: accepted
- note: Token handoff trigger: accepted — spec now says milestone/human-initiated. Global config state flaw: rejected — CLAUDE.md holds protocol instructions only; block note (transient state) goes in workflow.json via block command. Undefined checkpoint mechanism and first-checkpoint base: accepted — spec now defines checkpoint_progress struct with SHA and explicit first-run behavior. tasks.md mutability: accepted — marker_count stored for drift detection. Advisory checkpoints and model brittleness: deferred — out of scope.
