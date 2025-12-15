# Feature Specification: Integrated AI Chat

**Feature**: #020 - integrated-chat
**Created**: 2025-12-14
**Status**: Draft
**Input**: Integrate AI chat into cloud website with MCP support, separate tab UX, auto-managed API key

---

## Overview

Add an AI chat interface to the ValueRank cloud platform that connects to the ValueRank MCP server, enabling users to interact with their evaluation data through natural language conversation. The chat experience should mirror modern AI assistants (ChatGPT, Claude.ai) with full conversation support, custom system prompts, and seamless MCP tool access.

---

## Research: MCP-Compatible Providers & Models

MCP (Model Context Protocol) support is required for the chat to access ValueRank tools. Based on research conducted December 2025:

### Tier 1: Confirmed MCP Support (Recommended)

| Provider | Models | MCP Status | Notes |
|----------|--------|------------|-------|
| **Anthropic** | Claude Sonnet 4.5, Sonnet 4, Opus 4, Haiku 4.5, Haiku 3.5 | Native | MCP creator, native SDK support |
| **OpenAI** | GPT-5.1, GPT-5 Mini, GPT-4.1, GPT-4o, GPT-4o Mini | Adopted March 2025 | Full function calling, MCP connector in API |
| **Google** | Gemini 2.5 Pro, Gemini 2.5 Flash | Confirmed April 2025 | Built-in MCP support in Gemini SDKs |

### Tier 2: Function Calling Support (May Work)

| Provider | Models | Status | Notes |
|----------|--------|--------|-------|
| **xAI** | Grok 4, Grok 4.1 Fast, Grok 3 | Function calling | MCP adoption not documented |
| **Mistral** | Mistral Large, Mistral Small | Function calling | MCP support unclear |
| **DeepSeek** | DeepSeek Chat, DeepSeek Reasoner | Function calling | MCP status unknown |

### Recommendation

**Phase 1 (MVP)**: Support only Tier 1 providers (Anthropic, OpenAI, Google) to guarantee MCP tool reliability.

**Phase 2**: Evaluate Tier 2 providers once function-calling-to-MCP adapter patterns are proven.

