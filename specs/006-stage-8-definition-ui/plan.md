# Implementation Plan: Stage 8 - Definition Management UI

**Branch**: `stage-8-definition-ui` | **Date**: 2025-12-06 | **Spec**: [spec.md](./spec.md)

## Summary

Build the definition management UI enabling researchers to browse, create, edit, and fork scenario definitions with version tree visualization and tag-based organization. Implementation spans database schema updates (tags), GraphQL API enhancements, and new React components following the existing patterns from Stage 7.

---

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Frontend**: React 18 + Vite + urql + Tailwind CSS + React Router
**Backend**: Express + GraphQL Yoga + Pothos + DataLoaders
**Database**: PostgreSQL + Prisma ORM
**Testing**: Vitest + React Testing Library (frontend), Supertest (API)
**Build Tools**: Turborepo monorepo
**Target Platform**: Docker (local), Railway (production)

**Performance Goals**:
- Search returns < 500ms for 1000 definitions (SC-005)
- Tag filtering < 200ms perceived (SC-006)
- Fork operation < 3 seconds (SC-003)

**Existing Infrastructure**:
- `createDefinition` mutation (apps/api/src/graphql/mutations/definition.ts)
- `forkDefinition` mutation (apps/api/src/graphql/mutations/definition.ts)
- Definition GraphQL type with parent/children relations (apps/api/src/graphql/types/definition.ts)
- DataLoader for definitions (apps/api/src/graphql/dataloaders/definition.ts)
- Placeholder Definitions page (apps/web/src/pages/Definitions.tsx)

---

## Constitution Check

**Status**: PASS

### File Size Limits (< 400 lines per file)

Per constitution:
- [x] Route handlers: < 400 lines
- [x] Services/business logic: < 400 lines
- [x] React components: < 400 lines (split into focused components)
- [x] Test files: < 400 lines (may be longer due to setup)

### TypeScript Standards

- [x] No `any` types - Use proper typing with Prisma types and generated GraphQL types
- [x] Strict mode enabled
- [x] Function signatures typed, empty arrays explicitly typed

### Testing Requirements

- [x] 80% minimum coverage target (SC-007)
- [x] Test structure follows describe/it pattern
- [x] Tests in `tests/` directories mirroring `src/`

### Logging Standards

- [x] Use shared logger from `@valuerank/shared` (backend)
- [x] Structured logging with context objects
- [x] No console.log in production code

**Violations/Notes**: None - plan follows all constitutional requirements.

---

## Architecture Decisions

### Decision 1: Tag Storage Approach

**Chosen**: New Tag and DefinitionTag tables with many-to-many relationship

**Rationale**:
- Clean relational model matching existing Prisma patterns
- Supports tag reuse across definitions
- Enables efficient filtering via JOINs
- Simpler than JSONB array approach for querying

**Alternatives Considered**:
- JSONB tags array on Definition: Easier to implement but harder to query, update, and maintain uniqueness
- Tag as value (no separate table): Would create duplicates, no tag management

**Tradeoffs**:
- Pros: Clean data model, efficient queries, tag CRUD operations
- Cons: Additional join required for queries, more database tables

---

### Decision 2: Version Tree Data Fetching

**Chosen**: Recursive GraphQL field resolvers with DataLoader caching

**Rationale**:
- Follows existing DataLoader pattern for N+1 prevention
- Parent/children fields already implemented
- Ancestors/descendants can use recursive CTEs in database
- Client-side tree construction from flat data

**Alternatives Considered**:
- Dedicated tree query returning full tree structure: Simpler client code but heavier queries
- Client-side recursive fetching: More requests, less efficient

**Tradeoffs**:
- Pros: Efficient with DataLoaders, flexible depth control
- Cons: Tree building logic on client, multiple resolver calls

---

### Decision 3: Search Implementation

**Chosen**: Server-side search with Prisma `contains` filter

**Rationale**:
- Works within existing Prisma patterns
- PostgreSQL ILIKE is sufficient for ~1000 definitions
- Can add full-text search later if needed

**Alternatives Considered**:
- Client-side filtering: Requires fetching all definitions upfront
- PostgreSQL full-text search: Over-engineered for current scale

**Tradeoffs**:
- Pros: Simple implementation, server-side filtering efficient
- Cons: No fuzzy matching, no relevance ranking

---

### Decision 4: Definition Editor State Management

**Chosen**: Local component state with urql mutations

**Rationale**:
- Editor is single-user, no real-time sync needed
- urql provides caching and refetch on mutation
- Form state is temporary until explicit save
- Follows existing API key management pattern from Stage 7

**Alternatives Considered**:
- Zustand for complex state: Overkill for single form
- Optimistic updates: Not needed for create/edit flows

**Tradeoffs**:
- Pros: Simple, follows existing patterns
- Cons: No auto-save, unsaved changes prompt needed

---

### Decision 5: Scenario Preview Generation

**Chosen**: Client-side cartesian product generation

**Rationale**:
- Preview is read-only, no persistence needed
- Definition content already in client memory
- Instant feedback without API round-trip
- Show sample (first 10) to avoid performance issues

**Alternatives Considered**:
- Server-side generation: Unnecessary round-trip for preview
- Full generation with pagination: Over-engineered for preview use case

**Tradeoffs**:
- Pros: Instant preview, no API needed, simple
- Cons: Must limit sample size, no persistent scenario IDs until run

---

## Project Structure

### Monorepo Structure (existing)

