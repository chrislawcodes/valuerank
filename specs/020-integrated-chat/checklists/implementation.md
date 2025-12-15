# Implementation Quality Checklist

**Purpose**: Validate code quality during implementation
**Feature**: [tasks.md](../tasks.md)
**Constitution**: [cloud/CLAUDE.md](../../../cloud/CLAUDE.md)

## File Size Limits (per constitution)

- [ ] Route handlers < 400 lines
  - Reference: Constitution § File Size Limits
  - Files to check: `apps/api/src/routes/chat.ts`
- [ ] Services/business logic < 400 lines per file
  - Reference: Constitution § File Size Limits
  - Files to check: `apps/api/src/services/chat/*.ts`
- [ ] React components < 400 lines
  - Reference: Constitution § File Size Limits
  - Files to check: `apps/web/src/components/chat/*.tsx`
- [ ] If file exceeds limit, split into logical sub-modules

## TypeScript Standards (per constitution)

- [ ] No `any` types - use proper interfaces
  - Reference: Constitution § No `any` Types
  - Use `unknown` if type is truly unknown
- [ ] Strict mode enabled for all new files
  - Reference: Constitution § Strict Mode Required
- [ ] Type all function signatures explicitly
  - Reference: Constitution § Type Inference vs Explicit Types
- [ ] Use types for data shapes, interfaces for contracts
  - Reference: Constitution § Prefer Types Over Interfaces for Data

## Logging Standards (per constitution)

- [ ] Use `createLogger('chat')` for all logging
  - Reference: Constitution § Logger Abstraction
  - Never use `console.log` directly
- [ ] Use structured logging (object + message format)
  - Reference: Constitution § Structured Logging Rules
  - Example: `log.info({ conversationId, userId }, 'Message sent')`
- [ ] Log key events: message sent, response complete, errors
  - Reference: Constitution § Log Levels
- [ ] Include correlation IDs for request tracing

## Database Patterns (per constitution)

- [ ] Soft delete for conversations and messages (deletedAt)
  - Reference: Constitution § Soft Delete Pattern
- [ ] Filter `deletedAt: null` in ALL queries
  - Reference: Constitution § Required query patterns
- [ ] Use transactions for multi-step operations
  - Reference: Constitution § Use Prisma with Type Safety
  - Example: Create message + update lastMessageAt
- [ ] deletedAt field NOT exposed in GraphQL
  - Reference: Constitution § GraphQL layer requirements

## Error Handling (per constitution)

- [ ] Use custom error classes (AppError, NotFoundError, ValidationError)
  - Reference: Constitution § Custom Error Classes
- [ ] Always catch and forward to error middleware
  - Reference: Constitution § Error Handling in Routes
- [ ] Never expose internal error details to client

## Code Organization (per constitution)

- [ ] Follow import order: Node → External → Internal → Relative
  - Reference: Constitution § Import Order
- [ ] Follow folder structure per app
  - Reference: Constitution § Folder Structure per App
  - API: routes/, services/, graphql/types/
  - Web: components/, hooks/, pages/

## GraphQL Patterns

- [ ] Use Pothos builder pattern consistent with existing types
  - Reference: Existing files in `apps/api/src/graphql/types/`
- [ ] Expose only necessary fields (no internal IDs unnecessarily)
- [ ] Use DataLoader for N+1 prevention if needed

## Security

- [ ] API key never exposed to frontend (NFR-003)
  - Only return key ID, never raw key
- [ ] JWT authentication on SSE endpoint
- [ ] Validate conversation ownership before operations
- [ ] Rate limit chat requests appropriately
