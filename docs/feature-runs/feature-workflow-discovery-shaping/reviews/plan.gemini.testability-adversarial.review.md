---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/feature-runs/feature-workflow-discovery-shaping/plan.md"
artifact_sha256: "3ab646a54a85269378ab2bdcbc0e751b03773aeb35771ab86fb8de476685ecc3"
repo_root: "."
git_head_sha: "fce47f73a2542524b87e0bbf199703aaf9f3c4c6"
git_base_ref: "origin/chore/agents-md-single-source-of-truth"
git_base_sha: "fce47f73a2542524b87e0bbf199703aaf9f3c4c6"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Accepted after defining a single normalized discovery item identity, keeping all gates on one helper, and using discover --clear only for malformed or irrecoverable state."
raw_output_path: "docs/feature-runs/feature-workflow-discovery-shaping/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

1.  **Untestable Normalization Logic (High Severity):** The plan's foundation is "normalized item text," but the normalization rules are not defined. It is impossible to write reliable tests for `discover --resolve` or `discover --defer` without knowing how whitespace, casing, or special characters are handled. A test for `discover --resolve "item 1"` cannot be written if the corresponding entry in `unresolved` could be `" item 1 "` or `"Item 1"`. This ambiguity makes the core matching logic untestable.

2.  **Undefined Behavior for Malformed State (Medium Severity):** The plan does not specify how the system will react to a malformed `state.json`. If the `unresolved` or `deferred` fields exist but are not arrays (e.g., `null` or a string), will commands like `status` or checkpointing crash, or will they default to a safe "blocking" state? Tests must cover these corruption scenarios to ensure the runner is resilient.

3.  **Vague Action Definitions (Medium Severity):** The plan refers to abstract actions like "mark[ing] completion" and "spec checkpointing" without specifying the concrete commands or entry points. This prevents the creation of specific test cases. A tester cannot verify the blocking mechanism without knowing the exact command that is supposed to be blocked (e.g., `run --complete`, `spec --checkpoint`).

4.  **Destructive Operation Lacks Safeguards (Low Severity):** The plan designates `discover --clear` as a "visibly destructive" recovery path. However, it omits any mention of a confirmation prompt or a `--force` flag. Without such a safeguard, a user could accidentally wipe their discovery state. Testability is impacted as the expected behavior (interactive prompt vs. immediate action) is unknown.

## Residual Risks

1.  **Atomic Write Guarantees Are Assumed, Not Tested:** The plan states it "must preserve" existing atomic JSON write behavior but does not include work to validate this. State-changing operations (`--resolve`, `--defer`, `--clear`) remain vulnerable to producing a corrupted `state.json` if the process is interrupted mid-write. This creates a risk of unrecoverable states that may not be caught by standard integration tests.

2.  **Partial or In-Flight Migrations Are Not Addressed:** The "grandfathering" of legacy blobs is mentioned, but the plan doesn't consider states that are partially migrated. For example, a state file could contain an `unresolved` array but be missing the `deferred` array entirely. The helper logic must be tested to gracefully handle a missing `deferred` key, presumably treating it as empty, to avoid runtime errors on these edge cases.

## Token Stats

- total_input=1220
- total_output=578
- total_tokens=15302
- `gemini-2.5-pro`: input=1220, output=578, total=15302

## Resolution
- status: accepted
- note: Accepted after defining a single normalized discovery item identity, keeping all gates on one helper, and using discover --clear only for malformed or irrecoverable state.
