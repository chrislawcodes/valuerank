# GraphQL Schema Reference

> Part of [Cloud ValueRank Documentation](../README.md)
>
> See also: [REST Endpoints](./rest-endpoints.md) | [MCP Tools](./mcp-tools.md)

The Cloud ValueRank API is built using **Pothos** (GraphQL schema builder) with Express and GraphQL Yoga. This document provides a complete reference for all GraphQL types, queries, and mutations.

---

## Endpoint

```
POST /graphql
Content-Type: application/json
Authorization: Bearer <jwt_token>
```

Or with API key:
```
POST /graphql
Content-Type: application/json
X-API-Key: <api_key>
```

**Authentication**: Required for all operations except schema introspection.

---

## Custom Scalars

| Scalar | Description | Example |
|--------|-------------|---------|
| `DateTime` | ISO 8601 timestamp | `"2025-01-15T10:30:00.000Z"` |
| `JSON` | Arbitrary JSON object | `{"preamble": "...", "template": "..."}` |

---

## Enums

### RunStatus
```graphql
enum RunStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
  CANCELLED
}
```

### LlmModelStatus
```graphql
enum LlmModelStatus {
  ACTIVE
  DEPRECATED
}
```

### AnalysisStatus
```graphql
enum AnalysisStatus {
  CURRENT
  SUPERSEDED
}
```

### RunPriority
```graphql
enum RunPriority {
  LOW
  NORMAL
  HIGH
}
```

### TaskStatus
```graphql
enum TaskStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
}
```

### ExpansionJobStatus
```graphql
enum ExpansionJobStatus {
  PENDING
  ACTIVE
  COMPLETED
  FAILED
  NONE
}
```

---

## Types

### Definition

A scenario definition with inheritance support for versioning.

```graphql
type Definition {
  # Core Fields
  id: ID!
  name: String!
  parentId: ID
  content: JSON!                    # Raw stored content
  createdAt: DateTime!
  updatedAt: DateTime!
  lastAccessedAt: DateTime

  # Relations
  parent: Definition
  children: [Definition!]!
  runs: [Run!]!
  scenarios: [Scenario!]!
  tags: [Tag!]!

  # Inheritance-Computed Fields
  isForked: Boolean!                # True if has parent
  resolvedContent: JSON!            # Merged content (local + inherited)
  localContent: JSON!               # Only locally-defined fields
  overrides: DefinitionOverrides!   # Which fields are overridden
  inheritedTags: [Tag!]!            # Tags from ancestors
  allTags: [Tag!]!                  # Direct + inherited tags
  ancestors: [Definition!]!         # Full ancestry chain
  descendants: [Definition!]!       # Full descendant tree

  # Counts
  runCount: Int!
  scenarioCount: Int!

  # Async Job Status
  expansionStatus: ExpansionStatus  # Scenario generation job status
}
```

**Content Structure** (JSON):
```json
{
  "schema_version": 2,
  "preamble": "You are an ethics advisor...",
  "template": "A hospital must decide [scenario details]...",
  "dimensions": [
    {
      "name": "Physical_Safety",
      "levels": [
        {"score": 1, "label": "Minor risk"},
        {"score": 3, "label": "Moderate risk"},
        {"score": 5, "label": "Life-threatening"}
      ]
    }
  ],
  "matching_rules": "optional rules for scenario generation"
}
```

### DefinitionOverrides

Indicates which fields are locally overridden vs inherited.

```graphql
type DefinitionOverrides {
  preamble: Boolean!
  template: Boolean!
  dimensions: Boolean!
  matchingRules: Boolean!
}
```

### ExpansionStatus

Status of async scenario generation job.

```graphql
type ExpansionStatus {
  status: ExpansionJobStatus!
  jobId: ID
  triggeredBy: String
  createdAt: DateTime
  completedAt: DateTime
  error: String
  scenarioCount: Int
}
```

### Run

An evaluation run executing scenarios against AI models.

