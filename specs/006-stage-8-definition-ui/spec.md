# Feature Specification: Stage 8 - Definition Management UI

> **Feature #006** | Branch: `stage-8-definition-ui`
> **Created**: 2025-12-06
> **Status**: Draft
> **Dependencies**: Stage 7 (Frontend Foundation) - Complete

## Overview

Build the definition library, editor, and version tree visualization with tag-based navigation. This stage enables team members to create, organize, and iterate on scenario definitions with full version control capabilities.

**Input Description**: Definition library page with tag-based filtering, tag management (create, assign, filter by tags), definition editor with preamble/template/dimensions, fork definition flow with label, version tree visualization (basic lineage diagram), search and filter functionality, syntax highlighting for template placeholders.

---

## User Stories & Testing

### User Story 1 - Browse Definition Library (Priority: P1)

As a researcher, I need to see all available scenario definitions in a browsable list so that I can find existing definitions to use or build upon.

**Why this priority**: Core functionality - users cannot work with definitions without seeing what exists. Foundation for all other definition interactions.

**Independent Test**: Navigate to Definitions page, verify definitions are listed with name, version info, creation date, and last accessed date.

**Acceptance Scenarios**:

1. **Given** I am logged in, **When** I navigate to the Definitions tab, **Then** I see a list of definitions with name, version label (if any), creation date, and run count
2. **Given** definitions exist, **When** the page loads, **Then** definitions are sorted by most recently created by default
3. **Given** I am viewing the definition list, **When** I click on a definition card, **Then** I navigate to the definition detail/editor view
4. **Given** no definitions exist, **When** I view the Definitions page, **Then** I see an empty state with a "Create your first definition" call-to-action
5. **Given** definitions are loading, **When** I view the page, **Then** I see a loading skeleton (not a blank page)

---

### User Story 2 - Create New Definition (Priority: P1)

As a researcher, I need to create new scenario definitions with preamble, template, and dimensions so that I can design moral dilemma scenarios for evaluation.

**Why this priority**: Core functionality - the system's primary purpose is creating and running scenario definitions. Cannot evaluate AI models without this.

**Independent Test**: Click "New Definition", fill in required fields, save, verify definition appears in library.

**Acceptance Scenarios**:

1. **Given** I am on the Definitions page, **When** I click "New Definition" button, **Then** I see the definition editor with empty fields
2. **Given** I am creating a definition, **When** I enter a name, preamble, template, and at least one dimension, **Then** I can save the definition successfully
3. **Given** I am creating a definition, **When** I leave required fields empty, **Then** I see validation errors and cannot save
4. **Given** I have created a definition, **When** I return to the library, **Then** my new definition appears in the list
5. **Given** I am editing the template, **When** I type dimension placeholders like `[situation]`, **Then** they are highlighted visually (syntax highlighting)
6. **Given** I am adding dimensions, **When** I click "Add Dimension", **Then** I can define dimension name and levels with labels and scores

---

### User Story 3 - Edit Existing Definition (Priority: P1)

As a researcher, I need to modify an existing definition so that I can correct errors or improve the scenario design.

**Why this priority**: Core functionality - definitions often need refinement after initial creation or after seeing results.

**Independent Test**: Open an existing definition, change a field, save, verify changes persist.

**Acceptance Scenarios**:

1. **Given** I am viewing a definition, **When** I click "Edit", **Then** the editor becomes editable with current values populated
2. **Given** I am editing a definition, **When** I modify fields and click "Save", **Then** changes are persisted and I see a success confirmation
3. **Given** I am editing a definition, **When** I click "Cancel" without saving, **Then** I am prompted if I have unsaved changes
4. **Given** I am editing a definition that has runs, **When** I save changes, **Then** a new version is created (existing runs reference old version) OR I'm warned about editing a definition with runs
5. **Given** I make changes to a definition, **When** I save, **Then** the `updatedAt` timestamp is updated

---

### User Story 4 - Fork Definition (Priority: P1)

As a researcher, I need to create a variant of an existing definition while preserving the original so that I can experiment with changes while maintaining lineage.

**Why this priority**: Core functionality - forking is the primary mechanism for systematic iteration and the key value proposition of the cloud version (per product spec).

**Independent Test**: Fork an existing definition, verify new definition is created with parent relationship, verify original is unchanged.

**Acceptance Scenarios**:

