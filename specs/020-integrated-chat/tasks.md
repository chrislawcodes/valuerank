# Tasks: Integrated AI Chat

**Prerequisites**: plan.md, spec.md, data-model.md, contracts/chat-schema.graphql

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (US1-US8) for user story phases only
- Include exact file paths from plan.md

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and branch setup

- [ ] T001 Create feature branch `020-integrated-chat` from main
- [ ] T002 Verify LLM provider API keys are configured in .env (ANTHROPIC_API_KEY, OPENAI_API_KEY)

**Checkpoint**: Development environment ready for implementation

---

## Phase 2: Foundation (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story

⚠️ **CRITICAL**: No user story work can begin until this phase is complete

### Database Schema

- [ ] T003 Add ChatConversation and ChatMessage models to `packages/db/prisma/schema.prisma` per data-model.md
- [ ] T004 Add ChatMessageRole enum to `packages/db/prisma/schema.prisma`
- [ ] T005 Add User relation for ChatConversation in `packages/db/prisma/schema.prisma`
- [ ] T006 Create database migration `add_chat_tables` via `npx prisma migrate dev`
- [ ] T007 Verify migration applies to test database

### TypeScript Types (API)

- [ ] T008 [P] Create chat types in `apps/api/src/services/chat/types.ts` per data-model.md
- [ ] T009 [P] Create GraphQL ChatConversation type in `apps/api/src/graphql/types/chat-conversation.ts`
- [ ] T010 [P] Create GraphQL ChatMessage type in `apps/api/src/graphql/types/chat-message.ts`
- [ ] T011 [P] Create GraphQL ChatModel type for model selection in `apps/api/src/graphql/types/chat-model.ts`
- [ ] T012 Export new types from `apps/api/src/graphql/types/index.ts`

### TypeScript Types (Web)

- [ ] T013 [P] Create chat types in `apps/web/src/types/chat.ts` per data-model.md
- [ ] T014 [P] Create GraphQL operations in `apps/web/src/api/operations/chat.ts`

### Core Services

