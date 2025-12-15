# Testing Quality Checklist

**Purpose**: Validate test coverage and quality
**Feature**: [tasks.md](../tasks.md)
**Constitution**: [cloud/CLAUDE.md](../../../cloud/CLAUDE.md)

## Coverage Targets (per constitution)

| Metric | Minimum | Target |
|--------|---------|--------|
| Line coverage | 80% | 90% |
| Branch coverage | 75% | 85% |
| Function coverage | 80% | 90% |

- [ ] Line coverage ≥ 80% for new chat code
  - Reference: Constitution § Coverage Targets
- [ ] Branch coverage ≥ 75% for new chat code
- [ ] Function coverage ≥ 80% for new chat code

## Test Structure (per constitution)

- [ ] Tests follow describe/it pattern
  - Reference: Constitution § Test Structure
  - Example: `describe('ChatService') > describe('create') > it('creates conversation')`
- [ ] Tests located in parallel `tests/` directory
  - Reference: Constitution § Test Files Location
  - API tests: `apps/api/tests/services/chat/`
  - GraphQL tests: `apps/api/tests/graphql/chat.test.ts`

## What to Test (per constitution)

- [ ] Business logic in chat services
  - Reference: Constitution § What to Test
  - Conversation CRUD operations
  - Message handling
  - API key management
- [ ] Data transformations
  - SSE event formatting
  - Tool call parsing
- [ ] Edge cases
  - Empty messages blocked
  - Conversation ownership validation
  - Soft delete behavior
- [ ] Mock external dependencies
  - Database (use test database)
  - LLM providers (mock responses)
  - MCP client (mock tool calls)

## Pre-Commit Requirements

- [ ] All tests pass before committing
  - Command: `npm test` from cloud/
- [ ] Build succeeds
  - Command: `npx turbo build`
- [ ] Lint passes
  - Command: `npx turbo lint`

## Test Database Setup

- [ ] Verify test database has chat tables
  - Command: `npm run db:test:setup`
- [ ] Tests use test database URL
  - URL: `postgresql://valuerank:valuerank@localhost:5433/valuerank_test`
- [ ] Tests clean up after themselves (no data pollution)
  - Reference: Constitution § Troubleshooting Test Failures

## Integration Tests

- [ ] GraphQL mutations tested with test database
  - createChatConversation
  - updateChatConversation
  - deleteChatConversation
  - addChatMessage
  - ensureChatApiKey
- [ ] GraphQL queries tested
  - chatConversations
  - chatConversation(id)
  - chatModels
- [ ] SSE endpoint tested with mock LLM
  - Streaming response format
  - Error handling
  - Tool call execution

## Unit Tests

- [ ] Chat service functions tested
  - `apps/api/tests/services/chat/conversation.test.ts`
  - `apps/api/tests/services/chat/message.test.ts`
  - `apps/api/tests/services/chat/api-key.test.ts`
  - `apps/api/tests/services/chat/streaming.test.ts`
- [ ] MCP client factory tested
  - `apps/api/tests/services/chat/mcp-client.test.ts`

## Acceptance Test Validation

From quickstart.md, verify:

- [ ] US1: Chat tab accessible in navigation
- [ ] US2: Messages send and stream responses
- [ ] US3: API key auto-created on first access
- [ ] US4: Conversations persist across sessions
- [ ] US5: Multiple conversations manageable
- [ ] US6: Model selection works (P2)
- [ ] US7: Copy message works (P3)
- [ ] US8: Tool calls visible (P2)

## Non-Functional Requirements

- [ ] NFR-001: First token < 3 seconds (measure actual latency)
- [ ] NFR-002: Responsive on tablet 768px+ (manual visual test)
- [ ] NFR-003: API key never in frontend code (code review)

## Running Tests

```bash
# Run all tests via turbo (recommended)
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test" \
JWT_SECRET="test-secret-that-is-at-least-32-characters-long" \
npx turbo run test

# Run with coverage
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test" \
JWT_SECRET="test-secret-that-is-at-least-32-characters-long" \
npx turbo run test:coverage

# Run specific test file
cd apps/api && \
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test" \
JWT_SECRET="test-secret-that-is-at-least-32-characters-long" \
npx vitest run tests/services/chat/conversation.test.ts
```
