---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/feature-runs/i7-structured-discovery/plan.md"
artifact_sha256: "dd0d7573b935ab366f5bef64386a57958ea3426045fe7273ea74b299903ee113"
repo_root: "."
git_head_sha: "acd7dd3a428760b036c85a8f24442853bde050b9"
git_base_ref: "origin/main"
git_base_sha: "bb7a5403bbe8414e99820865a15e2490fe0542cb"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Finding 1: write-back uses atomic_json_write which is already tested; tests mock atomic_json_write. Finding 2: gate test matrix defined in tasks: 5 explicit cases (required+complete+empty, required+complete+unresolved, required+incomplete+empty, required+incomplete+unresolved, required+complete+deferred-only). Finding 3: migration excludes answered questions from unresolved — moot for V1 (no answers dict), V2 --answer already clears from unresolved. Finding 4: --answer strictly requires question in questions[], no upsert."
raw_output_path: "docs/feature-runs/i7-structured-discovery/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

1.  **Untestable I/O Operations:** The plan for Wave 2 states that the migration will be applied and then "write back to disk if version changed." This introduces a file system I/O side effect directly into the application logic. The plan omits any strategy for testing this behavior, such as using file system mocks (`patch('builtins.open', ...)`). Without a clear mocking strategy, tests for this functionality will be stateful, slow, and dependent on the environment, making them brittle and unreliable.

2.  **Insufficiently Defined Test Cases for Gate Logic:** The plan for Wave 3 introduces complex, multi-part boolean logic for the checkpoint gate: `required AND (not complete OR any(not i.get("deferred") for i in unresolved))`. The associated test plan simply says "Add gate tests." This is too vague. A feature with combinatorial logic requires an explicit test matrix to ensure all paths are covered. The plan provides no assurance that edge cases—such as a state that is `complete=False` but has only `deferred` items—will be tested correctly.

3.  **Ambiguous Migration Logic for `unresolved` Population:** The plan for Wave 1 states the migration populates `unresolved[]` from `questions[]` if `required=true` and `complete=false`. However, it fails to specify how this interacts with the `answers{}` dictionary. It's unclear if a question that exists in `questions[]` and already has a corresponding entry in `answers{}` would still be added to `unresolved[]`. This ambiguity prevents the creation of a definitive test case; a test could be written to either expect or not expect the answered question in the `unresolved` list, and both would seem valid under the current plan.

4.  **Undefined "Upsert" Behavior for CLI:** In Wave 2, the `--answer` flag is described to "upsert otherwise" if the question isn't in the `questions[]` list. This "upsert" behavior is untestable because it's not defined. Does it add the new question to the `questions[]` list in addition to adding the entry to the `answers{}` dictionary? Or does it only add to `answers{}`? This lack of clarity makes it impossible to write a test that can assert the correct final state of the discovery artifact after the command is run.

## Residual Risks

1.  **Brittle Test Suite:** The failure to specify a strategy for mocking file I/O (Finding #1) creates a significant risk of developing a flaky test suite. Tests that interact with the disk are prone to intermittent failures due to permissions, concurrent access, or state left over from previous test runs, leading to a loss of confidence in the test results.

2.  **Incorrect Gate Enforcement:** The lack of a specific test matrix for the gate logic (Finding #2) means that critical edge cases may be missed during implementation. This could lead to a buggy gate that incorrectly blocks valid checkpoints or, more critically, allows invalid checkpoints to pass, undermining the feature's entire purpose.

3.  **State Corruption During Migration:** If the ambiguity in `unresolved` population (Finding #3) is not clarified, the migration could incorrectly populate the `unresolved` list with questions that have already been answered. This would corrupt the state of existing discovery artifacts, incorrectly blocking workflows and forcing users to manually resolve items that were already complete.

4.  **Inconsistent CLI State Management:** The undefined "upsert" behavior for the `--answer` flag (Finding #4) risks introducing unpredictable state management. If the implementation is not tested against a clear specification, it could lead to discovery artifacts where an answer exists but the corresponding question does not, or vice versa, leading to downstream errors and data integrity issues.

## Token Stats

- total_input=2217
- total_output=800
- total_tokens=16469
- `gemini-2.5-pro`: input=2217, output=800, total=16469

## Resolution
- status: accepted
- note: Finding 1: write-back uses atomic_json_write which is already tested; tests mock atomic_json_write. Finding 2: gate test matrix defined in tasks: 5 explicit cases (required+complete+empty, required+complete+unresolved, required+incomplete+empty, required+incomplete+unresolved, required+complete+deferred-only). Finding 3: migration excludes answered questions from unresolved — moot for V1 (no answers dict), V2 --answer already clears from unresolved. Finding 4: --answer strictly requires question in questions[], no upsert.