- [ ] T015 Create chat service index in `apps/api/src/services/chat/index.ts`
- [ ] T016 [P] Create conversation CRUD service in `apps/api/src/services/chat/conversation.ts`
- [ ] T017 [P] Create message service in `apps/api/src/services/chat/message.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 3 - Automatic API Key Management (Priority: P1) 🎯 MVP

**Goal**: System auto-creates `--integrated-chat` API key on first chat access

**Independent Test**: Access chat without API key, verify key auto-created

### Implementation for User Story 3

- [ ] T018 [US3] Create API key management service in `apps/api/src/services/chat/api-key.ts`
- [ ] T019 [US3] Implement `getOrCreateChatApiKey(userId)` function that:
  - Checks for existing "--integrated-chat" key
  - Creates new key if not found
  - Returns key ID (never raw key to frontend)
- [ ] T020 [US3] Add `ensureChatApiKey` mutation to GraphQL in `apps/api/src/graphql/types/chat-conversation.ts`
- [ ] T021 [US3] Write unit tests for API key service in `apps/api/tests/services/chat/api-key.test.ts`

**Checkpoint**: User Story 3 complete - API key auto-management functional

---

## Phase 4: User Story 4 - Persistent Conversation History (Priority: P1) 🎯 MVP

**Goal**: Conversations persist in database across sessions

**Independent Test**: Send messages, refresh, verify history restored

### Implementation for User Story 4

- [ ] T022 [US4] Add `chatConversations` query resolver in `apps/api/src/graphql/types/chat-conversation.ts`
- [ ] T023 [US4] Add `chatConversation(id)` query resolver for single conversation
- [ ] T024 [US4] Add `messages` field resolver on ChatConversation type
- [ ] T025 [US4] Add `createChatConversation` mutation resolver
- [ ] T026 [US4] Add `addChatMessage` mutation resolver in `apps/api/src/graphql/types/chat-message.ts`
- [ ] T027 [US4] Implement conversation queries in `apps/api/src/services/chat/conversation.ts`:
  - `listConversations(userId, limit, offset)`
  - `getConversation(id, userId)`
  - `createConversation(userId, input)`
- [ ] T028 [US4] Implement message operations in `apps/api/src/services/chat/message.ts`:
  - `getMessages(conversationId, limit, offset)`
  - `createMessage(conversationId, role, content)`
- [ ] T029 [US4] Write integration tests in `apps/api/tests/graphql/chat.test.ts`

**Checkpoint**: User Story 4 complete - conversations persist to database

---

## Phase 5: User Story 2 - Send Messages and Receive Responses (Priority: P1) 🎯 MVP

**Goal**: Users can send messages and receive streaming AI responses

**Independent Test**: Send message, verify streaming response appears

### Streaming Infrastructure

- [ ] T030 [US2] Create SSE endpoint router in `apps/api/src/routes/chat.ts`
- [ ] T031 [US2] Implement request validation and JWT auth for `/api/chat/stream`
- [ ] T032 [US2] Create LLM streaming service in `apps/api/src/services/chat/streaming.ts`:
  - Accept conversation ID, message content
  - Create user message in database
  - Call LLM provider with streaming
  - Stream tokens back via SSE
  - Save assistant message when complete
- [ ] T033 [US2] Create MCP client factory in `apps/api/src/services/chat/mcp-client.ts`:
  - Create MCP client pointing to `/mcp` endpoint
  - Use user's `--integrated-chat` API key for auth
  - Return tool definitions for LLM
- [ ] T034 [US2] Implement Anthropic streaming adapter (primary provider)
- [ ] T035 [US2] Implement tool call execution flow:
  - Detect tool_use in LLM response
  - Execute via MCP client
  - Feed results back to LLM
  - Continue streaming
- [ ] T036 [US2] Register chat router in `apps/api/src/server.ts`

### Frontend Streaming

- [ ] T037 [US2] Create SSE streaming hook in `apps/web/src/hooks/useChatStream.ts`:
  - POST to `/api/chat/stream`
  - Parse SSE events
  - Update message state
  - Handle errors
- [ ] T038 [US2] Write unit tests for streaming service in `apps/api/tests/services/chat/streaming.test.ts`

**Checkpoint**: User Story 2 complete - streaming chat functional with MCP tools

---

## Phase 6: User Story 1 - Access AI Chat Tab (Priority: P1) 🎯 MVP

**Goal**: Chat tab appears in navigation, accessible to logged-in users

**Independent Test**: Log in, verify Chat tab in navigation, click to access

### Implementation for User Story 1

- [ ] T039 [US1] Create Chat page component in `apps/web/src/pages/Chat.tsx`:
  - Chat layout with sidebar and main area
  - Call `ensureChatApiKey` on mount
  - Load most recent conversation
- [ ] T040 [US1] Add Chat route to `apps/web/src/App.tsx`:
  - Route: `/chat`
  - Protected with ProtectedLayout
- [ ] T041 [US1] Add "Chat" navigation link in `apps/web/src/components/layout/Layout.tsx`
- [ ] T042 [P] [US1] Create ChatLayout component in `apps/web/src/components/chat/ChatLayout.tsx`:
  - Left sidebar for conversation list
  - Main area for chat window
  - Responsive layout (tablet+)
- [ ] T043 [P] [US1] Create ChatWindow component in `apps/web/src/components/chat/ChatWindow.tsx`:
  - Display messages
  - Auto-scroll to bottom
  - Loading state for streaming
- [ ] T044 [P] [US1] Create MessageInput component in `apps/web/src/components/chat/MessageInput.tsx`:
  - Text input with send button
  - Enter to send, Shift+Enter for newline
  - Disabled when empty
  - Character count near limit
- [ ] T045 [P] [US1] Create ChatMessage component in `apps/web/src/components/chat/ChatMessage.tsx`:
  - User vs assistant styling
  - Markdown rendering for assistant
  - Streaming indicator
- [ ] T046 [US1] Create main chat hook in `apps/web/src/hooks/useChat.ts`:
  - Manage conversation state
  - Send messages via stream hook
  - Update UI optimistically
- [ ] T047 [US1] Export new hooks from `apps/web/src/hooks/index.ts`

**Checkpoint**: User Story 1 complete - Chat page accessible and functional

---

## Phase 7: User Story 5 - Multiple Conversations (Priority: P1) 🎯 MVP

**Goal**: Users can create and manage multiple separate conversations

**Independent Test**: Create multiple conversations, switch between, verify each has own history

### Implementation for User Story 5

- [ ] T048 [US5] Create ConversationList component in `apps/web/src/components/chat/ConversationList.tsx`:
  - List all conversations with title/timestamp
  - Click to switch
  - Sorted by lastMessageAt
- [ ] T049 [US5] Create ConversationItem component in `apps/web/src/components/chat/ConversationItem.tsx`:
  - Display title (or "New Chat")
  - Timestamp
  - Edit/delete buttons
- [ ] T050 [US5] Create useConversations hook in `apps/web/src/hooks/useConversations.ts`:
  - Fetch conversation list
  - Create new conversation
  - Select conversation
- [ ] T051 [US5] Add `updateChatConversation` mutation for rename in `apps/api/src/graphql/types/chat-conversation.ts`
- [ ] T052 [US5] Add `deleteChatConversation` mutation (soft delete)
- [ ] T053 [US5] Implement update/delete in conversation service
- [ ] T054 [US5] Add "New Chat" button to ChatLayout
- [ ] T055 [US5] Implement auto-title generation from first message:
  - On first user message
  - Take first 50 chars
  - Update conversation title
- [ ] T056 [US5] Implement conversation switching in useChat hook
- [ ] T057 [US5] Handle delete active conversation (redirect to most recent)

**Checkpoint**: User Story 5 complete - multiple conversations manageable

---

## Phase 8: User Story 6 - Select AI Model (Priority: P2)

**Goal**: Admin configures chat model in Settings; conversations remember their model

**Independent Test**: Configure model in Settings, start new chat, verify it uses configured model; open old chat, verify it uses original model

### Implementation for User Story 6

- [ ] T058 [US6] Add `setChatModel` MCP tool/mutation using existing `set_infra_model` pattern:
  - Purpose: "chat" (alongside judge, summarizer, scenario_generator)
  - Store in SystemSetting as `infra_model_chat`
- [ ] T059 [US6] Add `chatModelConfig` query resolver in `apps/api/src/graphql/types/chat-model.ts`:
  - Read from SystemSetting `infra_model_chat`
  - Return modelId, displayName, provider
  - Default to `anthropic:claude-sonnet-4.5` if not set
- [ ] T060 [US6] Update Settings page to show Chat Model selector:
  - Add to Infrastructure section alongside Judge/Summarizer
  - Use existing model selector pattern from Settings.tsx
- [ ] T061 [US6] Update `createConversation` service to:
  - Read current `infra_model_chat` from SystemSetting
  - Store as `modelId` on new ChatConversation
- [ ] T062 [US6] Create ChatHeader component in `apps/web/src/components/chat/ChatHeader.tsx`:
  - Display conversation's model (read-only)
  - Show model display name and provider
- [ ] T063 [US6] Add ChatHeader to ChatLayout
- [ ] T064 [US6] Implement OpenAI streaming adapter in `apps/api/src/services/chat/streaming.ts`
- [ ] T065 [US6] Implement Google streaming adapter (Gemini)

**Checkpoint**: User Story 6 complete - global model config + conversation memory

---

## Phase 9: User Story 8 - View Tool Calls (Priority: P2)

**Goal**: Power users can see which MCP tools the AI called

**Independent Test**: Ask data question, expand tool calls section, verify tools shown

### Implementation for User Story 8

- [ ] T066 [US8] Create ToolCallDisplay component in `apps/web/src/components/chat/ToolCallDisplay.tsx`:
  - Expandable/collapsible section
  - Show tool name
  - Show arguments (JSON formatted)
  - Show result (if available)
- [ ] T067 [US8] Add tool calls to ChatMessage component:
  - Show only if toolCalls present
  - Collapsed by default
- [ ] T068 [US8] Ensure toolCalls saved to ChatMessage in streaming service
- [ ] T069 [US8] Add toolCalls field to GraphQL ChatMessage type (already in schema)

**Checkpoint**: User Story 8 complete - tool calls visible

---

## Phase 10: User Story 7 - Copy Message Content (Priority: P3)

**Goal**: Users can copy AI responses to clipboard

**Independent Test**: Click copy on AI response, paste elsewhere, verify content

### Implementation for User Story 7

- [ ] T070 [US7] Add copy button to ChatMessage component
- [ ] T071 [US7] Implement clipboard copy with toast confirmation
- [ ] T072 [US7] Handle code block formatting when copying

**Checkpoint**: User Story 7 complete - copy functionality works

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

### Error Handling

- [ ] T073 [P] Implement error boundary for Chat page
- [ ] T074 [P] Add retry button for failed messages
- [ ] T075 [P] Handle network disconnection gracefully
- [ ] T076 Implement API key recreation if deleted mid-conversation

### Edge Cases

- [ ] T077 [P] Add character count near 10,000 limit
- [ ] T078 [P] Implement conversation list pagination (50+ conversations)
- [ ] T079 [P] Handle model unavailable fallback
- [ ] T080 Add rate limiting handling (queue + "Processing..." state)

### Performance

- [ ] T081 Implement message virtualization for long conversations
- [ ] T082 Add conversation caching in useConversations

### Testing & Validation

- [ ] T083 Run all acceptance tests from quickstart.md
- [ ] T084 Verify NFR-001: first token < 3s
- [ ] T085 Verify NFR-002: responsive on tablet (768px+)
- [ ] T086 Verify NFR-003: API key never exposed to frontend
- [ ] T087 Run full test suite, ensure >80% coverage for new code

**Checkpoint**: Feature complete, all acceptance criteria met

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup) ──► Phase 2 (Foundation) ──► Phases 3-7 (P1 Stories)
                                         └──► Phases 8-9 (P2 Stories)
                                         └──► Phase 10 (P3 Story)
                                         └──► Phase 11 (Polish)
```

