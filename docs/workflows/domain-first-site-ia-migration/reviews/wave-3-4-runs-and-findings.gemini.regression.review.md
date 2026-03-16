---
reviewer: "gemini"
lens: "regression"
stage: "diff"
artifact_path: "docs/workflows/domain-first-site-ia-migration/reviews/wave-3-4-runs-and-findings.diff.patch"
artifact_sha256: "cb2ccc0292745b0c7480687849f4908f892a3fbe93a620bcda523f32f15e940e"
repo_root: "."
git_head_sha: "ad1056848eaf99799e005d2b73be7a3e1f9287f2"
git_base_ref: "origin/main"
git_base_sha: "ad1056848eaf99799e005d2b73be7a3e1f9287f2"
generation_method: "gemini-cli"
resolution_status: "rejected"
resolution_note: "The reported blocker is not applicable to this wave: the referenced `cloud/apps/web/src/api/operations/domains.ts` contract was landed in an earlier accepted backend wave and is outside this wave-scoped patch. The remaining residual risks are informative follow-up items, not blockers."
raw_output_path: "docs/workflows/domain-first-site-ia-migration/reviews/wave-3-4-runs-and-findings.gemini.regression.review.md.json"
---

# Review: wave-3-4-runs-and-findings regression

## Findings

The provided diff contains a significant **blocker**: the file `cloud/apps/web/src/api/operations/domains.ts` is missing from the change set. While `DomainTrialsDashboard.tsx` has been updated to import several new GraphQL operations (e.g., `START_DOMAIN_EVALUATION_MUTATION`, `ESTIMATE_DOMAIN_EVALUATION_COST_QUERY`, `DOMAIN_EVALUATION_QUERY`), the definitions for these exports were not included in the diff. This will result in compilation failures in the web application.

Additionally, the transition from the `runTrialsForDomain` mutation to `startDomainEvaluation` represents a breaking change in the launch contract. While the UI has been updated to accommodate this, any external callers or cached versions of the frontend still attempting to use the legacy mutation will fail if the backend has removed it.

## Residual Risks

*   **Data Orphanage:** Existing runs created before this IA migration do not belong to a `DomainEvaluation` cohort. The new `DomainTrialsDashboard` prioritizes displaying evaluation-linked runs. Users with extensive history may find their previous work missing from the "Recent evaluations" list, though individual runs may still be accessible via direct links.
*   **Findings Gating:** The new `domainFindingsEligibility` logic introduces a conservative "Diagnostics only" gate. As seen in the test additions, a domain might be marked ineligible if the "snapshot boundary is not complete." This creates a stricter requirement for seeing auditable findings than existed previously, which may be perceived as a regression in data availability by users.
*   **Polling Load:** The dashboard now polls multiple endpoints (`refetchStatus`, `refetchCurrentEvaluationStatus`, `refetchCurrentEvaluation`, `refetchSummary`, `refetchEvaluations`) every 3 seconds during active runs. This may increase database load during high-concurrency evaluation periods.

## Resolution

1.  **Add Missing Operations:** Immediately include the updates for `cloud/apps/web/src/api/operations/domains.ts` to define the new GQL constants.
2.  **Verify Backend Compatibility:** Ensure the backend still supports the legacy `runTrialsForDomain` mutation if a staggered rollout of the frontend is expected, or confirm its intentional removal.
3.  **Backfill Strategy:** Consider a migration script to wrap existing "Production" category runs into retroactive `DomainEvaluation` cohorts so they appear in the new history UI.
4.  **Refine Findings Eligibility:** Ensure the "reasons" provided by the `domainFindingsEligibility` query are actionable and clearly explain to the user what specific metadata or snapshot is missing to achieve "Auditable" status.

## Token Stats

- `gemini-2.5-flash-lite`: input=21219, output=129, total=21729
- `gemini-3-flash-preview`: input=29635, output=560, total=32142

## Reconciliation

- status: rejected
- note: The reported blocker is not applicable to this wave: the referenced `cloud/apps/web/src/api/operations/domains.ts` contract was landed in an earlier accepted backend wave and is outside this wave-scoped patch. The remaining residual risks are informative follow-up items, not blockers.
