# Implementation Plan: Definition Diff View

**Branch**: `feature/021-definition-diff-view` | **Date**: 2025-12-16 | **Spec**: [spec.md](./spec.md)

## Summary

Add a Definition Diff visualization to the Compare view using Monaco Editor's built-in diff functionality. This is a frontend-only feature - Monaco is already installed and definition content (preamble/template) is already fetched by the comparison data hook.

---

## Technical Context

| Aspect | Value |
|--------|-------|
| **Language/Version** | TypeScript 5.3+ |
| **Framework** | React 18 + Vite |
| **Primary Dependencies** | @monaco-editor/react ^4.7.0 (already installed) |
| **Storage** | N/A (no database changes) |
| **Testing** | Vitest + @testing-library/react |
| **Target Platform** | Browser (React SPA) |
| **Performance Goals** | Monaco render < 1 second for typical templates |
| **Constraints** | Files < 400 lines, 80% test coverage |

---

## Constitution Check

**Status**: PASS

| Requirement | Status | Notes |
|-------------|--------|-------|
| Files < 400 lines | PASS | Split into 3 components: DefinitionViz, DefinitionDiff, DefinitionGroups |
| No `any` types | PASS | Will use typed props throughout |
| 80% test coverage | PASS | Testing plan below |
| React components < 400 lines | PASS | Component split strategy defined |
| Use Pull Requests | PASS | Feature branch specified |

---

## Architecture Decisions

### Decision 1: Monaco DiffEditor vs Custom Diff

**Chosen**: Monaco DiffEditor

**Rationale**:
- Monaco is already installed in the project (`@monaco-editor/react": "^4.7.0"`)
- Built-in diff functionality with syntax highlighting, minimap, side-by-side view
- Battle-tested (same editor as VS Code)
- No additional dependencies needed

**Alternatives Considered**:
- **react-diff-viewer**: Would add another dependency, less sophisticated than Monaco
- **Custom text diff**: Significant development effort, less polished UX

**Tradeoffs**:
- Pros: Rich UX, zero new dependencies, consistent with VS Code diff experience
- Cons: Monaco bundle size (~1MB), but already paid since it's installed

---

### Decision 2: Two-Run vs Multi-Run Behavior

**Chosen**: Dual-mode component (diff for 2 runs, cards for 3+)

**Rationale**:
- True diff only makes sense for exactly 2 items
- With 3+ runs, showing relationship/grouping is more useful
- Matches UX patterns from Git tools (diff 2 commits, overview for multiple)

**Implementation**:
- `DefinitionViz` (orchestrator): Decides which view to render based on `runs.length`
- `DefinitionDiff` (2 runs): Monaco DiffEditor with preamble/template tabs
- `DefinitionGroups` (3+ runs): Card layout grouping runs by definition

---

### Decision 3: Tab Structure for Preamble vs Template

**Chosen**: Tab component within DefinitionDiff

**Rationale**:
- Keeps diff view focused on one content type at a time
- Template is primary (shown by default)
- Preamble is often empty or identical - tab hides when both null

**Implementation**:
- Simple state toggle: `'template' | 'preamble'`
- Hide preamble tab when neither run has a preamble
- Existing Button component with variant="ghost" for tabs (consistent with VisualizationNav)

---

### Decision 4: Monaco Editor Configuration

**Chosen**: Read-only side-by-side diff with minimap

**Configuration**:
```typescript
const editorOptions: DiffEditorOptions = {
  readOnly: true,
  renderSideBySide: true,
  minimap: { enabled: true },
  scrollBeyondLastLine: false,
  wordWrap: 'on',
  lineNumbers: 'on',
  fontSize: 13,
  automaticLayout: true,
};
```

**Language**: `plaintext` (templates are prose, not code)

---

## Project Structure

### Files to Create

```
cloud/apps/web/src/components/compare/visualizations/
├── DefinitionViz.tsx       # Main visualization (registered in registry)
├── DefinitionDiff.tsx      # Monaco diff for exactly 2 runs
└── DefinitionGroups.tsx    # Card layout for 3+ runs
```

### Files to Modify

```
cloud/apps/web/src/components/compare/visualizations/
└── registry.tsx            # Add registration for 'definition' visualization
```

### Test Files to Create

```
cloud/apps/web/tests/components/compare/visualizations/
├── DefinitionViz.test.tsx
├── DefinitionDiff.test.tsx
└── DefinitionGroups.test.tsx
```

---

## Component Design

### DefinitionViz (Orchestrator)

**Purpose**: Route to appropriate sub-component based on run count

```typescript
type DefinitionVizProps = ComparisonVisualizationProps;

// Logic:
// - runs.length === 0 or 1: Show "Select at least 2 runs" message
// - runs.length === 2: Render <DefinitionDiff>
// - runs.length >= 3: Render <DefinitionGroups>
```

**Size estimate**: ~80 lines

---

### DefinitionDiff (Monaco Diff)

