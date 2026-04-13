---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/balance-ui-merge/plan.md"
artifact_sha256: "6d505b40c38e6f71a04fb90f017a06966c1863eb6df2d4ca2f3c75f9104da824"
repo_root: "."
git_head_sha: "489849cbced674725c5f8ada21de706c3bc0f223"
git_base_ref: "origin/main"
git_base_sha: "489849cbced674725c5f8ada21de706c3bc0f223"
generation_method: "gemini-cli"
resolution_status: "deferred"
resolution_note: "HIGH (atomicity rollback test): impractical without complex Prisma tx mock — positive cases covered. HIGH (null logging): design decision, deferred. MEDIUM (dead DB column): explicitly out of scope. MEDIUM (manual smoke): accepted — added modal component tests to tasks.md Slice 2. LOW (grep for mutation): accepted — added SYNC_PROVIDER_BALANCE_MUTATION grep to tasks.md. Race condition residual risk acknowledged."
raw_output_path: "docs/workflow/feature-runs/balance-ui-merge/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

| Severity | Finding |
| :--- | :--- |
| **HIGH** | **Atomicity Not Verified** <br> The plan's verification strategy for the backend transaction is incomplete. It confirms that a log is created on success but fails to specify a test that proves atomicity. A robust test would involve simulating a failure on the second step of the transaction (the `llmProvider.update`) and asserting that the first step (the `providerBalanceSyncLog.create`) is rolled back, ensuring no log record is left behind without a corresponding balance change. |
| **HIGH** | **Ambiguous Logging on Untracking** <br> The plan specifies that changing a provider's balance *to* `null` (disabling tracking) will intentionally *not* create a `ProviderBalanceSyncLog` entry. This represents a potential loss of audit information. The act of moving from a tracked, non-null balance to an untracked `null` state is a significant change event. Omitting it from the audit log could obscure financial or operational history. This decision should be explicitly confirmed as the desired business logic. |
| **MEDIUM** | **[UNVERIFIED] Potential for Dead Schema Column** <br> The frontend plan correctly removes `lastSyncedAt` from the GraphQL fragment and all UI components. However, the plan does not mention an associated database migration to remove the `lastSyncedAt` column from the `LlmProvider` table. If this column is not removed, it will become dead schema, a maintenance liability that can cause future confusion. |
| **MEDIUM** | **Reliance on Manual UI Verification** <br> Frontend verification relies on a "Manual smoke" test. This is brittle and non-repeatable in an automated fashion. The plan should include updating or creating component-level tests for `ProviderSettingsModal.tsx`. These tests should assert that, given a provider prop, the new read-only balance is displayed correctly and, critically, that the removed "Sync" section and its controls do not render. |
| **LOW** | **[UNVERIFIED] Incomplete Search for Obsolete Code** <br> The risk mitigation plan includes grepping for usages of `lastSyncedAt` and `<ProviderSettingsModal>`, which is good. However, it does not explicitly state that a search should be performed for the `SYNC_PROVIDER_BALANCE_MUTATION` itself before its removal. It is possible, though unlikely, that this mutation is called directly from another location in the codebase, which a search focused only on component props would miss. |

## Residual Risks

-   **Stale Logic Remains Accessible:** The `syncProviderBalance` mutation is intentionally left in the system. While the plan removes the primary UI that calls it, the mutation is still part of the API schema and could be called by other tools or by developers unaware of its deprecation, leading to inconsistent balance tracking logic being used.
-   **Inconsistent Read Timing:** The logic to skip a write for an unchanged balance (step #5) relies on a read that occurs *outside* the transaction. The logic that performs the write (step #3) re-reads the provider *inside* the transaction. In a high-concurrency scenario, another process could modify the balance between the initial read and the transaction's start, causing a "no-op" check to pass incorrectly when a write was actually needed. The impact is low (a missed update in a rare race condition) but represents a subtle flaw.
-   **Loss of Granularity in History:** The delta calculation treats a pre-existing `null` balance as `Decimal(0)`. This erases the distinction between a balance that was explicitly zero and one that was never set. While acceptable for the current use case, this loss of historical information could complicate future, more granular financial analysis.

## Token Stats

- total_input=2421
- total_output=804
- total_tokens=16917
- `gemini-2.5-pro`: input=2421, output=804, total=16917

## Resolution
- status: deferred
- note: HIGH (atomicity rollback test): impractical without complex Prisma tx mock — positive cases covered. HIGH (null logging): design decision, deferred. MEDIUM (dead DB column): explicitly out of scope. MEDIUM (manual smoke): accepted — added modal component tests to tasks.md Slice 2. LOW (grep for mutation): accepted — added SYNC_PROVIDER_BALANCE_MUTATION grep to tasks.md. Race condition residual risk acknowledged.