### Sources
- [Anthropic MCP Introduction](https://www.anthropic.com/news/model-context-protocol)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [Google Gemini Function Calling](https://ai.google.dev/gemini-api/docs/function-calling)
- [MCP Official Site](https://modelcontextprotocol.io/)

---

## User Scenarios & Testing

### User Story 1 - Access AI Chat Tab (Priority: P1)

As a logged-in user, I need to access an AI Chat tab in the navigation so that I can interact with ValueRank data through natural language.

**Why this priority**: Core entry point - without navigation access, users cannot reach the feature.

**Independent Test**: Navigate to the cloud app while logged in, verify "Chat" tab appears in navigation, click to access chat interface.

**Acceptance Scenarios**:

1. **Given** a logged-in user on any page, **When** they view the navigation, **Then** they see a "Chat" tab alongside existing tabs (Dashboard, Definitions, Runs, etc.)

2. **Given** a user clicks the Chat tab, **When** the page loads, **Then** they see an empty chat interface with a message input area and send button.

3. **Given** a user is not logged in, **When** they attempt to access /chat directly, **Then** they are redirected to the login page.

---

### User Story 2 - Send Messages and Receive Responses (Priority: P1)

As a user in the chat interface, I need to send messages and receive AI responses so that I can have conversations about my ValueRank data.

**Why this priority**: Core functionality - chat is useless without message exchange.

**Independent Test**: Type a message, send it, verify AI response appears in conversation thread.

**Acceptance Scenarios**:

1. **Given** a user in the chat interface, **When** they type a message and click Send (or press Enter), **Then** the message appears in the conversation thread and an AI response streams in.

2. **Given** a user sends a message, **When** the AI is responding, **Then** a loading/typing indicator shows and the response streams token-by-token (not all at once).

3. **Given** a user sends a message about ValueRank data (e.g., "Show me my recent runs"), **When** the AI processes the request, **Then** it uses MCP tools to fetch real data and presents accurate results.

4. **Given** a network error occurs, **When** the AI response fails, **Then** an error message appears with option to retry.

---

### User Story 3 - Automatic API Key Management (Priority: P1)

As a user accessing chat for the first time, I need the system to automatically create an API key for MCP integration so that chat works without manual configuration.

**Why this priority**: Eliminates friction - users should not need to understand API keys to use chat.

**Independent Test**: Access chat with no existing "--integrated-chat" API key, verify key is auto-created and chat functions.

**Acceptance Scenarios**:

1. **Given** a user accesses chat without an "--integrated-chat" API key, **When** the chat interface loads, **Then** the system automatically creates an API key named "--integrated-chat" for that user.

2. **Given** a user previously deleted their "--integrated-chat" API key, **When** they access chat again, **Then** a new "--integrated-chat" key is automatically recreated.

3. **Given** the "--integrated-chat" API key exists, **When** the chat makes MCP tool calls, **Then** it authenticates using that key (user never sees the key value).

4. **Given** API key creation fails, **When** the user tries to use chat, **Then** an error message explains the issue with a "Retry" option.

---

### User Story 4 - Persistent Conversation History (Priority: P1)

As a user, I need my chat conversations to persist in the database so that I can access them across sessions and devices.

**Why this priority**: Essential for usability - users expect conversations to survive page refreshes and return visits.

**Independent Test**: Send messages, close browser, reopen, verify conversation is restored from database.

**Acceptance Scenarios**:

1. **Given** a user has sent multiple messages, **When** they scroll up, **Then** all previous messages and AI responses are visible in order.

2. **Given** a conversation is in progress, **When** the user navigates away and returns to Chat tab, **Then** the conversation is preserved.

3. **Given** a user refreshes the page or closes the browser, **When** they return to chat later, **Then** their most recent conversation is automatically loaded.

4. **Given** a user logs in from a different device, **When** they access chat, **Then** they see their existing conversations.

---

### User Story 5 - Multiple Conversations (Priority: P1)

As a user, I need to create and manage multiple separate conversations so that I can organize different topics and maintain distinct contexts.

**Why this priority**: Core feature for productive use - users need separate conversations for different tasks/topics.

**Independent Test**: Create multiple conversations, switch between them, verify each maintains its own history.

**Acceptance Scenarios**:

1. **Given** a user is in the chat interface, **When** they click "New Chat", **Then** a new conversation is created and the previous one is saved.

2. **Given** a user has multiple conversations, **When** they view the conversation list (sidebar), **Then** they see all their conversations with titles and timestamps.

3. **Given** a user clicks on a conversation in the list, **When** the conversation loads, **Then** they see all messages from that specific conversation.

4. **Given** a user wants to rename a conversation, **When** they edit the title, **Then** the new title is saved and displayed in the list.

5. **Given** a user wants to delete a conversation, **When** they confirm deletion, **Then** the conversation and all its messages are removed.

6. **Given** a new conversation has no messages yet, **When** displayed in the list, **Then** it shows a default title like "New Chat" or uses the first message as title once sent.

---

### User Story 6 - Select AI Model (Priority: P2)

As an admin, I need to configure which AI model powers the chat feature so that the organization can standardize on a preferred model.

**Why this priority**: Enhances flexibility but chat works with a sensible default.

**Independent Test**: Configure chat model in Settings, start new chat, verify response comes from configured model.

**Acceptance Scenarios**:

1. **Given** an admin opens Settings, **When** they view the Infrastructure section, **Then** they see a "Chat Model" selector alongside Judge/Summarizer model settings.

2. **Given** an admin selects a chat model, **When** a user starts a NEW conversation, **Then** that conversation uses the currently configured model.

3. **Given** no chat model is explicitly configured, **When** chat loads, **Then** a sensible default model is used (e.g., Claude Sonnet 4.5).

4. **Given** a conversation was started with Model A, **When** the admin changes the global setting to Model B, **Then** returning to that old conversation still uses Model A (the original model).

5. **Given** a user opens an existing conversation, **When** they view the chat header, **Then** they see which model this conversation is using (read-only display).

---

### User Story 7 - Copy Message Content (Priority: P3)

As a user, I need to copy AI responses so that I can paste them elsewhere (reports, documentation, etc.).

**Why this priority**: Convenience feature, not core functionality.

**Independent Test**: Click copy button on an AI response, paste elsewhere, verify content matches.

**Acceptance Scenarios**:

1. **Given** an AI response is displayed, **When** the user clicks a copy button/icon, **Then** the response text is copied to clipboard with a confirmation toast.

2. **Given** a response contains code blocks, **When** copied, **Then** formatting is preserved appropriately for plain text paste.

---

### User Story 8 - View Tool Calls (Priority: P2)

As a power user, I need to see which MCP tools the AI called so that I can understand how it retrieved my data.

**Why this priority**: Transparency feature for advanced users, not essential for basic usage.

**Independent Test**: Ask a question that requires MCP tools, expand tool calls section, verify tool names and parameters are shown.

**Acceptance Scenarios**:

1. **Given** an AI response used MCP tools, **When** the user expands a "Tool Calls" section, **Then** they see which tools were called (e.g., "list_runs", "get_run_summary").

2. **Given** a response required no tool calls, **When** the user views the response, **Then** no tool calls section appears.

---

## Edge Cases

- **Empty message**: Disable send button when input is empty or whitespace-only.
- **Very long message**: Allow up to 10,000 characters; show character count when approaching limit.
- **Rate limiting**: If AI provider rate-limits, queue messages and show "Processing..." status.
- **API key deleted mid-conversation**: Detect auth failure, auto-recreate key, retry transparently.
- **Model unavailable**: If selected model becomes unavailable, fall back to default with notification.
- **Network disconnection**: Show offline indicator, queue messages, sync when reconnected.
- **Concurrent sessions**: Multiple browser tabs editing same conversation should handle conflicts gracefully (last-write-wins or optimistic locking).
- **Token limit exceeded**: If conversation exceeds model context window, truncate older messages with notification.
- **Many conversations**: Paginate conversation list if user has 50+ conversations; show most recent first.
- **Delete active conversation**: If user deletes the currently open conversation, redirect to most recent remaining conversation or empty state.
- **Conversation title generation**: Auto-generate title from first user message (first ~50 chars) if not manually set.
- **Empty conversation cleanup**: Optionally delete conversations with no messages after 24 hours.

---

## Requirements

### Functional Requirements

- **FR-001**: System MUST display a "Chat" navigation tab for authenticated users.
- **FR-002**: System MUST provide a message input area with send button and keyboard shortcut (Enter to send, Shift+Enter for newline).
- **FR-003**: System MUST stream AI responses token-by-token using server-sent events or WebSocket.
- **FR-004**: System MUST auto-create an API key named "--integrated-chat" on first chat access if not exists.
- **FR-005**: System MUST auto-recreate the "--integrated-chat" API key if user deleted it.
- **FR-006**: System MUST connect to ValueRank MCP server using the user's "--integrated-chat" API key.
- **FR-007**: System MUST include a custom system prompt instructing the AI about ValueRank context and available MCP tools.
- **FR-008**: System MUST persist all conversations and messages to the database.
- **FR-009**: System MUST allow admin configuration of chat model in Settings (alongside Judge/Summarizer settings).
- **FR-009a**: System MUST store the model used when a conversation is created, and continue using that model for that conversation.
- **FR-009b**: System MUST display the conversation's model in the chat header (read-only).
- **FR-010**: System MUST display loading state while AI is generating response.
- **FR-011**: System MUST handle errors gracefully with user-friendly messages and retry options.
- **FR-012**: System MUST provide a "New Chat" action to create a new conversation (previous conversation is saved).
- **FR-013**: System MUST display a conversation list/sidebar showing all user's conversations.
- **FR-014**: System MUST allow users to switch between conversations by clicking in the list.
- **FR-015**: System MUST allow users to rename conversations.
- **FR-016**: System MUST allow users to delete conversations (with confirmation).
- **FR-017**: System MUST auto-generate conversation titles from first user message if not manually set.
- **FR-018**: System MUST load the most recent conversation when user accesses chat.
- **FR-019**: System SHOULD display which MCP tools were called (expandable section).
- **FR-020**: System SHOULD allow copying AI response content to clipboard.
- **FR-021**: System SHOULD paginate conversation list when user has many conversations (50+).

### Non-Functional Requirements

- **NFR-001**: AI response first token MUST appear within 3 seconds of sending message (excluding model inference time).
- **NFR-002**: Chat interface MUST be responsive on desktop (1024px+) and tablet (768px+).
- **NFR-003**: System MUST NOT expose the "--integrated-chat" API key value to the frontend.

---

## Success Criteria

- **SC-001**: Users can send a message and receive a streaming AI response within 5 seconds (first token).
- **SC-002**: Users can ask data questions (e.g., "list my runs") and receive accurate results from MCP tools.
- **SC-003**: 95% of chat sessions start successfully without API key errors.
- **SC-004**: Users can select from at least 3 different AI models across supported providers.
- **SC-005**: Chat interface achieves 90% task completion rate for basic queries on first attempt.
- **SC-006**: Users can create, switch between, and manage multiple conversations without data loss.
- **SC-007**: Conversations persist across browser sessions and are accessible from any device.

---

## Key Entities

### New Entities

| Entity | Description |
|--------|-------------|
| `ChatConversation` | Stores conversation metadata: id, userId, title, modelId, createdAt, updatedAt |
| `ChatMessage` | Stores individual messages: id, conversationId, role (user/assistant/system), content, toolCalls (JSON), createdAt |

### Existing Entities Used

| Entity | Usage |
|--------|-------|
| `ApiKey` | Auto-managed "--integrated-chat" key for MCP auth |
| `User` | Owner of conversations and API keys |
| `LlmProvider` | Filter to MCP-compatible providers |
| `LlmModel` | Available models for chat, stored per conversation |

---

## Assumptions

1. **Server-side AI calls**: The API server makes AI provider calls (not browser), keeping API keys secure.
2. **Database persistence**: All conversations and messages are stored in PostgreSQL.
3. **Unlimited conversations**: No artificial limit on number of conversations per user.
4. **MCP tools already exist**: The ValueRank MCP server (list_runs, get_run_summary, etc.) is already implemented.
5. **API keys table supports special names**: The "--integrated-chat" naming convention works with existing ApiKey model.
6. **Streaming supported**: All target AI providers support streaming responses.
7. **Soft delete for conversations**: Deleted conversations use soft delete pattern (deletedAt timestamp) consistent with other entities.

---

## Out of Scope (MVP)

- Sharing conversations with other users
- Voice input/output
- File/image uploads
- Custom system prompt editing by users
- Mobile-optimized layout (tablet minimum)
- Full-text search across conversations
- Export conversation to file
- Conversation folders/organization
- Pinned/favorite conversations

---

## Dependencies

- Existing MCP server implementation (specs/009, specs/010)
- Existing API key infrastructure
- LLM provider integrations (already in system)
- Streaming response infrastructure (may need to add)

---

## Open Questions

*None requiring clarification - assumptions documented above.*
