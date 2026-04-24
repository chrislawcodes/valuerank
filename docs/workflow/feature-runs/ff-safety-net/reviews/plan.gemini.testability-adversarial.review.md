---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/ff-safety-net/plan.md"
artifact_sha256: "5deff9bcdb318585117de24610b19e86c12bae171e3851edbd1c9124770a7484"
repo_root: "."
git_head_sha: "c6ec7b7929903a6a9a4c8fea6819b6aa2f1cba03"
git_base_ref: "origin/main"
git_base_sha: "c07a4283ecdebffa57e8a2cccfa08c23e0f76a36"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Findings addressed in spec/plan/tasks updates (see plan.md Review Reconciliation section for cross-stage rollup)."
raw_output_path: "docs/workflow/feature-runs/ff-safety-net/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

| Severity | ID | Finding |
|---|---|---|
| **HIGH** | F-01 | **Untested Conditional State Mutation Creates Corruption Loophole:** The proposed decorator-based system (`@mutates_state`, `@readonly_command`) is binary and cannot account for commands that mutate state only under specific conditions (e.g., when a flag like `--write-to-state` is used). A command could be decorated as `@readonly_command` but contain a mutating code path. This would bypass the invariant checks designed to protect state integrity, creating a silent and untestable vector for state corruption. The test plan only validates that a decorator is present, not that its classification is correct across all execution paths. |
| **MEDIUM** | F-02 | **[UNVERIFIED] Veto Outcome Is Ambiguous and Untestable:** The plan states the completeness veto will "override majority". This is too vague to be testable. It is unclear if this means flipping a `status` field, preventing a `PASS` state, or simply adding a warning. Without a precise definition of the final state representation after a veto, it is impossible to write a definitive test assertion. The test plan can only validate that *something* happens, not that the *correct* state transition occurred. |
| **MEDIUM** | F-03 | **Omitted Failure Case for Garbage Collection:** The test plan for garbage collection (`test_review_gc.py`) focuses on success paths (deletion and preservation). It completely omits testing for failure modes, specifically what happens if the process encounters a file system error (e.g., permissions denied) during deletion. An unhandled exception could crash the process mid-GC, leaving the workflow in an inconsistent state with a random subset of intermediate files present. This failure mode is not covered. |
| **LOW** | F-04 | **[UNVERIFIED] Garbage Collection Specification Is Brittle:** The plan states GC will delete "5 globs per FR-015". The effectiveness of the entire GC feature hinges on the assumption that this list of globs is, and will remain, complete and accurate. The test plan only verifies that files matching these globs are deleted; it cannot verify that the globs themselves cover all necessary intermediate artifacts. Stale files from a new or changed tool could easily be missed, leading to data pollution. |
| **LOW** | F-05 | **Inflexible GC Control Logic May Obscure Bugs:** The `--keep-intermediates` flag is an all-or-nothing switch. This coarse-grained control prevents a developer from inspecting the output of a single problematic stage while cleaning up others. This can make debugging more difficult and encourages leaving all intermediates, increasing the risk of a developer being confused by stale data—the very problem the GC feature aims to solve. The test plan does not explore the robustness of this binary choice. |

## Residual Risks

| Severity | ID | Risk |
|---|---|---|
| **HIGH** | R-01 | **Silent State Corruption:** A command mis-decorated as `@readonly_command` could mutate state without triggering the framework's invariant checks. This breaks the primary safety assumption of the new architecture and could lead to data integrity issues that are difficult to trace. |
| **MEDIUM** | R-02 | **Inconsistent State on File System Error:** If the garbage collection process fails mid-operation due to a file system error (e.g., permissions), it may leave the workflow in a partially cleaned, inconsistent state. The plan confirms idempotency on re-run but does not account for the process crashing or the untestability of this failure mode. |
| **MEDIUM** | R-03 | **LLM Non-Compliance in Veto Prompt:** As noted in the artifact (Risk P1), the completeness veto depends on the LLM correctly identifying and populating the `unaddressed_high_finding_ids` array. If the LLM fails to follow the new prompt instructions, the veto mechanism may fail silently (i.e., not block) even if the fail-open guard catches the empty array, as the human reviewer may not notice the missing veto. |
| **LOW** | R-04 | **Brittle Dependency on `argparse` Internals:** As noted in the artifact (Risk P2), the logic for auto-registering commands relies on introspecting `argparse` internal structures. A future update to the `argparse` library could break the command registry, causing runtime failures. While the plan suggests a mitigating test, this remains a dependency risk. |

## Token Stats

- total_input=13965
- total_output=965
- total_tokens=16819
- `gemini-2.5-pro`: input=13965, output=965, total=16819

## Resolution
- status: accepted
- note: Findings addressed in spec/plan/tasks updates (see plan.md Review Reconciliation section for cross-stage rollup).
