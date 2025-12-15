# Quickstart: Integrated AI Chat

Manual testing guide for verifying chat feature implementation against spec acceptance criteria.

## Prerequisites

- [ ] Development environment running (`npm run dev` in cloud/)
- [ ] Database migrated with chat tables
- [ ] Test user account exists (dev@valuerank.ai / development)
- [ ] At least one LLM provider API key configured (ANTHROPIC_API_KEY recommended)
- [ ] At least one definition with scenarios exists (for MCP tool testing)

---

## Testing User Story 1: Access AI Chat Tab (P1)

**Goal**: Verify chat tab appears in navigation and is accessible.

### Steps

1. Open browser to http://localhost:5173
2. Log in with test credentials (dev@valuerank.ai / development)
3. Look at the main navigation bar
4. Click on the "Chat" tab

### Expected

- [ ] "Chat" tab appears in navigation alongside Dashboard, Definitions, Runs, etc.
- [ ] Clicking Chat tab navigates to /chat
- [ ] Chat page shows empty chat interface with message input area
- [ ] Send button is visible (initially disabled if input is empty)

### Verification

```bash
# Check route exists in App.tsx
grep -n "chat" cloud/apps/web/src/App.tsx

# Check navigation includes Chat
grep -n "Chat" cloud/apps/web/src/components/layout/Layout.tsx
```

---

## Testing User Story 2: Send Messages and Receive Responses (P1)

**Goal**: Verify basic chat functionality with streaming responses.

### Steps

1. Navigate to /chat
2. Type "Hello, what can you help me with?" in the message input
3. Press Enter or click Send
4. Watch for AI response

### Expected

- [ ] User message appears immediately in the conversation thread
- [ ] Loading/typing indicator shows while AI is responding
- [ ] AI response streams in token-by-token (not all at once)
- [ ] Response appears as a formatted message below user's message

### Verification

```bash
# Test SSE endpoint directly with curl
TOKEN=$(node -e "const jwt=require('jsonwebtoken');console.log(jwt.sign({sub:'USER_ID',email:'dev@valuerank.ai'},'dev-secret-key-for-local-development-only-32chars',{expiresIn:'1h'}))")

# First create a conversation via GraphQL
curl -s -X POST http://localhost:3031/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query": "mutation { createChatConversation { id title } }"}'

# Then test streaming (replace CONV_ID)
curl -N http://localhost:3031/api/chat/stream \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"conversationId": "CONV_ID", "content": "Hello"}'
```

---

## Testing User Story 3: Automatic API Key Management (P1)

**Goal**: Verify API key is auto-created for chat without user intervention.

### Steps

1. Delete any existing "--integrated-chat" API key for your user (via database or Settings page if available)
2. Navigate to /chat
3. Send any message

### Expected

- [ ] Chat works immediately without any API key prompts
- [ ] Behind the scenes, "--integrated-chat" API key was created

### Verification

```bash
# Check if key was created
psql -h localhost -p 5433 -U valuerank valuerank -c \
  "SELECT id, name, key_prefix, created_at FROM api_keys WHERE name = '--integrated-chat'"

# Or via GraphQL
curl -s -X POST http://localhost:3031/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query": "mutation { ensureChatApiKey { apiKeyId created } }"}'
```

---

## Testing User Story 4: Persistent Conversation History (P1)

**Goal**: Verify conversations persist across page reloads and sessions.

### Steps

1. Send 2-3 messages in a conversation
2. Note the conversation content
3. Refresh the page (F5 or Cmd+R)
4. Observe that conversation is restored
5. Close browser completely, reopen, navigate to /chat

### Expected

- [ ] After refresh, all previous messages are visible
- [ ] Messages appear in correct order (oldest first)
- [ ] After browser restart, conversation is restored from database

### Verification

```bash
# Check messages in database
psql -h localhost -p 5433 -U valuerank valuerank -c \
  "SELECT id, role, LEFT(content, 50) as content_preview, created_at
   FROM chat_messages
   WHERE conversation_id = 'CONV_ID'
   ORDER BY created_at"
```

---

## Testing User Story 5: Multiple Conversations (P1)

**Goal**: Verify users can create and manage multiple conversations.

### Steps

1. Navigate to /chat with an existing conversation
2. Click "New Chat" button
3. Send a message in the new conversation
4. Observe conversation list in sidebar
5. Click on the first conversation
6. Rename the first conversation (click title, edit, save)
7. Delete the second conversation

### Expected

- [ ] "New Chat" creates a new, empty conversation
- [ ] Previous conversation is preserved
- [ ] Sidebar shows list of all conversations with titles/timestamps
- [ ] Clicking a conversation loads its messages
- [ ] Renaming updates the title in the list
- [ ] Delete removes the conversation (with confirmation)
- [ ] New conversations show default title until first message

