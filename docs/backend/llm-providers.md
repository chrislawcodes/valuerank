# LLM Providers

> Part of [Cloud ValueRank Backend](./queue-system.md)
>
> See also: [specs/013-provider-metadata/](../../specs/013-provider-metadata/) for implementation spec

## Overview

Cloud ValueRank supports **6 LLM providers** through a database-driven configuration system. Provider metadata (parallelism limits, rate limits, model costs) is stored in PostgreSQL, enabling runtime configuration without code changes.

### Supported Providers

| Provider | API Style | Environment Variable |
|----------|-----------|---------------------|
| OpenAI | OpenAI Chat Completions | `OPENAI_API_KEY` |
| Anthropic | Anthropic Messages | `ANTHROPIC_API_KEY` |
| Google | Gemini generateContent | `GOOGLE_API_KEY` |
| xAI | OpenAI-compatible | `XAI_API_KEY` |
| DeepSeek | OpenAI-compatible | `DEEPSEEK_API_KEY` |
| Mistral | OpenAI-compatible | `MISTRAL_API_KEY` |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Database                                     │
├─────────────────────────────────────────────────────────────────────┤
│  llm_providers                    llm_models                         │
│  ├── id                           ├── id                             │
│  ├── name (unique)                ├── provider_id (FK)               │
│  ├── display_name                 ├── model_id                       │
│  ├── max_parallel_requests        ├── display_name                   │
│  ├── requests_per_minute          ├── cost_input_per_million         │
│  └── is_enabled                   ├── cost_output_per_million        │
│                                   ├── status (ACTIVE/DEPRECATED)     │
│                                   └── is_default                     │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
            ┌───────────┐   ┌─────────────┐   ┌──────────────┐
            │ GraphQL   │   │ Parallelism │   │ Python       │
            │ API       │   │ Service     │   │ Workers      │
            └───────────┘   └─────────────┘   └──────────────┘
```

## Database Schema

### LlmProvider

```prisma
model LlmProvider {
  id                  String   @id @default(cuid())
  name                String   @unique          // "openai", "anthropic"
  displayName         String                    // "OpenAI", "Anthropic"
  maxParallelRequests Int      @default(1)      // Concurrent request limit
  requestsPerMinute   Int      @default(60)     // Rate limit
  isEnabled           Boolean  @default(true)   // Enable/disable provider
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  models LlmModel[]
}
```

### LlmModel

```prisma
model LlmModel {
  id                   String         @id @default(cuid())
  providerId           String                    // FK to LlmProvider
  modelId              String                    // "gpt-4o", "claude-sonnet-4"
  displayName          String                    // "GPT-4o", "Claude Sonnet 4"
  costInputPerMillion  Decimal                   // $2.50 per 1M input tokens
  costOutputPerMillion Decimal                   // $10.00 per 1M output tokens
  status               LlmModelStatus @default(ACTIVE)
  isDefault            Boolean        @default(false)
  createdAt            DateTime       @default(now())
  updatedAt            DateTime       @updatedAt

  provider LlmProvider @relation(...)

  @@unique([providerId, modelId])
}

enum LlmModelStatus {
  ACTIVE
  DEPRECATED
}
```

## Seeded Data

The database seed script populates providers and models:

### Provider Settings

| Provider | Max Parallel | RPM | Default Model |
|----------|-------------|-----|---------------|
| OpenAI | 5 | 60 | gpt-4o-mini |
| Anthropic | 3 | 40 | claude-sonnet-4 |
| Google | 1 | 10 | gemini-2.5-pro |
| xAI | 2 | 30 | grok-3-mini-fast |
| DeepSeek | 2 | 30 | deepseek-chat |
| Mistral | 2 | 30 | mistral-large |

### Model Pricing (per 1M tokens)

| Model | Input | Output |
|-------|-------|--------|
| **OpenAI** | | |
| gpt-4o-mini | $0.15 | $0.60 |
| gpt-4o | $2.50 | $10.00 |
| o1 | $15.00 | $60.00 |
| o1-mini | $1.10 | $4.40 |
| **Anthropic** | | |
| claude-sonnet-4 | $3.00 | $15.00 |
| claude-3-5-haiku | $0.80 | $4.00 |
| claude-opus-4 | $15.00 | $75.00 |
| **Google** | | |
| gemini-2.5-pro | $1.25 | $10.00 |
| gemini-2.5-flash | $0.15 | $0.60 |
| **xAI** | | |
| grok-3-mini-fast | $0.30 | $0.50 |
| grok-3 | $3.00 | $15.00 |
| **DeepSeek** | | |
| deepseek-chat | $0.14 | $0.28 |
| deepseek-reasoner | $0.55 | $2.19 |
| **Mistral** | | |
| mistral-large | $2.00 | $6.00 |
| mistral-small | $0.20 | $0.60 |

## Provider Availability

A provider is "available" if its API key environment variable is set:

```typescript
// apps/api/src/config/models.ts

