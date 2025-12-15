# Data Model: Integrated AI Chat

## Entities

### Entity 1: ChatConversation

**Purpose**: Stores conversation metadata - title, model selection, and timestamps. Represents a single chat thread owned by a user.

**Storage**: `chat_conversations` table

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String (cuid) | PRIMARY KEY | Unique conversation identifier |
| userId | String | NOT NULL, FK → users | Owner of this conversation |
| title | String | NULL | Display title (auto-generated from first message if null) |
| modelId | String | NULL | Selected LLM model identifier (e.g., "anthropic:claude-sonnet-4.5") |
| systemPrompt | Text | NULL | Custom system prompt for this conversation (for future use) |
| createdAt | DateTime | NOT NULL, DEFAULT now() | When conversation was created |
| updatedAt | DateTime | NOT NULL, auto-update | When conversation was last modified |
| lastMessageAt | DateTime | NULL | When the last message was sent (for sorting) |
| deletedAt | DateTime | NULL | Soft delete timestamp |

**Indexes**:
- `chat_conversations_user_id_idx` on (userId) - list conversations by user
- `chat_conversations_user_last_message_idx` on (userId, lastMessageAt DESC) - sorted conversation list
- `chat_conversations_deleted_at_idx` on (deletedAt) - soft delete filtering

**Relationships**:
- Many-to-One: User (owner)
- One-to-Many: ChatMessage (messages in this conversation)

**Validation Rules**:
- Title max length: 200 characters
- Title auto-generated from first user message (first 50 chars) if not set

---

### Entity 2: ChatMessage

**Purpose**: Stores individual messages in a conversation - user inputs, assistant responses, and tool call metadata.

**Storage**: `chat_messages` table

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String (cuid) | PRIMARY KEY | Unique message identifier |
| conversationId | String | NOT NULL, FK → chat_conversations | Parent conversation |
| role | Enum | NOT NULL | Message role: USER, ASSISTANT, SYSTEM |
| content | Text | NOT NULL | Message text content |
| toolCalls | Json | NULL | MCP tool calls made (for assistant messages) |
| toolResults | Json | NULL | Results from tool calls (for tool response messages) |
| inputTokens | Int | NULL | Token count for input (if tracked) |
| outputTokens | Int | NULL | Token count for output (if tracked) |
| modelId | String | NULL | Model that generated this response |
| modelVersion | String | NULL | Specific model version used |
| durationMs | Int | NULL | Response generation time in milliseconds |
| createdAt | DateTime | NOT NULL, DEFAULT now() | When message was created |
| deletedAt | DateTime | NULL | Soft delete timestamp |

**Indexes**:
- `chat_messages_conversation_id_idx` on (conversationId) - list messages in conversation
- `chat_messages_conversation_created_idx` on (conversationId, createdAt) - ordered message retrieval
- `chat_messages_deleted_at_idx` on (deletedAt) - soft delete filtering

**Relationships**:
- Many-to-One: ChatConversation (parent)

**Validation Rules**:
- Content cannot be empty for USER messages
- Content may be empty for ASSISTANT messages (during streaming)
- toolCalls must be valid JSON array if present

---

## Type Definitions

### Prisma Schema

```prisma
// ============================================================================
// CHAT (AI Assistant Integration)
// ============================================================================

model ChatConversation {
  id            String    @id @default(cuid())
  userId        String    @map("user_id")
  title         String?   @db.VarChar(200)
  modelId       String?   @map("model_id")
  systemPrompt  String?   @map("system_prompt") @db.Text
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")
  lastMessageAt DateTime? @map("last_message_at")
  deletedAt     DateTime? @map("deleted_at")

  user     User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages ChatMessage[]

  @@index([userId])
  @@index([userId, lastMessageAt(sort: Desc)])
  @@index([deletedAt])
  @@map("chat_conversations")
}

model ChatMessage {
  id             String          @id @default(cuid())
  conversationId String          @map("conversation_id")
  role           ChatMessageRole
  content        String          @db.Text
  toolCalls      Json?           @map("tool_calls") @db.JsonB
  toolResults    Json?           @map("tool_results") @db.JsonB
  inputTokens    Int?            @map("input_tokens")
  outputTokens   Int?            @map("output_tokens")
  modelId        String?         @map("model_id")
  modelVersion   String?         @map("model_version")
  durationMs     Int?            @map("duration_ms")
  createdAt      DateTime        @default(now()) @map("created_at")
  deletedAt      DateTime?       @map("deleted_at")

  conversation ChatConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId])
  @@index([conversationId, createdAt])
  @@index([deletedAt])
  @@map("chat_messages")
}

enum ChatMessageRole {
  USER
  ASSISTANT
  SYSTEM
  TOOL
}
```

### TypeScript Types (API)

