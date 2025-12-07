# Testing Quality Checklist

**Purpose**: Validate test coverage and quality
**Feature**: [tasks.md](../tasks.md)

## Coverage Requirements (per constitution cloud/CLAUDE.md)

- [ ] Line coverage ≥ 80% on hooks and utilities
  - Reference: Constitution § Coverage Targets
  - Command: `npm run test:coverage`
  - Focus areas: `apps/web/src/auth/`, `apps/web/src/hooks/`

- [ ] Branch coverage ≥ 75%
  - Reference: Constitution § Coverage Targets

- [ ] Function coverage ≥ 80%
  - Reference: Constitution § Coverage Targets

## Test Structure (per constitution)

- [ ] Tests use describe/it blocks
  - Reference: Constitution § Test Structure
  - Pattern: `describe('Component') > describe('method') > it('behavior')`

- [ ] Test files in parallel directory structure
  - Reference: Constitution § Test Files Location
  - Pattern: `src/auth/context.tsx` → `tests/auth/context.test.tsx`

## Required Tests

### Authentication (US1)

- [ ] AuthContext: login sets token and user
- [ ] AuthContext: logout clears token and user
- [ ] AuthContext: token restored from localStorage on load
- [ ] useAuth: returns correct authentication state

### Protected Routes (US5)

- [ ] ProtectedRoute: redirects to login when not authenticated
- [ ] ProtectedRoute: renders children when authenticated
- [ ] ProtectedRoute: preserves intended destination after login

### Login Page (US1)

- [ ] Login: renders form with email and password fields
- [ ] Login: shows error on invalid credentials
- [ ] Login: redirects to dashboard on success

### Settings Page (US3)

- [ ] Settings: displays API keys list
- [ ] Settings: creates new API key
- [ ] Settings: shows full key after creation
- [ ] Settings: revokes key with confirmation

## Test Quality

- [ ] Tests are maintainable (no implementation details)
- [ ] Tests cover edge cases
- [ ] Mocks are minimal and focused
- [ ] Each test has clear purpose (arrange-act-assert)

## Pre-Commit Verification

- [ ] All tests pass: `npm test`
- [ ] TypeScript compiles: `npm run typecheck`
- [ ] Linter passes: `npm run lint`
- [ ] Build succeeds: `npm run build`

## Manual Verification

- [ ] Complete quickstart.md verification checklist
- [ ] All user story acceptance criteria met
