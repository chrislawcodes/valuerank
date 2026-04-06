# Trial Signature on Analysis Page

This plan details the implementation for adding the \Trial Signature\ visibility to the main Analysis List page (`/analysis`).

## Goal Description
The user wants to see the trial signature on the main Analysis card list, distinguishing runs at a glance.

## Proposed Changes
We will modify `AnalysisCard` (used by `VirtualizedAnalysisList` and `VirtualizedAnalysisFolderView`) to format and display the trial signature next to the run date.

### [MODIFY] [AnalysisCard.tsx](file:///Users/chrislaw/valuerank/cloud/apps/web/src/components/analysis/AnalysisCard.tsx)
*   **Import Signature Utility:** Import `formatTrialSignature` from `../../utils/trial-signature`.
*   **Extract Signature Data:** Parse `run.config` to extract `definitionVersion` and `temperature`.
*   **Format Signature:** Use `formatTrialSignature` to create the display string.
*   **UI Placement:** Add the formatted trial signature as a prominent badge or inline text element next to the definition name and version, or immediately before the date in the subtitle row.

## Verification Plan
### Manual Verification
1.  **UI Verification:** Log in to local dev environment. Navigate to main `/analysis` page.
2.  **Signature Display:** Verify analysis cards display the trial signature (e.g., `vnewt0.7`) prominently.
3.  **View Modes:** Toggle between \Folder View\ and \List View\ to ensure signature is visible in both.
