# Feature 013: LLM Provider Metadata

**Feature Branch**: `feat/013-provider-metadata`
**Created**: 2024-12-08
**Status**: Draft
**Input**: Add database-driven LLM model metadata with admin UI for managing costs, rate limits, parallelism, and model lifecycle (active/deprecated). Support default models per provider and infrastructure model selection.

---

## Scope

**In Scope**: Cloud ValueRank (`cloud/` directory only)
- Database schema for providers and models
- `cloud/workers/` Python workers (read model metadata)
- `cloud/apps/api/` job scheduling and GraphQL API
- `cloud/apps/web/` Settings UI for model management

**Out of Scope**: Legacy Python pipeline (`src/`, `config/`) - will be deprecated separately.

---

## User Scenarios & Testing

### User Story 1 - Database-Driven Model Configuration (Priority: P1)

As a cloud platform operator, I need LLM model metadata stored in the database so that I can manage models without redeploying and maintain history for old runs.

**Why this priority**: Core functionality - enables dynamic model management and preserves historical run context.

**Independent Test**: Insert a model record via SQL, run a probe, verify the worker reads costs from database.

**Acceptance Scenarios**:

1. **Given** a fresh deployment, **When** database is seeded, **Then** all 6 providers exist with their default models and current pricing.

2. **Given** a model record in database, **When** a probe job runs, **Then** cost/rate limit metadata is read from database (not config file).

3. **Given** a model name like `gpt-5-mini`, **When** the system resolves its metadata, **Then** it returns the correct cost, rate limit, and status from the `llm_models` table.

---

### User Story 2 - Model Management Admin UI (Priority: P1)

As an admin, I need a Settings panel to add new models, edit costs/limits, and deprecate old models without touching code or database directly.

**Why this priority**: Critical for operational agility - model pricing changes frequently and new versions release often.

**Independent Test**: Open Settings > Models, add a new model, verify it appears in model selection dropdowns.

**Acceptance Scenarios**:

1. **Given** the Settings page, **When** I navigate to "Models" tab, **Then** I see a table of all models grouped by provider with their costs, limits, and status.

2. **Given** the Models panel, **When** I click "Add Model", **Then** I can enter model ID, display name, provider, costs, and rate limits.

3. **Given** an existing model, **When** I click "Edit", **Then** I can update costs and rate limits (model ID is immutable).

4. **Given** an active model, **When** I click "Deprecate", **Then** the model is marked deprecated, hidden from new run model selection, but historical runs still show correct metadata.

---

### User Story 3 - Default Model Per Provider (Priority: P1)

As a user creating a run, I need sensible default models pre-selected so that I don't have to manually choose every model for each provider.

**Why this priority**: UX improvement - reduces friction when creating runs.

**Independent Test**: Create a new run without specifying models, verify default models are auto-selected for each enabled provider.

**Acceptance Scenarios**:

1. **Given** provider OpenAI has `gpt-5-mini` marked as default, **When** I create a run and enable OpenAI, **Then** `gpt-5-mini` is pre-selected.

2. **Given** the Models admin panel, **When** I click "Set as Default" on a model, **Then** it becomes the default for that provider (only one default per provider).

3. **Given** the default model is deprecated, **When** I try to create a run, **Then** I'm warned to select a different model or the next active model becomes default.

---

### User Story 4 - Infrastructure Model Selection (Priority: P1)

As a platform operator, I need to designate specific models for "infrastructure" tasks (scenario expansion, summarization) separate from user-facing probe models.

**Why this priority**: Allows using cheaper/faster models for internal tasks while users evaluate expensive frontier models.

**Independent Test**: Set infra model to `gpt-5-mini`, run scenario expansion, verify it uses that model (not user-selected models).

**Acceptance Scenarios**:

1. **Given** the Settings panel, **When** I open "Infrastructure" section, **Then** I can select which model to use for scenario expansion.

2. **Given** an infra model is configured, **When** scenario expansion runs, **Then** it uses the configured infra model regardless of run's target models.

3. **Given** infra model settings, **When** I can configure separate models for: scenario expansion, summarization (future), and analysis (future).

---

### User Story 5 - Safe Parallelism Defaults (Priority: P2)

As a platform operator, I need conservative default parallelism (1 concurrent request per provider) with the ability to increase for providers that support higher throughput.

**Why this priority**: Important for reliability - prevents rate limit cascades.

