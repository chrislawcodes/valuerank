---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/match-pair-counts/plan.md"
artifact_sha256: "552bf20a0efdaab21464d9d6bfcb1b650486978832232f780518fe95602f26ad"
repo_root: "."
git_head_sha: "728da7d111003c5b052de4afad7f33501fbe10ba"
git_base_ref: "origin/main"
git_base_sha: "ee49253d6dd9ce8c0dfd6789aad31716b74634e8"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/match-pair-counts/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

| Severity | Finding | Evidence |
| --- | --- | --- |
| **HIGH** | Plan's "Verified Fact" about `orphanedBatchCount` is contradicted by provided code. | `[CODE-CONFIRMED]` |
| **MEDIUM** | Plan is ambiguous about the core tie-breaking logic for identifying the lagging pair. | `[UNVERIFIED]` |
| **LOW** | The plan's proposed GraphQL schema inaccurately uses an `enum` for `LaunchMode`. | `[CODE-CONFIRMED]` |

---

- **Severity:** HIGH
  - **Finding:** Plan's "Verified Fact" about `orphanedBatchCount` is contradicted by provided code.
  - **Details:** The plan asserts as a "Verified Fact" that the field `orphanedBatchCount` exists on `DomainValueCoverageCell` in the main branch. However, the provided code contexts directly refute this. The `DomainValueCoverageCell` type definition in `cloud/apps/api/src/graphql/generated/graphql.ts`, `cloud/apps/web/src/api/operations/domainCoverage.ts`, and the props in `cloud/apps/web/src/components/domains/CoverageCell.tsx` all lack the `orphanedBatchCount` field. Slice 3 of the plan is critically dependent on this field for its UI gating logic (`orphanedBatchCount > 0 || orphanedConditionCount > 0`).
  - **Impact:** Building the feature based on a "Verified Fact" that is shown to be false by the provided code introduces a high risk of implementation failure, required rework, and incorrect test assumptions. While the plan notes the worktree may be stale, an adversarial review cannot accept a contradicted assertion as verified. This foundational discrepancy must be resolved before implementation begins.
  - **Evidence:** `[CODE-CONFIRMED]`

- **Severity:** MEDIUM
  - **Finding:** Plan is ambiguous about the core tie-breaking logic for identifying the lagging pair.
  - **Details:** Slice 3 of the plan calls for a new pure helper, `computeLaggingDirection`, to implement a "6-rule tie-breaker" for deciding which side of a pair to top up. The plan does not specify what these six rules are, their inputs, their priority order, or how to resolve conflicts between them.
  - **Impact:** This ambiguity creates significant implementation and testability risks. The developer is left to guess or reverse-engineer the business logic, making it highly probable that edge cases will be missed. Testers cannot write effective unit tests without a clear specification of the expected behavior for all possible input combinations (e.g., a cell with both orphaned batches and orphaned conditions in opposite directions).
  - **Evidence:** `[UNVERIFIED]`

- **Severity:** LOW
  - **Finding:** The plan's proposed GraphQL schema inaccurately uses an `enum` for `LaunchMode`.
  - **Details:** In its "GraphQL Schema" section, the plan proposes `enum LaunchMode { ... PAIRED_BATCH_TOPUP }`. However, analysis of `graphql.ts` shows that `StartRunInput.launchMode` is currently a `String`, and `run-json-types.ts` confirms the application uses a string literal union type.
  - **Impact:** This inaccuracy could mislead an implementer into creating a new GraphQL enum, which would be an unnecessary schema modification that deviates from the existing pattern. The implementation should follow the established pattern of treating this as a string field, as the plan correctly intuits in other sections.
  - **Evidence:** `[CODE-CONFIRMED]`

## Residual Risks

The plan's "Residual Risks" section is comprehensive. The following are additional risks identified during this adversarial review.

- **Risk:** Logic drift between backend-calculated coverage gaps and client-side lagging direction detection.
  - **Description:** The backend resolver computes fields like `orphanedConditionCount` to determine *if* a cell has a gap. A separate client-side helper, `computeLaggingDirection`, re-evaluates the cell's data to determine *which* direction is lagging. These two pieces of logic, being developed and executed in different environments, could have subtle disagreements. This could lead to a "Match Pair Counts" action appearing for a cell where the client helper can't find a gap, leading to a dead end.
  - **Evidence:** `[UNVERIFIED]`
  - **Suggested Mitigation:** Create a cross-layer unit test. The backend resolver tests (Slice 1) should output fixture objects for `DomainValueCoverageCell`. A corresponding client-side test (Slice 3) should ingest these exact fixtures and assert that the `computeLaggingDirection` helper's output is consistent with the backend's calculations (e.g., it finds a lagging direction if and only if the backend calculated a non-zero orphan count).

- **Risk:** Race condition with deleted definitions in `contributingDefinitionIds`.
  - **Description:** The UI passes a list of `contributingDefinitionIds` and a specific `launchDefinitionId` via route state. If a user deletes one of these definitions after the page loads but before the top-up run is launched, the `startRun` mutation could fail ungracefully.
  - **Evidence:** `[UNVERIFIED]`
  - **Suggested Mitigation:** The `startRun` mutation handler must be hardened to re-verify that the `launchDefinitionId` and any other critical definition IDs from the input still exist and are not soft-deleted *within the same transaction as the run creation*. The error returned to the client in case of failure should be specific (e.g., "Vignette to be launched has been deleted since the page was loaded.").

## Token Stats

- total_input=88165
- total_output=1224
- total_tokens=106720
- `gemini-2.5-pro`: input=88165, output=1224, total=106720

## Resolution
- status: open
- note: