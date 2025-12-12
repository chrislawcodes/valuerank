# Implementation Plan: Analysis Tab

**Branch**: `feat/016-analysis-tab` | **Date**: 2025-12-11 | **Spec**: [spec.md](./spec.md)

## Summary

Add a dedicated Analysis tab to the navigation that lists runs with analysis data, with drill-in to a standalone analysis detail page. This mirrors the existing Runs tab UX (filtering, pagination, folder view) while removing the embedded AnalysisPanel from RunDetail and replacing it with a link.

---

## Technical Context

**Language/Version**: TypeScript 5.3+ (React 18, Node.js)
**Primary Dependencies**: React Router, URQL (GraphQL), Lucide React icons, Tailwind CSS
**Storage**: PostgreSQL via Prisma (no schema changes needed)
**Testing**: Vitest
**Target Platform**: Vite SPA + Express API
**Performance Goals**: Initial load < 2s, filter response < 500ms (per SC-001, SC-002)
**Constraints**: Files < 400 lines, 80%+ test coverage

---

## Constitution Check

**Status**: PASS

Per `/Users/chrisanderson/Code/valuerank/cloud/CLAUDE.md`:

| Section | Requirement | Status |
|---------|-------------|--------|
| File Size | < 400 lines per file | PASS - New pages ~150-250 lines each |
| TypeScript | No `any` types, strict mode | PASS - Following existing patterns |
| Testing | 80% minimum coverage | NEEDS - Tests required for new components |
| Logging | Use centralized logger | PASS - No backend changes needed |
| Component Org | components/, pages/, hooks/ structure | PASS - Following existing patterns |

---

## Architecture Decisions

### Decision 1: Reuse `runs` GraphQL Query with `hasAnalysis` Filter

**Chosen**: Extend existing `runs` query with optional `hasAnalysis` filter rather than creating new `runsWithAnalysis` query.

**Rationale**:
- Minimal backend changes
- Existing `Run` type already includes `analysisStatus` field
- Client already handles Run data structures

**Alternatives Considered**:
- New `runsWithAnalysis` query: More specific but adds maintenance burden
- Query all runs client-side, filter by analysisStatus: Inefficient for large datasets

**Tradeoffs**:
- Pros: Minimal API changes, consistent data model
- Cons: Slightly more data transferred (full Run objects vs. analysis-specific subset)

---

### Decision 2: URL Structure `/analysis/:runId`

**Chosen**: Use run ID in the analysis URL (not analysis result ID)

**Rationale**:
- Analysis is always 1:1 with a run (CURRENT status)
- Simpler mental model for users
- Enables easy linking between run and analysis views

**Alternatives Considered**:
- `/analysis/:analysisId`: Would require new lookup pattern, breaks when analysis is recomputed

**Tradeoffs**:
- Pros: Consistent with run-centric data model, stable URLs
- Cons: Slightly less RESTful (analysis is technically a child resource)

---

### Decision 3: Component Reuse Strategy

**Chosen**: Create new `AnalysisCard` component, reuse `RunFilters` with minor extension

**Rationale**:
- AnalysisCard needs different display (computed date vs created date, no progress bar)
- RunFilters structure works, just needs analysis status options instead of run status
- Folder view logic can be extracted to shared utility

**Alternatives Considered**:
- Fully generic Card component: Over-abstraction for two use cases
- Copy RunFilters entirely: Duplication, maintenance burden

---

### Decision 4: Backend Query Extension

**Chosen**: Add `hasAnalysis: Boolean` parameter to existing `runs` query

**Rationale**:
- Single query modification
- Leverages existing sorting and pagination
- Consistent with existing filtering pattern

**Implementation**:
```typescript
// In apps/api/src/graphql/queries/run.ts
hasAnalysis: t.arg.boolean({
  required: false,
  description: 'Filter to runs that have analysis (any status)',
}),
```

Where clause addition:
```typescript
if (args.hasAnalysis === true) {
  where.analysisStatus = { not: null };
}
```

---

## Project Structure

### Files to Create

```
apps/web/src/
├── pages/
│   ├── Analysis.tsx          # List page (mirrors Runs.tsx)
│   └── AnalysisDetail.tsx    # Detail page (wrapper for AnalysisPanel)
├── components/
│   └── analysis/
│       ├── AnalysisCard.tsx      # Card for list display
│       ├── AnalysisListFilters.tsx  # Filters (status, tags, view mode)
│       └── AnalysisFolderView.tsx   # Folder view by tag
├── hooks/
│   └── useRunsWithAnalysis.ts   # Hook for fetching runs with analysis
```

### Files to Modify

