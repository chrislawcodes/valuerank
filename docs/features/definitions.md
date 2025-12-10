# Definitions

Definitions are the core entity in Cloud ValueRank. A definition describes a moral dilemma scenario template that can be expanded into multiple concrete scenarios for evaluation.

> **Original Design:** See [preplanning/database-design.md](../preplanning/database-design.md) for the original entity design and [specs/006-stage-8-definition-ui/spec.md](../../specs/006-stage-8-definition-ui/spec.md) for the full feature specification.

---

## Overview

A definition consists of:

- **Name** - Human-readable identifier
- **Preamble** - Context-setting text presented to the AI model before the scenario
- **Template** - The scenario text with `[placeholder]` markers for dimension values
- **Dimensions** - Variables that create scenario variations, each with scored levels
- **Matching Rules** (optional) - Constraints on which dimension combinations are valid

When a definition is created or updated, Cloud ValueRank automatically expands it into concrete scenarios using an LLM to generate natural-sounding variations.

---

## Content Structure

Definitions store their content in a JSONB field with this schema:

```typescript
type DefinitionContent = {
  schema_version: 2;              // Content version for migrations
  preamble?: string;              // Context text before scenarios
  template: string;               // Scenario template with [placeholders]
  dimensions?: Dimension[];       // Variable dimensions
  matching_rules?: string;        // Optional generation constraints
};

type Dimension = {
  name: string;                   // Placeholder name (e.g., "stakes")
  levels: DimensionLevel[];       // Possible values
};

type DimensionLevel = {
  score: number;                  // Numeric value (1-5 typically)
  label: string;                  // Human-readable label
  description?: string;           // Optional explanation
  options?: string[];             // Text variants for generation
};
```

### Example Definition Content

```json
{
  "schema_version": 2,
  "preamble": "You are helping a person make a difficult decision...",
  "template": "A [situation] has occurred involving [severity] consequences.",
  "dimensions": [
    {
      "name": "situation",
      "levels": [
        { "score": 1, "label": "minor", "options": ["small mishap", "minor accident"] },
        { "score": 3, "label": "moderate", "options": ["significant problem"] },
        { "score": 5, "label": "severe", "options": ["crisis", "emergency"] }
      ]
    },
    {
      "name": "severity",
      "levels": [
        { "score": 1, "label": "low", "options": ["temporary inconvenience"] },
        { "score": 5, "label": "high", "options": ["permanent harm", "lasting damage"] }
      ]
    }
  ]
}
```

---

## Version Control & Forking

Definitions support a parent-child relationship for version control:

### Forking

- Create a variant of an existing definition while preserving the original
- The fork references its parent via `parentId`
- Forks can inherit content from their parent (sparse storage) or copy content

### Inheritance (v2 Schema)

With schema version 2, forked definitions can use sparse storage:

- Only store fields that differ from the parent
- Inherit unspecified fields from the parent chain
- Clear an override to revert to inherited value

```graphql
# Fork with full inheritance (minimal content)
mutation ForkDefinition {
  forkDefinition(input: {
    parentId: "parent-id"
    name: "My Fork"
    inheritAll: true
  }) {
    id
    name
  }
}

# Fork with specific overrides
mutation ForkWithOverrides {
  forkDefinition(input: {
    parentId: "parent-id"
    name: "Modified Fork"
    content: { preamble: "New preamble text..." }
  }) {
    id
  }
}
```

### Version Tree

The system provides queries to navigate the version tree:

- `definitionAncestors(id)` - Get the full chain to the root definition
- `definitionDescendants(id)` - Get all forks (children) of a definition
- `definition.parent` - Get immediate parent
- `definition.children` - Get immediate children

---

## GraphQL Operations

### Queries

```graphql
# Get a single definition
query GetDefinition($id: ID!) {
  definition(id: $id) {
    id
    name
    content
    createdAt
    updatedAt
    parent { id name }
    children { id name }
    tags { id name }
    runCount
    scenarioCount
  }
}

# List definitions with filtering
query ListDefinitions(
  $search: String
  $tagIds: [ID!]
  $rootOnly: Boolean
  $hasRuns: Boolean
  $limit: Int
  $offset: Int
) {
  definitions(
    search: $search
    tagIds: $tagIds
    rootOnly: $rootOnly
    hasRuns: $hasRuns
    limit: $limit
    offset: $offset
  ) {
    id
    name
    createdAt
    tags { id name }
  }
}

# Get version tree
query GetVersionTree($id: ID!) {
  definition(id: $id) { id name }
  definitionAncestors(id: $id) { id name parentId }
  definitionDescendants(id: $id) { id name parentId }
}
```

### Mutations

```graphql
# Create a new definition
mutation CreateDefinition($input: CreateDefinitionInput!) {
  createDefinition(input: $input) {
    id
    name
  }
}

# Update a definition
mutation UpdateDefinition($id: String!, $input: UpdateDefinitionInput!) {
  updateDefinition(id: $id, input: $input) {
    id
    name
    updatedAt
  }
}

# Update specific content fields
mutation UpdateContent($id: String!, $input: UpdateDefinitionContentInput!) {
  updateDefinitionContent(id: $id, input: $input) {
    id
  }
}

# Fork a definition
mutation ForkDefinition($input: ForkDefinitionInput!) {
  forkDefinition(input: $input) {
    id
    name
    parent { id name }
  }
}

# Delete a definition (soft delete)
mutation DeleteDefinition($id: String!) {
  deleteDefinition(id: $id) {
    deletedIds
    count
  }
}

# Manually regenerate scenarios
mutation RegenerateScenarios($definitionId: String!) {
  regenerateScenarios(definitionId: $definitionId) {
    definitionId
    jobId
    queued
  }
}
```