1. **Given** I am viewing a definition, **When** I click "Fork", **Then** I see a dialog to enter a label for the new version
2. **Given** I am forking a definition, **When** I enter a label and confirm, **Then** a new definition is created with the original as its parent
3. **Given** I have forked a definition, **When** I view the new definition, **Then** I can see it references its parent definition
4. **Given** a definition has been forked, **When** I view the original, **Then** I can see it has child definitions
5. **Given** I am forking a definition, **When** I don't enter a label, **Then** the system uses the truncated ID as display (per hybrid versioning)

---

### User Story 5 - Manage Tags (Priority: P2)

As a researcher, I need to create, assign, and filter by tags so that I can organize definitions by topic, project, or any flexible categorization.

**Why this priority**: Important for organization but system functions without it. As the definition library grows, tags become essential for navigation.

**Independent Test**: Create a tag, assign it to a definition, filter by tag, verify correct definitions shown.

**Acceptance Scenarios**:

1. **Given** I am on the Definitions page, **When** I look at the filter area, **Then** I see a tag filter dropdown/chips showing available tags
2. **Given** tags exist, **When** I select a tag filter, **Then** only definitions with that tag are displayed
3. **Given** I am viewing/editing a definition, **When** I click "Add Tag", **Then** I can select from existing tags or create a new one
4. **Given** I am assigning a tag, **When** I type a new tag name, **Then** I can create it on-the-fly and assign it
5. **Given** a definition has tags, **When** I view it in the list, **Then** I see its tags displayed as chips
6. **Given** I select multiple tags, **When** filtering, **Then** I see definitions that have ANY of the selected tags (OR logic)

---

### User Story 6 - Search and Filter Definitions (Priority: P2)

As a researcher, I need to search definitions by name and filter by various criteria so that I can quickly find specific definitions in a large library.

**Why this priority**: Important for efficiency but users can browse manually for small libraries. Becomes critical as definition count grows.

**Independent Test**: Enter search query, verify matching definitions shown. Apply filters, verify filtered results.

**Acceptance Scenarios**:

1. **Given** I am on the Definitions page, **When** I type in the search box, **Then** definitions are filtered to those matching the search term (by name)
2. **Given** I search for a term, **When** results are displayed, **Then** the matching text is highlighted in results
3. **Given** I am filtering, **When** I select "Root definitions only", **Then** I see only definitions without parents (original definitions)
4. **Given** I am filtering, **When** I select "Has runs", **Then** I see only definitions that have been used in runs
5. **Given** I have search and tag filters active, **When** I view results, **Then** both filters are applied (AND logic between search and tags)
6. **Given** I have filters applied, **When** I click "Clear filters", **Then** all filters are reset and I see all definitions

---

### User Story 7 - View Version Tree/Lineage (Priority: P2)

As a researcher, I need to visualize the version tree for a definition so that I can understand how definitions have evolved and choose the right version to use or fork.

**Why this priority**: Important for understanding lineage but users can work without it initially. Critical for complex iteration workflows.

**Independent Test**: View a definition that has been forked multiple times, verify tree visualization shows correct parent-child relationships.

**Acceptance Scenarios**:

1. **Given** I am viewing a definition, **When** I look at the version panel, **Then** I see a tree/timeline showing the definition's lineage (ancestors and descendants)
2. **Given** a definition has a parent, **When** I view the tree, **Then** I see a visual connection to the parent node
3. **Given** a definition has children (forks), **When** I view the tree, **Then** I see visual connections to child nodes
4. **Given** I am viewing the version tree, **When** I click on a different version node, **Then** I navigate to that definition
5. **Given** a definition has multiple levels of ancestry, **When** I view the tree, **Then** I can see the full chain from root to current
6. **Given** the lineage tree is displayed, **When** I hover over a node, **Then** I see a tooltip with version label/ID, creation date, and author

---

### User Story 8 - Preview Generated Scenarios (Priority: P3)

As a researcher, I need to preview the scenarios that will be generated from a definition so that I can verify the combinations before running an evaluation.

**Why this priority**: Nice to have - researchers can verify scenarios during runs. Useful for catching issues early but not blocking.

**Independent Test**: Open a definition, click preview, verify generated scenario combinations are displayed.

**Acceptance Scenarios**:

1. **Given** I am editing a definition with dimensions, **When** I click "Preview Scenarios", **Then** I see a list/sample of scenarios that would be generated
2. **Given** I am previewing scenarios, **When** I view a scenario, **Then** I see the preamble, template with placeholders filled in, and dimension values used
3. **Given** the definition would generate many scenarios, **When** I preview, **Then** I see a limited sample (e.g., first 10) with total count displayed
4. **Given** the definition has validation errors, **When** I try to preview, **Then** I see an error explaining what needs to be fixed
5. **Given** I have made unsaved changes, **When** I preview, **Then** the preview reflects my current unsaved edits