```
apps/web/src/
├── App.tsx                   # Add /analysis and /analysis/:id routes
├── components/
│   └── layout/
│       └── NavTabs.tsx       # Add Analysis tab
├── pages/
│   └── RunDetail.tsx         # Remove AnalysisPanel, add link

apps/api/src/
├── graphql/
│   └── queries/
│       └── run.ts            # Add hasAnalysis filter parameter
```

---

## Implementation Phases

### Phase 1: Backend Query Extension (API)
- Add `hasAnalysis` filter to `runs` query
- Add `analysisComputedAt` field to Run type (if not exposed)
- Test query with new parameter

### Phase 2: Analysis List Components (Web)
- Create `AnalysisCard` component
- Create `AnalysisListFilters` component
- Create `AnalysisFolderView` component
- Create `useRunsWithAnalysis` hook

### Phase 3: Analysis Pages (Web)
- Create `Analysis.tsx` list page
- Create `AnalysisDetail.tsx` detail page
- Wire up routing in `App.tsx`

### Phase 4: Navigation & Run Detail Updates (Web)
- Add Analysis tab to `NavTabs.tsx`
- Modify `RunDetail.tsx`:
  - Remove embedded `AnalysisPanel`
  - Add "View Analysis" link in header

### Phase 5: Testing & Polish
- Add component tests
- Add integration tests
- Manual QA of all user stories

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        Analysis Tab                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  User clicks "Analysis" tab                                      │
│           │                                                      │
│           ▼                                                      │
│  useRunsWithAnalysis({ hasAnalysis: true })                     │
│           │                                                      │
│           ▼                                                      │
│  GraphQL: runs(hasAnalysis: true, limit, offset)                │
│           │                                                      │
│           ▼                                                      │
│  Render AnalysisCard for each run                               │
│           │                                                      │
│           ▼                                                      │
│  User clicks card → Navigate to /analysis/:runId                │
│           │                                                      │
│           ▼                                                      │
│  AnalysisDetail page loads                                       │
│           │                                                      │
│           ▼                                                      │
│  useAnalysis({ runId }) ← existing hook                         │
│           │                                                      │
│           ▼                                                      │
│  Render AnalysisPanel (existing component)                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## API Contract Changes

### Extended `runs` Query

```graphql
query Runs(
  $definitionId: String
  $status: String
  $hasAnalysis: Boolean      # NEW
  $limit: Int
  $offset: Int
) {
  runs(
    definitionId: $definitionId
    status: $status
    hasAnalysis: $hasAnalysis  # NEW
    limit: $limit
    offset: $offset
  ) {
    ...RunFields
  }
}
```

### Run Type (Already Exists)

```graphql
type Run {
  id: ID!
  definitionId: String!
  status: RunStatus!
  analysisStatus: String  # Already exposed: null | pending | computing | completed | failed
  # ... other fields
  definition {
    id: ID!
    name: String!
    tags { id, name }
  }
}
```

---

## Component Specifications

### AnalysisCard

Displays a run with analysis in card format:
- Definition name
- Run ID preview
- Analysis status badge (CURRENT/SUPERSEDED/Computing)
- Computed date (or "Computing..." if pending)
- Model count
- No progress bar (unlike RunCard)

### AnalysisListFilters

Filter controls:
- Analysis status: All, Current, Superseded
- Tag filter: Multi-select dropdown (same as RunFilters)
- View mode toggle: Flat / Folder

### AnalysisDetail Page

Header section:
- "Back to Analysis" button
- "View Run" link to /runs/:id
- Analysis status and computed timestamp
- Recompute button

Body:
- Full AnalysisPanel (existing component, all 6 tabs)

---

## Testing Strategy

### Unit Tests
- `AnalysisCard.test.tsx`: Renders correctly for various states
- `AnalysisListFilters.test.tsx`: Filter interactions work correctly
- `useRunsWithAnalysis.test.ts`: Hook fetches and filters correctly

### Integration Tests
- Analysis list page renders with data
- Navigation from Analysis tab to detail works
- Navigation from Run detail to Analysis works
- Filters update results correctly

### E2E Scenarios (Manual QA)
- US1: Browse analysis list, verify sorting
- US2: Apply filters, verify results
- US3: Click card, view detail page
- US4: From run detail, click analysis link
- US5: Verify tab appears in navigation

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Performance with many runs | Low | Medium | Pagination already in place |
| Analysis status sync issues | Low | Low | Existing polling handles this |
| Navigation confusion | Medium | Low | Clear "View Analysis" / "View Run" links |

---

## Dependencies

### External (None)
No new packages required

### Internal
- Existing `AnalysisPanel` component (reused as-is)
- Existing `useAnalysis` hook (reused for detail page)
- Existing `useTags` hook (reused for filtering)
- Existing Run GraphQL types

---

## Out of Scope (Confirmed)

- Bulk operations (recompute/delete multiple)
- Analysis comparison view
- Analysis text search
- New export functionality
- Backend analysis computation changes
