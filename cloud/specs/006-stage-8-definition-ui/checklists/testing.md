# Testing Quality Checklist

**Purpose**: Validate test coverage and quality
**Feature**: [tasks.md](../tasks.md)
**Constitution**: [cloud/CLAUDE.md](../../../CLAUDE.md)

## Coverage Targets (per Constitution)

- [ ] Line coverage ≥ 80% (SC-007)
  - Reference: Constitution § Testing Requirements - "Coverage Targets"
  - Command: `npm run test:coverage`
- [ ] Branch coverage ≥ 75%
  - Reference: Constitution § Testing Requirements - "Coverage Targets"
- [ ] Function coverage ≥ 80%
  - Reference: Constitution § Testing Requirements - "Coverage Targets"

## Test Structure (per Constitution)

- [ ] Tests follow describe/it pattern
  - Reference: Constitution § Testing Requirements - "Test Structure"
- [ ] Test files in `tests/` directory mirroring `src/`
  - Reference: Constitution § Testing Requirements - "Test Files Location"
- [ ] Test file naming: `[component].test.tsx` or `[module].test.ts`
  - Reference: Constitution § Testing Requirements

## Test Coverage Requirements

### Business Logic (Always Test)

- [ ] Hook logic tested (useDefinitions, useTags, etc.)
- [ ] Data transformations tested
- [ ] Edge cases covered (empty arrays, null values)
- [ ] Error scenarios tested

### GraphQL Integration Tests

- [ ] Tag CRUD mutations tested
- [ ] Definition-tag assignment tested
- [ ] Enhanced definitions query filters tested
- [ ] Ancestors/descendants queries tested

### Component Tests

- [ ] Component rendering tests
- [ ] User interaction tests
- [ ] Loading/error/empty states tested
- [ ] Form validation tested

### What to Mock

- [ ] Database calls mocked in unit tests
- [ ] GraphQL client mocked in component tests
- [ ] External APIs mocked

### What to Skip (per Constitution)

- [ ] Simple getters without logic
- [ ] Direct ORM pass-through without transformation
  - Reference: Constitution § Testing Requirements - "What to Test"

## Test Quality

- [ ] Tests are independent (no shared state)
- [ ] Tests are deterministic (same result each run)
- [ ] Test descriptions are clear and specific
- [ ] Arrange-Act-Assert pattern followed
- [ ] No hardcoded test data that could become stale

## Pre-Commit Requirements

- [ ] All tests pass: `npm test`
- [ ] TypeScript compiles: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`

## Acceptance Testing (per quickstart.md)

- [ ] US1 acceptance scenarios verified
- [ ] US2 acceptance scenarios verified
- [ ] US3 acceptance scenarios verified
- [ ] US4 acceptance scenarios verified
- [ ] US5 acceptance scenarios verified
- [ ] US6 acceptance scenarios verified
- [ ] US7 acceptance scenarios verified
- [ ] US8 acceptance scenarios verified

## Test Files to Create

### API Tests (apps/api/tests/)

- [ ] `graphql/tags.test.ts` - Tag CRUD operations
- [ ] `graphql/definitions.test.ts` - Enhanced queries

### Web Tests (apps/web/tests/)

**Components:**
- [ ] `components/definitions/DefinitionCard.test.tsx`
- [ ] `components/definitions/DefinitionList.test.tsx`
- [ ] `components/definitions/DefinitionEditor.test.tsx`
- [ ] `components/definitions/DimensionEditor.test.tsx`
- [ ] `components/definitions/ForkDialog.test.tsx`
- [ ] `components/definitions/TagSelector.test.tsx`
- [ ] `components/definitions/TagChips.test.tsx`
- [ ] `components/definitions/VersionTree.test.tsx`
- [ ] `components/definitions/DefinitionFilters.test.tsx`
- [ ] `components/definitions/ScenarioPreview.test.tsx`

**Hooks:**
- [ ] `hooks/useScenarioPreview.test.ts`
