# Implementation Quality Checklist

**Purpose**: Validate code quality during implementation
**Feature**: [tasks.md](../tasks.md)

## Code Quality (per constitution cloud/CLAUDE.md)

### TypeScript Standards

- [ ] No `any` types used - use `unknown` if type truly unknown
  - Reference: Constitution § TypeScript Standards
- [ ] Strict mode enabled (`strict: true` in tsconfig)
  - Reference: Constitution § Strict Mode Required
- [ ] All function signatures have explicit types
  - Reference: Constitution § Type Inference vs Explicit Types
- [ ] Empty arrays have explicit type annotation (`const items: string[] = []`)

### File Size Limits

- [ ] All new files under 400 lines
  - Reference: Constitution § File Size Limits
- [ ] If file exceeds limit, extract to sub-modules with index.ts
- [ ] Route handlers under 400 lines
- [ ] React components under 400 lines

### Logging Standards

- [ ] Use `createLogger` from `@valuerank/shared` - never `console.log`
  - Reference: Constitution § Logging Standards
- [ ] Structured logging with context objects, not string interpolation
  - Example: `log.info({ runId, samplesPerScenario }, 'Starting run')`
- [ ] Appropriate log levels (info for business events, debug for flow)

### Error Handling

- [ ] Use custom error classes (`ValidationError`, `NotFoundError`)
  - Reference: Constitution § Error Handling
- [ ] Errors include context for debugging
- [ ] Route handlers forward errors to error middleware

### Database Access

- [ ] All queries use Prisma with proper typing
  - Reference: Constitution § Database Access
- [ ] Soft delete respected (`deletedAt: null` in queries)
  - Reference: Constitution § Soft Delete Pattern
- [ ] Use proper migration, not `db push`
  - Reference: Constitution § Schema Changes

## Import Order (per constitution)

- [ ] Node built-ins first
- [ ] External packages second
- [ ] Internal packages (`@valuerank/*`) third
- [ ] Relative imports last

## Python Worker Standards

- [ ] Type hints on all functions
- [ ] Docstrings for public functions
- [ ] Dataclasses for structured data
- [ ] Use existing logging pattern (`get_logger`)

## API Design

### GraphQL

- [ ] Input types have proper descriptions
- [ ] Optional fields have sensible defaults
- [ ] Nullable fields documented

### MCP Tools

- [ ] Tool description explains usage
- [ ] Input schema matches Zod validation
- [ ] Error responses use standard format

## Backwards Compatibility

- [ ] Default `sampleIndex=0` for existing data
- [ ] Default `samplesPerScenario=1` maintains current behavior
- [ ] Analysis handles missing variance fields gracefully
- [ ] No breaking changes to existing API contracts

## Performance Considerations

- [ ] Variance calculation uses NumPy vectorization
- [ ] No N+1 queries in transcript fetching
- [ ] Error bars render within 500ms (SC-002)

## Security

- [ ] Input validation on samplesPerScenario (1-100)
- [ ] No injection vulnerabilities in queries
- [ ] Rate limiting unchanged (per-provider limits)
