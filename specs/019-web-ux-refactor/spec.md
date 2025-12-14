# Feature Specification: Web UX Refactor

**Feature Branch**: `feat/019-web-ux-refactor`
**Created**: 2025-12-14
**Status**: Draft
**Input**: Refactor web tier to reduce file sizes, increase component reuse, and establish mobile-first foundations

---

## Overview

The ValueRank web application has grown organically, resulting in large monolithic components, inconsistent styling patterns, and minimal mobile support. This refactor establishes a scalable component architecture with reusable primitives and responsive design foundations.

### Current State Analysis

**Files Exceeding 400-Line Limit (9 total):**
| File | Lines | Primary Issue |
|------|-------|---------------|
| InfraPanel.tsx | 756 | Multiple model selector cards, inline queries |
| ModelsPanel.tsx | 687 | Provider sections, model forms combined |
| RunDetail.tsx | 642 | Page logic + inline UI + state management |
| DefinitionDetail.tsx | 562 | Editor + preview + actions combined |
| AnalysisPanel.tsx | 516 | 6 tabs + charts + state in one component |
| ValuesViz.tsx | 477 | Multiple chart types in single file |
| TimelineViz.tsx | 441 | Timeline + legend + filters combined |
| DecisionsViz.tsx | 422 | Distribution charts + cards + tooltips |
| ExpandedScenarios.tsx | 410 | Scenario list + details + loading states |

**Component Reuse Issues:**
- 103 raw `<button>` elements vs ~20 Button component imports
- Hardcoded teal color classes in 30+ locations
- No reusable Card, Badge, Modal, Select, or Avatar components
- Inline icon + text patterns repeated throughout

**Mobile Readiness:**
- Only ~12 responsive breakpoint usages (`md:`) in entire codebase
- No mobile navigation pattern (hamburger menu, bottom nav)
- Fixed-width layouts assume desktop viewport
- No touch-target size considerations

---

## User Scenarios & Testing

### User Story 1 - Component Library Foundation (Priority: P1)

Developers need a consistent set of atomic UI components so they can build features faster without reinventing common patterns, and users experience visual consistency across the application.

**Why this priority**: Foundation for all other work. Cannot refactor large files effectively without reusable components to extract into.

**Independent Test**: Create a `/dev/components` page (dev-only route) showing all atomic components with their variants. Verify each component renders correctly with all prop combinations.

**Acceptance Scenarios**:

1. **Given** a developer needs a styled card container, **When** they import `Card` from ui components, **Then** they get consistent padding, border-radius, shadow, and hover states without writing custom CSS.

2. **Given** a feature uses status indicators, **When** developer uses `Badge` component with variant prop, **Then** they get consistent colors for success/warning/error/info states matching the design system.

3. **Given** a form needs a dropdown, **When** developer uses `Select` component, **Then** they get keyboard navigation, proper ARIA attributes, and consistent styling.

4. **Given** content needs user-dismissable overlays, **When** developer uses `Modal` component, **Then** they get focus trap, escape-to-close, backdrop click handling, and responsive sizing.

---

### User Story 2 - Large File Decomposition (Priority: P1)

Developers maintaining the codebase need files under 400 lines so they can understand, test, and modify individual concerns without cognitive overload.

**Why this priority**: Core constitution requirement. Large files create merge conflicts, make testing difficult, and slow down feature development.

**Independent Test**: Run `find . -name "*.tsx" -exec wc -l {} \; | awk '$1 > 400'` and verify zero results in `apps/web/src/`.

**Acceptance Scenarios**:

1. **Given** InfraPanel.tsx at 756 lines, **When** refactored, **Then** each extracted component (ModelSelectorCard, InfraModelSection, ExpansionSettings) is under 200 lines and independently testable.

2. **Given** RunDetail.tsx at 642 lines, **When** refactored, **Then** page orchestration is under 200 lines, with RunHeader, RunMetadata, RunActions, and DeleteConfirmModal as separate components.