```graphql
type Run {
  # Core Fields
  id: ID!
  definitionId: ID!
  experimentId: ID
  status: RunStatus!
  config: JSON!                     # Run configuration
  progress: JSON!                   # Raw progress data
  createdAt: DateTime!
  updatedAt: DateTime!
  completedAt: DateTime

  # Relations
  definition: Definition!
  experiment: Experiment
  transcripts(modelId: String): [Transcript!]!  # Optional filter by model
  selectedScenarios: [Scenario!]!
  analysis: AnalysisResult

  # Computed Fields
  runProgress: RunProgress!         # Structured progress
  recentTasks(limit: Int): [TaskResult!]!
  analysisStatus: String!           # pending/computing/completed/failed
}
```

**Config Structure** (JSON):
```json
{
  "models": ["gpt-4", "claude-3-sonnet"],
  "samplePercentage": 100,
  "sampleSeed": 12345,
  "priority": "NORMAL"
}
```

### RunProgress

Structured progress tracking for a run.

```graphql
type RunProgress {
  total: Int!
  completed: Int!
  failed: Int!
  percentComplete: Float!
  byModel: [ModelProgress!]!
}

type ModelProgress {
  modelId: String!
  total: Int!
  completed: Int!
  failed: Int!
}
```

### TaskResult

Individual job result from the queue.

```graphql
type TaskResult {
  scenarioId: String!
  modelId: String!
  status: TaskStatus!
  error: String
  completedAt: DateTime
}
```

### Transcript

A recorded conversation between an AI model and a scenario.

```graphql
type Transcript {
  id: ID!
  runId: ID!
  scenarioId: ID!
  modelId: String!
  modelVersion: String
  definitionSnapshot: JSON!         # Definition state at run time
  content: JSON!                    # Full conversation
  turnCount: Int!
  tokenCount: Int
  durationMs: Int
  createdAt: DateTime!

  # Relations
  run: Run!
  scenario: Scenario

  # Computed
  estimatedCost: Float              # Extracted from costSnapshot
}
```

**Content Structure** (JSON):
```json
{
  "turns": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ],
  "decision": {"code": 3, "text": "Balanced approach"},
  "costSnapshot": {
    "inputTokens": 500,
    "outputTokens": 200,
    "estimatedCost": 0.0035
  }
}
```

### Scenario

A generated moral dilemma instance.

```graphql
type Scenario {
  id: ID!
  definitionId: ID!
  name: String!
  content: JSON!                    # Scenario text and dimension values
  createdAt: DateTime!

  # Relations
  definition: Definition!
}
```

### Experiment

A grouping of related runs for comparison.

```graphql
type Experiment {
  id: ID!
  name: String!
  hypothesis: String
  analysisPlan: JSON
  createdAt: DateTime!
  updatedAt: DateTime!

  # Relations
  runs: [Run!]!                     # Excludes soft-deleted runs

  # Computed
  runCount: Int!
}
```

### Tag

Organization label for definitions.

```graphql
type Tag {
  id: ID!
  name: String!
  createdAt: DateTime!

  # Relations
  definitions: [Definition!]!

  # Computed
  definitionCount: Int!
}
```

### AnalysisResult

Statistical analysis output for a run.

```graphql
type AnalysisResult {
  id: ID!
  runId: ID!
  analysisType: String!
  status: AnalysisStatus!           # CURRENT or SUPERSEDED
  codeVersion: String!
  inputHash: String!                # For cache invalidation
  createdAt: DateTime!

  # Computed from output JSON
  computedAt: DateTime
  durationMs: Int
  perModel: JSON                    # Per-model statistics
  modelAgreement: JSON              # Pairwise correlations
  dimensionAnalysis: JSON           # Variable impact analysis
  visualizationData: JSON           # Frontend chart data
  mostContestedScenarios: [ContestedScenario!]
  methodsUsed: [String!]
  warnings: [AnalysisWarning!]
}

type ContestedScenario {
  scenarioId: String!
  scenarioName: String
  variance: Float!
  modelScores: JSON!                # {modelId: score}
}

type AnalysisWarning {
  code: String!
  message: String!
  severity: String!                 # info, warning, error
}
```

### User

Authenticated user account.

