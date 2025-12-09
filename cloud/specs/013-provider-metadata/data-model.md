# Data Model: LLM Provider Metadata

## Entities

### Entity 1: LlmProvider

**Purpose**: Represents an LLM API provider (OpenAI, Anthropic, etc.) with rate limiting and parallelism settings.

**Storage**: `llm_providers` table

**Fields**:
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String (cuid) | PRIMARY KEY | Unique identifier |
| name | String | UNIQUE, NOT NULL | Provider key (e.g., "openai") |
| displayName | String | NOT NULL | Human-readable name |
| maxParallelRequests | Int | DEFAULT 1 | Max concurrent API requests |
| requestsPerMinute | Int | DEFAULT 60 | Rate limit per minute |
| isEnabled | Boolean | DEFAULT true | Whether provider is available |
| createdAt | DateTime | DEFAULT now() | Record creation time |
| updatedAt | DateTime | @updatedAt | Last update time |

**Indexes**:
- Primary key on `id`
- Unique index on `name`

**Relationships**:
- One-to-many with `LlmModel`

---

### Entity 2: LlmModel

**Purpose**: Represents a specific LLM model with pricing and lifecycle status.

**Storage**: `llm_models` table

**Fields**:
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String (cuid) | PRIMARY KEY | Unique identifier |
| providerId | String | FK NOT NULL | Reference to provider |
| modelId | String | NOT NULL | API model identifier (e.g., "gpt-4o") |
| displayName | String | NOT NULL | Human-readable name |
| costInputPerMillion | Decimal(10,4) | NOT NULL | Cost per 1M input tokens |
| costOutputPerMillion | Decimal(10,4) | NOT NULL | Cost per 1M output tokens |
| status | LlmModelStatus | DEFAULT ACTIVE | Lifecycle status |
| isDefault | Boolean | DEFAULT false | Default model for provider |
| createdAt | DateTime | DEFAULT now() | Record creation time |
| updatedAt | DateTime | @updatedAt | Last update time |

**Indexes**:
- Primary key on `id`
- Unique index on `(providerId, modelId)`
- Index on `providerId`
- Index on `status`

**Relationships**:
- Many-to-one with `LlmProvider`

**Validation Rules**:
- Only one model per provider can have `isDefault = true`
- `modelId` cannot be changed after creation
- `costInputPerMillion` and `costOutputPerMillion` must be >= 0

---

### Entity 3: SystemSetting

**Purpose**: Key-value store for system-wide configuration including infrastructure model settings.

**Storage**: `system_settings` table

**Fields**:
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String (cuid) | PRIMARY KEY | Unique identifier |
| key | String | UNIQUE, NOT NULL | Setting key |
| value | Json | NOT NULL | Setting value (JSONB) |
| updatedAt | DateTime | @updatedAt | Last update time |

**Indexes**:
- Primary key on `id`
- Unique index on `key`

**Expected Keys**:
- `infra_model_scenario_expansion` - Model ID for scenario expansion
- `infra_model_summarization` - Model ID for summarization (future)

---

## Type Definitions

### Prisma Schema

```prisma
// ============================================================================
// LLM PROVIDERS & MODELS
// ============================================================================

model LlmProvider {
  id                  String   @id @default(cuid())
  name                String   @unique
  displayName         String   @map("display_name")
  maxParallelRequests Int      @default(1) @map("max_parallel_requests")
  requestsPerMinute   Int      @default(60) @map("requests_per_minute")
  isEnabled           Boolean  @default(true) @map("is_enabled")
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")

  models LlmModel[]

  @@map("llm_providers")
}

model LlmModel {
  id                   String         @id @default(cuid())
  providerId           String         @map("provider_id")
  modelId              String         @map("model_id")
  displayName          String         @map("display_name")
  costInputPerMillion  Decimal        @map("cost_input_per_million") @db.Decimal(10, 4)
  costOutputPerMillion Decimal        @map("cost_output_per_million") @db.Decimal(10, 4)
  status               LlmModelStatus @default(ACTIVE)
  isDefault            Boolean        @default(false) @map("is_default")
  createdAt            DateTime       @default(now()) @map("created_at")
  updatedAt            DateTime       @updatedAt @map("updated_at")

  provider LlmProvider @relation(fields: [providerId], references: [id], onDelete: Cascade)

  @@unique([providerId, modelId])
  @@index([providerId])
  @@index([status])
  @@map("llm_models")
}

enum LlmModelStatus {
  ACTIVE
  DEPRECATED
}

model SystemSetting {
  id        String   @id @default(cuid())
  key       String   @unique
  value     Json     @db.JsonB
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("system_settings")
}
```

### TypeScript Types (GraphQL/API)

```typescript
// types/llm.ts

export type LlmModelStatus = 'ACTIVE' | 'DEPRECATED';

export type LlmProvider = {
  id: string;
  name: string;
  displayName: string;
  maxParallelRequests: number;
  requestsPerMinute: number;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  models?: LlmModel[];
};

export type LlmModel = {
  id: string;
  providerId: string;
  modelId: string;
  displayName: string;
  costInputPerMillion: number;
  costOutputPerMillion: number;
  status: LlmModelStatus;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  provider?: LlmProvider;
};

export type SystemSetting = {
  id: string;
  key: string;
  value: unknown;
  updatedAt: Date;
};

// Input types for mutations
export type CreateLlmModelInput = {
  providerId: string;
  modelId: string;
  displayName: string;
  costInputPerMillion: number;
  costOutputPerMillion: number;
};

export type UpdateLlmModelInput = {
  displayName?: string;
  costInputPerMillion?: number;
  costOutputPerMillion?: number;
};
```

### Python Types (Workers)

```python
# common/models.py

from dataclasses import dataclass
from decimal import Decimal
from enum import Enum
from typing import Optional

class LlmModelStatus(Enum):
    ACTIVE = "ACTIVE"
    DEPRECATED = "DEPRECATED"

@dataclass
class LlmProvider:
    id: str
    name: str
    display_name: str
    max_parallel_requests: int
    requests_per_minute: int
    is_enabled: bool

@dataclass
class LlmModel:
    id: str
    provider_id: str
    model_id: str
    display_name: str
    cost_input_per_million: Decimal
    cost_output_per_million: Decimal
    status: LlmModelStatus
    is_default: bool
    provider: Optional[LlmProvider] = None

def calculate_cost(
    input_tokens: int,
    output_tokens: int,
    cost_input_per_million: Decimal,
    cost_output_per_million: Decimal,
) -> Decimal:
    """Calculate estimated cost for a completion."""
    input_cost = (Decimal(input_tokens) * cost_input_per_million) / Decimal(1_000_000)
    output_cost = (Decimal(output_tokens) * cost_output_per_million) / Decimal(1_000_000)
    return input_cost + output_cost
```

---

## Migrations

### Migration: Add LLM Provider Tables

```sql
-- CreateEnum
CREATE TYPE "LlmModelStatus" AS ENUM ('ACTIVE', 'DEPRECATED');

-- CreateTable
CREATE TABLE "llm_providers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "max_parallel_requests" INTEGER NOT NULL DEFAULT 1,
    "requests_per_minute" INTEGER NOT NULL DEFAULT 60,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "llm_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_models" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "cost_input_per_million" DECIMAL(10,4) NOT NULL,
    "cost_output_per_million" DECIMAL(10,4) NOT NULL,
    "status" "LlmModelStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "llm_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "llm_providers_name_key" ON "llm_providers"("name");

-- CreateIndex
CREATE INDEX "llm_models_provider_id_idx" ON "llm_models"("provider_id");

-- CreateIndex
CREATE INDEX "llm_models_status_idx" ON "llm_models"("status");

-- CreateIndex
CREATE UNIQUE INDEX "llm_models_provider_id_model_id_key" ON "llm_models"("provider_id", "model_id");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");

-- AddForeignKey
ALTER TABLE "llm_models" ADD CONSTRAINT "llm_models_provider_id_fkey"
  FOREIGN KEY ("provider_id") REFERENCES "llm_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

---

## Seed Data

```typescript
// packages/db/prisma/seed.ts (additions)