---

## Edge Cases

### Definition Library Edge Cases
- **Empty library**: Show helpful empty state with CTA, not blank page
- **Very long definition names**: Truncate with ellipsis, show full name on hover
- **Definitions with special characters in names**: Handle properly, no XSS concerns
- **Rapid pagination**: Debounce requests, show loading state

### Editor Edge Cases
- **Very long preamble/template**: Support scrolling, consider line numbers
- **Many dimensions (10+)**: Scrollable accordion, performance acceptable
- **Dimension with many levels (20+)**: Scrollable level list, batch save
- **Invalid placeholder in template**: Highlight in red, show warning, allow save but warn
- **Placeholder references non-existent dimension**: Validation warning
- **Unsaved changes + navigation**: Prompt to save or discard
- **Concurrent edit by another user**: Single-user assumption, but last-write-wins if race occurs

### Forking Edge Cases
- **Fork of a fork of a fork**: Support arbitrary depth, tree still renders correctly
- **Fork with same label**: Allow duplicate labels (different IDs), warn user
- **Fork then delete original**: Preserve fork, update parent reference to null or special marker
- **Very deep lineage tree**: Collapse/expand nodes, don't render all at once

### Tag Edge Cases
- **Duplicate tag creation**: Prevent duplicates (case-insensitive), offer existing tag
- **Tag with special characters**: Sanitize or reject, alphanumeric + hyphen + underscore
- **Delete tag in use**: Remove from all definitions OR prevent deletion
- **Very long tag name**: Limit to 50 characters
- **Many tags on one definition**: Display first few with "+N more" overflow

### Search/Filter Edge Cases
- **Search with special regex characters**: Escape properly, treat as literal
- **No results**: Show "No definitions match your search" with option to clear filters
- **Filter + search with no results**: Clear message about combined filters

---

## Functional Requirements

### Definition Library
- **FR-001**: System MUST display a paginated list of definitions (20 per page default)
- **FR-002**: System MUST show for each definition: name, version label (if set), creation date, run count
- **FR-003**: System MUST sort definitions by creation date descending by default
- **FR-004**: System MUST update `lastAccessedAt` when a definition is viewed

### Definition Editor
- **FR-005**: System MUST allow creating definitions with name, preamble, template, and dimensions
- **FR-006**: System MUST validate that name is not empty before save
- **FR-007**: System MUST validate that template contains at least one dimension placeholder
- **FR-008**: System MUST highlight dimension placeholders `[name]` in the template with distinct styling
- **FR-009**: System MUST allow adding, editing, and removing dimensions
- **FR-010**: System MUST allow dimension levels with label, score, and optional description
- **FR-011**: System MUST prompt for unsaved changes when navigating away

### Forking
- **FR-012**: System MUST create a new definition with `parentId` referencing the source definition
- **FR-013**: System MUST copy all content from source to forked definition
- **FR-014**: System MUST allow user to set a version label when forking
- **FR-015**: System MUST display truncated ID if no version label is provided

### Tags
- **FR-016**: System MUST allow creating new tags with unique names (case-insensitive)
- **FR-017**: System MUST allow assigning multiple tags to a definition
- **FR-018**: System MUST allow filtering definitions by one or more tags
- **FR-019**: System MUST display assigned tags on definition cards/detail views

### Search & Filter
- **FR-020**: System MUST provide text search filtering definitions by name
- **FR-021**: System MUST provide a "root only" filter showing definitions without parents
- **FR-022**: System MUST provide a "has runs" filter showing definitions with associated runs
- **FR-023**: System MUST support combining search with tag filters

### Version Tree
- **FR-024**: System MUST display the definition's parent (if any) in the version view
- **FR-025**: System MUST display the definition's children (forks) in the version view
- **FR-026**: System MUST allow navigating to any definition in the version tree
- **FR-027**: System MUST display full ancestry chain (recursive ancestors to root)

### Scenario Preview
- **FR-028**: System MUST generate preview scenarios based on current dimension values
- **FR-029**: System MUST display a sample of generated scenarios (max 10 initially)
- **FR-030**: System MUST show total scenario count for the definition

---

## Success Criteria

