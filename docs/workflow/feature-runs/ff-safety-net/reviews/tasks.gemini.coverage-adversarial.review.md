---
reviewer: "gemini"
lens: "coverage-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/ff-safety-net/tasks.md"
artifact_sha256: "d2a0b32ba24a43fed1299cdc5ee764e79186d87c51270085ebeb2863df90ca6b"
repo_root: "."
git_head_sha: "2b6558ee1c419e962fa35df03d175ab68715997a"
git_base_ref: "origin/main"
git_base_sha: "c07a4283ecdebffa57e8a2cccfa08c23e0f76a36"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/ff-safety-net/reviews/tasks.gemini.coverage-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks coverage-adversarial

## Findings

| Severity | ID | Finding |
| --- | --- | --- |
| **HIGH** | F-01 | **Completeness Veto Can Be Bypassed by an Incomplete LLM Response.** The veto logic in `T3.3` only checks if at least one of the `unaddressed_high_finding_ids` provided by the `completeness` judge corresponds to an unresolved concern. It does not validate that the LLM has identified *all* unresolved HIGH concerns. A lazy or faulty LLM could block but only list one of three open HIGH concerns. If a developer addresses only that single concern, the veto will not fire on the next run, and the artifact will advance despite the remaining two open HIGH concerns. This undermines the feature's core safety guarantee. |
| **MEDIUM** | F-02 | **Critical Safety Check is Only Applied to One of Twelve Mutating Commands.** The "init safety" test (`T1.7`) validates that `check_judge_advance_vs_recommended` passes on the state produced by `command_init`. However, this slice introduces eleven other state-mutating commands (`checkpoint`, `judge`, `reconcile`, etc.). The plan does not include tests to verify that these other commands do not leave the system in a state that would cause the judge to make a bad recommendation. This is a significant gap in test coverage for a critical cross-command invariant. |
| **MEDIUM** | F-03 | **[UNVERIFIED] Stale Data Can Cause Veto Failure.** The `completeness` judge relies on review files to populate `unaddressed_high_finding_ids`. The veto logic in `T3.3` compares these IDs against the current `stage_state`. If a new HIGH concern can be added to the state *after* the review files are generated but *before* the judge runs, the judge will be operating on stale data. It will not be aware of the new concern and cannot include it in its verdict, rendering the veto ineffective for that concern. |
| **LOW** | F-04 | **Intermediate File Cleanup is Brittle.** The garbage collection logic in `T2.2` relies on a hardcoded glob of 5 specific file patterns. If future development introduces new types of intermediate review artifacts, the `_gc_review_intermediates` function will not be aware of them. They will not be cleaned up, leading to repository bloat and potential confusion from stale files. |
| **LOW** | F-05 | **[UNVERIFIED] Command Discovery Relies on Fragile Implementation Details.** The `enumerate_subparser_handlers` helper in `T1.3` is specified to inspect internal attributes of the `argparse` module (`_actions`, `_SubParsersAction`, `choices[name]._defaults["func"]`). This creates a brittle dependency on the library's internal implementation, which is not guaranteed to be stable across different Python versions and could break with a future update. |

## Residual Risks

- **LLM Reliability:** The entire completeness veto feature (`Slice 3`) is dependent on an LLM correctly interpreting and following the system prompt's instructions to populate the `unaddressed_high_finding_ids` field. While the fail-open guard (`T3.4`) provides a fallback, a sufficiently erratic or non-compliant model could consistently fail to provide the structured data, degrading the veto to a simple warning and relying on the less-safe majority-rules outcome.
- **Human Override:** The safety net can be intentionally bypassed using the `--override-judges` flag on the `deliver` command (`T3.6`, US1.4). While the tasks add a check for a non-blank reason (`T3.5`), this remains a permanent backdoor that subverts the entire automated check. The risk is that this override is used for convenience rather than in a true emergency, negating the feature's benefit.

## Token Stats

- total_input=2973
- total_output=835
- total_tokens=17930
- `gemini-2.5-pro`: input=2973, output=835, total=17930

## Resolution
- status: open
- note: