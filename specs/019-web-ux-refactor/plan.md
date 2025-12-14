# Implementation Plan: Web UX Refactor

**Branch**: `feat/019-web-ux-refactor` | **Date**: 2025-12-14 | **Spec**: [spec.md](./spec.md)

## Summary

Refactor the ValueRank web application to reduce file sizes below 400 lines, introduce reusable atomic UI components (Card, Badge, Modal, Select), and establish responsive layout foundations for mobile support. This is a pure frontend refactor with no API or database changes.

---

## Technical Context

| Aspect | Value |
|--------|-------|
| **Language/Version** | TypeScript 5.x (React 18.2) |
| **Primary Dependencies** | React, Tailwind CSS 3.3, Lucide icons, Recharts, urql |
| **Storage** | N/A (no database changes) |
| **Testing** | Vitest + @testing-library/react |
| **Build Tool** | Vite 5.x |
| **Performance Goals** | Lighthouse accessibility >90, no horizontal scroll at 375px |
| **Constraints** | Maintain existing test coverage, incremental rollout |

---

## Constitution Check

**Status**: PASS

Per `cloud/CLAUDE.md`:

### File Size Limits (§ File Size Limits)
- [x] React components MUST be under 400 lines
- [x] Extract hooks/subcomponents if larger
- [x] Create folder with `index.ts` re-exporting pattern

### TypeScript Standards (§ TypeScript Standards)
- [x] No `any` types - all components will be fully typed
- [x] Strict mode maintained
- [x] Type function signatures for all component props

### Testing Requirements (§ Testing Requirements)
- [x] 80% minimum line coverage maintained
- [x] New components will have test coverage
- [x] Test structure follows describe/it pattern

**No violations identified.**

---

## Architecture Decisions

### Decision 1: Component Decomposition Strategy

**Chosen**: Folder-based extraction with barrel exports

**Rationale**:
- Aligns with constitution pattern for splitting large files
- Existing pattern in `services/runs/` folder structure
- Allows incremental migration without breaking imports

**Implementation**:
```
# Before: Single large file
components/settings/InfraPanel.tsx (756 lines)

# After: Folder with sub-components
components/settings/infra/
├── index.ts              # Re-exports InfraPanel
├── InfraPanel.tsx        # Orchestration (<150 lines)
├── ModelSelectorCard.tsx # Single model selection UI
├── ExpansionSettings.tsx # Code generation toggle
├── ParallelismSettings.tsx # Summarization controls
└── types.ts              # Shared types
```

**Alternatives Considered**:
- **Inline extraction to same folder**: Rejected - pollutes flat folder, harder to navigate
- **Move to generic `shared/` folder**: Rejected - loses domain context

**Tradeoffs**:
- Pros: Clear ownership, easy to find related code, enables lazy loading later
- Cons: More files to navigate, slightly more import boilerplate

---

### Decision 2: Atomic Component Library Approach

**Chosen**: Build minimal internal component library in `components/ui/`

**Rationale**:
- Existing `components/ui/` folder has Button, Input, Tabs, Loading, ErrorMessage
- Consistent with current architecture
- No external UI library dependency (keep bundle small)

**Implementation**:
```
components/ui/
├── index.ts         # Barrel export all components
├── Button.tsx       # Enhanced with icon-only support
├── Card.tsx         # NEW: Container with variants
├── Badge.tsx        # NEW: Status/tag indicators
├── Modal.tsx        # NEW: Dialog with focus trap
├── Select.tsx       # NEW: Dropdown with keyboard nav
├── Avatar.tsx       # NEW: User display
├── Tooltip.tsx      # NEW: Contextual info
├── Table.tsx        # NEW: Responsive data display
├── Input.tsx        # Existing
├── Tabs.tsx         # Existing
├── Loading.tsx      # Existing
├── ErrorMessage.tsx # Existing
└── EmptyState.tsx   # Existing
```

**Alternatives Considered**:
- **Headless UI / Radix**: Rejected - adds dependency, we need simple components
- **shadcn/ui**: Rejected - heavier installation, copy-paste model adds maintenance burden
- **Full design system (Chakra, MUI)**: Rejected - overkill for current scale, large bundle

**Tradeoffs**:
- Pros: Full control, minimal bundle size, matches existing patterns
- Cons: Need to implement keyboard/accessibility ourselves

---

### Decision 3: Button Migration Strategy

**Chosen**: Gradual file-by-file migration with ESLint rule

**Rationale**:
- 103 raw buttons across many files - big bang risky
- Can migrate during file decomposition work
- ESLint rule prevents new violations

**Implementation**:
1. Enhance `Button.tsx` with `iconOnly` prop and `aria-label` requirement
2. Add ESLint rule to warn on raw `<button>` usage
3. Migrate buttons file-by-file during decomposition
4. Final pass to catch stragglers

**ESLint Rule** (add to `.eslintrc`):
```javascript
rules: {
  'react/forbid-elements': ['warn', {
    forbid: [{
      element: 'button',
      message: 'Use <Button> from components/ui/Button instead'
    }]
  }]
}
```

**Alternatives Considered**:
- **Codemod**: Rejected - button variations too diverse for automated conversion
- **Big bang conversion**: Rejected - too risky, hard to review

**Tradeoffs**:
- Pros: Safe incremental approach, prevents regressions
- Cons: Longer timeline, temporary inconsistency

---

### Decision 4: Responsive Layout Approach

**Chosen**: Mobile-first CSS with Tailwind breakpoints + collapsible navigation

**Rationale**:
- Tailwind already configured with standard breakpoints
- Mobile-first aligns with best practices
- Hamburger menu pattern familiar to users

**Implementation**:
1. Update `Layout.tsx` to detect viewport and show mobile nav
2. Create `MobileNav.tsx` hamburger menu component
3. Add responsive utilities to `Card` and `Table` components
4. Apply `min-h-[44px]` to all interactive elements on mobile

**Breakpoint Strategy**:
```
Mobile:  < 640px  (sm:)  - Stack layouts, hamburger nav, card-based tables
Tablet:  640-1024 (md:)  - Sidebar visible, 2-column where appropriate
Desktop: > 1024px (lg:)  - Full layout, all features visible
```

**Alternatives Considered**:
- **Bottom tab navigation**: Rejected - less familiar pattern, harder thumb reach for top actions
- **Separate mobile app**: Rejected - out of scope, maintenance burden

**Tradeoffs**:
- Pros: Single codebase, progressive enhancement, SEO-friendly
- Cons: Some complex layouts may need significant rework

---

### Decision 5: CVA Pattern for Component Variants

**Chosen**: Adopt Class Variance Authority (CVA) for all UI components

**Rationale**:
- Type-safe variant definitions with excellent TypeScript support
- Clean separation of variant logic from component markup
- Composable with `tailwind-merge` for conflict-free class composition
- Industry standard pattern used by shadcn/ui and modern React component libraries
- Lightweight (~1KB gzipped)

**Implementation**:
```typescript
// components/ui/Button.tsx
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  // Base styles applied to all variants
  'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        primary: 'bg-teal-600 text-white hover:bg-teal-700 focus:ring-teal-500',
        secondary: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 focus:ring-gray-500',
        ghost: 'bg-transparent text-teal-600 hover:bg-teal-50 focus:ring-teal-500',
        danger: 'bg-orange-500 text-white hover:bg-orange-600 focus:ring-orange-500',
      },
      size: {
        sm: 'px-3 py-1.5 text-sm',
        md: 'px-4 py-2 text-base',
        lg: 'px-6 py-3 text-lg',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    isLoading?: boolean;
  };

export function Button({ variant, size, className, ...props }: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
```

**Utility Function** (`lib/utils.ts`):
```typescript
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**Badge Example**:
```typescript
const badgeVariants = cva(
  'inline-flex items-center rounded-full font-medium',
  {
    variants: {
      variant: {
        success: 'bg-green-100 text-green-700',
        warning: 'bg-amber-100 text-amber-700',
        error: 'bg-red-100 text-red-700',
        info: 'bg-blue-100 text-blue-700',
        tag: 'bg-gray-100 text-gray-600',
      },
      size: {
        sm: 'px-2 py-0.5 text-xs',
        md: 'px-2.5 py-1 text-sm',
      },
    },
    defaultVariants: {
      variant: 'info',
      size: 'md',
    },
  }
);
```

**Alternatives Considered**:
- **Inline conditional classes**: Rejected - messy, hard to read, no type safety
- **Separate CSS files**: Rejected - loses Tailwind benefits, harder to maintain
- **styled-components/Emotion**: Rejected - different paradigm, bundle size overhead

**Tradeoffs**:
- Pros: Type-safe variants, clean APIs, easy to test, good DX
- Cons: Additional dependency (~3KB total with tailwind-merge), learning curve

---

### Decision 6: Large File Decomposition Priority

**Chosen**: Ordered by size and interdependency

**Rationale**:
- Largest files have most to gain
- Settings panels are isolated (low risk)
- Page files need atomic components first

**Order of Operations**:
| Phase | File | Lines | Strategy |
|-------|------|-------|----------|
| 1 | InfraPanel.tsx | 756 | Extract 4 sub-components |
| 2 | ModelsPanel.tsx | 687 | Extract ProviderSection, ModelForm, ModelRow |
| 3 | RunDetail.tsx | 642 | Extract RunHeader, RunMetadata, DeleteConfirmModal |
| 4 | DefinitionDetail.tsx | 562 | Extract EditorPanel, PreviewPanel, ActionBar |
| 5 | AnalysisPanel.tsx | 516 | Extract tab content to separate files |
| 6 | ValuesViz.tsx | 477 | Extract chart components to charts/ |
| 7 | TimelineViz.tsx | 441 | Extract TimelineCard, TimelineLegend |
| 8 | DecisionsViz.tsx | 422 | Extract distribution chart primitives |
| 9 | ExpandedScenarios.tsx | 410 | Extract ScenarioItem, ScenarioDetail |

**Alternatives Considered**:
- **Alphabetical**: Rejected - doesn't prioritize highest impact
- **By feature area**: Rejected - settings files happen to be largest

**Tradeoffs**:
- Pros: Quick wins first, builds momentum
- Cons: Some files may have hidden dependencies requiring adjustment

---

## Project Structure

### Current Structure (Monolithic Components)
```
cloud/apps/web/src/
├── components/
│   ├── analysis/        # 15 files (AnalysisPanel.tsx is 516 lines)
│   ├── compare/         # 9 files (visualizations/ has 3 large files)
│   ├── definitions/     # 17 files (ExpandedScenarios.tsx is 410 lines)
│   ├── layout/          # 3 files (Layout, Header, NavTabs)
│   ├── runs/            # 15 files (RunProgress, TranscriptList, etc.)
│   ├── settings/        # 6 files (InfraPanel 756, ModelsPanel 687 lines)
│   └── ui/              # 7 files (Button, Input, Tabs, etc.)
├── pages/               # 9 files (RunDetail 642, DefinitionDetail 562 lines)
├── hooks/               # Custom hooks
└── lib/                 # Utilities
```

### Target Structure (Decomposed)
```
cloud/apps/web/src/
├── components/
│   ├── analysis/
│   │   ├── tabs/                    # NEW: Tab content extracted
│   │   │   ├── OverviewTab.tsx
│   │   │   ├── DecisionsTab.tsx
│   │   │   └── ...
│   │   └── AnalysisPanel.tsx        # Orchestration only
│   ├── compare/
│   │   ├── charts/                  # NEW: Shared chart primitives
│   │   │   ├── DistributionChart.tsx
│   │   │   ├── TimelineChart.tsx
│   │   │   └── HeatmapChart.tsx
│   │   └── visualizations/          # Simplified composition
│   ├── layout/
│   │   ├── Layout.tsx
│   │   ├── Header.tsx
│   │   ├── NavTabs.tsx
│   │   └── MobileNav.tsx            # NEW: Mobile navigation
│   ├── settings/
│   │   ├── infra/                   # NEW: Folder extraction
│   │   │   ├── index.ts
│   │   │   ├── InfraPanel.tsx
│   │   │   ├── ModelSelectorCard.tsx
│   │   │   └── ...
│   │   └── models/                  # NEW: Folder extraction
│   │       ├── index.ts
│   │       ├── ModelsPanel.tsx
│   │       └── ...
│   └── ui/                          # Enhanced component library
│       ├── index.ts                 # NEW: Barrel export
│       ├── Button.tsx               # Enhanced
│       ├── Card.tsx                 # NEW
│       ├── Badge.tsx                # NEW
│       ├── Modal.tsx                # NEW
│       ├── Select.tsx               # NEW
│       └── ...
├── pages/
│   ├── RunDetail/                   # NEW: Folder extraction
│   │   ├── index.ts
│   │   ├── RunDetail.tsx
│   │   ├── RunHeader.tsx
│   │   └── DeleteConfirmModal.tsx
│   └── DefinitionDetail/            # NEW: Folder extraction
│       └── ...
└── ...
```

---

## Implementation Phases

### Phase 1: Component Library Foundation (US1)
Build atomic components before decomposition work begins.

**Setup Tasks**:
1. Install CVA dependencies: `npm install class-variance-authority clsx tailwind-merge`
2. Create `lib/utils.ts` with `cn()` helper function
3. Migrate existing Button.tsx to CVA pattern as reference implementation

**Files to Create**:
- `lib/utils.ts` - `cn()` utility for class composition
- `components/ui/Card.tsx` - Container with variants (using CVA)
- `components/ui/Badge.tsx` - Status indicators (using CVA)
- `components/ui/Modal.tsx` - Dialog with focus trap
- `components/ui/Select.tsx` - Dropdown with keyboard nav
- `components/ui/Avatar.tsx` - User display (using CVA)
- `components/ui/Tooltip.tsx` - Contextual info
- `components/ui/index.ts` - Barrel export

**Files to Update**:
- `components/ui/Button.tsx` - Refactor to CVA pattern, add iconOnly variant
- `components/ui/Input.tsx` - Refactor to CVA pattern for consistency
- `components/ui/Tabs.tsx` - Refactor to CVA pattern for consistency

**Tests to Add**:
- `tests/components/ui/Card.test.tsx`
- `tests/components/ui/Badge.test.tsx`
- `tests/components/ui/Modal.test.tsx`
- `tests/components/ui/Select.test.tsx`

---

### Phase 2: Settings Panel Decomposition (US2 partial)
Tackle largest files first - they're isolated from other features.

**InfraPanel (756 → ~150 + 4 sub-components)**:
- `settings/infra/InfraPanel.tsx` - Orchestration
- `settings/infra/ModelSelectorCard.tsx` - Single model picker
- `settings/infra/ExpansionSettings.tsx` - Code gen toggle
- `settings/infra/ParallelismSettings.tsx` - Parallel config
- `settings/infra/types.ts` - Shared types

**ModelsPanel (687 → ~150 + 4 sub-components)**:
- `settings/models/ModelsPanel.tsx` - Orchestration
- `settings/models/ProviderSection.tsx` - Provider accordion
- `settings/models/ModelForm.tsx` - Add/edit form
- `settings/models/ModelRow.tsx` - Single model display

---

### Phase 3: Page Decomposition (US2 partial)
Extract page sub-components.

**RunDetail (642 → ~180 + 4 sub-components)**:
- `pages/RunDetail/RunDetail.tsx` - Page orchestration
- `pages/RunDetail/RunHeader.tsx` - Title, status, actions
- `pages/RunDetail/RunMetadata.tsx` - Dates, duration, definition
- `pages/RunDetail/DeleteConfirmModal.tsx` - Confirmation dialog

**DefinitionDetail (562 → ~150 + 3 sub-components)**:
- `pages/DefinitionDetail/DefinitionDetail.tsx` - Orchestration
- `pages/DefinitionDetail/EditorPanel.tsx` - Template editor
- `pages/DefinitionDetail/PreviewPanel.tsx` - Scenario preview
- `pages/DefinitionDetail/ActionBar.tsx` - Save/fork/delete

---

### Phase 4: Analysis & Visualization Decomposition (US2 partial)
Extract analysis tabs and chart primitives.

**AnalysisPanel (516 → ~120 + 6 tabs)**:
- `analysis/AnalysisPanel.tsx` - Tab orchestration
- `analysis/tabs/OverviewTab.tsx`
- `analysis/tabs/DecisionsTab.tsx`
- `analysis/tabs/ScenariosTab.tsx`
- `analysis/tabs/ValuesTab.tsx`
- `analysis/tabs/AgreementTab.tsx`
- `analysis/tabs/MethodsTab.tsx`

**Visualization files**:
- Extract shared chart components to `compare/charts/`
- Simplify ValuesViz, TimelineViz, DecisionsViz to composition

---

### Phase 5: Button Migration (US3)
Systematic conversion of raw buttons.

**Strategy**:
1. Add ESLint warning rule for raw `<button>`
2. Convert buttons in each file during Phase 2-4 work
3. Final sweep for remaining violations
4. Promote ESLint rule to error

---

### Phase 6: Responsive Foundation (US4)
Add mobile support to Layout and key components.

**Files to Create**:
- `components/layout/MobileNav.tsx` - Hamburger menu
- `components/ui/Table.tsx` - Responsive table with card fallback

**Files to Update**:
- `components/layout/Layout.tsx` - Viewport detection, nav switching
- `components/ui/Card.tsx` - Touch target spacing
- All filter components - Collapsible on mobile

---

### Phase 7: Badge Standardization (US5)
Replace hardcoded status styles with Badge component.

**Files to Update**:
- `components/runs/RunCard.tsx` - Use Badge for status
- `components/analysis/AnalysisCard.tsx` - Use Badge for status
- `components/definitions/TagChips.tsx` - Use Badge variant
- All list components with status indicators

---

### Phase 8: Card Standardization (US6)
Migrate list items to use Card component.

**Files to Update**:
- `components/definitions/DefinitionCard.tsx` - Use Card as base
- `components/runs/RunCard.tsx` - Use Card as base
- `components/analysis/AnalysisCard.tsx` - Use Card as base

---

## Testing Strategy

### Unit Tests (Vitest + Testing Library)

**New Component Tests**:
```typescript
// tests/components/ui/Card.test.tsx
describe('Card', () => {
  it('renders children', () => {...});
  it('applies variant styles', () => {...});
  it('handles onClick for interactive variant', () => {...});
  it('applies hover effect on interactive', () => {...});
});

// tests/components/ui/Badge.test.tsx
describe('Badge', () => {
  it('renders with success variant', () => {...});
  it('renders with tag variant', () => {...});
  it('truncates long content with title', () => {...});
});

// tests/components/ui/Modal.test.tsx
describe('Modal', () => {
  it('traps focus when open', () => {...});
  it('closes on escape key', () => {...});
  it('closes on backdrop click', () => {...});
  it('returns focus on close', () => {...});
});
```

### Integration Tests

**Refactored Component Tests**:
- Ensure existing tests pass after extraction
- Add tests for new sub-components
- Test component composition

### Visual Regression (Manual)

**Mobile Testing Checklist**:
- [ ] 375px viewport - no horizontal scroll
- [ ] Touch targets ≥44px
- [ ] Mobile nav opens/closes
- [ ] Filters collapse properly

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking existing functionality | Run test suite after each file change |
| Import path changes | Use folder/index.ts to maintain API |
| Performance regression | Verify bundle size doesn't increase significantly |
| Accessibility regression | Lighthouse audit after each phase |

---

## Dependencies

**New npm dependencies (3 packages, ~3KB gzipped total)**:

```bash
npm install class-variance-authority clsx tailwind-merge
```

| Package | Size | Purpose |
|---------|------|---------|
| `class-variance-authority` | ~1KB | Type-safe variant definitions |
| `clsx` | ~0.5KB | Conditional class composition |
| `tailwind-merge` | ~1.5KB | Intelligent Tailwind class merging |

**Why these packages**:
- CVA is the industry standard for Tailwind component variants
- clsx handles conditional classes cleanly
- tailwind-merge prevents conflicting Tailwind classes (e.g., `p-4 p-2` → `p-2`)

**Files to Create**:
```typescript
// lib/utils.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**Optional Enhancement** (not required):
- `@headlessui/react` - Could simplify Modal/Select if complexity grows

---

## Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Files >400 lines | 9 | 0 | `find . -name "*.tsx" -exec wc -l {} \; \| awk '$1 > 400'` |
| Raw `<button>` elements | 103 | 0 | `grep -r "<button" --include="*.tsx" \| wc -l` |
| Responsive breakpoints | ~12 | >50 | `grep -r "md:\|sm:\|lg:" --include="*.tsx" \| wc -l` |
| Lighthouse accessibility | Unknown | >90 | Run Lighthouse audit |
| Test coverage | Current | ≥Current | `npm run test:coverage` |