```graphql
type User {
  id: ID!
  email: String!
  name: String
  lastLoginAt: DateTime
  createdAt: DateTime!
}
```

### ApiKey

API authentication key (full key only returned at creation).

```graphql
type ApiKey {
  id: ID!
  name: String!
  keyPrefix: String!                # First 8 chars for identification
  lastUsedAt: DateTime
  expiresAt: DateTime
  createdAt: DateTime!
}

type CreateApiKeyResult {
  apiKey: ApiKey!
  key: String!                      # Full key - only returned once!
}
```

### LlmProvider

API provider configuration (OpenAI, Anthropic, etc.).

```graphql
type LlmProvider {
  id: ID!
  name: String!
  isConfigured: Boolean!            # Has API key set
  lastCheckedAt: DateTime
  createdAt: DateTime!
  updatedAt: DateTime!
}
```

### LlmModel

Specific model instance.

```graphql
type LlmModel {
  id: ID!
  providerId: ID!
  modelId: String!                  # API identifier (e.g., "gpt-4")
  displayName: String!
  costInputPerMillion: Float
  costOutputPerMillion: Float
  status: LlmModelStatus!
  isDefault: Boolean!

  # Relations
  provider: LlmProvider!

  # Computed
  isAvailable: Boolean!             # Provider has API key configured
}

type AvailableModel {
  id: ID!
  modelId: String!
  displayName: String!
  providerId: ID!
  providerName: String!
  isAvailable: Boolean!
}
```

### QueueStatus

Job queue health information.

```graphql
type QueueStatus {
  isRunning: Boolean!
  isPaused: Boolean!
  jobTypes: [JobTypeStatus!]!
  totals: JobTypeStatus!
}

type JobTypeStatus {
  type: String!
  pending: Int!
  active: Int!
  completed: Int!
  failed: Int!
}
```

---

## Queries

### Definition Queries

#### definition
Fetch a single definition by ID.

```graphql
query {
  definition(id: ID!): Definition
}
```

Returns `null` if not found or soft-deleted.

#### definitions
List definitions with filtering and pagination.

```graphql
query {
  definitions(
    rootOnly: Boolean      # Only root definitions (no parent)
    search: String         # Case-insensitive name search
    tagIds: [ID!]          # Filter by tags (OR logic, includes inherited)
    hasRuns: Boolean       # Only definitions with runs
    limit: Int = 20        # Max 100
    offset: Int = 0
  ): [Definition!]!
}
```

#### definitionAncestors
Get full ancestry chain to root (oldest first).

```graphql
query {
  definitionAncestors(
    id: ID!
    maxDepth: Int = 10
  ): [Definition!]!
}
```

#### definitionDescendants
Get full descendant subtree (newest first).

```graphql
query {
  definitionDescendants(
    id: ID!
    maxDepth: Int = 10
  ): [Definition!]!
}
```

### Run Queries

#### run
Fetch a single run by ID.

```graphql
query {
  run(id: ID!): Run
}
```

#### runs
List runs with filtering and pagination.

```graphql
query {
  runs(
    definitionId: String
    experimentId: String
    status: String         # RunStatus enum value
    limit: Int = 20        # Max 100
    offset: Int = 0
  ): [Run!]!
}
```

### Scenario Queries

#### scenario
Fetch a single scenario by ID.

```graphql
query {
  scenario(id: ID!): Scenario
}
```

#### scenarios
List scenarios for a definition.

```graphql
query {
  scenarios(
    definitionId: ID!
    limit: Int = 50        # Max 100
    offset: Int = 0
  ): [Scenario!]!
}
```

#### scenarioCount
Count scenarios for a definition.

```graphql
query {
  scenarioCount(definitionId: ID!): Int!
}
```

### Analysis Queries

#### analysis
Get current (non-superseded) analysis for a run.

```graphql
query {
  analysis(runId: ID!): AnalysisResult
}
```

#### analysisHistory
Get all analysis versions including superseded.

```graphql
query {
  analysisHistory(
    runId: ID!
    limit: Int = 10
  ): [AnalysisResult!]!
}
```

