# Quickstart: Definition Diff View

## Prerequisites

- [ ] Development environment running (`cd cloud && npm run dev`)
- [ ] Database running with test data (`docker-compose up -d postgres`)
- [ ] At least 2 completed runs with different definitions
- [ ] At least 2 completed runs with the same definition (for "identical" test)

## Testing User Story 1: View Template Diff Between Two Runs

**Goal**: Verify Monaco diff editor shows definition differences for 2 selected runs.

### Test 1.1: Different Definitions

**Steps**:
1. Navigate to `/compare`
2. Select 2 runs that use different definitions (check definition name in run list)
3. Click the "Definition" tab in the visualization navigation

**Expected**:
- Monaco diff editor appears with side-by-side view
- Left side shows first run's template
- Right side shows second run's template
- Added text highlighted in green
- Removed text highlighted in red
- Minimap visible on right edge

**Verification**:
- Both run names visible in header
- Scroll through diff to see all changes
- Toggle to "Preamble" tab if both runs have preambles

### Test 1.2: Identical Definitions

**Steps**:
1. Navigate to `/compare`
2. Select 2 runs that use the SAME definition
3. Click the "Definition" tab

**Expected**:
- Message shows "Definitions are identical"
- Full template displayed in read-only mode (not diff mode)

### Test 1.3: Preamble Tab Visibility

**Steps**:
1. Select 2 runs where at least one has a preamble
2. Go to Definition tab

**Expected**:
- Both "Template" and "Preamble" tabs visible
- Can switch between tabs
- Diff updates to show preamble content

**Steps (alternate)**:
1. Select 2 runs where NEITHER has a preamble
2. Go to Definition tab

**Expected**:
- Only "Template" tab visible
- No "Preamble" tab shown

---

## Testing User Story 2: Multi-Run Definition Preview

**Goal**: Verify grouped card view appears when 3+ runs selected.

### Test 2.1: Card Grouping

**Steps**:
1. Navigate to `/compare`
2. Select 3 or more runs (mix of same and different definitions)
3. Click the "Definition" tab

**Expected**:
- Card layout appears (not Monaco diff)
- Runs grouped by definition
- Each card shows:
  - Definition name
  - List of runs using this definition
  - Template preview (truncated to ~200 chars)

**Verification**:
- Count cards matches unique definition count
- Runs correctly grouped in each card

### Test 2.2: Compare Two Definitions

**Steps**:
1. With 3+ runs selected, view Definition tab
2. Click "Compare" on two different definition cards (if implemented)

**Expected**:
- View switches to Monaco diff mode
- Shows diff between the two selected definitions

---

## Testing User Story 3: Copy and Export (P3 - Optional)

**Goal**: Verify copy functionality works (if implemented).

**Steps**:
1. View a diff with 2 runs selected
2. Click "Copy Left" button

**Expected**:
- Left definition template copied to clipboard
- Toast notification confirms copy

**Steps**:
1. Click "Copy Diff" button

**Expected**:
- Unified diff format copied to clipboard
- Includes header with run/definition names

---

## Edge Cases to Test

### Missing Definition Content

**Steps**:
1. Find or create a run where `definition.resolvedContent` is null
2. Select it with another run
3. Go to Definition tab

**Expected**:
- Placeholder text "(No template defined)" shown for missing side
- No crash or error

### Very Long Template

**Steps**:
1. Use runs with templates >1000 lines (if available)
2. View Definition diff

**Expected**:
- Monaco renders without lag
- Minimap helpful for navigation
- Scrolling smooth

### URL State Persistence

**Steps**:
1. Select 2 runs and go to Definition tab
2. Note URL shows `?viz=definition`
3. Refresh page

**Expected**:
- Definition tab remains selected
- Same runs still selected
- Diff view intact

---

## Troubleshooting

**Issue**: Monaco editor blank or not rendering
**Fix**:
- Check browser console for errors
- Ensure Monaco worker files loaded (check Network tab)
- Try hard refresh (Ctrl+Shift+R)

**Issue**: "Definition" tab not appearing in navigation
**Fix**:
- Verify registration in `registry.tsx`
- Check import path is correct
- Ensure `minRuns: 2` requirement met

**Issue**: definitionContent undefined
**Fix**:
- Check `useComparisonData.ts` extracts from `resolvedContent`
- Verify GraphQL query includes `resolvedContent` field
- Check run's definition actually has template content in DB

**Issue**: Tests failing with Monaco errors
**Fix**:
- Ensure Monaco mock is properly set up in test file
- Check vitest.setup.ts for any global Monaco configuration