const providers = [
  {
    name: 'openai',
    displayName: 'OpenAI',
    maxParallelRequests: 5,
    requestsPerMinute: 60,
    models: [
      { modelId: 'gpt-4o-mini', displayName: 'GPT-4o Mini', costInput: 0.15, costOutput: 0.60, isDefault: true },
      { modelId: 'gpt-4o', displayName: 'GPT-4o', costInput: 2.50, costOutput: 10.00 },
      { modelId: 'gpt-4.1', displayName: 'GPT-4.1', costInput: 2.00, costOutput: 8.00 },
      { modelId: 'o1', displayName: 'o1', costInput: 15.00, costOutput: 60.00 },
      { modelId: 'o1-mini', displayName: 'o1 Mini', costInput: 1.10, costOutput: 4.40 },
      { modelId: 'o3-mini', displayName: 'o3 Mini', costInput: 1.10, costOutput: 4.40 },
    ],
  },
  {
    name: 'anthropic',
    displayName: 'Anthropic',
    maxParallelRequests: 3,
    requestsPerMinute: 40,
    models: [
      { modelId: 'claude-sonnet-4-20250514', displayName: 'Claude Sonnet 4', costInput: 3.00, costOutput: 15.00, isDefault: true },
      { modelId: 'claude-3-5-haiku-20241022', displayName: 'Claude 3.5 Haiku', costInput: 0.80, costOutput: 4.00 },
      { modelId: 'claude-opus-4-20250514', displayName: 'Claude Opus 4', costInput: 15.00, costOutput: 75.00 },
    ],
  },
  {
    name: 'google',
    displayName: 'Google',
    maxParallelRequests: 1,
    requestsPerMinute: 10,
    models: [
      { modelId: 'gemini-2.5-pro-preview-06-05', displayName: 'Gemini 2.5 Pro', costInput: 1.25, costOutput: 10.00, isDefault: true },
      { modelId: 'gemini-2.5-flash-preview-05-20', displayName: 'Gemini 2.5 Flash', costInput: 0.15, costOutput: 0.60 },
    ],
  },
  {
    name: 'xai',
    displayName: 'xAI',
    maxParallelRequests: 2,
    requestsPerMinute: 30,
    models: [
      { modelId: 'grok-3-mini-fast', displayName: 'Grok 3 Mini Fast', costInput: 0.30, costOutput: 0.50, isDefault: true },
      { modelId: 'grok-3', displayName: 'Grok 3', costInput: 3.00, costOutput: 15.00 },
    ],
  },
  {
    name: 'deepseek',
    displayName: 'DeepSeek',
    maxParallelRequests: 2,
    requestsPerMinute: 30,
    models: [
      { modelId: 'deepseek-chat', displayName: 'DeepSeek Chat', costInput: 0.14, costOutput: 0.28, isDefault: true },
      { modelId: 'deepseek-reasoner', displayName: 'DeepSeek Reasoner', costInput: 0.55, costOutput: 2.19 },
    ],
  },
  {
    name: 'mistral',
    displayName: 'Mistral',
    maxParallelRequests: 2,
    requestsPerMinute: 30,
    models: [
      { modelId: 'mistral-large-2411', displayName: 'Mistral Large', costInput: 2.00, costOutput: 6.00, isDefault: true },
      { modelId: 'mistral-small-2503', displayName: 'Mistral Small', costInput: 0.20, costOutput: 0.60 },
    ],
  },
];

// Seed system settings
const settings = [
  { key: 'infra_model_scenario_expansion', value: { modelId: 'gpt-4o-mini', providerId: 'openai' } },
];
```