```typescript
// apps/api/src/services/chat/types.ts

export type ChatMessageRole = 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';

export interface ChatConversation {
  id: string;
  userId: string;
  title: string | null;
  modelId: string | null;
  systemPrompt: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date | null;
  deletedAt: Date | null;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: ChatMessageRole;
  content: string;
  toolCalls: ToolCall[] | null;
  toolResults: ToolResult[] | null;
  inputTokens: number | null;
  outputTokens: number | null;
  modelId: string | null;
  modelVersion: string | null;
  durationMs: number | null;
  createdAt: Date;
  deletedAt: Date | null;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

// Input types for mutations
export interface CreateConversationInput {
  title?: string;
  modelId?: string;
}

export interface UpdateConversationInput {
  title?: string;
  modelId?: string;
}

export interface SendMessageInput {
  conversationId: string;
  content: string;
  modelId?: string; // Override conversation model for this message
}

// Streaming response types
export interface ChatStreamEvent {
  type: 'text' | 'tool_call' | 'tool_result' | 'done' | 'error';
  data: string | ToolCall | ToolResult | { messageId: string } | { error: string };
}
```

### TypeScript Types (Web)

```typescript
// apps/web/src/types/chat.ts

export type ChatMessageRole = 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';

export interface ChatConversation {
  id: string;
  title: string | null;
  modelId: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  messageCount?: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: ChatMessageRole;
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  modelId: string | null;
  createdAt: string;
  isStreaming?: boolean; // Client-side state for streaming indicator
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

// SSE event types
export type ChatStreamEventType = 'text' | 'tool_call' | 'tool_result' | 'done' | 'error';

export interface ChatStreamTextEvent {
  type: 'text';
  data: string;
}

export interface ChatStreamToolCallEvent {
  type: 'tool_call';
  data: ToolCall;
}

export interface ChatStreamToolResultEvent {
  type: 'tool_result';
  data: ToolResult;
}

export interface ChatStreamDoneEvent {
  type: 'done';
  data: { messageId: string };
}

export interface ChatStreamErrorEvent {
  type: 'error';
  data: { error: string; retryable?: boolean };
}

export type ChatStreamEvent =
  | ChatStreamTextEvent
  | ChatStreamToolCallEvent
  | ChatStreamToolResultEvent
  | ChatStreamDoneEvent
  | ChatStreamErrorEvent;
```

---

## Migrations

### Migration: add_chat_tables

```sql
-- CreateEnum
CREATE TYPE "ChatMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL');

-- CreateTable: chat_conversations
CREATE TABLE "chat_conversations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" VARCHAR(200),
    "model_id" TEXT,
    "system_prompt" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_message_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable: chat_messages
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" "ChatMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "tool_calls" JSONB,
    "tool_results" JSONB,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "model_id" TEXT,
    "model_version" TEXT,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: chat_conversations indexes
CREATE INDEX "chat_conversations_user_id_idx" ON "chat_conversations"("user_id");
CREATE INDEX "chat_conversations_user_last_message_idx" ON "chat_conversations"("user_id", "last_message_at" DESC);
CREATE INDEX "chat_conversations_deleted_at_idx" ON "chat_conversations"("deleted_at");

-- CreateIndex: chat_messages indexes
CREATE INDEX "chat_messages_conversation_id_idx" ON "chat_messages"("conversation_id");
CREATE INDEX "chat_messages_conversation_created_idx" ON "chat_messages"("conversation_id", "created_at");
CREATE INDEX "chat_messages_deleted_at_idx" ON "chat_messages"("deleted_at");

-- AddForeignKey: chat_conversations.user_id → users.id
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: chat_messages.conversation_id → chat_conversations.id
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

---

## Query Patterns

### List User's Conversations (sorted by recent activity)

```typescript
const conversations = await prisma.chatConversation.findMany({
  where: {
    userId,
    deletedAt: null,
  },
  orderBy: {
    lastMessageAt: 'desc',
  },
  take: limit,
  skip: offset,
});
```

### Get Conversation with Messages

```typescript
const conversation = await prisma.chatConversation.findUnique({
  where: { id: conversationId, deletedAt: null },
  include: {
    messages: {
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
    },
  },
});
```

### Add Message and Update lastMessageAt (Transaction)

```typescript
const [message] = await prisma.$transaction([
  prisma.chatMessage.create({
    data: {
      conversationId,
      role: 'USER',
      content,
    },
  }),
  prisma.chatConversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date() },
  }),
]);
```

### Soft Delete Conversation (Cascade to Messages)

```typescript
const now = new Date();
await prisma.$transaction([
  prisma.chatConversation.update({
    where: { id: conversationId },
    data: { deletedAt: now },
  }),
  prisma.chatMessage.updateMany({
    where: { conversationId },
    data: { deletedAt: now },
  }),
]);
```

---

## Data Retention

Following the soft delete pattern from the constitution:

- **Conversations**: Soft deleted via `deletedAt` timestamp
- **Messages**: Cascading soft delete when conversation is deleted
- **GraphQL**: `deletedAt` field NOT exposed; all queries filter `deletedAt: null`
- **Future**: Optional hard delete job for conversations deleted > 30 days