**Independent Test**: Schedule 10 probe jobs for a single provider, verify only 1 runs at a time by default.

**Acceptance Scenarios**:

1. **Given** no parallelism override, **When** probe jobs are scheduled, **Then** each provider processes at most 1 request concurrently by default.

2. **Given** OpenAI configured with `max_parallel: 5` in database, **When** 10 jobs are scheduled, **Then** up to 5 run concurrently.

3. **Given** the Models admin panel, **When** I edit a provider's settings, **Then** I can set `max_parallel_requests` and `requests_per_minute`.

---

### User Story 6 - Intelligent Rate Limit Retry (Priority: P2)

As a platform operator, I need probe workers to handle rate limit errors gracefully with exponential backoff.

**Why this priority**: Important for reliability but system functions without it (jobs fail and retry via PgBoss).

**Independent Test**: Mock a 429 response, verify the worker retries with backoff before failing.

**Acceptance Scenarios**:

1. **Given** a rate limit error (HTTP 429), **When** the worker retries, **Then** it uses exponential backoff (30s, 60s, 90s, 120s).

2. **Given** rate limits persist after max retries, **When** the final retry fails, **Then** job returns `retryable: true` with error code `RATE_LIMITED`.

3. **Given** rate limit detection, **When** error contains "429", "rate limit", "too many requests", or "quota exceeded", **Then** it is classified as rate limit (not generic failure).

---

### User Story 7 - Cost Tracking (Priority: P2)

As a platform operator, I need cost estimates calculated from model metadata so that analysis results include accurate cost data.

**Why this priority**: Important for cost visibility - helps users understand spend.

**Independent Test**: Run a probe, verify response includes `estimatedCost` based on database costs.

**Acceptance Scenarios**:

1. **Given** model costs in database, **When** a probe completes, **Then** `estimatedCost` is calculated and stored.

2. **Given** a run with multiple models, **When** viewing run details, **Then** I see cost breakdown per model.

3. **Given** historical runs, **When** model costs are updated, **Then** historical run costs use the costs at time of run (not current costs).

---

## Edge Cases

- **Unknown model**: Model ID not in database → Return error with code `MODEL_NOT_FOUND`, suggest checking model configuration.
- **Unknown provider**: Model references unknown provider → Return error with code `UNSUPPORTED_PROVIDER`.
- **Deprecated model in run**: User tries to start run with deprecated model → Block with validation error, show which models are deprecated.
- **All models deprecated for provider**: No active models for a provider → Hide provider from model selection UI.
- **Missing cost data**: Model exists but costs are null → Use provider defaults with log warning.
- **Zero parallelism**: `max_parallel_requests: 0` in database → Treat as 1 (minimum), log warning.
- **Rate limit during backoff**: Worker receives rate limit while backing off → Continue backoff, don't reset timer.
- **Historical cost lookup**: Run references model with updated costs → Store `cost_at_run` snapshot in transcript or use model's costs at run creation time.
- **Default model deleted**: Provider's default model is deprecated → Auto-promote next active model to default, or warn admin.
- **Infra model unavailable**: Configured infra model API key missing → Fall back to any available provider's cheap model, log error.
- **Database unavailable**: Can't read model metadata → Fail job with `retryable: true`, don't use hardcoded fallbacks.

---

## Requirements

### Functional Requirements

**Database Schema**
- **FR-001**: System MUST store provider metadata in `llm_providers` table with fields: `id`, `name`, `display_name`, `max_parallel_requests`, `requests_per_minute`, `is_enabled`, `created_at`, `updated_at`.
- **FR-002**: System MUST store model metadata in `llm_models` table with fields: `id`, `provider_id`, `model_id`, `display_name`, `cost_input_per_million`, `cost_output_per_million`, `status` (active/deprecated), `is_default`, `created_at`, `updated_at`.
- **FR-003**: System MUST store infrastructure settings in `system_settings` table with keys: `infra_model_scenario_expansion`, `infra_model_summarization`, etc.
- **FR-004**: Database seed script MUST populate all 6 providers and their current models with accurate pricing.

**Model Management**
- **FR-005**: Admin UI MUST allow adding new models with: model_id, display_name, provider, costs, status.
- **FR-006**: Admin UI MUST allow editing model costs and rate limits (model_id is immutable).
- **FR-007**: Admin UI MUST allow deprecating models (sets status to 'deprecated', hides from new run selection).
- **FR-008**: Admin UI MUST allow setting one model as default per provider.
- **FR-009**: Deprecated models MUST remain in database for historical run reference.
- **FR-010**: Run creation MUST validate that all selected models are active (not deprecated).