- **SC-001**: Users can find any definition within 3 clicks from the main Definitions page
- **SC-002**: Definition creation workflow completes in under 2 minutes for a basic definition
- **SC-003**: Fork operation completes in under 3 seconds
- **SC-004**: Version tree displays correctly for definitions with up to 10 levels of depth
- **SC-005**: Search returns results within 500ms for a library of 1000 definitions
- **SC-006**: Tag filtering updates results immediately (under 200ms perceived)
- **SC-007**: 80% code coverage on new components and hooks
- **SC-008**: All new files under 400 lines (per constitution)
- **SC-009**: No `any` types in TypeScript code (per constitution)

---

## Key Entities

### Definition (from database)
```
Definition {
  id: string              // cuid
  parentId: string | null // Fork parent reference
  name: string            // Human-readable name
  content: {              // JSONB content
    schema_version: number
    preamble: string
    template: string
    dimensions: Dimension[]
  }
  createdAt: Date
  updatedAt: Date
  lastAccessedAt: Date | null
}
```

### Dimension (within content)
```
Dimension {
  name: string           // Placeholder name, e.g., "situation"
  levels: DimensionLevel[]
}

DimensionLevel {
  score: number          // Numeric value for analysis
  label: string          // Human-readable label, e.g., "minor"
  description?: string   // Optional longer description
  options?: string[]     // Optional specific text options
}
```

### Tag (new entity needed)
```
Tag {
  id: string
  name: string           // Unique, case-insensitive
  createdAt: Date
}

DefinitionTag {
  definitionId: string
  tagId: string
  createdAt: Date
}
```

---

## Assumptions

1. **Tags are flat** - No hierarchical tag structure; tags are simple labels (per product spec emphasis on simplicity)
2. **Single-user editing** - No real-time collaboration; concurrent edits use last-write-wins (per non-goals in product spec)
3. **Version tree is read-only** - Users navigate to definitions, don't edit from tree view
4. **Root definitions are editable** - Unlike some VCS, editing doesn't require forking first
5. **Editing definition with runs** - Creates implicit new version OR warns user (TBD - documented as design decision for implementation)
6. **Tag deletion policy** - Removing a tag removes it from all definitions (no orphan prevention)
7. **Search is client-side** - For MVP with expected library size (<1000), server pagination with client filtering is acceptable

---

## Dependencies

### Requires from Previous Stages
- Authentication system (Stage 4) - Already implemented
- Frontend foundation (Stage 7) - Already implemented
- GraphQL Definition type (Stage 3) - Already implemented
- urql GraphQL client configured - Already implemented

### New Backend Requirements
- Tag management GraphQL mutations: `createTag`, `deleteTag`
- Definition-Tag assignment mutations: `addTagToDefinition`, `removeTagFromDefinition`
- Definition mutations: `createDefinition`, `updateDefinition`, `forkDefinition`
- Enhanced definitions query: filtering by tags, search, hasRuns
- Ancestors/descendants queries for version tree

---

## Constitution Validation

### Compliance Check

| Requirement | Status | Notes |
|-------------|--------|-------|
| React components < 400 lines | PASS | Spec splits into focused components (DefinitionEditor, DefinitionList, VersionTree, etc.) |
| No `any` types | PASS | SC-009 explicitly requires this |
| Test coverage 80% minimum | PASS | SC-007 explicitly requires this |
| Structured logging | N/A | Frontend uses console for development (per Stage 7 precedent) |
| Type safety | PASS | urql provides typed GraphQL operations |

### Folder Structure Compliance
Per constitution, frontend should follow:
```
apps/web/src/
├── components/
│   └── definitions/
│       ├── DefinitionCard.tsx
│       ├── DefinitionEditor.tsx
│       ├── DefinitionList.tsx
│       ├── DimensionEditor.tsx
│       ├── ForkDialog.tsx
│       ├── TagManager.tsx
│       ├── VersionTree.tsx
│       └── ScenarioPreview.tsx
├── hooks/
│   ├── useDefinitions.ts
│   ├── useDefinition.ts
│   ├── useTags.ts
│   └── useVersionTree.ts
├── pages/
│   └── Definitions.tsx (update existing)
│   └── DefinitionDetail.tsx (new)
└── graphql/
    └── definitions.ts (queries/mutations)
```

**VALIDATION RESULT: PASS** - Spec addresses all constitutional requirements.

---

## Out of Scope

- Real-time collaborative editing (per product-spec non-goals)
- Definition import from CLI format (deferred to Stage 15)
- Definition diffing/comparison view (potential Stage 8b or later)
- Bulk operations (multi-select, bulk tag assignment)
- Definition templates/boilerplates
- AI-assisted definition authoring (Stage 14/15)
- Definition comments/annotations
- Definition sharing/permissions (single tenant, all public)