### System Queries

#### queueStatus
Get job queue health (requires authentication).

```graphql
query {
  queueStatus: QueueStatus!
}
```

#### me
Get current authenticated user.

```graphql
query {
  me: User
}
```

Returns `null` if not authenticated.

#### apiKeys
List current user's API keys (requires authentication).

```graphql
query {
  apiKeys: [ApiKey!]!
}
```

#### availableModels
List configured LLM models.

```graphql
query {
  availableModels(
    availableOnly: Boolean  # Filter to models with API key configured
  ): [AvailableModel!]!
}
```

---

## Mutations

### Definition Mutations

#### createDefinition
Create a new scenario definition.

```graphql
mutation {
  createDefinition(input: CreateDefinitionInput!): Definition!
}

input CreateDefinitionInput {
  name: String!            # 1-255 characters
  content: JSON!           # Must be object with schema_version
  parentId: String         # Optional parent for inheritance
}
```

Auto-adds `schema_version: 2` if not present. Queues async scenario expansion.

#### forkDefinition
Create a variant of an existing definition.

```graphql
mutation {
  forkDefinition(input: ForkDefinitionInput!): Definition!
}

input ForkDefinitionInput {
  parentId: String!
  name: String!
  content: JSON            # Optional partial overrides
  inheritAll: Boolean = true  # Use sparse storage (recommended)
}
```

With `inheritAll: true` (default), stores minimal content and inherits from parent.

#### updateDefinition
Update a definition's name or content.

```graphql
mutation {
  updateDefinition(
    id: String!
    input: UpdateDefinitionInput!
  ): Definition!
}

input UpdateDefinitionInput {
  name: String
  content: JSON            # Replaces entire content
}
```

Queues scenario re-expansion if content updated.

#### updateDefinitionContent
Granular field updates with inheritance control.

```graphql
mutation {
  updateDefinitionContent(
    id: String!
    input: UpdateDefinitionContentInput!
  ): Definition!
}

input UpdateDefinitionContentInput {
  preamble: String         # Empty string clears override
  template: String
  dimensions: JSON         # Array
  matchingRules: String
  clearOverrides: [String!]  # Fields to clear (inherit from parent)
}
```

#### deleteDefinition
Soft delete a definition and all descendants.

```graphql
mutation {
  deleteDefinition(id: String!): DeleteDefinitionResult!
}

type DeleteDefinitionResult {
  deletedIds: [String!]!
  count: Int!
}
```

Cascades to scenarios and definition_tags.

#### regenerateScenarios
Manually trigger scenario regeneration.

```graphql
mutation {
  regenerateScenarios(definitionId: String!): RegenerateScenariosResult!
}

type RegenerateScenariosResult {
  definitionId: String!
  jobId: String
  queued: Boolean!
}
```

### Run Mutations

#### startRun
Start a new evaluation run.

```graphql
mutation {
  startRun(input: StartRunInput!): StartRunPayload!
}

input StartRunInput {
  definitionId: ID!
  models: [String!]!       # Model IDs to evaluate
  samplePercentage: Int    # 1-100, default 100
  sampleSeed: Int          # Optional seed for reproducibility
  priority: String         # LOW/NORMAL/HIGH
  experimentId: ID         # Optional experiment grouping
}

type StartRunPayload {
  run: Run!
  jobCount: Int!
}
```

Queues `probe_scenario` jobs for each model-scenario combination.

#### pauseRun
Pause a running evaluation (requires authentication).

```graphql
mutation {
  pauseRun(runId: ID!): Run!
}
```

In-progress jobs complete; no new jobs start.

#### resumeRun
Resume a paused run (requires authentication).

```graphql
mutation {
  resumeRun(runId: ID!): Run!
}
```

#### cancelRun
Cancel a run (requires authentication).

```graphql
mutation {
  cancelRun(runId: ID!): Run!
}
```

Removes pending jobs; in-progress jobs complete.

#### deleteRun
Soft delete a run (requires authentication).

```graphql
mutation {
  deleteRun(runId: ID!): Boolean!
}
```

### Tag Mutations