3. **Given** AnalysisPanel.tsx with 6 tabs, **When** refactored, **Then** each tab content is a separate component (OverviewTab, DecisionsTab, etc.) loaded on-demand.

4. **Given** visualization components (ValuesViz, TimelineViz, DecisionsViz), **When** refactored, **Then** chart primitives are extracted to shared `charts/` folder and composed in viz components.

---

### User Story 3 - Button Standardization (Priority: P2)

Users need consistent button styling and behavior across all interactions so they can predict how interactive elements work throughout the application.

**Why this priority**: Buttons are the most common interactive element. Inconsistency creates user confusion and maintenance burden.

**Independent Test**: Search for raw `<button` elements in codebase. Count should be zero (all should use `Button` component or explicit exemptions documented).

**Acceptance Scenarios**:

1. **Given** 103 raw button elements exist, **When** migration complete, **Then** all buttons use the `Button` component with appropriate variant (primary/secondary/ghost/danger).

2. **Given** icon-only buttons exist, **When** using Button component, **Then** `icon` prop and `aria-label` are properly set for accessibility.

3. **Given** buttons with loading states, **When** action is pending, **Then** `isLoading` prop disables interaction and shows spinner consistently.

---

### User Story 4 - Responsive Layout Foundation (Priority: P2)

Users on mobile devices need the application to be usable so they can check run status, view results, and perform basic actions from their phones.

**Why this priority**: Mobile usage is increasingly expected. Foundation work enables incremental mobile improvements without major rewrites.

**Independent Test**: Open application at 375px viewport width. All pages should be navigable without horizontal scroll. Core actions (view runs, see results) should be accessible.

**Acceptance Scenarios**:

1. **Given** a user on mobile device, **When** they open the app, **Then** navigation collapses to hamburger menu or bottom tabs with touch-friendly targets (min 44px).

2. **Given** data tables on mobile, **When** viewport is narrow, **Then** tables switch to card-based layout or horizontal scroll with pinned first column.

3. **Given** side-by-side layouts (filters + content), **When** on mobile, **Then** filters collapse to expandable panel or modal with "Apply" button.

4. **Given** any interactive element, **When** on touch device, **Then** touch targets are minimum 44x44px and have visible tap feedback.

---

### User Story 5 - Badge and Status Indicators (Priority: P2)

Users viewing lists need consistent status indicators so they can quickly scan and understand the state of runs, definitions, and transcripts.

**Why this priority**: Status badges appear on every list view. Inconsistent colors/shapes slow user comprehension.

**Independent Test**: Visual audit of all list pages. Status indicators should use identical Badge component with consistent color meanings.

**Acceptance Scenarios**:

1. **Given** run status display, **When** showing PENDING/RUNNING/COMPLETED/FAILED, **Then** each status uses Badge with predefined semantic color (blue/yellow/green/red).

2. **Given** tag display on definitions, **When** showing tags, **Then** uses Badge with `tag` variant (neutral gray, smaller size).

3. **Given** count indicators, **When** showing counts in navigation or filters, **Then** uses Badge with `count` variant (circular, minimal).

---

### User Story 6 - Card-Based Layouts (Priority: P3)

Users browsing lists and details need consistent container styling so content hierarchy is clear and the interface feels polished.

**Why this priority**: Cards provide visual structure. Not blocking for functionality but improves perceived quality.

**Independent Test**: All list items (DefinitionCard, RunCard, AnalysisCard) should use shared Card component with consistent padding/shadow/hover.

**Acceptance Scenarios**:

1. **Given** definition list items, **When** rendered, **Then** each uses Card component with consistent hover effect and click target.

2. **Given** detail page sections, **When** rendered, **Then** each section uses Card with appropriate padding variant (compact/default/spacious).

3. **Given** interactive cards, **When** user hovers, **Then** subtle elevation change provides feedback without jarring transitions.

---

## Edge Cases

