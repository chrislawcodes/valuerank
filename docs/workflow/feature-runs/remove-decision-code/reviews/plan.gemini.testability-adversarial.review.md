---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/remove-decision-code/plan.md"
artifact_sha256: "33c221a08db543266041458aac83cebff45766767edd25e104475fa7e8af712f"
repo_root: "."
git_head_sha: "a50a4b6e54d0816f0ff99be3defba99d0315f4ad"
git_base_ref: "origin/main"
git_base_sha: "bd742f04a07dd015aa976e30754c675d915b3903"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Plan round 4 accepted. HIGH Python-TS numeric-only contract concern -> resolver body verified to NOT consume decisionCode for any derivation path; decisionCode on TranscriptDecisionModelInput is vestigial. Numeric parser branches identify a number internally for matchedLabel resolution but the final derivation goes through parsePath plus matchedLabel, not the raw number. Safe to remove without breaking numeric-only paths. HIGH migration script duplicates production logic -> ACCEPTED and MAJOR architectural improvement: A2 rewritten to delegate to production resolveCanonicalDecision; W9 and T9 rewritten to import and call it directly. Zero logic duplication. MEDIUM manual override test plan -> T8.5 expanded in a follow-up task to enumerate invalid-payload cases explicitly."
raw_output_path: "docs/workflow/feature-runs/remove-decision-code/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

### 1. HIGH: Flawed Python-TypeScript Contract Change

The plan to have the Python worker stop emitting `decisionCode` (Wave 3) will break the summarization process for any transcript that uses numeric-only parsing. The downstream TypeScript layer relies on this value to derive the canonical decision.

-   **Description:** The plan for W3 is to remove `decisionCode` from the Python worker's output. The plan for W4 is to remove `decisionCode` from the input to the TypeScript resolver (`resolveTranscriptDecisionModel`). However, for scenarios without text-based scale labels, the Python parser identifies a number (e.g., "4") and returns it as `decisionCode`. The TypeScript resolver uses this number to determine the final `canonicalDecision`. If the Python worker stops sending this number, the TypeScript layer has no way to know *which* number was chosen, as `parsePath: 'numeric_deterministic'` does not contain the value itself.
-   **Evidence:** `[CODE-CONFIRMED]`
    -   `summarize_extract.py` contains numerous regex patterns like `STRUCTURED_RATING_PATTERN` specifically to find a numeric code.
    -   `summarize.py`'s `extract_decision_result` function returns this value as `decisionCode` in its result dictionary.
    -   `summarize-transcript.test.ts`'s test helper `buildSuccessfulWorkerSummary` shows that the TypeScript side expects `decisionCode` in the worker's payload.
    -   `decision-model-types.ts` shows `TranscriptDecisionModelInput` includes `decisionCode`, which the plan intends to remove, leaving no path for numeric decisions to be communicated.

### 2. HIGH: Migration Script Duplicates Production Logic

The plan for the migration script (Wave 9) involves re-implementing complex business logic for deriving a canonical decision, rather than reusing the existing production resolver. This creates a significant testing and maintenance risk.

-   **Description:** Architecture Decision A2 and Wave 9 describe a "four-case processor" to be built inside the migration script. This processor would replicate the logic of the production `resolveTranscriptDecisionModel` function. This is risky because any discrepancy between the two implementations, now or in the future, will lead to data corruption. The script becomes a second, untested source of truth for business logic. A much safer approach is for the migration script to import and call the single, production-grade, and well-tested resolver function.
-   **Evidence:** `[UNVERIFIED]`
    -   The plan explicitly states in W9: "This slice is a complete rewrite" and "Implement the four-case processor from spec".
    -   The existence of `resolveTranscriptDecisionModel` in `summarize-transcript.test.ts` confirms there is a production resolver that could be reused. Duplicating its logic in `backfill-canonical-v2-migration.ts` is an unnecessary risk.

### 3. MEDIUM: Incomplete Test Plan for Manual Override Mutation

The plan for reshaping the manual override mutation (Wave 8) correctly identifies the need for a new input shape but does not specify the need to test for invalid input combinations, which is critical for ensuring the API is robust.

-   **Description:** Wave 8 proposes a new input shape `{decisionState, favoredValueKey?, strength?}` and defines the behavior for valid combinations. However, it does not mention testing the failure modes. For example, a robust test suite must assert that the mutation correctly rejects a request where `decisionState` is `"resolved"` but `strength` or `favoredValueKey` is missing, or where `strength` is `"neutral"`. Without these negative tests, the validation logic is not fully verified.
-   **Evidence:** `[UNVERIFIED]`
    -   The plan in W8 presents a table of valid inputs and expected outputs but omits a discussion of how invalid combinations should be handled and tested. This is an assumption that the implementation will include correct validation without explicit test planning.

### 4. LOW: Implicit Test Case for Key Helper Function

The plan correctly identifies a single-use case for the new `scaleCodeFromCanonical` helper but does not explicitly state that its usage will be verified in tests.

-   **Description:** Architecture Decision A3 and Wave 10 identify that `job-choice-bridge-report-lib.ts` will be the sole user of the `scaleCodeFromCanonical` helper. The plan should explicitly state that the tests for W10 will assert that this specific file is indeed using the new helper and that its JSDoc allowlist is correctly updated. Making this test requirement explicit ensures the architectural constraint is verified.
-   **Evidence:** `[CODE-CONFIRMED]`
    -   The plan for W10 lists `job-choice-bridge-report-lib.ts` as a file to be modified. A3 establishes the "allowlist" concept for the helper. The finding is that the test plan should connect these two points explicitly.

## Residual Risks

The plan correctly identifies the major risks (R1-R6), including the potential for the GraphQL resolver to bypass helpers (R1), the Python/TS deploy race (R2), and the breaking change to external APIs (R6). Assuming the findings above are addressed, the primary residual risks are operational:

1.  **Migration-Induced Errors:** The Wave 9 migration script, even if it reuses production logic as recommended, is a high-stakes operation. An unforeseen bug in the script could corrupt `decisionMetadata` for thousands of transcripts. The planned dry run is a good mitigation, but the risk of subtle data corruption remains.
2.  **Incomplete Test Fixture Rewiring:** As noted in R5, the project has a large test fixture sprawl. It is highly probable that some obscure test fixture or mock is missed during the refactoring waves, leading to a test that passes for the wrong reasons (e.g., using a stale mock) or becomes a "change detector" test that fails on every unrelated change.

## Token Stats

- total_input=62554
- total_output=1297
- total_tokens=68244
- `gemini-2.5-pro`: input=62554, output=1297, total=68244

## Resolution
- status: accepted
- note: Plan round 4 accepted. HIGH Python-TS numeric-only contract concern -> resolver body verified to NOT consume decisionCode for any derivation path; decisionCode on TranscriptDecisionModelInput is vestigial. Numeric parser branches identify a number internally for matchedLabel resolution but the final derivation goes through parsePath plus matchedLabel, not the raw number. Safe to remove without breaking numeric-only paths. HIGH migration script duplicates production logic -> ACCEPTED and MAJOR architectural improvement: A2 rewritten to delegate to production resolveCanonicalDecision; W9 and T9 rewritten to import and call it directly. Zero logic duplication. MEDIUM manual override test plan -> T8.5 expanded in a follow-up task to enumerate invalid-payload cases explicitly.
