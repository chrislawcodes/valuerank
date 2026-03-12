---
reviewer: "gemini"
lens: "testability"
stage: "plan"
artifact_path: "/Users/chrislaw/valuerank/docs/workflows/aggregate-service-split/plan.md"
artifact_sha256: "81db5beec9bc44be48b63812cb8e336c186e01c270946c232f1c61442a776e1d"
repo_root: "/Users/chrislaw/valuerank"
git_head_sha: "f4994a3fa0e40d89e81a5afb0eddcb46336155bd"
git_base_ref: "origin/main"
git_base_sha: "f4994a3fa0e40d89e81a5afb0eddcb46336155bd"
resolution_status: "open"
resolution_note: ""
raw_output_path: "/Users/chrislaw/valuerank/docs/workflows/aggregate-service-split/reviews/plan.gemini.testability.review.md.json"
created_at: "2026-03-12T17:43:17.554670+00:00"
---

# Review: plan testability

## Findings

*   **High Severity: Insufficient Test Strategy Specificity (Relates to Step 7)**
    *   **Finding:** Step 7 states, "Add or extend tests only where needed to pin worker payload construction and normalized aggregate output." This instruction lacks specificity regarding the types of tests required for this structural refactor. It does not explicitly detail the need for:
        *   Unit tests for each new leaf module to verify its isolated logic.
        *   Integration tests specifically for the compatibility shim to ensure it correctly dispatches calls to the new modules and maintains the external API contract.
        *   Establishing a pre-refactor test baseline that captures the current worker payload and aggregate output to serve as a definitive point for regression testing.
    *   **Testability Impact:** This vagueness increases the risk of missing regressions and compromises the guarantee that aggregate behavior remains unchanged.

*   **High Severity: Lack of Explicit Pre-Refactor Test Baseline (Relates to Step 1 & 7)**
    *   **Finding:** Step 1 aims to "Confirm the live export surface of `services/analysis/aggregate.ts` with repo search." However, the plan does not explicitly state that this confirmation will be *validated by comprehensive tests* prior to the refactoring.
    *   **Testability Impact:** Without a clear plan to establish a robust, test-driven baseline of the current export surface's behavior before the refactor begins, there is a significant risk of unknowingly breaking the public API.

*   **Medium Severity: Ambiguity of "Required Verification Suite" (Relates to Step 8)**
    *   **Finding:** Step 8 states, "Run the required verification suite." The plan does not specify what this suite entails, its comprehensiveness regarding aggregate behavior, or how the new tests developed in Step 7 will integrate with or augment it.
    *   **Testability Impact:** The effectiveness of this critical verification step relies on an assumed, adequate existing test infrastructure, which is not detailed in the plan.

*   **Low Severity / Residual Risk: `buildValueOutcomes` Scope (Relates to Review Reconciliation)**
    *   **Finding:** The accepted reconciliation of `spec.gemini.requirements.review.md` correctly notes that future movement of `buildValueOutcomes` is out of scope for this plan.
    *   **Testability Impact:** This is beneficial for the current refactor's testability by stabilizing the location of `buildValueOutcomes`. The interaction between the newly split aggregate and `buildValueOutcomes` is not detailed for testing in this plan, which may become a consideration for future work.

## Token Stats

- total_input=12238
- total_output=553
- total_tokens=16712
- `gemini-2.5-flash-lite`: input=12238, output=553, total=16712

## Resolution
- status: open
- note: