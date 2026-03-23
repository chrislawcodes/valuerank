---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/feature-runs/i7-wave2-runner-extension/plan.md"
artifact_sha256: "8304bda1677f266e57da3d0ccf2d14eb984ca2cedb209ffe27f50c10c6f2785b"
repo_root: "."
git_head_sha: "c16754b277e7f93f31eb63486dc5be9dc6320105"
git_base_ref: "origin/main"
git_base_sha: "1bc92c5502d64397cd53f28fed52f4f58ff07934"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Implementation complete. 74 tests pass. All correctness findings addressed."
raw_output_path: "docs/feature-runs/i7-wave2-runner-extension/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

1.  **Plan is Not Self-Contained:** The plan's first sentence defers to an external document (`docs/plans/i7-structured-discovery-plan.md`) for "full details." This makes the plan non-verifiable on its own. A test strategy cannot be evaluated or designed against an incomplete specification. Relying on external context for core details is a significant flaw in a planning artifact.

2.  **Untestable "Transparent" Migration:** The plan describes a V1->V2 state migration that is "wired into loader" and "transparent." This presents several testability issues:
    *   **Observability:** How can a "transparent" process be observed to confirm it is working correctly? The plan omits any mention of logging, events, or other mechanisms to verify the migration occurred.
    *   **Idempotency:** The migration is triggered "on first read," implying a one-time, stateful change. This is difficult to test reliably. Test suites require repeatable, stateless operations. A testing harness would need to manage and reset pristine V1 fixture files for every single test case, which is brittle.
    *   **Failure Modes:** The plan completely ignores failure scenarios. What happens if a V1 `state.json` file is malformed, partially written, or read-only? Does the process fail silently, corrupt the file, or throw a catchable exception? The lack of defined failure behavior makes it impossible to test for robustness.

3.  **Contradictory Scope Claims:** The plan claims the work is "Purely additive to existing behavior" but in the very next section states, "The V1 version guard removal changes visible behavior." This is a direct contradiction. Additive changes should not alter existing behavior. This ambiguity makes it impossible to determine if regression testing is required for the V1 path or if only the new V2 behavior needs to be validated.

4.  **Weak Assumption on Impact Radius:** The assertion that "All changes in run_factory.py and tests" is an implementation detail, not a guaranteed boundary of impact. It assumes the *public contract* of `run_factory.py` (e.g., return types, error types thrown, performance characteristics) remains unchanged. A change in behavior, like the one described, could have downstream consequences that are not being considered or tested.

## Residual Risks

1.  **Risk of Silent Data Corruption:** The "transparent" migration, with no specified validation or failure handling, could silently fail on edge-case V1 files in production. This could lead to a partially migrated or corrupted state that is not discovered until much later, making recovery difficult.

2.  **Risk of Incomplete Test Coverage:** The ambiguity between the "purely additive" claim and the "changes visible behavior" statement may lead developers to write insufficient tests. They might focus on the additive V2 logic while failing to write adequate regression tests for the altered V1 guard behavior, potentially allowing bugs in how existing states are handled.

3.  **Risk of Unidentified Dependencies:** Because the plan is not self-contained, critical details affecting testability (e.g., dependencies, non-deterministic behavior, environmental assumptions) located in the external document may be overlooked. The project could proceed with a flawed understanding of the testing effort required.

## Token Stats

- total_input=1262
- total_output=694
- total_tokens=15027
- `gemini-2.5-pro`: input=1262, output=694, total=15027

## Resolution
- status: accepted
- note: Implementation complete. 74 tests pass. All correctness findings addressed.
