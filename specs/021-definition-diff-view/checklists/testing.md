# Testing Quality Checklist

**Purpose**: Validate test coverage and quality
**Feature**: [tasks.md](../tasks.md)

## Pre-Commit Requirements (per constitution)

- [X] All tests pass before commit
  - Command: `npm run test` (from cloud/ directory)
  - Reference: Constitution § Testing Requirements
- [X] Build succeeds without errors
  - Command: `npm run build` (from cloud/ directory)
  - Reference: Constitution § Pre-push Hook
- [X] Lint passes without errors
  - Command: `npm run lint` (from cloud/ directory)
  - Reference: Constitution § Pre-push Hook

## Test Coverage (per constitution)

- [X] Line coverage ≥ 80% on new files
  - Command: `npm run test:coverage`
  - Reference: Constitution § Testing Requirements - Coverage Targets
- [X] Branch coverage ≥ 75% on new files
  - Reference: Constitution § Testing Requirements - Coverage Targets
- [X] Function coverage ≥ 80% on new files
  - Reference: Constitution § Testing Requirements - Coverage Targets

## Test File Structure (per constitution)

- [X] Tests in correct location: `cloud/apps/web/tests/components/compare/visualizations/`
  - Reference: Constitution § Test Files Location
- [X] Tests use describe/it structure
  - Reference: Constitution § Testing Requirements - Test Structure
- [X] Test files under 400 lines
  - Reference: Constitution § File Size Limits

## Monaco Mocking Strategy

- [X] Monaco DiffEditor properly mocked in tests
  - Mock approach: Replace DiffEditor with test div exposing original/modified props
- [X] No actual Monaco rendering in unit tests (performance)
- [X] Mock clipboard API for copy tests

## Test Coverage per Component

### DefinitionViz.test.tsx

- [X] Test: Routes to DefinitionDiff for 2 runs
- [X] Test: Routes to DefinitionGroups for 3+ runs
- [X] Test: Shows message for <2 runs

### DefinitionDiff.test.tsx

- [X] Test: Renders Monaco DiffEditor with correct props
- [X] Test: Tab switching between template/preamble
- [X] Test: Hides preamble tab when both empty
- [X] Test: Shows "identical" message when definitions match
- [X] Test: Copy button rendering (P3)

### DefinitionGroups.test.tsx

- [X] Test: Groups runs by definition ID correctly
- [X] Test: Shows correct run count per definition
- [X] Test: Displays template preview

## Manual Testing

- [ ] Complete all scenarios in quickstart.md
- [ ] Test with real run data (not just mocks)
- [ ] Test URL state persistence (refresh keeps Definition tab selected)
- [ ] Test keyboard navigation within Monaco diff