### Verification

```bash
# List conversations for user
psql -h localhost -p 5433 -U valuerank valuerank -c \
  "SELECT id, title, created_at, last_message_at, deleted_at
   FROM chat_conversations
   WHERE user_id = 'USER_ID'
   ORDER BY last_message_at DESC"
```

---

## Testing User Story 6: Select AI Model (P2)

**Goal**: Verify admin can configure chat model in Settings; conversations remember their model.

### Steps

1. Navigate to /settings
2. Find the Infrastructure section
3. Locate "Chat Model" selector (alongside Judge/Summarizer)
4. Select a model (e.g., GPT-4o)
5. Navigate to /chat
6. Create a new conversation
7. Verify the chat header shows the configured model
8. Go back to Settings, change model to Claude Sonnet 4.5
9. Return to the conversation from step 6
10. Verify it still shows GPT-4o (the original model)

### Expected

- [ ] Settings page shows "Chat Model" in Infrastructure section
- [ ] Model selector shows available MCP-compatible models
- [ ] Default is Claude Sonnet 4.5 if not configured
- [ ] New conversations use the currently configured model
- [ ] Existing conversations keep their original model
- [ ] Chat header displays the conversation's model (read-only)

### Verification

```bash
# Check current chat model config
curl -s -X POST http://localhost:3031/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query": "query { chatModelConfig { modelId displayName provider } }"}'

# Check system setting directly
psql -h localhost -p 5433 -U valuerank valuerank -c \
  "SELECT key, value FROM system_settings WHERE key = 'infra_model_chat'"

# Check conversation model (should match what was configured at creation time)
psql -h localhost -p 5433 -U valuerank valuerank -c \
  "SELECT id, model_id, created_at FROM chat_conversations WHERE id = 'CONV_ID'"
```

---

## Testing User Story 7: Copy Message Content (P3)

**Goal**: Verify users can copy AI responses.

### Steps

1. Have an AI response in the conversation
2. Hover over the AI message
3. Click the copy button/icon

### Expected

- [ ] Copy button appears on hover (or always visible)
- [ ] Clicking copy shows a confirmation toast
- [ ] Pasting produces the message content

### Verification

Manual test only - paste into a text editor to verify content.

---

## Testing User Story 8: View Tool Calls (P2)

**Goal**: Verify users can see which MCP tools the AI called.

### Steps

1. Ask a question that requires MCP tools: "Show me my recent runs"
2. Wait for AI response
3. Look for "Tool Calls" or expandable section

### Expected

- [ ] Response shows the data from MCP tools (e.g., run list)
- [ ] Expandable section shows tool name (e.g., "list_runs")
- [ ] Arguments passed to tool are visible
- [ ] For simple queries without tools, no tool calls section appears

### Verification

```bash
# Check tool calls in message record
psql -h localhost -p 5433 -U valuerank valuerank -c \
  "SELECT id, role, tool_calls, tool_results
   FROM chat_messages
   WHERE conversation_id = 'CONV_ID'
   AND tool_calls IS NOT NULL"
```

---

## Testing Edge Cases

### Empty Message

1. Clear input field
2. Click Send button
3. **Expected**: Send button is disabled, nothing happens

### Very Long Message

1. Paste a message with 10,000+ characters
2. **Expected**: Character count shown, validation error if over limit

### Network Error

1. Disconnect network (DevTools > Network > Offline)
2. Send a message
3. **Expected**: Error message with "Retry" option

### Model Unavailable

1. Select a model, then (admin) deprecate that model
2. Send a message
3. **Expected**: Falls back to default model with notification

---

## Troubleshooting

### Issue: Chat tab not appearing

**Fix**: Verify the route is added in App.tsx and Layout component has the nav link.

### Issue: "API key not found" error

**Fix**: Check the ensureChatApiKey mutation is being called on chat page load.

```bash
# Manually create the key
curl -s -X POST http://localhost:3031/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query": "mutation { ensureChatApiKey { apiKeyId created } }"}'
```

### Issue: Streaming not working (response appears all at once)

**Fix**: Check browser supports EventSource and CORS headers allow SSE.

```bash
# Test SSE directly
curl -N http://localhost:3031/api/chat/stream \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"conversationId": "ID", "content": "Hi"}'
```

### Issue: MCP tools not working

**Fix**: Verify the --integrated-chat API key has MCP access and the MCP server is running.

```bash
# Test MCP endpoint directly
curl -s http://localhost:3031/mcp \
  -H "Authorization: Bearer API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/list", "id": 1}'
```

### Issue: Conversation not persisting

**Fix**: Check database connection and that messages are being created.

```bash
# Check recent messages
psql -h localhost -p 5433 -U valuerank valuerank -c \
  "SELECT * FROM chat_messages ORDER BY created_at DESC LIMIT 5"
```