**Infrastructure Models**
- **FR-011**: Admin UI MUST allow selecting infrastructure model for scenario expansion.
- **FR-012**: Scenario expansion worker MUST use configured infra model, not run's target models.

**Parallelism & Rate Limiting**
- **FR-013**: Default `max_parallel_requests` MUST be 1 for all providers unless explicitly configured higher.
- **FR-014**: API job scheduler MUST enforce per-provider parallelism limits from database.
- **FR-015**: Rate limit errors MUST trigger exponential backoff retry (30s, 60s, 90s, 120s).
- **FR-016**: System MUST detect rate limits via HTTP 429 OR body containing "rate limit", "too many requests", "quota exceeded".
- **FR-017**: Rate limit failures MUST return `retryable: true` with error code `RATE_LIMITED`.

**Cost Tracking**
- **FR-018**: Probe worker output MUST include `estimatedCost` calculated from model's database costs.
- **FR-019**: Historical runs MUST preserve cost calculation (snapshot costs at run time, or store calculated cost).

**API**
- **FR-020**: GraphQL API MUST expose queries: `llmProviders`, `llmModels`, `systemSettings`.
- **FR-021**: GraphQL API MUST expose mutations: `createLlmModel`, `updateLlmModel`, `deprecateLlmModel`, `setDefaultModel`, `updateSystemSettings`.

### Non-Functional Requirements

- **NFR-001**: Model metadata queries MUST complete in <50ms (use caching if needed).
- **NFR-002**: Admin UI model table MUST load in <1 second for 50 models.
- **NFR-003**: Rate limit detection MUST not add measurable latency to successful requests.
- **NFR-004**: Database schema changes MUST include Prisma migration files.

---

## Success Criteria

- **SC-001**: All 6 providers and their models seeded in database with accurate pricing.
- **SC-002**: Admin can add/edit/deprecate models via Settings UI without code changes.
- **SC-003**: Default model per provider auto-selected when creating runs.
- **SC-004**: Infrastructure tasks use configured infra model, not user-selected models.
- **SC-005**: Default parallelism of 1 prevents rate limit errors on fresh deployments.
- **SC-006**: Rate limit errors are retried with backoff before failing to PgBoss.
- **SC-007**: Cost estimates appear in probe results and run summaries.
- **SC-008**: Historical runs display correct costs even after model pricing updates.

---

## Key Entities

### Database Schema

#### llm_providers

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| name | VARCHAR(50) | Unique identifier (e.g., "openai", "anthropic") |
| display_name | VARCHAR(100) | Human-readable name (e.g., "OpenAI") |
| max_parallel_requests | INT | Max concurrent requests (default: 1) |
| requests_per_minute | INT | Rate limit (default: 60) |
| is_enabled | BOOLEAN | Whether provider is active (default: true) |
| created_at | TIMESTAMP | Record creation time |
| updated_at | TIMESTAMP | Last update time |

#### llm_models

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| provider_id | UUID | FK to llm_providers |
| model_id | VARCHAR(100) | API model identifier (e.g., "gpt-5-mini") |
| display_name | VARCHAR(100) | Human-readable name |
| cost_input_per_million | DECIMAL(10,4) | Cost per 1M input tokens |
| cost_output_per_million | DECIMAL(10,4) | Cost per 1M output tokens |
| status | ENUM | 'active' or 'deprecated' |
| is_default | BOOLEAN | Default model for this provider |
| created_at | TIMESTAMP | Record creation time |
| updated_at | TIMESTAMP | Last update time |

**Constraints:**
- Unique constraint on (provider_id, model_id)
- Only one model per provider can have is_default = true

#### system_settings

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| key | VARCHAR(100) | Setting key (unique) |
| value | JSONB | Setting value |
| updated_at | TIMESTAMP | Last update time |

**Settings keys:**
- `infra_model_scenario_expansion` - Model ID for scenario expansion
- `infra_model_summarization` - Model ID for summarization (future)

### Seed Data (Initial Models)