- **Setup (Phase 1)**: No dependencies
- **Foundation (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **US3 API Keys (Phase 3)**: First P1 story - needed by streaming
- **US4 Persistence (Phase 4)**: Depends on Foundation
- **US2 Streaming (Phase 5)**: Depends on US3, US4
- **US1 Chat Tab (Phase 6)**: Depends on US2, US4
- **US5 Multiple Convos (Phase 7)**: Depends on US1
- **US6-8 (P2/P3)**: Depend on P1 stories complete
- **Polish (Phase 11)**: Depends on desired stories complete

### User Story Dependencies

| Story | Priority | Depends On | Blocks |
|-------|----------|------------|--------|
| US3 (API Keys) | P1 | Foundation | US2 |
| US4 (Persistence) | P1 | Foundation | US1, US2 |
| US2 (Streaming) | P1 | US3, US4 | US1 |
| US1 (Chat Tab) | P1 | US2, US4 | US5 |
| US5 (Multi-Convo) | P1 | US1 | - |
| US6 (Model Config) | P2 | Foundation, Settings page | - |
| US8 (Tool Calls) | P2 | US2 | - |
| US7 (Copy) | P3 | US1 | - |

### Parallel Opportunities

- Tasks marked [P] can run in parallel within each phase
- P2/P3 stories can be worked on in parallel once P1 MVP is complete
- Foundation type definitions (T008-T014) can all run in parallel