---

## Tags

Tags provide flexible organization for definitions:

### Tag Rules

- Names are lowercase, alphanumeric with hyphens and underscores
- Maximum 50 characters
- Case-insensitive uniqueness (stored lowercase)

### Tag Inheritance

When filtering by tags, the system includes both:
- Definitions with the tag directly assigned
- Descendants of tagged definitions (inherited tags)

### Tag Mutations

```graphql
# Add existing tag to definition
mutation AddTag {
  addTagToDefinition(definitionId: "def-id", tagId: "tag-id") {
    id
    tags { id name }
  }
}

# Create and assign tag in one operation
mutation CreateAndAssignTag {
  createAndAssignTag(definitionId: "def-id", tagName: "new-tag") {
    id
    tags { id name }
  }
}

# Remove tag from definition
mutation RemoveTag {
  removeTagFromDefinition(definitionId: "def-id", tagId: "tag-id") {
    id
  }
}
```

---

## Scenario Expansion

When a definition is created or updated, scenarios are automatically generated:

### Expansion Process

1. **Queue Job** - A `expand_scenarios` job is queued via PgBoss
2. **Build Prompt** - The system constructs an LLM prompt from the template and dimensions
3. **LLM Generation** - Claude generates all valid dimension combinations as YAML
4. **Parse & Store** - YAML is parsed and scenarios are created in the database

### Expansion Triggers

Scenario expansion is triggered by:
- `createDefinition` mutation
- `updateDefinition` mutation (when content changes)
- `updateDefinitionContent` mutation
- `forkDefinition` mutation
- `regenerateScenarios` mutation (manual trigger)

### Scenario Content

Each generated scenario contains:

```typescript
type ScenarioContent = {
  preamble?: string;                    // From definition
  prompt: string;                       // Filled-in template
  dimensions: Record<string, number>;   // Dimension scores used
  followups?: Array<{                   // Optional follow-up prompts
    label: string;
    prompt: string;
  }>;
};
```

### Fallback Behavior

If LLM generation fails or no dimensions are defined:
- A single "Default Scenario" is created
- Uses the raw template as the prompt

---

## Soft Delete

Definitions use soft delete via a `deletedAt` timestamp:

- Deleted definitions are filtered out of all queries automatically
- Deletion cascades to scenarios and tags
- The `deleteDefinition` mutation returns all deleted IDs (including descendants)

```graphql
mutation DeleteDefinition {
  deleteDefinition(id: "def-id") {
    deletedIds    # ["def-id", "child-1", "child-2", ...]
    count         # 3
  }
}
```

---

## Frontend Components

The web UI provides a full definition management interface:

| Component | Purpose |
|-----------|---------|
| `DefinitionList` | Paginated list with search and filters |
| `DefinitionCard` | Summary card showing name, tags, run count |
| `DefinitionEditor` | Full editor for preamble, template, dimensions |
| `DimensionEditor` | Add/edit/remove dimensions |
| `DimensionLevelEditor` | Edit levels within a dimension |
| `TemplateEditor` | Template text with placeholder highlighting |
| `VersionTree` | Visualize parent-child relationships |
| `ForkDialog` | Fork workflow with name input |
| `TagSelector` | Assign/create tags |
| `TagChips` | Display assigned tags |
| `ScenarioPreview` | Preview generated scenarios |
| `ExpandedScenarios` | View all generated scenarios |

### Key Source Files

- **GraphQL mutations:** `apps/api/src/graphql/mutations/definition.ts`
- **GraphQL queries:** `apps/api/src/graphql/queries/definition.ts`
- **Tag mutations:** `apps/api/src/graphql/mutations/definition-tags.ts`
- **Scenario expansion:** `apps/api/src/services/scenario/expand.ts`
- **Frontend components:** `apps/web/src/components/definitions/`

---

## Database Schema

```prisma
model Definition {
  id             String    @id @default(cuid())
  parentId       String?   @map("parent_id")
  name           String
  content        Json      @db.JsonB
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  lastAccessedAt DateTime?
  deletedAt      DateTime?

  parent    Definition?   @relation("DefinitionVersions", fields: [parentId])
  children  Definition[]  @relation("DefinitionVersions")
  runs      Run[]
  scenarios Scenario[]
  tags      DefinitionTag[]
}

model Tag {
  id          String   @id @default(cuid())
  name        String   @unique
  createdAt   DateTime @default(now())
  definitions DefinitionTag[]
}

model DefinitionTag {
  id           String    @id @default(cuid())
  definitionId String
  tagId        String
  createdAt    DateTime  @default(now())
  deletedAt    DateTime?

  definition Definition @relation(...)
  tag        Tag        @relation(...)

  @@unique([definitionId, tagId])
}
```

---

## Best Practices

1. **Use descriptive names** - Definition names should indicate the dilemma type
2. **Keep dimensions focused** - 2-4 dimensions with 3-5 levels each is ideal
3. **Fork before major changes** - Preserve version history for completed runs
4. **Use tags for organization** - Group by project, topic, or status
5. **Preview before running** - Check generated scenarios before starting a run