- **What happens when components are used in unexpected contexts?** → Components should degrade gracefully with sensible defaults.
- **How does keyboard navigation work in new Select/Modal?** → Full keyboard support required (Tab, Enter, Escape, Arrow keys).
- **What if mobile user has no touch?** → Support both touch and mouse interactions; don't assume touch-only on mobile viewports.
- **How handle very long content in Cards/Badges?** → Truncation with title attribute for full text on hover.
- **What about existing tests?** → Refactored components must maintain existing test coverage; add tests for new atomic components.

---

## Requirements

### Functional Requirements

**Component Library (US1)**
- **FR-001**: System MUST provide Card component with variants: default, bordered, elevated, interactive
- **FR-002**: System MUST provide Badge component with variants: status (success/warning/error/info), tag, count
- **FR-003**: System MUST provide Select component with keyboard navigation and ARIA compliance
- **FR-004**: System MUST provide Modal component with focus trap, escape handling, and responsive sizing
- **FR-005**: System MUST provide Avatar component for user display with fallback initials
- **FR-006**: System MUST provide Tooltip component for contextual information

**File Size Compliance (US2)**
- **FR-007**: All .tsx files in apps/web/src MUST be under 400 lines (excluding generated code)
- **FR-008**: Complex components MUST be split into container (logic) and presentation (UI) layers
- **FR-009**: Shared utilities MUST be extracted to hooks/ or lib/ folders

**Button Migration (US3)**
- **FR-010**: All button elements MUST use the Button component
- **FR-011**: Button component MUST support icon-only variant with required aria-label

**Responsive Foundation (US4)**
- **FR-012**: Layout component MUST provide mobile navigation (hamburger or bottom tabs)
- **FR-013**: All pages MUST be viewable without horizontal scroll at 375px viewport
- **FR-014**: Touch targets MUST be minimum 44x44px on mobile viewports
- **FR-015**: System MUST provide responsive Table component with mobile card fallback

**Badge Standardization (US5)**
- **FR-016**: RunStatus displays MUST use Badge with semantic color mapping
- **FR-017**: Tag displays MUST use Badge with tag variant

**Card Standardization (US6)**
- **FR-018**: List item components MUST use Card as base container
- **FR-019**: Card MUST support onClick handler for interactive cards

---

## Success Criteria

- **SC-001**: Zero .tsx files exceed 400 lines in apps/web/src
- **SC-002**: Zero raw `<button>` elements remain (all use Button component)
- **SC-003**: All pages pass Lighthouse accessibility audit with score >90
- **SC-004**: All pages viewable without horizontal scroll at 375px viewport
- **SC-005**: Component library provides >90% of common UI patterns (measured by no new inline styles for standard elements)
- **SC-006**: Existing test coverage maintained or improved after refactor

---

## Key Entities

### Design Tokens (new)
```
colors:
  primary: teal-600
  primary-hover: teal-700
  success: green-500
  warning: amber-500
  error: red-500
  info: blue-500

spacing:
  touch-target: 44px
  card-padding: 16px (default), 12px (compact), 24px (spacious)

breakpoints:
  sm: 640px
  md: 768px
  lg: 1024px
  xl: 1280px
```

### Component Hierarchy (new)
```
components/ui/
├── Button.tsx (existing, enhanced)
├── Card.tsx (new)
├── Badge.tsx (new)
├── Select.tsx (new)
├── Modal.tsx (new)
├── Avatar.tsx (new)
├── Tooltip.tsx (new)
├── Table.tsx (new - responsive)
└── index.ts (barrel export)
```

---

## Assumptions

1. **Tailwind CSS remains the styling solution** - Not migrating to CSS-in-JS or other approaches
2. **No design system tool required** - Components documented in code; no Storybook needed initially
3. **Incremental rollout acceptable** - Can refactor files one at a time rather than big-bang
4. **Existing color palette is final** - Teal primary, semantic colors for status
5. **No IE11 support required** - Can use modern CSS (grid, flexbox, CSS variables)
6. **Test database available** - Can run existing tests during refactor to verify no regressions

---

## Out of Scope

- Animations/transitions beyond hover feedback
- Dark mode support
- Internationalization (i18n)
- Performance optimization (code splitting, lazy loading)
- Visual design changes beyond consistency
- New features or functionality