export const PROVIDER_ENV_KEYS: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_API_KEY',
  xai: 'XAI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  mistral: 'MISTRAL_API_KEY',
};

export function isProviderAvailable(providerName: string): boolean {
  const envKey = PROVIDER_ENV_KEYS[providerName];
  if (!envKey) return false;
  const key = process.env[envKey];
  return key !== undefined && key.length > 0;
}
```

The `isAvailable` field on models in GraphQL reflects this runtime check.

## GraphQL API

### Types

```graphql
type LlmProvider {
  id: ID!
  name: String!                    # "openai"
  displayName: String!             # "OpenAI"
  maxParallelRequests: Int!        # 5
  requestsPerMinute: Int!          # 60
  isEnabled: Boolean!              # true
  models: [LlmModel!]!             # All models
  activeModels: [LlmModel!]!       # Only ACTIVE status
  defaultModel: LlmModel           # isDefault=true model
}

type LlmModel {
  id: ID!
  providerId: ID!
  modelId: String!                 # "gpt-4o"
  displayName: String!             # "GPT-4o"
  costInputPerMillion: Float!      # 2.50
  costOutputPerMillion: Float!     # 10.00
  status: String!                  # "ACTIVE" or "DEPRECATED"
  isDefault: Boolean!              # true if provider default
  isAvailable: Boolean!            # true if API key configured
  provider: LlmProvider!
}
```

### Queries

```graphql
type Query {
  # Get all providers
  llmProviders: [LlmProvider!]!

  # Get provider by ID
  llmProvider(id: ID!): LlmProvider

  # Get all models (with optional filters)
  llmModels(
    providerId: ID
    status: LlmModelStatus
    availableOnly: Boolean
  ): [LlmModel!]!

  # Get model by ID
  llmModel(id: ID!): LlmModel

  # Get default models (one per provider)
  defaultLlmModels: [LlmModel!]!
}
```

### Mutations

```graphql
type Mutation {
  # Update provider settings
  updateLlmProvider(
    id: ID!
    input: UpdateLlmProviderInput!
  ): LlmProvider!

  # Create a new model
  createLlmModel(input: CreateLlmModelInput!): LlmModel!

  # Update model pricing/name
  updateLlmModel(id: ID!, input: UpdateLlmModelInput!): LlmModel!

  # Deprecate a model (sets status=DEPRECATED)
  deprecateLlmModel(id: ID!): DeprecateModelResult!

  # Reactivate a deprecated model
  reactivateLlmModel(id: ID!): LlmModel!

  # Set model as default for its provider
  setDefaultLlmModel(id: ID!): SetDefaultModelResult!
}
```

### Example Queries

**Get all available models:**
```graphql
query {
  llmModels(availableOnly: true) {
    modelId
    displayName
    provider {
      displayName
    }
    costInputPerMillion
    costOutputPerMillion
  }
}
```

**Get provider with default model:**
```graphql
query {
  llmProvider(id: "...") {
    displayName
    maxParallelRequests
    requestsPerMinute
    defaultModel {
      modelId
      displayName
    }
  }
}
```

## Integration with Queue System

Provider metadata drives the [parallelism service](./queue-system.md#provider-specific-queues):

```typescript
// services/parallelism/index.ts

export async function loadProviderLimits(): Promise<Map<string, ProviderLimits>> {
  const providers = await getAllProvidersWithModels();

  for (const provider of providers) {
    if (!provider.isEnabled) continue;

    providerLimitsCache.set(provider.name, {
      maxParallelRequests: provider.maxParallelRequests,
      requestsPerMinute: provider.requestsPerMinute,
      queueName: `probe_${provider.name}`,
    });
  }
}
```

Each provider gets its own PgBoss queue with `batchSize` matching `maxParallelRequests`.

## Integration with Python Workers

The Python `llm_adapters` module provides provider-specific implementations:

```python
# workers/common/llm_adapters.py

# Provider detection from model ID
PROVIDER_PATTERNS = {
    "openai": ["gpt", "text-", "o1", "davinci"],
    "anthropic": ["claude"],
    "google": ["gemini"],
    "xai": ["grok"],
    "deepseek": ["deepseek"],
    "mistral": ["mistral"],
}

