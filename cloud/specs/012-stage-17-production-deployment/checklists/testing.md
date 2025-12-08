# Testing Quality Checklist

**Purpose**: Validate test coverage and quality
**Feature**: [tasks.md](../tasks.md)

## Pre-Commit Requirements (per cloud/CLAUDE.md)

- [ ] All tests pass locally before push
  - Command: `npm test` from `cloud/` directory
- [ ] TypeScript compiles without errors
  - Command: `npm run typecheck`
- [ ] Linting passes
  - Command: `npm run lint`

## Test Coverage (per cloud/CLAUDE.md)

- [ ] Line coverage ≥ 80%
  - Reference: Constitution "Coverage Targets" section
- [ ] Branch coverage ≥ 75%
- [ ] New code has tests (health endpoint)

## Health Endpoint Tests

- [ ] Test: Returns 200 when all components healthy
- [ ] Test: Returns 503 when database disconnected
- [ ] Test: Returns 503 when queue unhealthy
- [ ] Test: Response includes correct JSON structure
- [ ] Test: Timestamps are valid ISO strings

## CI Pipeline Tests

- [ ] GitHub Actions workflow syntax is valid
- [ ] Workflow runs on correct triggers (push to main, PRs)
- [ ] PostgreSQL service container works
- [ ] All jobs complete successfully

## Production Verification Tests

- [ ] Manual: Login flow works in production
- [ ] Manual: Health endpoint accessible externally
- [ ] Manual: Auto-deploy triggers on push
- [ ] Manual: Database migrations run on deploy
- [ ] Manual: Python workers spawn correctly

## Rollback Verification

- [ ] Manual: Previous deployment accessible after rollback
- [ ] Manual: Database state compatible with rollback
- [ ] Manual: Health check blocks bad deploys
