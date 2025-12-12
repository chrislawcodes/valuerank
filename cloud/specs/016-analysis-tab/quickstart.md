# Quickstart: Analysis Tab

## Prerequisites

- [ ] Development environment running (`npm run dev` in cloud/)
- [ ] Database running with test data (`docker-compose up -d postgres`)
- [ ] At least one completed run with analysis data
- [ ] Logged in as test user (dev@valuerank.ai / development)

---

## Testing User Story 1: Browse Analysis Results

**Goal**: Verify users can browse analysis results in a dedicated tab

**Steps**:
1. Log in to the application
2. Click the "Analysis" tab in the navigation bar
3. Observe the list of runs with analysis

**Expected**:
- Analysis tab appears between "Runs" and "Experiments" in nav
- List displays runs that have analysis data
- Each card shows: definition name, run ID preview, computed date, model count
- List is sorted by analysis computed date (most recent first)
- Empty runs (no analysis) do not appear

**Verification**:
```bash
# Check database for runs with analysis
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank" \
  npx prisma studio
# Navigate to Run table, filter by analysisStatus != null
```

---

## Testing User Story 2: Filter and Search Analysis

**Goal**: Verify filtering and view modes work correctly

**Steps**:
1. Navigate to /analysis
2. Select "Current" from status filter
3. Observe results update
4. Select "Superseded" from status filter
5. Observe results change
6. Select a tag from tag filter
7. Observe results filter by tag
8. Toggle between Flat and Folder view modes
9. In Flat view, navigate pagination (if >10 results)

**Expected**:
- Status filter shows: All, Current, Superseded
- Selecting status filters results appropriately
- Tag filter works same as Runs tab
- Folder view groups by definition tags
- Flat view shows paginated list (10 per page)
- Pagination controls appear when >10 results

**Verification**:
- Network tab shows query with `hasAnalysis: true` parameter
- Query parameters update when filters change

---

## Testing User Story 3: View Analysis Detail Page

**Goal**: Verify analysis detail page displays all information

**Steps**:
1. Navigate to /analysis
2. Click on any analysis card
3. Observe the URL changes to /analysis/<runId>
4. View the analysis detail page
5. Click through all 6 tabs: Overview, Decisions, Scenarios, Values, Agreement, Methods
6. Locate the "Recompute" button
7. Locate the "View Run" link

**Expected**:
- URL is /analysis/<runId>
- "Back to Analysis" button appears in header
- "View Run" link navigates to /runs/<runId>
- All 6 AnalysisPanel tabs are present and functional
- Computed timestamp and duration displayed
- Recompute button visible (disabled while computing)

**Verification**:
```javascript
// In browser console, verify run ID matches
console.log(window.location.pathname) // /analysis/clxxxxxxxxx
```

---

## Testing User Story 4: Access Analysis from Run Detail

**Goal**: Verify link from run detail to analysis works

**Steps**:
1. Navigate to /runs
2. Click on a completed run that has analysis
3. Look for "View Analysis" link in the header area
4. Click the "View Analysis" link
5. Verify navigation to /analysis/<runId>
6. Go back to /runs
7. Click on a run WITHOUT analysis
8. Observe that "View Analysis" link is not present (or disabled)

**Expected**:
- Completed runs with analysis show "View Analysis" link prominently
- Link navigates to /analysis/<runId>
- Runs without analysis don't show the link (or show "Not available")
- The embedded AnalysisPanel is NO LONGER at the bottom of run detail

**Verification**:
- Scroll to bottom of run detail - AnalysisPanel should not be there
- "View Analysis" link should be visible near top of page

---

## Testing User Story 5: Analysis Tab Navigation

**Goal**: Verify tab appears and highlights correctly

**Steps**:
1. Log in and view navigation tabs
2. Note the position and icon of Analysis tab
3. Click Analysis tab
4. Observe it becomes active (highlighted)
5. Navigate to /analysis/<id> directly
6. Observe tab remains highlighted
7. Click on other tabs and return to Analysis

**Expected**:
- Analysis tab appears between Runs and Experiments
- Tab has chart-style icon (BarChart or similar)
- Tab highlights teal when active
- Tab stays highlighted on /analysis and /analysis/:id routes

**Verification**:
- Inspect NavTabs component in React DevTools
- Tab order: Definitions, Runs, Analysis, Experiments, Settings

---

## Edge Cases to Test

### No Analysis Exists
1. Create a new definition and start a run
2. Navigate to /analysis while run is still pending
3. Verify the run doesn't appear (no analysis yet)

**Expected**: Empty state or run not listed until analysis completes

### Analysis Computing
1. Find a run where analysis is still computing
2. Navigate to /analysis
3. Observe card shows "Computing..." status
4. Card should not be clickable (or show loading state)

**Expected**: Computing analysis shown with visual indicator

### Invalid Analysis URL
1. Navigate to /analysis/invalid-id-12345
2. Observe error handling

**Expected**: "Analysis not found" error with link back to /analysis

### Analysis Superseded
1. Find a run, trigger recompute
2. After recompute, old analysis is SUPERSEDED
3. Filter by "Superseded" status
4. Verify old analysis appears with muted styling

**Expected**: Superseded analysis visible but visually differentiated

---

## Troubleshooting

**Issue**: Analysis tab not appearing
**Fix**: Check NavTabs.tsx was updated, clear browser cache, verify route exists in App.tsx

**Issue**: No runs appear in analysis list
**Fix**: Ensure runs have `analysisStatus` set. Check database:
```sql
SELECT id, status, "analysisStatus" FROM runs WHERE "analysisStatus" IS NOT NULL;
```

**Issue**: "View Analysis" link not appearing on run detail
**Fix**: Verify run has `analysisStatus` = 'completed', check RunDetail.tsx changes

**Issue**: Analysis detail page shows 404
**Fix**: Check route is `/analysis/:id` in App.tsx, verify parameter parsing
