# Quickstart: Web UX Refactor

## Prerequisites

- [ ] Development environment running (`npm run dev` in `cloud/apps/web`)
- [ ] API server running on port 3031
- [ ] Test user account available (`dev@valuerank.ai` / `development`)
- [ ] Chrome DevTools or similar for responsive testing
- [ ] At least one run with completed results for testing

---

## Testing User Story 1: Component Library Foundation

**Goal**: Verify all new atomic components work correctly with their variants.

### Test Card Component

**Steps**:
1. Navigate to any page with card-based content (e.g., `/runs`)
2. Inspect a card element in DevTools
3. Verify it uses the `Card` component (check class names)

**Expected**:
- Cards have consistent padding (16px default)
- Cards have subtle shadow (`shadow-sm`)
- Interactive cards show hover effect (slight elevation change)
- Cards have consistent border-radius

**Verification**:
```bash
# Check Card component is used across the codebase
grep -r "import.*Card.*from.*ui" cloud/apps/web/src --include="*.tsx" | wc -l
# Should be > 0 for each card-based component
```

### Test Badge Component

**Steps**:
1. Navigate to `/runs` to see run status badges
2. Look for PENDING, RUNNING, COMPLETED, FAILED statuses
3. Navigate to `/definitions` to see tag badges

**Expected**:
- PENDING: Blue badge
- RUNNING: Yellow/amber badge with animation
- COMPLETED: Green badge
- FAILED: Red badge
- Tags: Gray/neutral badge, smaller size

### Test Modal Component

**Steps**:
1. Navigate to any page with delete action (e.g., `/runs/:id`)
2. Click delete button to open confirmation modal
3. Press Escape key
4. Click delete again, then click outside modal

**Expected**:
- Modal centers on screen with backdrop
- Escape key closes modal
- Clicking backdrop closes modal
- Focus is trapped inside modal (Tab cycles through modal elements only)
- Focus returns to delete button when modal closes

### Test Select Component

**Steps**:
1. Navigate to `/settings` → Models panel
2. Find any dropdown selector
3. Use keyboard navigation (Arrow keys, Enter, Escape)

**Expected**:
- Dropdown opens on click
- Arrow keys navigate options
- Enter selects highlighted option
- Escape closes without selection
- Tab moves focus appropriately

---

## Testing User Story 2: Large File Decomposition

**Goal**: Verify all .tsx files are under 400 lines and functionality is preserved.

### Run Line Count Check

**Steps**:
```bash
cd cloud/apps/web/src
find . -name "*.tsx" -exec wc -l {} \; | awk '$1 > 400' | sort -rn
```

**Expected**:
- Output should be empty (no files > 400 lines)

### Test InfraPanel Refactor

**Steps**:
1. Navigate to `/settings` → Infrastructure tab
2. Verify all three model selectors are visible (Scenario Generator, Judge, Summarizer)
3. Change the Scenario Generator model
4. Toggle code generation on/off
5. Adjust summarization parallelism

**Expected**:
- All UI elements render correctly
- Model selection persists after page refresh
- Toggle saves immediately
- Parallelism slider works and saves

**Verification**:
```bash
# Check InfraPanel is now a folder
ls -la cloud/apps/web/src/components/settings/infra/
# Should show: index.ts, InfraPanel.tsx, ModelSelectorCard.tsx, etc.

# Check each file is under 400 lines
wc -l cloud/apps/web/src/components/settings/infra/*.tsx
```

### Test ModelsPanel Refactor

**Steps**:
1. Navigate to `/settings` → Models tab
2. Expand each provider section
3. View model details
4. Test add/edit model form if available

**Expected**:
- Provider sections expand/collapse correctly
- Model list displays correctly
- Forms work as before

### Test RunDetail Refactor

**Steps**:
1. Navigate to a specific run (`/runs/:id`)
2. Verify header shows run name, status, actions
3. Verify metadata shows dates, duration, definition link
4. Test delete action (opens confirmation modal)
5. Test export action if available

**Expected**:
- All sections render correctly
- Delete confirmation modal works
- Actions trigger correctly

### Test DefinitionDetail Refactor

**Steps**:
1. Navigate to a definition (`/definitions/:id`)
2. Verify editor panel shows template
3. Verify preview panel shows scenarios
4. Test save action
5. Test fork action

**Expected**:
- Template editor loads correctly
- Preview updates on changes
- Actions work as before

### Test AnalysisPanel Refactor

**Steps**:
1. Navigate to a completed run's analysis (`/runs/:id` → Analysis section)
2. Click through all 6 tabs: Overview, Decisions, Scenarios, Values, Agreement, Methods
3. Verify charts and data load in each tab

**Expected**:
- Each tab loads correct content
- Charts render properly
- Data matches expectations

---

## Testing User Story 3: Button Standardization

**Goal**: Verify all buttons use the Button component.

### Check for Raw Buttons

**Steps**:
```bash
cd cloud/apps/web/src
grep -rn "<button" --include="*.tsx" | grep -v "Button" | wc -l
```

