# Testing Quality Checklist

**Purpose**: Validate test coverage and quality
**Feature**: [tasks.md](../tasks.md)

## Coverage Requirements (per constitution cloud/CLAUDE.md)

### Minimum Targets

- [ ] Line coverage ≥ 80%
  - Reference: Constitution "Coverage Targets" table
  - Target: 90%
- [ ] Branch coverage ≥ 75%
  - Reference: Constitution "Coverage Targets" table
  - Target: 85%
- [ ] Function coverage ≥ 80%
  - Reference: Constitution "Coverage Targets" table
  - Target: 90%

### Commands

```bash
# Run tests with coverage
npm run test:coverage

# API coverage
cd cloud/apps/api && npm run test:coverage

# Web coverage
cd cloud/apps/web && npm run test:coverage
```

## Test Structure (per constitution cloud/CLAUDE.md)

- [ ] Tests follow `describe`/`it` structure
  - Reference: Constitution "Test Structure" section
- [ ] Tests located in parallel `tests/` directory (API) or `__tests__/` (Web)
  - Reference: Constitution "Test Files Location"

## What to Test (per constitution cloud/CLAUDE.md)

### Always Test
- [ ] Business logic (run creation, progress calculation)
- [ ] Data transformations (CSV serialization)
- [ ] Edge cases (empty states, errors, boundary conditions)

### Mock
- [ ] Database interactions
- [ ] External APIs
- [ ] GraphQL context

### Integration Tests
- [ ] API routes with test database
- [ ] CSV export endpoint
- [ ] GraphQL queries/mutations

### Skip
- [ ] Simple getters
- [ ] Direct ORM pass-through

## Pre-Commit Verification

- [ ] All tests pass
  ```bash
  npm test
  ```
- [ ] TypeScript compiles without errors
  ```bash
  npm run typecheck
  ```
- [ ] Linting passes
  ```bash
  npm run lint
  ```

## Test Quality Guidelines

### Component Tests (React Testing Library)

- [ ] Test user interactions, not implementation
- [ ] Use `getByRole`, `getByLabelText` over `getByTestId`
- [ ] Test loading/error/empty states
- [ ] Mock urql responses appropriately

### Hook Tests

- [ ] Test with `renderHook` from @testing-library/react
- [ ] Test success and error scenarios
- [ ] Test polling behavior (useRun)
- [ ] Test mutation callbacks

### API Tests (Supertest)

- [ ] Test authentication requirements
- [ ] Test input validation
- [ ] Test success responses
- [ ] Test error responses
- [ ] Test authorization (if applicable)

## Specific Tests Required

### Backend (apps/api/)

- [ ] `tests/graphql/queries/models.test.ts` - Available models query
- [ ] `tests/routes/export.test.ts` - CSV export endpoint
- [ ] `tests/middleware/access-tracking.test.ts` - lastAccessedAt updates

### Frontend (apps/web/)

- [ ] `components/runs/__tests__/ModelSelector.test.tsx`
- [ ] `components/runs/__tests__/RunForm.test.tsx`
- [ ] `components/runs/__tests__/RunProgress.test.tsx`
- [ ] `components/runs/__tests__/RunControls.test.tsx`
- [ ] `components/runs/__tests__/RunResults.test.tsx`
- [ ] `components/runs/__tests__/TranscriptList.test.tsx`
- [ ] `pages/__tests__/Runs.test.tsx`
- [ ] `pages/__tests__/RunDetail.test.tsx`
- [ ] `hooks/__tests__/useRun.test.ts`
- [ ] `hooks/__tests__/useRuns.test.ts`
- [ ] `hooks/__tests__/useRunMutations.test.ts`
- [ ] `hooks/__tests__/useAvailableModels.test.ts`
- [ ] `api/__tests__/export.test.ts`

## Manual Testing

- [ ] Complete all scenarios in [quickstart.md](../quickstart.md)
- [ ] Test on multiple browsers (Chrome, Firefox, Safari)
- [ ] Test error scenarios (network failures, API errors)
- [ ] Test edge cases documented in spec.md