#### createTag
Create a new tag.

```graphql
mutation {
  createTag(name: String!): Tag!
}
```

#### assignTagToDefinition
Assign a tag to a definition.

```graphql
mutation {
  assignTagToDefinition(
    tagId: String!
    definitionId: String!
  ): DefinitionTag!
}
```

#### removeTagFromDefinition
Remove a tag from a definition.

```graphql
mutation {
  removeTagFromDefinition(
    tagId: String!
    definitionId: String!
  ): Boolean!
}
```

### API Key Mutations

#### createApiKey
Generate a new API key (requires authentication).

```graphql
mutation {
  createApiKey(
    name: String!
    expiresAt: DateTime
  ): CreateApiKeyResult!
}
```

**Important**: The full key is only returned once at creation time.

#### deleteApiKey
Delete an API key (requires authentication).

```graphql
mutation {
  deleteApiKey(keyId: String!): Boolean!
}
```

---

## DataLoader Pattern

The API uses DataLoaders to prevent N+1 query problems. All loaders are created per-request and automatically:

- Batch multiple ID lookups into single queries
- Cache results within the request
- Filter out soft-deleted records
- Return results in the same order as input IDs

**Available DataLoaders**:
- `definition` - Load Definition by ID
- `run` - Load Run by ID
- `transcript` - Load Transcript by ID
- `transcriptsByRun` - Batch load all transcripts for a run
- `scenario` - Load Scenario by ID
- `experiment` - Load Experiment by ID
- `tag` - Load Tag by ID
- `tagsByDefinition` - Batch load all tags for a definition
- `llmProvider` - Load LlmProvider by ID
- `llmModel` - Load LlmModel by ID
- `llmModelsByProvider` - Batch load all models for a provider

---

## Pagination

All list queries use offset-based pagination:

```graphql
query {
  definitions(limit: 20, offset: 0) {
    id
    name
  }
}
```

- **Default limit**: Varies by query (20-50)
- **Max limit**: 100 for most queries
- **Sort order**: `createdAt DESC` unless specified

---

## Error Handling

Errors are returned in the standard GraphQL format:

```json
{
  "errors": [
    {
      "message": "Definition not found",
      "extensions": {
        "code": "NOT_FOUND"
      }
    }
  ]
}
```

**Common Error Codes**:
- `AUTHENTICATION_ERROR` - Auth required or invalid
- `VALIDATION_ERROR` - Input validation failed
- `NOT_FOUND` - Resource not found
- `INTERNAL_ERROR` - Server error

---

## Example Queries

### Get definition with inheritance info

```graphql
query GetDefinition($id: ID!) {
  definition(id: $id) {
    id
    name
    isForked
    resolvedContent
    overrides {
      preamble
      template
      dimensions
    }
    ancestors {
      id
      name
    }
    scenarioCount
    expansionStatus {
      status
      scenarioCount
    }
  }
}
```

### Get run with progress and analysis

```graphql
query GetRun($id: ID!) {
  run(id: $id) {
    id
    status
    runProgress {
      total
      completed
      failed
      percentComplete
      byModel {
        modelId
        completed
        total
      }
    }
    analysis {
      perModel
      modelAgreement
      mostContestedScenarios {
        scenarioId
        scenarioName
        variance
      }
    }
  }
}
```

### Start a new run

```graphql
mutation StartRun($input: StartRunInput!) {
  startRun(input: $input) {
    run {
      id
      status
    }
    jobCount
  }
}
```

Variables:
```json
{
  "input": {
    "definitionId": "def-123",
    "models": ["gpt-4", "claude-3-sonnet"],
    "samplePercentage": 50,
    "priority": "NORMAL"
  }
}
```

---

## Source Files

- **Builder**: `apps/api/src/graphql/builder.ts`
- **Context**: `apps/api/src/graphql/context.ts`
- **Types**: `apps/api/src/graphql/types/`
- **Queries**: `apps/api/src/graphql/queries/`
- **Mutations**: `apps/api/src/graphql/mutations/`
- **DataLoaders**: `apps/api/src/graphql/dataloaders/`
