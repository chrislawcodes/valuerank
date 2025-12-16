# Feature Specification: Definition Diff View

> **Feature #021** | Branch: `feature/definition-diff-view`
> **Created**: 2025-12-16
> **Status**: Draft
> **Dependencies**: Feature 016 (Cross-Run Compare) - Complete

## Overview

Add a **Definition Diff** visualization to the Compare view that shows the differences between definition templates used in compared runs. This feature was originally scoped as User Story 9 (P3) in Feature #016 (Cross-Run Compare) but was not implemented.

**Problem**: When comparing runs, researchers need to understand what changed in the definition templates to contextualize behavioral differences. Currently, they must manually open each definition in separate tabs to compare.

**Solution**: Integrate Monaco Editor's diff view into the Compare page to show side-by-side template differences with syntax highlighting and inline change indicators.

**Key Value**: Researchers can immediately see "what changed" (definition) alongside "what effect it had" (behavior) in a single view.

---

## User Stories & Testing

### User Story 1 - View Template Diff Between Two Runs (Priority: P1)

As a researcher, I need to see the differences between definition templates when comparing two runs so that I can understand what textual changes may have caused behavioral differences.

**Why this priority**: Core functionality - the diff view only makes sense when comparing exactly 2 definitions. This is the primary use case.

**Independent Test**: Select 2 runs with different definitions, navigate to Definition Diff visualization, verify Monaco diff editor shows the template differences.

**Acceptance Scenarios**:

1. **Given** I have selected 2 runs with different definitions, **When** I click the "Definition" visualization tab, **Then** I see a Monaco diff editor showing side-by-side template comparison
2. **Given** the diff view is displayed, **When** I examine it, **Then** added text is highlighted in green, removed text in red, and unchanged text is neutral
3. **Given** definitions have different preambles, **When** I view the diff, **Then** I can toggle between "Template" and "Preamble" tabs to see both sections
4. **Given** I scroll through a long diff, **When** I use the minimap, **Then** I can navigate to specific changes
5. **Given** the diff is displayed, **When** I hover over line numbers, **Then** I see which run each side represents
6. **Given** runs are selected, **When** both use the same definition (no template changes), **Then** I see "Definitions are identical" message with full template displayed in read-only mode

---

### User Story 2 - Multi-Run Definition Preview (Priority: P2)

As a researcher, I need to see definition information when more than 2 runs are selected so that I can understand which runs share definitions.

**Why this priority**: Important for orientation - when >2 runs are selected, a true diff isn't possible, but showing definition relationships helps users understand the comparison context.

**Independent Test**: Select 3+ runs, navigate to Definition tab, verify a summary view shows which runs use which definitions.

**Acceptance Scenarios**:

1. **Given** I have selected 3+ runs, **When** I view the Definition tab, **Then** I see a card layout grouping runs by definition
2. **Given** definitions are grouped, **When** I examine the cards, **Then** I see definition name, run count, and a preview of the template (first 200 chars)
3. **Given** runs use forked definitions, **When** I view the groups, **Then** parent-child relationships are indicated
4. **Given** I want to compare two specific definitions, **When** I click "Compare these two" on two definition cards, **Then** the view switches to diff mode with those two definitions

---

### User Story 3 - Copy and Export Definition Text (Priority: P3)

As a researcher, I need to copy or export definition text so that I can document changes in external reports.

**Why this priority**: Nice to have - useful for documentation but not blocking core comparison functionality.

**Independent Test**: View a diff, click copy button, verify definition text is copied to clipboard.

**Acceptance Scenarios**:

1. **Given** I'm viewing a definition diff, **When** I click "Copy Left" or "Copy Right", **Then** that side's full template is copied to clipboard
2. **Given** I'm viewing a diff, **When** I click "Copy Diff", **Then** a unified diff format is copied to clipboard
3. **Given** I copy text, **When** I check the clipboard, **Then** the text includes header indicating which run/definition it came from

---

## Edge Cases

### Diff Display Edge Cases
- **Identical definitions**: Show "Definitions are identical" with single read-only view
- **Very long templates (>5000 lines)**: Monaco handles this, but add loading state for initial render
- **Unicode/special characters**: Monaco should handle; verify no encoding issues
- **Empty preamble**: Show "(No preamble)" placeholder

### Run Selection Edge Cases
- **Single run selected**: Definition tab disabled (need 2+ runs)
- **2 runs, same definition ID**: Show "identical" state, not empty diff
- **>2 runs selected**: Switch to grouped card view
- **Run with missing definition**: Show error state for that run only

### Data Availability Edge Cases
- **Definition content not loaded**: Show loading skeleton until resolvedContent available
- **Null/undefined template**: Show placeholder text "(No template defined)"
- **resolvedContent parsing error**: Show raw JSON fallback with warning

---

## Functional Requirements

### Monaco Integration
- **FR-001**: System MUST integrate @monaco-editor/react for diff display
- **FR-002**: System MUST configure Monaco in diff mode with side-by-side layout
- **FR-003**: System MUST display left side as "original" (first selected run) and right as "modified" (second selected run)
- **FR-004**: System MUST enable read-only mode (no editing allowed)
- **FR-005**: System MUST show line numbers and minimap for navigation