```
openai:
  - gpt-5-mini (default): $0.25/$2.00 per 1M tokens
  - gpt-5.1: $1.25/$10.00 per 1M tokens
  max_parallel: 5, rate_limit: 60/min

anthropic:
  - claude-haiku-4-5 (default): $1.00/$5.00 per 1M tokens
  - claude-sonnet-4-5: $3.00/$15.00 per 1M tokens
  max_parallel: 3, rate_limit: 40/min

xai:
  - grok-4-1-fast-reasoning (default): $0.20/$0.50 per 1M tokens
  - grok-4-0709: $3.00/$15.00 per 1M tokens
  max_parallel: 2, rate_limit: 30/min

google:
  - gemini-2.5-pro (default): $1.25/$10.00 per 1M tokens
  max_parallel: 1, rate_limit: 10/min

deepseek:
  - deepseek-chat (default): $0.28/$0.42 per 1M tokens
  - deepseek-reasoner: $0.28/$0.42 per 1M tokens
  max_parallel: 2, rate_limit: 30/min

mistral:
  - mistral-large-2512 (default): $0.50/$1.50 per 1M tokens
  max_parallel: 2, rate_limit: 30/min
```

---

## Implementation Notes

### Database Changes

`cloud/packages/db/prisma/schema.prisma`:
- Add `LlmProvider` model
- Add `LlmModel` model with FK to provider
- Add `SystemSetting` model for infra config
- Create migration file

`cloud/packages/db/prisma/seed.ts`:
- Seed all 6 providers with rate limits
- Seed all current models with pricing
- Set default models per provider
- Set default infra model (suggest: `gpt-5-mini` for cost efficiency)

### API Changes

`cloud/apps/api/src/graphql/`:
- Add `LlmProvider` and `LlmModel` types to schema
- Add queries: `llmProviders`, `llmModels(providerId?)`, `systemSettings`
- Add mutations: `createLlmModel`, `updateLlmModel`, `deprecateLlmModel`, `setDefaultModel`, `updateSystemSetting`

`cloud/apps/api/src/jobs/`:
- Load provider parallelism limits from database (cache with TTL)
- Enforce per-provider limits when scheduling probe jobs
- Track active jobs per provider in memory or Redis

### Python Worker Changes

`cloud/workers/common/llm_adapters.py`:
- Add rate limit detection in `_post_json()`
- Add exponential backoff retry for rate limits (30s, 60s, 90s, 120s)
- Return `RATE_LIMITED` error code for persistent rate limit failures

`cloud/workers/common/models.py` (new file):
- Add function to fetch model metadata from database via API or direct DB query
- Add cost calculation helper: `calculate_cost(input_tokens, output_tokens, model_id)`
- Cache model metadata in memory (refresh on worker start)

`cloud/workers/probe.py`:
- Fetch model costs at job start
- Add `estimatedCost` to output
- Store `costInputPerMillion` and `costOutputPerMillion` used (for historical accuracy)

### Frontend Changes

`cloud/apps/web/src/pages/Settings/`:
- Add "Models" tab to Settings page
- Create `ModelsPanel.tsx` component with:
  - Table of models grouped by provider
  - Add Model dialog
  - Edit Model dialog (costs, rate limits)
  - Deprecate Model confirmation
  - Set Default Model action
- Create `InfrastructurePanel.tsx` component with:
  - Dropdown to select scenario expansion model
  - (Future) Dropdowns for other infra tasks

### Where Parallelism is Enforced

Parallelism enforced at **API job scheduler level** (Node.js), not Python workers:
- API queries `llm_providers.max_parallel_requests` from database
- Before scheduling probe job, check active job count for provider
- If at capacity, job stays in PgBoss queue until slot opens
- Use in-memory counter or Redis for active job tracking

### Historical Cost Accuracy

Two options for preserving historical costs:
1. **Snapshot at run time**: Store `cost_input_per_million` and `cost_output_per_million` in transcript record
2. **Calculate on read**: Store model_id in transcript, look up model's cost at run's `created_at` timestamp

Recommend option 1 (snapshot) for simplicity - store costs in transcript metadata.

---

## Assumptions

1. Current 6 providers (OpenAI, Anthropic, XAI, Google, DeepSeek, Mistral) are the complete set for initial implementation.
2. Rate limit detection via string matching is sufficient (no need for provider-specific parsers).
3. Parallelism is enforced at job scheduling level, not within workers.
4. Model metadata is cached in workers (refreshed on startup, not hot-reloaded).
5. Legacy `config/model_costs.yaml` and `src/probe.py` are not modified (deprecated separately).
6. Only admins can manage models (no per-user model restrictions for v1).
7. Provider API keys remain in environment variables (not database) for security.