**Expected**:
- Count should be 0

### Visual Button Audit

**Steps**:
1. Navigate through all major pages
2. Identify all clickable buttons
3. Check for consistent styling

**Expected**:
- Primary actions: Teal background, white text
- Secondary actions: White background, gray border
- Destructive actions: Orange/red background
- All buttons have consistent padding and border-radius
- Loading states show spinner

---

## Testing User Story 4: Responsive Layout Foundation

**Goal**: Verify mobile usability at 375px viewport.

### Mobile Navigation Test

**Steps**:
1. Open Chrome DevTools → Toggle device toolbar
2. Select iPhone SE (375px width) or similar
3. Load the application
4. Look for hamburger menu icon
5. Click to open mobile navigation
6. Navigate to different pages

**Expected**:
- Hamburger menu visible on mobile
- Menu opens as slide-over or dropdown
- All main nav items accessible
- Touch targets are easily tappable (≥44px)

### Mobile Layout Test - Runs Page

**Steps**:
1. At 375px viewport, navigate to `/runs`
2. Scroll through the run list
3. Click on a run card

**Expected**:
- No horizontal scroll
- Run cards stack vertically
- Status badges visible
- Cards are tappable

### Mobile Layout Test - Run Detail

**Steps**:
1. At 375px viewport, navigate to a run detail page
2. Scroll through all sections
3. Check progress indicators
4. Check action buttons

**Expected**:
- Content fits viewport width
- Progress bars scale appropriately
- Action buttons are accessible and large enough

### Mobile Layout Test - Filters

**Steps**:
1. At 375px viewport, navigate to `/runs` or `/definitions`
2. Look for filter controls
3. Interact with filters

**Expected**:
- Filters collapse to expandable section or modal
- Filter button shows active filter count
- Filter panel doesn't overflow viewport

### Touch Target Audit

**Steps**:
1. At 375px viewport, use DevTools to inspect interactive elements
2. Check computed height/width of buttons, links, controls

**Expected**:
- Minimum 44x44px for all touch targets
- Adequate spacing between adjacent targets

---

## Testing User Story 5: Badge and Status Indicators

**Goal**: Verify consistent status colors across all list views.

### Run Status Colors

**Steps**:
1. Navigate to `/runs`
2. Find or create runs with different statuses

**Expected**:
| Status | Color | Appearance |
|--------|-------|------------|
| PENDING | Blue | `bg-blue-100 text-blue-700` |
| RUNNING | Amber | `bg-amber-100 text-amber-700` with pulse |
| COMPLETED | Green | `bg-green-100 text-green-700` |
| FAILED | Red | `bg-red-100 text-red-700` |

### Tag Badge Styling

**Steps**:
1. Navigate to `/definitions`
2. Look for definition tags

**Expected**:
- Smaller size than status badges
- Gray/neutral color (`bg-gray-100 text-gray-600`)
- Rounded pill shape

---

## Testing User Story 6: Card-Based Layouts

**Goal**: Verify consistent card styling across list views.

### Definition Cards

**Steps**:
1. Navigate to `/definitions`
2. Inspect card elements

**Expected**:
- Consistent padding
- Subtle shadow
- Hover effect (slight elevation or border change)
- Click anywhere on card navigates to detail

### Run Cards

**Steps**:
1. Navigate to `/runs`
2. Inspect card elements

**Expected**:
- Same styling as definition cards
- Status badge positioned consistently
- Metadata aligned consistently

### Analysis Cards

**Steps**:
1. Navigate to a completed run's results
2. Find any card-based displays

**Expected**:
- Consistent with other card styles

---

## Troubleshooting

### Issue: Component not rendering
**Fix**: Check import path - may need to update from direct file import to folder import
```typescript
// Old
import { InfraPanel } from '../components/settings/InfraPanel';
// New
import { InfraPanel } from '../components/settings/infra';
```

### Issue: Test failing after refactor
**Fix**: Check if component was renamed or props changed. Update test imports and assertions.

### Issue: Mobile nav not appearing
**Fix**: Verify viewport detection hook is working. Check Layout component renders MobileNav conditionally.

### Issue: Focus trap not working in Modal
**Fix**: Ensure focus-trap logic is correctly implemented. Check that focusable elements are properly identified.

### Issue: Button variant not matching
**Fix**: Verify correct variant prop is passed. Check Button component variant styles.

---

## Post-Refactor Verification

### Final Checks
```bash
# 1. No files over 400 lines
find cloud/apps/web/src -name "*.tsx" -exec wc -l {} \; | awk '$1 > 400'

# 2. No raw buttons
grep -rn "<button" cloud/apps/web/src --include="*.tsx" | grep -v "import" | wc -l

# 3. Tests pass
cd cloud && npm test

# 4. Build succeeds
cd cloud && npm run build

# 5. Lint passes
cd cloud/apps/web && npm run lint
```

### Lighthouse Audit
1. Run app in production mode: `npm run build && npm run preview`
2. Open Chrome DevTools → Lighthouse
3. Run accessibility audit
4. Target score: >90