### Tab System
- **FR-006**: System MUST provide tabs for "Template" and "Preamble" when both exist
- **FR-007**: System MUST default to "Template" tab
- **FR-008**: System MUST hide "Preamble" tab if neither run has a preamble

### Visualization Registry
- **FR-009**: System MUST register the Definition visualization in the registry with `id: 'definition'`
- **FR-010**: System MUST set `minRuns: 2` for the Definition visualization
- **FR-011**: System MUST use FileText or similar icon from lucide-react

### Multi-Run View
- **FR-012**: System MUST show grouped card view when >2 runs selected
- **FR-013**: System MUST group runs by definition ID
- **FR-014**: System MUST show definition name and template preview in each card

### Header Information
- **FR-015**: System MUST display run name/ID in diff header for each side
- **FR-016**: System MUST display definition name in diff header for each side
- **FR-017**: System MUST indicate if definitions share a parent

---

## Success Criteria

- **SC-001**: Monaco diff editor renders within 1 second for typical template sizes (<1000 lines)
- **SC-002**: Diff visualization is accessible via keyboard navigation
- **SC-003**: Syntax highlighting improves template readability (no raw text)
- **SC-004**: Users can identify changes within 5 seconds of viewing the diff
- **SC-005**: 80% code coverage on new components (per constitution)
- **SC-006**: All new files under 400 lines (per constitution)
- **SC-007**: No `any` types in TypeScript code (per constitution)

---

## Key Entities

### DefinitionDiffProps (component props)
```typescript
type DefinitionDiffProps = {
  leftDefinition: {
    runId: string;
    runName: string;
    definitionId: string;
    definitionName: string;
    preamble: string | null;
    template: string;
    parentId?: string | null;
  };
  rightDefinition: {
    runId: string;
    runName: string;
    definitionId: string;
    definitionName: string;
    preamble: string | null;
    template: string;
    parentId?: string | null;
  };
};
```

### DefinitionGroup (for multi-run view)
```typescript
type DefinitionGroup = {
  definitionId: string;
  definitionName: string;
  template: string;
  preamble: string | null;
  parentId?: string | null;
  runs: {
    id: string;
    name: string | null;
  }[];
};
```

---

## Assumptions

1. **Monaco bundle size acceptable**: @monaco-editor/react adds ~1MB to bundle; assume code splitting mitigates
2. **resolvedContent already fetched**: The comparison data hook already loads definition preamble/template
3. **Template is plain text**: No need for custom syntax highlighting (YAML/text mode is sufficient)
4. **Browser support**: Monaco Editor supports all browsers we target (modern evergreen)
5. **Two-run diff is primary use case**: Multi-run view is secondary/informational

---

## Out of Scope

- **Inline diff mode**: Only side-by-side (Monaco supports both; can add later)
- **Dimension diff**: Only template/preamble; dimensions are complex objects
- **Edit capability**: Read-only view only
- **Saved diff snapshots**: No persistence of diff state
- **AI-generated diff summary**: No automatic explanation of changes
- **Line-level comments**: No annotation capability

---

## Constitution Validation

### Compliance Check

| Requirement | Status | Notes |
|-------------|--------|-------|
| Files < 400 lines | PASS | Component split: DefinitionViz, DefinitionDiff, DefinitionGroups |
| No `any` types | PASS | SC-007 explicitly requires this |
| Test coverage 80% minimum | PASS | SC-005 explicitly requires this |
| Structured logging | N/A | Frontend component, no logging needed |
| Type safety | PASS | TypeScript strict mode, defined types above |
| Use Pull Requests | PASS | Feature branch specified |

### Folder Structure Compliance
Per constitution, will follow:
```
cloud/apps/web/src/components/compare/visualizations/
├── DefinitionViz.tsx       # Main visualization (registered in registry)
├── DefinitionDiff.tsx      # Monaco diff component for 2 runs
├── DefinitionGroups.tsx    # Card view component for >2 runs
```

**VALIDATION RESULT: PASS** - Spec addresses all constitutional requirements.

---

## Technical Notes

### Monaco Editor Integration

The Monaco Editor will be integrated using `@monaco-editor/react`:

```bash
npm install @monaco-editor/react
```

Key configuration:
- Use `DiffEditor` component, not `Editor`
- Set `readOnly: true` for both sides
- Enable `renderSideBySide: true`
- Set language to `plaintext` or `markdown` (templates are prose)
- Enable minimap for navigation

### Data Flow

1. Compare page loads selected runs via `useComparisonData` hook
2. `runsWithAnalysis` query returns `resolvedContent` with preamble/template
3. `DefinitionViz` extracts definition content from `runs` prop
4. For 2 runs: render `DefinitionDiff` with Monaco
5. For >2 runs: render `DefinitionGroups` with cards

### Existing Infrastructure

Already in place (from Feature #016):
- `VisualizationType` includes `'definition'` in types.ts
- `ComparisonRun.definition.resolvedContent` has preamble/template
- Visualization registry pattern with `registerVisualization()`
- `COMPARISON_RUN_FULL_FRAGMENT` fetches `resolvedContent`
