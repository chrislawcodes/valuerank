# Implementation Quality Checklist

**Purpose**: Validate code quality during implementation
**Feature**: [tasks.md](../tasks.md)

## Code Quality (per cloud/CLAUDE.md)

- [ ] File size under 400 lines
  - Reference: Constitution "File Size Limits" section
- [ ] No `any` types in TypeScript
  - Reference: Constitution "No `any` Types" section
- [ ] Strict TypeScript mode enabled
  - Reference: Constitution "Strict Mode Required" section

## Logging (per cloud/CLAUDE.md)

- [ ] Use `createLogger` from `@valuerank/shared`, not `console.log`
  - Reference: Constitution "Logging Standards" section
- [ ] Structured logging with context objects
- [ ] Appropriate log levels (info for health checks, error for failures)

## Error Handling (per cloud/CLAUDE.md)

- [ ] Use `AppError` classes for application errors
  - Reference: Constitution "Custom Error Classes" section
- [ ] Health check returns 503 on component failure
- [ ] Clear error messages in health response

## Health Endpoint Specifics

- [ ] `GET /health` returns JSON
- [ ] Response includes all component statuses:
  - [ ] `database`: connection status
  - [ ] `queue`: PgBoss status
  - [ ] `worker`: Python availability
- [ ] Returns HTTP 200 when healthy
- [ ] Returns HTTP 503 when unhealthy
- [ ] Includes timestamp in response
- [ ] Includes version in response (optional)

## GitHub Actions CI

- [ ] Runs on push to main and PRs
- [ ] Uses PostgreSQL service container for tests
- [ ] Runs lint, typecheck, test in sequence
- [ ] Uses Node.js 20
- [ ] Caches npm dependencies

## Railway Configuration

- [ ] Root directory set correctly for each service
- [ ] Build and start commands use workspace filters
- [ ] Release command runs Prisma migrations
- [ ] Watch paths prevent unnecessary rebuilds
- [ ] Python runtime configured via nixpacks
