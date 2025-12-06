# Testing Quality Checklist

**Purpose**: Validate test coverage and quality
**Feature**: [Stage 6 - Python Worker Integration](../tasks.md)

## Test Coverage (per [CLAUDE.md](../../../CLAUDE.md))

### Coverage Targets

- [ ] Line coverage ≥ 80% (minimum)
- [ ] Branch coverage ≥ 75% (minimum)
- [ ] Function coverage ≥ 80% (minimum)
  - Reference: CLAUDE.md § Testing Requirements

### TypeScript Coverage

- [ ] Run: `npm run test:coverage` in apps/api
- [ ] Verify probe-scenario.ts handler coverage ≥ 80%
- [ ] Verify transcript service coverage ≥ 80%

### Python Coverage

- [ ] Run: `pytest --cov=. --cov-report=term-missing` in workers/
- [ ] Verify probe.py coverage ≥ 80%
- [ ] Verify llm_adapters.py coverage ≥ 80%
- [ ] Verify errors.py coverage ≥ 100%

## Test Structure (per [CLAUDE.md](../../../CLAUDE.md))

### TypeScript Test Files

- [ ] Tests in `apps/api/tests/` mirror `apps/api/src/` structure
- [ ] Use describe/it blocks with clear names
- [ ] Test happy path first, then error cases
  - Reference: CLAUDE.md § Test Structure

### Python Test Files

- [ ] Tests in `workers/tests/` directory
- [ ] Use pytest fixtures in conftest.py
- [ ] Mock all HTTP calls (no real LLM calls in tests)

## What to Test

### Business Logic

- [ ] Multi-turn conversation flow
- [ ] Token counting logic
- [ ] Error classification (retryable vs permanent)
- [ ] Transcript content structure

### Data Transformations

- [ ] JSON input parsing
- [ ] JSON output formatting
- [ ] Transcript record creation

### Edge Cases

- [ ] Empty scenario prompt
- [ ] Very long LLM response (100KB)
- [ ] Unicode/emoji in response
- [ ] Missing API key
- [ ] Invalid model ID
- [ ] Python process timeout

### Error Scenarios

- [ ] Rate limit error (429) → retryable
- [ ] Auth error (401/403) → not retryable
- [ ] Timeout error → retryable
- [ ] Network error → retryable
- [ ] Validation error → not retryable

## Mock Strategy

### Python HTTP Mocking

- [ ] Use `monkeypatch` to mock `requests.post`
- [ ] Create fixtures for each provider response format
- [ ] Test error responses (4xx, 5xx)

### TypeScript Process Mocking

- [ ] Mock `spawnPython` for unit tests
- [ ] Use real Python for integration tests (with mocked HTTP)

## Pre-Commit Requirements

Before committing code:

- [ ] All tests pass: `npm run test` (from cloud/)
- [ ] TypeScript compiles: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Python tests pass: `pytest` (from workers/)

## Integration Testing

- [ ] End-to-end test: startRun → probe job → transcript saved
- [ ] Multi-provider test: GPT-4 + Claude + Gemini in same run
- [ ] Progress tracking test: completed count increments correctly
- [ ] Error handling test: failed jobs increment failed count

## Manual Testing (per quickstart.md)

- [ ] Real LLM call works (at least one provider)
- [ ] Transcript saved with correct structure
- [ ] Run completes with status COMPLETED
- [ ] Error messages are clear and actionable