**Purpose**: Show side-by-side diff for exactly 2 definitions

**Props**:
```typescript
type DefinitionDiffProps = {
  leftRun: RunWithAnalysis;
  rightRun: RunWithAnalysis;
};
```

**State**:
```typescript
const [activeTab, setActiveTab] = useState<'template' | 'preamble'>('template');
```

**Key sections**:
1. **Header row**: Shows run names/IDs for left and right
2. **Tab bar**: Template | Preamble (preamble hidden if both empty)
3. **Monaco DiffEditor**: Side-by-side diff of selected content
4. **Footer**: Copy buttons (optional P3)

**Size estimate**: ~200 lines

---

### DefinitionGroups (Card Layout)

**Purpose**: Show definition groupings when 3+ runs selected

**Props**:
```typescript
type DefinitionGroupsProps = {
  runs: RunWithAnalysis[];
};
```

**Data transformation**:
```typescript
// Group runs by definition ID
type DefinitionGroup = {
  definitionId: string;
  definitionName: string;
  preamble: string | null;
  template: string;
  runs: { id: string; name: string | null }[];
};
```

**Key sections**:
1. **Summary**: "X definitions across Y runs"
2. **Cards**: One per unique definition, showing:
   - Definition name
   - Runs using this definition (as badges)
   - Template preview (truncated)
   - "Compare" button to select 2 cards for diff

**Size estimate**: ~150 lines

---

## Registry Registration

Add to `registry.tsx`:

```typescript
import { FileText } from 'lucide-react';
import { DefinitionViz } from './DefinitionViz';

registerVisualization({
  id: 'definition',
  label: 'Definition',
  icon: FileText,
  component: DefinitionViz,
  minRuns: 2,
  description: 'Compare definition templates between runs',
});
```

---

## Testing Strategy

### Unit Tests (DefinitionViz.test.tsx)

1. **Renders diff view for 2 runs**
   - Mock 2 runs with different definitions
   - Assert DefinitionDiff is rendered

2. **Renders group view for 3+ runs**
   - Mock 3 runs
   - Assert DefinitionGroups is rendered

3. **Shows message for insufficient runs**
   - Mock 0 or 1 run
   - Assert helpful message displayed

### Unit Tests (DefinitionDiff.test.tsx)

1. **Renders Monaco DiffEditor**
   - Mock @monaco-editor/react
   - Assert DiffEditor component rendered with correct props

2. **Shows correct content for each tab**
   - Test tab switching between template/preamble
   - Assert Monaco receives correct original/modified values

3. **Hides preamble tab when both empty**
   - Mock runs with null preambles
   - Assert preamble tab not rendered

4. **Shows "identical" message when definitions match**
   - Mock 2 runs with same definition content
   - Assert appropriate messaging

### Unit Tests (DefinitionGroups.test.tsx)

1. **Groups runs by definition ID**
   - Mock runs with shared definitions
   - Assert correct grouping

2. **Shows definition preview**
   - Assert template text truncated appropriately

3. **Displays run badges**
   - Assert runs listed in each card

### Monaco Mocking Strategy

```typescript
vi.mock('@monaco-editor/react', () => ({
  DiffEditor: ({ original, modified, ...props }) => (
    <div data-testid="mock-diff-editor">
      <div data-testid="original">{original}</div>
      <div data-testid="modified">{modified}</div>
    </div>
  ),
}));
```

---

## Data Flow

```
Compare.tsx
    │
    ├── useComparisonData() → selectedRuns (with definitionContent)
    │
    └── VizComponent (DefinitionViz)
            │
            ├── (2 runs) → DefinitionDiff
            │                   │
            │                   └── DiffEditor (Monaco)
            │                         ├── original: run[0].definitionContent.template
            │                         └── modified: run[1].definitionContent.template
            │
            └── (3+ runs) → DefinitionGroups
                                │
                                └── Cards grouped by definition.id
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Monaco bundle size impact | Low | Low | Already installed, code-split by Vite |
| Monaco SSR issues | Low | Medium | Already working in other parts (assumed) |
| Long template performance | Low | Low | Monaco handles large files well |
| Missing definitionContent | Medium | Low | Graceful fallback to placeholder text |

---

## Dependencies

### Already Available
- `@monaco-editor/react` ^4.7.0 (installed)
- `definitionContent` extraction in `useComparisonData.ts` (lines 106-113)
- `VisualizationType` includes `'definition'` (types.ts)
- Visualization registry pattern

### Nothing New Required
- No new npm packages
- No database changes
- No API changes
- No backend work

---

## Implementation Order

1. **DefinitionDiff.tsx** - Core Monaco diff component (most complex)
2. **DefinitionGroups.tsx** - Card layout for multi-run
3. **DefinitionViz.tsx** - Orchestrator with routing logic
4. **registry.tsx** - Register the visualization
5. **Tests** - All three test files
6. **Manual testing** - Verify with real data
