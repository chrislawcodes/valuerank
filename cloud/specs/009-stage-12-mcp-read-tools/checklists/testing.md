# Testing Quality Checklist

**Purpose**: Validate test coverage and quality
**Feature**: [tasks.md](../tasks.md)

## Coverage Requirements (per CLAUDE.md Constitution)

- [ ] Minimum 80% line coverage on new code
  - Reference: CLAUDE.md "Coverage Targets"
  - Command: `npm run test:coverage`
- [ ] Minimum 75% branch coverage
  - Reference: CLAUDE.md "Coverage Targets"
- [ ] Minimum 80% function coverage
  - Reference: CLAUDE.md "Coverage Targets"

## Test Structure (per CLAUDE.md Constitution)

- [ ] Tests mirror source structure
  - Reference: CLAUDE.md "Test Files Location"
  - `apps/api/src/mcp/` → `apps/api/tests/mcp/`
- [ ] Describe blocks for components/modules
  - Reference: CLAUDE.md "Test Structure"
- [ ] Meaningful test descriptions
  - `it('returns 401 when API key missing', ...)`

## What to Test (per CLAUDE.md Constitution)

- [ ] Business logic tested (tool handlers)
  - Reference: CLAUDE.md "What to Test"
- [ ] Data transformations tested (formatters)
- [ ] Edge cases covered
- [ ] Database mocked appropriately
- [ ] External APIs mocked

## MCP-Specific Testing

### Tool Handler Tests
- [ ] Each tool has dedicated test file
- [ ] Parameter validation tested
- [ ] Successful responses tested
- [ ] Error responses tested
- [ ] Token budget compliance verified

### Authentication Tests
- [ ] Missing API key returns 401
- [ ] Invalid API key returns 401
- [ ] Expired API key returns 401
- [ ] Valid API key allows access
- [ ] User context propagated to tools

### Rate Limiting Tests
- [ ] Under limit requests succeed
- [ ] At limit requests return 429
- [ ] Rate limit headers present
- [ ] Retry-After header correct

### Integration Tests
- [ ] Full MCP request/response cycle
- [ ] Auth + rate limit combined
- [ ] Multiple tools in sequence

## Pre-Commit Requirements

- [ ] All tests pass
  - Command: `npm test`
- [ ] TypeScript compiles without errors
  - Command: `npm run typecheck`
- [ ] Linting passes
  - Command: `npm run lint`
- [ ] Coverage thresholds met
  - Command: `npm run test:coverage`

## Manual Testing (per quickstart.md)

- [ ] Claude Desktop integration verified
- [ ] All 7 tools callable via MCP
- [ ] Response sizes within budgets
- [ ] Rate limiting works in practice
- [ ] Error messages are helpful
