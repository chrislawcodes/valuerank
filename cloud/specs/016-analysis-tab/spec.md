# Feature Specification: Analysis Tab

**Feature Branch**: `feat/016-analysis-tab`
**Created**: 2025-12-11
**Status**: Draft
**Input Description**: Move analysis information to a separate tab (peer of Definitions and Runs). The Analysis tab should work exactly like the Runs tab (sorting/filtering/etc) but drill-in shows only analysis information. Remove analysis from the bottom of run detail page, replace with a link at the top to analysis results when available. URL for analysis should be /analysis/<cuid>.

---

## User Scenarios & Testing

### User Story 1 - Browse Analysis Results (Priority: P1)

As a researcher, I need to browse completed analysis results in a dedicated tab so that I can quickly find and compare analysis data across different runs without navigating through run details.

**Why this priority**: Core functionality - the primary purpose of this feature is to surface analysis as a first-class entity in the navigation hierarchy, enabling faster access to analysis results.

**Independent Test**: Navigate to /analysis tab, see a list of runs that have analysis, click one to drill into analysis details.

**Acceptance Scenarios**:

1. **Given** I am logged in and on any page, **When** I click the "Analysis" tab in the navigation, **Then** I see a list of runs that have analysis data, displayed with the same card/list format as the Runs tab.

2. **Given** I am on the Analysis tab, **When** there are runs with completed analysis, **Then** I see each run displayed with: definition name, run ID preview, analysis computed date, model count, and analysis status indicator.

3. **Given** I am on the Analysis tab with multiple runs, **When** I look at the list, **Then** runs are sorted by analysis computed date (most recent first) by default.

---

### User Story 2 - Filter and Search Analysis (Priority: P1)

As a researcher, I need to filter and organize analysis results so that I can quickly find specific analysis data when I have many runs.

**Why this priority**: Critical for usability - without filtering, the Analysis tab would become unusable as the number of runs grows. This mirrors the essential functionality of the existing Runs tab.

**Independent Test**: On Analysis tab, apply status filter (e.g., "completed"), verify only matching analysis appears.

**Acceptance Scenarios**:

1. **Given** I am on the Analysis tab, **When** I select a status filter (e.g., "CURRENT" or "SUPERSEDED"), **Then** only analysis results matching that status appear.

2. **Given** I am on the Analysis tab, **When** I select tag filters, **Then** only analysis from runs belonging to definitions with those tags appear.

3. **Given** I am on the Analysis tab, **When** I toggle between "Flat" and "Folder" view modes, **Then** the display changes between a paginated flat list and a folder-grouped view (by definition tags), just like the Runs tab.

4. **Given** I am on the Analysis tab with more than 10 results in flat view, **When** I navigate with pagination controls, **Then** I can browse through pages of results (10 per page).

---

### User Story 3 - View Analysis Detail Page (Priority: P1)

As a researcher, I need to access a dedicated analysis detail page so that I can view comprehensive analysis data with full charts, tabs, and statistics without scrolling through run details.

**Why this priority**: Core feature - the analysis detail page is the primary way users will interact with analysis data. Moving it to its own route improves focus and navigation.

**Independent Test**: Navigate to /analysis/<cuid>, see the full AnalysisPanel content with all 6 tabs (Overview, Decisions, Scenarios, Values, Agreement, Methods).

**Acceptance Scenarios**:

1. **Given** I am on the Analysis tab, **When** I click an analysis card, **Then** I navigate to /analysis/<runId> and see the full analysis panel.

2. **Given** I am on the analysis detail page, **When** I view the page, **Then** I see the complete AnalysisPanel with all 6 tabs: Overview, Decisions, Scenarios, Values, Agreement, Methods.

3. **Given** I am on the analysis detail page, **When** I look at the header, **Then** I see a "Back to Analysis" button and a link to the associated run (e.g., "View Run" linking to /runs/<id>).

4. **Given** I am on the analysis detail page, **When** the analysis was computed, **Then** I see the computed timestamp, duration, and a "Recompute" button.

5. **Given** I am on the analysis detail page, **When** I click the "View Run" link, **Then** I navigate to /runs/<runId>.

---

### User Story 4 - Access Analysis from Run Detail (Priority: P2)

As a researcher, I need a quick link from run details to its analysis so that I can easily jump to analysis data when viewing a specific run.

**Why this priority**: Important for discoverability - users viewing a run should have a clear path to its analysis. However, the primary browsing flow is via the Analysis tab.

**Independent Test**: Navigate to /runs/<id> for a completed run, see "View Analysis" link near top of page, click to go to /analysis/<id>.

**Acceptance Scenarios**:

1. **Given** I am viewing a run detail page for a completed run with analysis, **When** I look at the header area, **Then** I see a "View Analysis" link/button prominently displayed.

2. **Given** I am viewing a run detail page for a completed run with analysis, **When** I click the "View Analysis" link, **Then** I navigate to /analysis/<runId>.

3. **Given** I am viewing a run detail page for a run without analysis, **When** I look at the header area, **Then** the "View Analysis" link is either hidden or shows "Analysis not available" state.

4. **Given** I am viewing a run detail page, **When** analysis is computing, **Then** I see "Analysis Computing..." status instead of a clickable link.

---

### User Story 5 - Analysis Tab Navigation (Priority: P2)

As a user, I need the Analysis tab to appear in the main navigation so that I can easily discover and access analysis functionality.

**Why this priority**: Important for discoverability - the Analysis tab needs to be visible in the main navigation hierarchy. Without this, users won't know the feature exists.

**Independent Test**: Log in, observe NavTabs shows "Analysis" as a tab between "Runs" and "Experiments".