def infer_provider(model: str) -> str:
    # Check explicit prefix: "anthropic:claude-sonnet-4"
    if ":" in model:
        prefix, _ = model.split(":", 1)
        if prefix in PROVIDER_PATTERNS:
            return prefix

    # Pattern matching
    for provider, patterns in PROVIDER_PATTERNS.items():
        if any(p in model.lower() for p in patterns):
            return provider

    return "unknown"
```

Cost tracking uses database model pricing:

```typescript
// queue/handlers/probe-scenario.ts

async function fetchModelCost(modelId: string) {
  const model = await db.llmModel.findFirst({
    where: { modelId },
    select: { costInputPerMillion: true, costOutputPerMillion: true },
  });
  return model ? {
    costInputPerMillion: Number(model.costInputPerMillion),
    costOutputPerMillion: Number(model.costOutputPerMillion),
  } : null;
}
```

## Model Lifecycle

### Adding a New Model

1. **Database**: Add via seed script or GraphQL mutation
2. **Python adapter**: Usually no changes (OpenAI-compatible providers work automatically)
3. **Frontend**: Model appears in dropdown if provider is available

```graphql
mutation {
  createLlmModel(input: {
    providerId: "clx..."        # OpenAI provider ID
    modelId: "gpt-4.1"
    displayName: "GPT-4.1"
    costInputPerMillion: 2.00
    costOutputPerMillion: 8.00
    setAsDefault: false
  }) {
    id
    modelId
  }
}
```

### Deprecating a Model

When deprecating a model that's the default, the system automatically promotes another:

```graphql
mutation {
  deprecateLlmModel(id: "clx...") {
    model { modelId status }
    newDefault { modelId }    # Another model promoted if this was default
  }
}
```

### Updating Pricing

```graphql
mutation {
  updateLlmModel(id: "clx...", input: {
    costInputPerMillion: 2.50
    costOutputPerMillion: 10.00
  }) {
    modelId
    costInputPerMillion
    costOutputPerMillion
  }
}
```

## Model Version Resolution

The system handles both friendly model IDs and API version IDs:

```typescript
// config/models.ts

export const LLM_PROVIDERS = [
  {
    id: 'anthropic',
    models: [
      {
        id: 'claude-sonnet-4',                        // Friendly ID
        versions: ['claude-sonnet-4-20250514'],       // API versions
        defaultVersion: 'claude-sonnet-4-20250514',   // Default for API calls
      },
    ],
  },
];
```

When starting a run:
1. User selects `claude-sonnet-4` (friendly ID)
2. System resolves to `claude-sonnet-4-20250514` (API version)
3. Python worker calls Anthropic with resolved version
4. Transcript records actual `modelVersion` returned by API

## System Settings

Infrastructure models (for internal tasks like scenario expansion) are configured via `SystemSetting`:

```typescript
// packages/db/src/queries/llm.ts

export async function getInfraModel(purpose: string): Promise<LlmModelWithProvider | null> {
  const key = `infra_model_${purpose}`;
  const setting = await getSettingByKey(key);
  // ...
}
```

Seeded settings:
- `infra_model_scenario_expansion` → gpt-4o-mini (cheap, fast for generation)

## Source Files

| File | Purpose |
|------|---------|
| `packages/db/prisma/schema.prisma` | LlmProvider, LlmModel schema |
| `packages/db/prisma/seed.ts` | Provider/model seed data |
| `packages/db/src/queries/llm.ts` | Database query helpers |
| `apps/api/src/config/models.ts` | Availability checking, version resolution |
| `apps/api/src/graphql/types/llm-provider.ts` | Provider GraphQL type |
| `apps/api/src/graphql/types/llm-model.ts` | Model GraphQL type |
| `apps/api/src/graphql/queries/llm.ts` | GraphQL queries |
| `apps/api/src/graphql/mutations/llm.ts` | GraphQL mutations |
| `apps/api/src/services/parallelism/index.ts` | Provider queue limits |
| `workers/common/llm_adapters.py` | Python provider adapters |
| `workers/common/config.py` | Python API key configuration |

## Comparison to Original Design

| Aspect | Original CLI | Cloud Implementation |
|--------|--------------|---------------------|
| Provider config | `config/runtime.yaml` | Database tables |
| Model costs | `config/model_costs.yaml` | LlmModel.costInputPerMillion |
| Parallelism | Not configurable | LlmProvider.maxParallelRequests |
| Rate limits | Hardcoded in adapters | LlmProvider.requestsPerMinute |
| Model deprecation | Not supported | LlmModelStatus enum |
| Runtime updates | Requires restart | GraphQL mutations |
