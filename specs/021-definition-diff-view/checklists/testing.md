# Testing Quality Checklist

**Purpose**: Validate test coverage and quality
**Feature**: [tasks.md](../tasks.md)

## Pre-Commit Requirements (per constitution)

- [ ] All tests pass before commit
  - Command: `npm run test` (from cloud/ directory)
  - Reference: Constitution § Testing Requirements
- [ ] Build succeeds without errors
  - Command: `npm run build` (from cloud/ directory)
  - Reference: Constitution § Pre-push Hook
- [ ] Lint passes without errors
  - Command: `npm run lint` (from cloud/ directory)
  - Reference: Constitution § Pre-push Hook

## Test Coverage (per constitution)

- [ ] Line coverage ≥ 80% on new files
  - Command: `npm run test:coverage`
  - Reference: Constitution § Testing Requirements - Coverage Targets
- [ ] Branch coverage ≥ 75% on new files
  - Reference: Constitution § Testing Requirements - Coverage Targets
- [ ] Function coverage ≥ 80% on new files
  - Reference: Constitution § Testing Requirements - Coverage Targets

## Test File Structure (per constitution)

- [ ] Tests in correct location: `cloud/apps/web/tests/components/compare/visualizations/`
  - Reference: Constitution § Test Files Location
- [ ] Tests use describe/it structure
  - Reference: Constitution § Testing Requirements - Test Structure
- [ ] Test files under 400 lines
  - Reference: Constitution § File Size Limits

## Monaco Mocking Strategy

- [ ] Monaco DiffEditor properly mocked in tests
  - Mock approach: Replace DiffEditor with test div exposing original/modified props
- [ ] No actual Monaco rendering in unit tests (performance)
- [ ] Mock clipboard API for copy tests

## Test Coverage per Component

### DefinitionViz.test.tsx

- [ ] Test: Routes to DefinitionDiff for 2 runs
- [ ] Test: Routes to DefinitionGroups for 3+ runs
- [ ] Test: Shows message for <2 runs

### DefinitionDiff.test.tsx

- [ ] Test: Renders Monaco DiffEditor with correct props
- [ ] Test: Tab switching between template/preamble
- [ ] Test: Hides preamble tab when both empty
- [ ] Test: Shows "identical" message when definitions match
- [ ] Test: Copy button triggers clipboard API (P3)

### DefinitionGroups.test.tsx

- [ ] Test: Groups runs by definition ID correctly
- [ ] Test: Shows correct run count per definition
- [ ] Test: Displays template preview

## Manual Testing

- [ ] Complete all scenarios in quickstart.md
- [ ] Test with real run data (not just mocks)
- [ ] Test URL state persistence (refresh keeps Definition tab selected)
- [ ] Test keyboard navigation within Monaco diff