**Acceptance Scenarios**:

1. **Given** I am logged in, **When** I view the navigation tabs, **Then** I see "Analysis" as a tab with an appropriate icon (e.g., BarChart or PieChart).

2. **Given** I am on the Analysis tab, **When** I look at the navigation, **Then** the Analysis tab is highlighted as active.

3. **Given** I am on an analysis detail page (/analysis/<id>), **When** I look at the navigation, **Then** the Analysis tab remains highlighted as active.

---

## Edge Cases

- **No analysis exists for any run**: Show empty state on Analysis tab with guidance ("No analysis results yet. Complete a run to generate analysis.")
- **Analysis is computing/pending**: Show in list with "Computing..." status badge, not clickable until complete.
- **Analysis superseded**: Show superseded analysis in list but visually differentiate (muted styling, "Superseded" badge).
- **Run deleted but analysis still exists**: Should not happen (analysis cascade deletes with run), but if encountered, handle gracefully by hiding orphaned analysis.
- **User navigates to /analysis/<invalid-id>**: Show "Analysis not found" error with link back to Analysis list.
- **Run has no transcripts (incomplete)**: Don't show in Analysis list (analysis requires completed transcripts).

---

## Requirements

### Functional Requirements

- **FR-001**: System MUST add a new route `/analysis` that displays a list of runs with analysis data. (Supports US1, US2)
- **FR-002**: System MUST add a new route `/analysis/:id` that displays the full AnalysisPanel for a specific run. (Supports US3)
- **FR-003**: System MUST add "Analysis" tab to NavTabs component with appropriate icon, positioned after "Runs". (Supports US5)
- **FR-004**: Analysis list page MUST support status filtering (CURRENT, SUPERSEDED). (Supports US2)
- **FR-005**: Analysis list page MUST support tag-based filtering (matching runs via their definitions). (Supports US2)
- **FR-006**: Analysis list page MUST support "Flat" and "Folder" view modes matching Runs tab behavior. (Supports US2)
- **FR-007**: Analysis list page MUST support pagination in flat view (10 items per page). (Supports US2)
- **FR-008**: Run detail page MUST display a "View Analysis" link in the header area when analysis is available. (Supports US4)
- **FR-009**: Run detail page MUST remove the embedded AnalysisPanel component from the bottom. (Supports US4)
- **FR-010**: Analysis detail page MUST include navigation back to Analysis list and link to associated run. (Supports US3)
- **FR-011**: Analysis detail page MUST display all 6 AnalysisPanel tabs: Overview, Decisions, Scenarios, Values, Agreement, Methods. (Supports US3)
- **FR-012**: Analysis list SHOULD show runs sorted by `computedAt` date descending (most recent first). (Supports US1)

---

## Success Criteria

- **SC-001**: Users can navigate to the Analysis tab and see all runs with analysis in under 2 seconds (initial load).
- **SC-002**: Users can filter the analysis list and see results update in under 500ms.
- **SC-003**: Users can navigate from Analysis list to Analysis detail in a single click.
- **SC-004**: Users can navigate from Run detail to Analysis detail in a single click.
- **SC-005**: Analysis detail page displays all analysis information previously shown at bottom of run detail.

---

## Key Entities

### Existing Entities (No Changes)

- **Run**: Contains `analysisStatus` field indicating analysis state
- **AnalysisResult**: Contains all analysis data (perModel, modelAgreement, dimensionAnalysis, etc.)
- **Definition**: Parent of runs, contains tags for filtering

### UI Components (New/Modified)

- **Analysis page** (new): List view with cards, filters, pagination
- **AnalysisDetail page** (new): Wrapper for AnalysisPanel with navigation
- **AnalysisCard** (new): Card component for analysis list items
- **AnalysisFilters** (reuse/extend): Filter component for status/tags
- **NavTabs** (modified): Add Analysis tab
- **RunDetail** (modified): Remove AnalysisPanel, add "View Analysis" link

---

## Assumptions

1. **Analysis is always associated with a run**: There is no standalone analysis; every analysis has a parent run. The URL `/analysis/:id` uses the run ID, not a separate analysis ID.

2. **Existing hooks can be reused**: `useAnalysis` hook can be used on the detail page. A new `useAnalysisList` hook may be needed for the list view, or existing queries can be extended.

3. **API already returns necessary data**: The GraphQL API already supports querying runs with their analysis status and can be filtered appropriately. No backend changes required for basic functionality.

4. **Filter behavior matches Runs tab**: Tag filtering is client-side (matching definitions), status filtering uses server-side query parameters where possible.

5. **Analysis computation UI unchanged**: The "Recompute" button and computation polling behavior remain the same, just moved to the dedicated analysis page.

---

## Out of Scope

- Bulk analysis operations (recompute multiple, delete multiple)
- Analysis comparison view (side-by-side comparison of two analyses)
- Analysis search by text content
- Analysis export functionality (CSV export remains on run detail)
- Changes to how analysis is computed or stored

---

## Constitution Compliance

Validated against `/Users/chrisanderson/Code/valuerank/cloud/CLAUDE.md`:

| Requirement | Status | Notes |
|-------------|--------|-------|
| File size < 400 lines | PASS | New pages should be well under 400 lines each |
| No `any` types | PASS | All components will be fully typed |
| Type safety | PASS | GraphQL types flow through to components |
| Import order | PASS | Will follow Node → External → Internal → Relative |
| Component organization | PASS | New components in `components/analysis/` and `pages/` |
| Test coverage 80%+ | NEEDS ATTENTION | Tests should be added for new pages and components |

**Constitution Check Result**: PASS
