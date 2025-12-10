# Testing Quality Checklist

**Purpose**: Validate test coverage and quality
**Feature**: [tasks.md](../tasks.md)

## Pre-Commit Requirements (per constitution § Testing Requirements)

- [ ] All tests pass before commit
  - Command: `npm test` (from cloud/ directory)
  - Reference: Constitution § Testing Requirements
- [ ] Build succeeds
  - Command: `npx turbo build`
- [ ] No linting errors
  - Command: `npm run lint`

## Test Coverage (per constitution § Testing Requirements)

- [ ] Line coverage ≥ 80% for new code
  - Reference: Constitution § Testing Requirements
  - Target: 90%
- [ ] Branch coverage ≥ 75% for new code
  - Reference: Constitution § Testing Requirements
  - Target: 85%
- [ ] Function coverage ≥ 80% for new code

## Unit Tests

### Cost Estimation (`apps/api/tests/services/cost/estimate.test.ts`)

- [ ] Test cost calculation formula accuracy
- [ ] Test fallback: model stats present → uses model stats
- [ ] Test fallback: model stats missing → uses all-model average
- [ ] Test fallback: DB empty → uses system default (100/900)
- [ ] Test edge case: zero scenarios → $0.00
- [ ] Test edge case: model cost not set → appropriate error/display
- [ ] Test sample percentage affects scenario count

### Statistics (`apps/api/tests/services/cost/statistics.test.ts`)

- [ ] Test getTokenStatsForModels with existing stats
- [ ] Test getTokenStatsForModels with missing stats
- [ ] Test getAllModelAverage with data
- [ ] Test getAllModelAverage with empty DB
- [ ] Test upsertTokenStats creates new record
- [ ] Test upsertTokenStats updates existing record

### Python Worker (`workers/tests/test_compute_token_stats.py`)

- [ ] Test EMA calculation correctness
- [ ] Test first-time stats (no existing data)
- [ ] Test update with existing stats
- [ ] Test handling of null token values
- [ ] Test grouping by modelId

## Integration Tests

### GraphQL (`apps/api/tests/graphql/`)

- [ ] estimateCost query returns valid CostEstimate
- [ ] modelTokenStats query returns stats or empty array
- [ ] Run.estimatedCosts field populated after startRun
- [ ] AnalysisResult.actualCost computed from transcripts

### Services (`apps/api/tests/services/`)

- [ ] startRun stores estimatedCosts in run.config
- [ ] compute_token_stats job updates statistics after run

## Test Data

- [ ] Test fixtures for models with different costs
- [ ] Test fixtures for existing token statistics
- [ ] Test fixtures for completed runs with transcripts
- [ ] Cleanup of test data after each test

## Performance Tests (per spec Success Criteria)

- [ ] Cost prediction returns in < 1 second (SC-003)
- [ ] Statistics computed within 60 seconds of completion (SC-005)
- [ ] Run results display cost within 5 seconds (SC-004)
