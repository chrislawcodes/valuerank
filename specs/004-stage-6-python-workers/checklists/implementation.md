# Implementation Quality Checklist

**Purpose**: Validate code quality during implementation
**Feature**: [Stage 6 - Python Worker Integration](../tasks.md)

## Code Quality (per [CLAUDE.md](../../../CLAUDE.md))

### File Size Limits

- [ ] Route handlers < 400 lines
- [ ] Services/business logic < 400 lines
- [ ] Utilities < 400 lines
- [ ] Python workers < 400 lines each
- [ ] Test files can be longer but still reasonable
  - Reference: CLAUDE.md § File Size Limits

### TypeScript Standards

- [ ] No `any` types - use proper typing or `unknown`
- [ ] Strict mode enabled (tsconfig.json)
- [ ] Function signatures explicitly typed
- [ ] Empty arrays have explicit type annotations
  - Reference: CLAUDE.md § TypeScript Standards

### Python Standards

- [ ] Type hints on all function signatures
- [ ] Docstrings on public functions
- [ ] No bare `except:` clauses (use specific exceptions)
- [ ] Use dataclasses or typed dicts for structured data

## Logging (per [CLAUDE.md](../../../CLAUDE.md))

### TypeScript Logging

- [ ] Use `createLogger` from `@valuerank/shared`
- [ ] Never use `console.log` directly
- [ ] Log levels: error, warn, info, debug, trace
- [ ] Structured data: `log.info({ runId, jobId }, 'message')`
  - Reference: CLAUDE.md § Logging Standards

### Python Logging

- [ ] Use `common/logging.py` structured logger
- [ ] Output JSON to stderr (not stdout)
- [ ] Never use `print()` for logging
- [ ] Include context: job_id, run_id, model_id

## Error Handling (per [CLAUDE.md](../../../CLAUDE.md))

### Custom Error Classes

- [ ] Use `AppError` base class for TypeScript errors
- [ ] Use `WorkerError` base class for Python errors
- [ ] Include error codes (NOT_FOUND, VALIDATION_ERROR, etc.)
- [ ] Include context for debugging
  - Reference: CLAUDE.md § Error Handling

### Error Classification

- [ ] Retryable errors identified (rate limit, timeout, network)
- [ ] Non-retryable errors identified (auth, validation, not found)
- [ ] Error messages are actionable (explain what failed, how to fix)

## Database Access (per [CLAUDE.md](../../../CLAUDE.md))

- [ ] Use Prisma with type safety
- [ ] Transactions for multi-step operations
- [ ] Query helpers in packages/db if reusable
  - Reference: CLAUDE.md § Database Access

## Import Order

- [ ] Node built-ins first
- [ ] External packages second
- [ ] Internal packages (@valuerank/*) third
- [ ] Relative imports last
  - Reference: CLAUDE.md § Code Organization

## JSON Communication

- [ ] Python reads JSON from stdin
- [ ] Python writes JSON to stdout
- [ ] Errors go to stderr (not stdout)
- [ ] Handle encoding edge cases (unicode, emojis)

## Security

- [ ] API keys read from environment variables
- [ ] No secrets in code or logs
- [ ] Validate all external input
