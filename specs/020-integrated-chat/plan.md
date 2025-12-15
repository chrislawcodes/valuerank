# Implementation Plan: Integrated AI Chat

**Branch**: `020-integrated-chat` | **Date**: 2025-12-14 | **Spec**: [spec.md](./spec.md)

## Summary

Add an AI chat interface to the ValueRank cloud platform that connects to the MCP server via server-side LLM calls. The chat uses server-sent events (SSE) for streaming responses, auto-managed API keys for MCP authentication, and persists conversations in PostgreSQL.

---

## Technical Context

| Attribute | Value |
|-----------|-------|
| **Language/Version** | TypeScript 5.3+ (Node.js 20+) |
| **Primary Dependencies** | Express, GraphQL (Pothos), Prisma, React, URQL, Anthropic/OpenAI SDKs |
| **Storage** | PostgreSQL with Prisma ORM |
| **Testing** | Vitest (API), Vitest (web) |
| **Target Platform** | Railway (Docker) |
| **Performance Goals** | First token < 3s (NFR-001), responsive on desktop/tablet (NFR-002) |
| **Constraints** | API key never exposed to frontend (NFR-003), server-side LLM calls only |

---

## Constitution Check

**Status**: PASS

### File Size (< 400 lines)
- [ ] Split chat service into modular files if needed
- [ ] Extract streaming logic to dedicated module
- [ ] Keep React components under limit via subcomponent extraction

### TypeScript Standards
- [ ] No `any` types - use proper interfaces for LLM responses
- [ ] Strict mode for all new files
- [ ] Type all function signatures

### Testing Requirements
- [ ] 80% minimum coverage for new code
- [ ] Mock LLM providers in tests
- [ ] Integration tests for GraphQL mutations

### Logging Standards
- [ ] Use `createLogger('chat')` for structured logging
- [ ] Log chat events: message sent, response complete, errors

### Database Patterns
- [ ] Soft delete for conversations/messages (deletedAt)
- [ ] Filter `deletedAt: null` in all queries
- [ ] Use transactions for multi-step operations

**Violations/Notes**: None - plan follows all constitutional requirements.

---

## Architecture Decisions

### Decision 1: Streaming Transport - Server-Sent Events (SSE)

**Chosen**: SSE via new REST endpoint `/api/chat/stream`

**Rationale**:
- Simpler than WebSockets for unidirectional server-to-client streaming
- Native browser support via `EventSource` API
- GraphQL Yoga doesn't support streaming text responses natively
- Matches pattern used by OpenAI/Anthropic APIs

**Alternatives Considered**:
- **WebSocket**: Overkill for one-way streaming, more complex state management
- **GraphQL Subscriptions**: Would require Yoga subscription setup; responses aren't graph-shaped

**Tradeoffs**:
- Pros: Simple, well-supported, easy to debug, works through proxies
- Cons: New endpoint pattern (REST alongside GraphQL), no bidirectional

---

### Decision 2: Server-Side LLM Calls

**Chosen**: API server makes LLM calls, never exposes API keys to frontend

**Rationale**:
- Spec requirement NFR-003: API key never exposed to frontend
- Allows MCP tool calls to use user's `--integrated-chat` API key
- Central rate limiting and cost tracking possible

**Architecture**:
```
Browser → POST /api/chat/stream (JWT auth)
       → API Server creates MCP client with user's API key
       → API Server calls LLM (Anthropic/OpenAI/Google)
       → SSE stream back to browser
```

**Alternatives Considered**:
- **Browser-direct calls**: Would expose API keys, violates NFR-003

---

### Decision 3: Auto-Managed API Key Pattern

**Chosen**: Auto-create `--integrated-chat` API key on first chat access

**Rationale**:
- Spec requirements FR-004, FR-005: auto-create and auto-recreate
- User never needs to manage keys for chat feature
- Leverages existing ApiKey infrastructure

**Implementation**:
- GraphQL query `ensureChatApiKey` returns key ID (never the raw key)
- Service layer checks for existing key, creates if missing
- Key stored hashed, never returned to frontend after creation
- Internal service can retrieve raw key for MCP auth

**Tradeoffs**:
- Pros: Zero friction for users, secure
- Cons: Requires internal key retrieval mechanism (not exposed via GraphQL)

---

### Decision 4: Conversation Storage Model

**Chosen**: Separate `ChatConversation` and `ChatMessage` tables

