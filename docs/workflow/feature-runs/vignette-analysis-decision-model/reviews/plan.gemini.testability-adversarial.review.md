---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/vignette-analysis-decision-model/plan.md"
artifact_sha256: "318014dd758efdb309ddbda0bbce43cd02cda01054b15491f5af8262cab744aa"
repo_root: "."
git_head_sha: "fce47f73a2542524b87e0bbf199703aaf9f3c4c6"
git_base_ref: "origin/chore/agents-md-single-source-of-truth"
git_base_sha: "fce47f73a2542524b87e0bbf199703aaf9f3c4c6"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "The plan now defines the invalid-override failure mode, required null and neutral coverage, and a concrete parity-check rule using legacy fixture outputs. The remaining fixture-golden-set concerns are valid but not blockers for this wave because the parity scope is explicitly bounded to the designated legacy fixtures."
raw_output_path: "docs/workflow/feature-runs/vignette-analysis-decision-model/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

1.  **Untested Feature Flag State:** The verification plan confirms the `decision_model_v2` flag defaults to `off`, but includes no strategy for testing the `on` state. Without a test harness that can temporarily consume the adapter with the flag enabled, the core canonical logic remains un-exercised in an integrated context. A unit test of the adapter is insufficient; we must verify that the `config.ts` hook actually works and routes calls correctly when activated.
2.  **Insufficient Definition of "Malformed" Data:** The plan mentions testing "malformed metadata" and "invalid manual override" rejection. This is too generic. An adversarial approach requires testing syntactically valid but semantically nonsensical data, which is a common source of bugs.
    *   What if `favoredValueKey` and `opposedValueKey` are the same value?
    *   What if an override provides a `favoredValueKey` that isn't part of the vignette's value pair?
    *   What if the `previousDecisionCode` in an override is itself nonsensical (e.g., a negative number or a string)?
    The tests must explicitly check for rejection of these semantically invalid states, not just structurally broken JSON.
3.  **Over-reliance on Existing Test Fixtures:** The plan assumes existing legacy fixtures in `domain-analysis.test.ts` are sufficient to guarantee "unchanged domain-analysis output." This is a weak assumption. Those tests may only cover happy paths and may not include edge cases like zero-scores, ties, or transcripts that produced `unknown` states in the legacy model. The new adapter could pass the existing tests but fail on historical data not represented in the fixtures. The verification plan needs a specific task to audit the *coverage* of the legacy fixtures against known edge cases.
4.  **Canonical Gap in Historical Data is a Downstream Problem:** The plan correctly identifies that historical rows may lack metadata to produce a canonical decision. The mitigation is to keep `LegacyDecisionCompat` available. However, this pushes the problem downstream. Any future consumer built *only* for the canonical model will break on this data. The plan lacks a test case for this specific failure mode: a consumer requesting a canonical-only representation must receive an explicit `error` or `unknown_metadata` state, and this response must be verified.
5.  **Purity of the Adapter is Assumed, Not Enforced:** The plan states the adapter must be a "pure function layer" but proposes no mechanism to test or enforce this. A test should be added that calls the adapter multiple times with the identical input and asserts with deep equality that the output is identical every time, ensuring no hidden state is being mutated. Another test could involve checking for dependencies on non-local or mutable singletons.
6.  **Documentation Check is Unreliable:** The verification plan proposes a `grep-style check` to confirm docs no longer teach "score-first semantics". This is brittle and can easily miss nuanced phrasing or context. Verification should be based on asserting that specific, identified "score-first" sentences from the old docs have been removed or replaced with specific "direction/strength-first" sentences.

## Residual Risks

1.  **Bug-for-Bug Compatibility:** The emphasis on achieving parity with legacy numeric fixtures means that if the legacy system had subtle bugs in its calculations, this plan will codify them into the `LegacyDecisionCompat` adapter. The project may be faithfully reproducing incorrect legacy behavior, which will become harder to fix later.
2.  **Type Definition Creep:** While the plan focuses on isolating changes, adding new canonical types to shared packages (`decision-model.ts`) can have untracked ripple effects. Other parts of the monorepo that consume these packages may be affected in subtle ways (e.g., in IDEs, linters, or other static analysis tools) that are not immediately visible in the targeted regression tests.
3.  **Manual Override Race Conditions:** The proposed override shape (`appliedDecision` + `previousDecisionCode`) does not account for multiple users attempting to apply an override simultaneously. While a full solution is out of scope for Phase 1, this architectural choice bakes in a potential for lost updates or inconsistent audit trails in the future, a risk that should be explicitly documented.

## Token Stats

- total_input=1993
- total_output=909
- total_tokens=16025
- `gemini-2.5-pro`: input=1993, output=909, total=16025

## Resolution
- status: accepted
- note: The plan now defines the invalid-override failure mode, required null and neutral coverage, and a concrete parity-check rule using legacy fixture outputs. The remaining fixture-golden-set concerns are valid but not blockers for this wave because the parity scope is explicitly bounded to the designated legacy fixtures.