```
cloud/
├── apps/
│   ├── api/                 # GraphQL API
│   │   └── src/
│   │       ├── graphql/
│   │       │   ├── types/   # [MODIFY] Add Tag type
│   │       │   ├── queries/ # [MODIFY] Enhance definitions query
│   │       │   ├── mutations/ # [MODIFY] Add tag/update mutations
│   │       │   └── dataloaders/ # [ADD] Tag dataloader
│   │       └── services/    # [ADD] Definition/tag services if needed
│   └── web/                 # React frontend
│       └── src/
│           ├── components/
│           │   └── definitions/ # [ADD] New component directory
│           ├── hooks/       # [ADD] Definition/tag hooks
│           ├── pages/       # [MODIFY] Definitions.tsx, [ADD] DefinitionDetail.tsx
│           └── graphql/     # [ADD] Definition queries/mutations
├── packages/
│   ├── db/                  # Prisma schema + migrations
│   │   └── prisma/
│   │       └── schema.prisma # [MODIFY] Add Tag, DefinitionTag models
│   └── shared/              # Shared types/utilities
```

### New Files to Create

**Backend (apps/api/src)**:
```
graphql/
├── types/tag.ts                    # Tag GraphQL type
├── mutations/tag.ts                # Tag CRUD mutations
├── mutations/definition-tags.ts    # Add/remove tag mutations
├── queries/tag.ts                  # Tags query
├── dataloaders/tag.ts              # Tag dataloader
```

**Frontend (apps/web/src)**:
```
components/definitions/
├── DefinitionCard.tsx              # Card for list view
├── DefinitionList.tsx              # List container with filters
├── DefinitionEditor.tsx            # Create/edit form
├── DimensionEditor.tsx             # Dimension sub-editor
├── DimensionLevelEditor.tsx        # Level editing within dimension
├── VersionTree.tsx                 # Lineage visualization
├── ForkDialog.tsx                  # Fork modal
├── TagChips.tsx                    # Tag display/filter chips
├── TagSelector.tsx                 # Tag assignment dropdown
├── ScenarioPreview.tsx             # Preview generated scenarios
├── DefinitionFilters.tsx           # Search + filter bar

hooks/
├── useDefinitions.ts               # List query with filters
├── useDefinition.ts                # Single definition query
├── useDefinitionMutations.ts       # Create/update/fork mutations
├── useTags.ts                      # Tags query + mutations
├── useVersionTree.ts               # Ancestors/descendants
├── useScenarioPreview.ts           # Client-side scenario generation

pages/
├── DefinitionDetail.tsx            # Detail/editor page

graphql/
├── definitions.ts                  # Definition queries/mutations
├── tags.ts                         # Tag queries/mutations
```

---

## API Changes Summary

### New GraphQL Types
- `Tag` - id, name, createdAt
- `DefinitionTag` - junction type (may be implicit)

### New Queries
- `tags` - List all tags
- `tag(id)` - Single tag
- `definitionAncestors(id)` - Full ancestry chain
- `definitionDescendants(id)` - Full descendant tree

### Enhanced Queries
- `definitions` - Add: search, tagIds, hasRuns filters

### New Mutations
- `createTag(name)` - Create new tag
- `deleteTag(id)` - Delete tag
- `addTagToDefinition(definitionId, tagId)` - Assign tag
- `removeTagFromDefinition(definitionId, tagId)` - Unassign tag
- `updateDefinition(id, input)` - Update existing definition

---

## Implementation Phases

### Phase 1: Database Schema (Tags)
- Add Tag and DefinitionTag models to Prisma schema
- Create migration
- Add indexes for efficient queries

### Phase 2: GraphQL API - Tags
- Tag type definition
- Tag CRUD mutations
- Definition-tag assignment mutations
- Tags query

### Phase 3: GraphQL API - Definition Enhancements
- updateDefinition mutation
- Enhanced definitions query (search, tag filter, hasRuns)
- Ancestors/descendants queries

### Phase 4: Frontend - List & Navigation
- DefinitionList component
- DefinitionCard component
- DefinitionFilters component
- Routing to detail page

### Phase 5: Frontend - Editor
- DefinitionEditor component
- DimensionEditor component
- Create/edit flows
- Unsaved changes handling

### Phase 6: Frontend - Fork & Version Tree
- ForkDialog component
- VersionTree component
- Fork flow integration

### Phase 7: Frontend - Tags
- TagSelector component
- TagChips component
- Tag filtering in list

### Phase 8: Frontend - Preview & Polish
- ScenarioPreview component
- Empty/loading/error states
- Accessibility review

### Phase 9: Testing & Documentation
- Unit tests for all components
- Integration tests for GraphQL
- Update quickstart guide

---

## Risk Assessment

### Medium Risk: Version Tree Performance

**Concern**: Deep lineage trees could cause slow queries

**Mitigation**:
- Limit recursive CTE depth (10 levels per spec)
- Use DataLoader caching
- Consider pagination for large descendant trees

### Low Risk: Tag Uniqueness

**Concern**: Case-sensitivity edge cases

**Mitigation**:
- Store tags lowercase, compare case-insensitively
- Unique constraint on normalized name

### Low Risk: Editor Complexity

**Concern**: Dimension editor could exceed 400 lines

**Mitigation**:
- Extract DimensionLevelEditor as sub-component
- Keep editor focused, extract utilities

---

## Dependencies

### External (none new)
- All dependencies already in package.json
- No new libraries required

### Internal
- Requires Stage 7 frontend foundation (complete)
- Uses existing auth context and protected routes
- Uses existing urql client setup
- Uses existing UI components (Button, Input, Loading, etc.)

---

## Testing Strategy

### Unit Tests
- Component rendering tests (React Testing Library)
- Hook tests (custom hook testing)
- Scenario preview generation logic

### Integration Tests
- GraphQL mutation/query tests with test database
- Tag CRUD operations
- Definition filtering

### Manual Testing (quickstart.md)
- All user story acceptance scenarios
- Edge cases (empty states, deep trees)