**Rationale**:
- Clean separation of metadata vs content
- Efficient queries for conversation list (don't load all messages)
- Standard pattern for chat applications
- Supports soft delete per constitution

**Data Model**:
- `ChatConversation`: id, userId, title, modelId, systemPrompt, createdAt, updatedAt, deletedAt
- `ChatMessage`: id, conversationId, role, content, toolCalls (JSON), createdAt, deletedAt

---

### Decision 5: MCP Integration Architecture

**Chosen**: Create temporary MCP client per chat request

**Rationale**:
- MCP SDK supports programmatic client creation
- Each request can use user's API key for MCP auth
- No long-lived connections to manage
- Reuses existing MCP server (`/mcp` endpoint)

**Flow**:
1. Chat request arrives with user JWT
2. Lookup user's `--integrated-chat` API key
3. Create MCP client pointing to `http://localhost:PORT/mcp`
4. Pass MCP tools to LLM as function definitions
5. Execute tool calls via MCP client
6. Stream results back to user

---

### Decision 6: Model Selection - Global Setting + Conversation Memory

**Chosen**: Global chat model setting in infra config; conversations remember their model

**Rationale**:
- Simpler UX: no per-chat model dropdown cluttering the interface
- Consistent with existing infra model pattern (judge, summarizer)
- Conversations preserve context: returning to old chat uses original model
- Admin control over which model the organization uses

**Architecture**:
```
SystemSetting: infra_model_chat = "anthropic:claude-sonnet-4.5"

New Conversation:
  1. Read infra_model_chat from system settings
  2. Store modelId on ChatConversation record
  3. Use that model for all messages in conversation

Existing Conversation:
  1. Read modelId from ChatConversation record
  2. Use that model (ignore current global setting)
```

**Models Available** (Tier 1 only - confirmed MCP support):
- Anthropic: Claude Sonnet 4.5, Opus 4, Haiku (default: Sonnet 4.5)
- OpenAI: GPT-4o, GPT-4o Mini, GPT-4.1
- Google: Gemini 2.5 Pro, Gemini 2.5 Flash

**UI Changes**:
- Settings page: Add "Chat Model" dropdown in Infrastructure section
- Chat header: Display current conversation's model (read-only)
- No per-chat model selector

---

## Project Structure

### API Changes (`apps/api/src/`)

```
apps/api/src/
├── routes/
│   └── chat.ts              # NEW: SSE streaming endpoint
├── services/
│   └── chat/
│       ├── index.ts         # NEW: Service exports
│       ├── conversation.ts  # NEW: CRUD operations
│       ├── message.ts       # NEW: Message operations
│       ├── streaming.ts     # NEW: LLM streaming logic
│       ├── mcp-client.ts    # NEW: MCP client factory
│       └── api-key.ts       # NEW: Auto-managed key logic
├── graphql/
│   └── types/
│       ├── chat-conversation.ts  # NEW: GraphQL types
│       └── chat-message.ts       # NEW: GraphQL types
└── queue/
    └── handlers/
        └── chat-cleanup.ts  # NEW: Optional cleanup job
```

### Web Changes (`apps/web/src/`)

```
apps/web/src/
├── pages/
│   ├── Chat.tsx             # NEW: Main chat page
│   └── Settings.tsx         # MODIFY: Add chat model selector
├── components/
│   └── chat/
│       ├── ChatLayout.tsx       # NEW: Sidebar + main area
│       ├── ConversationList.tsx # NEW: Left sidebar
│       ├── ConversationItem.tsx # NEW: List item
│       ├── ChatWindow.tsx       # NEW: Message display area
│       ├── MessageInput.tsx     # NEW: Input with send button
│       ├── ChatMessage.tsx      # NEW: Single message display
│       ├── ToolCallDisplay.tsx  # NEW: Expandable tool calls
│       └── ChatHeader.tsx       # NEW: Shows conversation model (read-only)
├── hooks/
│   ├── useChat.ts               # NEW: Main chat state hook
│   ├── useConversations.ts      # NEW: Conversation list
│   └── useChatStream.ts         # NEW: SSE streaming hook
└── api/
    └── operations/
        └── chat.ts              # NEW: GraphQL operations
```

### Database Changes (`packages/db/`)

```
packages/db/prisma/
├── schema.prisma            # MODIFY: Add ChatConversation, ChatMessage
└── migrations/
    └── YYYYMMDD_add_chat_tables/
        └── migration.sql    # NEW: Chat tables migration
```

---

## Implementation Phases

### Phase 1: Database & Core API (P1 Stories)
1. Add Prisma models for ChatConversation, ChatMessage
2. Create migration
3. Implement chat service (CRUD operations)
4. Implement auto-managed API key service
5. Add GraphQL types and mutations

### Phase 2: Streaming Infrastructure
1. Create SSE endpoint `/api/chat/stream`
2. Implement LLM provider adapters for streaming
3. Create MCP client factory
4. Implement tool execution flow

### Phase 3: Frontend - Basic Chat (P1 Stories)
1. Add Chat page with routing
2. Create ChatLayout component
3. Implement MessageInput component
4. Implement useChatStream hook for SSE
5. Display streaming responses

### Phase 4: Frontend - Conversations (P1 Stories)
1. Implement ConversationList component
2. Add create/rename/delete operations
3. Persist model selection per conversation
4. Load most recent on page load

### Phase 5: Polish & P2/P3 Features
1. Model selector UI (P2)
2. Tool calls display (P2)
3. Copy message content (P3)
4. Edge case handling

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| SSE connection drops | Implement reconnection logic, resume from last message |
| MCP tool call failures | Graceful error handling, retry with exponential backoff |
| Long responses exceed context | Implement conversation summarization or truncation |
| Rate limiting by LLM providers | Queue requests, show "busy" state to user |

---

## Testing Strategy

### Unit Tests
- Chat service CRUD operations
- API key auto-creation logic
- Message formatting and validation

### Integration Tests
- GraphQL mutations with test database
- SSE endpoint with mock LLM responses
- MCP tool execution flow

### E2E Considerations
- Manual testing via quickstart.md
- Verify streaming in browser dev tools

---

## Dependencies

- **Existing**: MCP server at `/mcp`, ApiKey infrastructure, LlmModel/LlmProvider tables
- **New Packages**: None (LLM SDKs already available in workers, may need in API)
- **API Keys Needed**: Anthropic, OpenAI, Google (already configured for workers)

---

## Open Technical Questions (Resolved)

1. ~~SSE vs WebSocket~~ → SSE chosen for simplicity
2. ~~MCP client lifecycle~~ → Per-request creation
3. ~~API key storage~~ → Existing hash pattern, internal retrieval for MCP auth
