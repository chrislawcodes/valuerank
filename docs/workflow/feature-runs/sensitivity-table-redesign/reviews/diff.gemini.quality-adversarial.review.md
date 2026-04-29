---
reviewer: "gemini"
lens: "quality-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/sensitivity-table-redesign/reviews/implementation.diff.patch"
artifact_sha256: "1c4d0b910b8c1688de90c8d90df436e30fade9a25ea109be04be4318566d515e"
repo_root: "."
git_head_sha: "c62155cb1218b80dde70aa567057450bc4ac732b"
git_base_ref: "6f68da8676f6cefa892631008e0a91c8bf9c8b79"
git_base_sha: "6f68da8676f6cefa892631008e0a91c8bf9c8b79"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "MEDIUM (API contract) VERIFIED. MEDIUM (code duplication) RESOLVED via shared pressureSensitivityFormatting.ts in commit 2fbb44ad. LOW (sort icons) ACCEPTED per spec. LOW (info removal) INTENTIONAL per spec."
raw_output_path: "docs/workflow/feature-runs/sensitivity-table-redesign/reviews/diff.gemini.quality-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff quality-adversarial

## Findings

| Severity | Finding |
| --- | --- |
| **MEDIUM** | **[UNVERIFIED] Risk of Integration Failure Due to Unverified API Contract Changes** |
| **MEDIUM** | **Code Duplication Between Summary and Detail Components** |
| **LOW** | **Sort Functionality on Delta Column May Be Unintuitive** |
| **LOW** | **Potentially Useful Information Has Been Removed** |

### **MEDIUM: [UNVERIFIED] Risk of Integration Failure Due to Unverified API Contract Changes**

The components `PressureSensitivityDetail.tsx` and `PressureSensitivitySummary.tsx` have been completely refactored to consume a new data structure. The previous implementation relied on properties like `netScoreDelta`, `directionDelta`, and `aggregateSensitivity`. The new implementation expects `winRateDelta`, `winRateDeltaSummary`, and `qualifyingTrials` on the `PressureSensitivityModel` and `PressureSensitivityValuePair` types. Additionally, the parent `PressureSensitivity.tsx` page now expects a `transcriptCapHit` boolean in the API response.

This represents a major change to the data contract with the backend. If the API has not been updated to provide these new fields and structures, these components will fail to render or will crash at runtime. This finding is marked `[UNVERIFIED]` as the API implementation was not provided for review.

**File:** `cloud/apps/web/src/components/models/PressureSensitivityDetail.tsx`, `cloud/apps/web/src/components/models/PressureSensitivitySummary.tsx`, `cloud/apps/web/src/pages/PressureSensitivity.tsx`

### **MEDIUM: Code Duplication Between Summary and Detail Components**

Several helper functions, constants, and JSX rendering functions are duplicated across `PressureSensitivitySummary.tsx` and `PressureSensitivityDetail.tsx`. This includes:
*   Tooltip content strings (`GROUP_TOOLTIP`, `LOW_TOOLTIP`, `HIGH_TOOLTIP`, `DELTA_TOOLTIP`)
*   Formatting functions (`formatPercent`, `formatPoints`)
*   Business logic (`getBadgeFlag`)
*   A rendering function (`renderBandCell` is defined locally in both files with nearly identical implementations)

This duplication increases the maintenance burden, as any future changes to this logic or copy will need to be applied in multiple places, creating a risk of inconsistency. These shared utilities should be extracted to a common location.

**Files:** `cloud/apps/web/src/components/models/PressureSensitivitySummary.tsx`, `cloud/apps/web/src/components/models/PressureSensitivityDetail.tsx`

### **LOW: Sort Functionality on Delta Column May Be Unintuitive**

In `PressureSensitivityDetail.tsx`, the "Win rate Δ" column is sortable. The implementation sorts pairs based on the *absolute value* of the delta (`Math.abs(a.winRateDelta.value)`). This allows users to see pairs with the highest and lowest *magnitude* of change.

However, the UI uses standard ascending (`▲`) and descending (`▼`) icons. Users often associate these with a directional sort (e.g., from most positive to most negative). A user who wants to find the value pairs that are most suppressed by heavy pressure (i.e., the most negative delta) cannot sort for this directly and must instead scan the list visually. The functionality is not flawed, but the UI may create an incorrect expectation.

**File:** `cloud/apps/web/src/components/models/PressureSensitivityDetail.tsx`

### **LOW: Potentially Useful Information Has Been Removed**

The previous implementation of the summary and detail tables has been replaced with a more focused view on win-rate sensitivity. In the process, several pieces of information have been removed:
*   **Summary Table:** The "Provider" column and the "Per-pair spread" sparkline visualization are gone.
*   **Detail Table:** The `Direction Δ`, `Conviction Δ`, and `netScore Δ` metrics are gone.

While the new design is arguably cleaner and easier to understand, this is a removal of functionality. The sparkline, in particular, provided a quick visual summary of the distribution of sensitivity across all pairs for a given model. This is likely an intentional design tradeoff, but it's a "silent" removal of features that users may have found valuable.

**Files:** `cloud/apps/web/src/components/models/PressureSensitivitySummary.tsx`, `cloud/apps/web/src/components/models/PressureSensitivityDetail.tsx`

## Residual Risks

*   **Deployment Coordination:** The most significant risk is the dependency on the unverified API contract changes. The frontend and backend changes must be deployed atomically. If the frontend is deployed before the backend, the Pressure Sensitivity page will be broken.
*   **User Adaptation:** The UI has changed significantly, removing several metrics and visualizations. There is a risk that existing users who relied on the removed information (e.g., `netScore Δ`, the provider column for quick filtering, the sparkline) will find the new report less useful for their workflow.
*   **Data Completeness Assumption:** The new `transcriptCapHit` warning is an excellent addition for transparency. However, its effectiveness depends on the cap being set at a reasonable level and the backend reliably flagging when it's hit. An incorrect implementation of this flag could lead to users either being needlessly alarmed or falsely confident in the data's completeness.

## Token Stats

- total_input=20968
- total_output=1152
- total_tokens=25189
- `gemini-2.5-pro`: input=20968, output=1152, total=25189

## Resolution
- status: accepted
- note: MEDIUM (API contract) VERIFIED. MEDIUM (code duplication) RESOLVED via shared pressureSensitivityFormatting.ts in commit 2fbb44ad. LOW (sort icons) ACCEPTED per spec. LOW (info removal) INTENTIONAL per spec.
