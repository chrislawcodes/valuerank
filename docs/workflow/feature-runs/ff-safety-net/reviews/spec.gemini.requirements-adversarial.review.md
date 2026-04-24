---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ff-safety-net/spec.md"
artifact_sha256: "da09382e8c33b1717f23595ce88209107a3400a0ee13bff880353439515552d6"
repo_root: "."
git_head_sha: "50eaa7497529381b508e931325872a2a6f6ead88"
git_base_ref: "origin/main"
git_base_sha: "c07a4283ecdebffa57e8a2cccfa08c23e0f76a36"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/ff-safety-net/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

| Severity | ID | Finding |
| --- | --- | --- |
| CRITICAL | F-01 | **Ambiguous Veto Fallback:** The spec is critically divided on the `completeness` judge veto mechanism. The `Functional requirements` section (FR-001) explicitly states the new structured JSON field is the "single source of truth" and that "regex is NOT a fallback." However, the `Edge cases` and `Residual risks` (R1) sections directly contradict this, stating a regex fallback "MUST still match." For a safety-critical gate, this ambiguity is unacceptable. The behavior when the structured signal is missing or malformed must be deterministic and explicitly defined: either the veto fails open (majority rule) or fails closed (block/requires manual intervention). |
| HIGH | F-02 | **Veto Logic Can Be Bypassed or Misfired:** The veto logic in FR-003 is insufficient. It checks if a `completeness` judge's `unaddressed_high_finding_ids` are unresolved, but it fails to validate that those IDs (a) correspond to findings that are actually `HIGH` severity in the state file and (b) belong to the current stage. A judge could cite an unaddressed `MEDIUM` finding's ID, or an ID from a previous stage (`spec` instead of `plan`), and incorrectly trigger a veto. Conversely, if the prompt fails to emit the ID, the veto is silently bypassed, reverting to a majority vote and failing to stop a PR with a known HIGH issue. |
| MEDIUM | F-03 | **Redundant Work on Concurrent Execution:** The spec proposes using an existing state lock to prevent a race condition for the Garbage Collection (GC) of intermediate files (FR-014). While this prevents file corruption, it doesn't prevent a significant redundant work anti-pattern. If a second `checkpoint` process starts while another is running, it will wait for the lock, then execute its own GC (on already-deleted files) and dispatch its own, completely redundant, set of reviews. This wastes significant time and resources. The lock should prevent redundant invocations, not just concurrent writes. |
| MEDIUM | F-04 | **Unspecified Failure Mode for Judge JSON:** The spec mandates a new JSON structure from the `completeness` judge (FR-001) but fails to define the system's behavior if the LLM produces malformed or invalid JSON. Does the judge process fail entirely, requiring manual repair? Or does the system fail open, silently ignoring the veto and proceeding with a majority vote? The latter would undermine the entire feature, while the former introduces operational fragility. This failure mode must be explicitly defined. |
| MEDIUM | F-05 | **[UNVERIFIED] Test for Decorator Coverage Is Incomplete:** The proposed test for the auto-registration of mutating commands (FR-012) asserts that every subcommand handler retrieved from the `argparse` registry is decorated. This is a good check. However, it assumes a simple `func` assignment in `set_defaults`. If command dispatch logic is more complex (e.g., a single handler function that delegates to other functions based on arguments), the test may not provide full coverage. It's possible a mutating code path could exist that is not tied to a directly-decorated handler, re-introducing the original risk of silent drift. |
| LOW | F-06 | **[UNVERIFIED] GC File List is Brittle:** The spec relies on a hardcoded list of 5 glob patterns to identify intermediate files for deletion (FR-015). While this list was corrected during the spec review, its existence is a source of fragility. If a new type of intermediate file is introduced in the future, it will not be garbage-collected unless a developer remembers to update this specific list. A convention-based approach (e.g., all intermediate files must include `.intermediate.` in their name) would be more robust and scalable. |
| LOW | F-07 | **[UNVERIFIED] `init` Command Self-Check Behavior Is Undefined:** The spec correctly reclassifies the `init` command as mutating but hand-waves the consequence, stating the invariant check is "harmless" (FR-011). This is an assumption. The exact behavior of the invariant check when run against a non-existent or empty state should be explicitly defined and tested. Undefined behavior in the very first command a user runs can lead to confusion or errors. |

## Residual Risks

| ID | Risk | Mitigation / Comment |
| --- | --- | --- |
| R-01 | **Veto Ineffectiveness:** The most significant residual risk is that the `completeness` judge veto fails to fire, allowing a feature with an unaddressed `HIGH` severity finding to be merged. This can happen if (a) the judge prompt fails to elicit the structured JSON output (see F-04), or (b) the logic for cross-checking the finding ID against the state file is flawed (see F-02). The spec's reliance on a single LLM's output for a critical safety gate is inherently risky. **Recommendation:** The final "tally" logic should be the single source of truth. It should iterate through all unaddressed `HIGH` concerns for the stage; if any exist, and the judge panel outcome is `advance`, it should be programmatically overridden to `edit_and_rerun_judge` regardless of the judges' reasoning. This makes the veto a deterministic system-level rule, not a suggestion from one judge. |
| R-02 | **Developer Forgets Decorator:** A developer could add a new subcommand to the `argparse` registry but forget to apply either the `@mutates_state` or `@readonly_command` decorator to its handler. **Mitigation from Spec:** FR-012 proposes a test that enumerates all subcommands from the parser and asserts that each handler is decorated. This effectively mitigates this risk, provided the test is implemented correctly. |
| R-03 | **Incomplete State Mutation Detection:** A developer might add mutating logic to a function that is not a command handler, or to a command currently marked `@readonly_command`. This would bypass the invariant self-check. **Mitigation:** This is a fundamental limitation of the proposed approach. The check only runs after decorated mutating commands. Mitigating this would require a much more complex static analysis tool. This risk should be explicitly accepted. |
| R-04 | **GC Deletes Necessary Debugging Artifacts:** A developer debugging a failed run might have their intermediate files deleted by a subsequent `checkpoint` command, losing valuable context. **Mitigation from Spec:** The `--keep-intermediates` flag (FR-017) provides a manual override. While a more ergonomic stateful config could be considered, the specified flag is a sufficient mitigation for the immediate risk. |

## Token Stats

- total_input=17686
- total_output=1471
- total_tokens=21494
- `gemini-2.5-pro`: input=17686, output=1471, total=21494

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
