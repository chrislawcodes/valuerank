# Testing Quality Checklist

**Purpose**: Validate test coverage and quality
**Feature**: [tasks.md](../tasks.md)

## Pre-Commit Requirements (per constitution)

- [ ] All tests pass
  - Command: `npm test`
  - Reference: Constitution § Testing Requirements
- [ ] TypeScript compiles without errors
  - Command: `npm run typecheck`
- [ ] Lint passes
  - Command: `npm run lint`

## Test Coverage (per constitution)

- [ ] Line coverage ≥ 80%
  - Reference: Constitution § Coverage Targets (80% minimum)
  - Command: `npm run test:coverage`
- [ ] Branch coverage ≥ 75%
  - Reference: Constitution § Coverage Targets
- [ ] Function coverage ≥ 80%
  - Reference: Constitution § Coverage Targets

## Test Structure (per constitution)

- [ ] Tests in apps/api/tests/ mirror src/ structure
  - Reference: Constitution § Test Files Location
- [ ] Describe/it blocks organized by function
  - Reference: Constitution § Test Structure
- [ ] Edge cases covered (empty arrays, special chars, large files)
  - Reference: Spec § Edge Cases

## Unit Tests Required

### Export Services
- [ ] apps/api/tests/services/export/md.test.ts
- [ ] apps/api/tests/services/export/yaml.test.ts
- [ ] apps/api/tests/services/export/jsonl.test.ts
- [ ] apps/api/tests/services/export/bundle.test.ts
- [ ] apps/api/tests/services/export/download.test.ts

### Import Services
- [ ] apps/api/tests/services/import/md.test.ts
- [ ] apps/api/tests/services/import/yaml.test.ts

### GraphQL
- [ ] apps/api/tests/graphql/mutations/export.test.ts
- [ ] apps/api/tests/graphql/queries/export.test.ts

### Routes
- [ ] apps/api/tests/routes/export.test.ts (includes MD, YAML, download)
- [ ] apps/api/tests/routes/import.test.ts

### Queue Handlers
- [ ] apps/api/tests/queue/handlers/export.test.ts

## Integration Tests Required

- [ ] apps/api/tests/integration/md-roundtrip.test.ts
  - Export → Import → Compare (FR-003: round-trip fidelity)
- [ ] apps/api/tests/integration/yaml-cli-compat.test.ts
  - Verify YAML matches CLI format (FR-007)

## Success Criteria Validation

- [ ] SC-001: MD export parseable by devtool
- [ ] SC-002: YAML export usable by CLI probe.py
- [ ] SC-003: 95% round-trip fidelity (field comparison)
- [ ] SC-004: 1000 transcripts export < 30 seconds
- [ ] SC-005: Download URLs expire correctly
- [ ] SC-006: 80%+ test coverage

## Mock Strategy (per constitution)

- [ ] Mock database in unit tests
  - Reference: Constitution § What to Test
- [ ] Mock external APIs (none for export, but queue if needed)
- [ ] Use integration tests with test database for route tests
  - Database URL: `postgresql://valuerank:valuerank@localhost:5433/valuerank_test`
