# Quickstart: Stage 3 - GraphQL API Foundation

## Prerequisites

- [ ] Development environment running (`docker-compose up -d`)
- [ ] Database has seed data (`npm run db:seed`)
- [ ] API server running (`npm run dev` in `apps/api`)
- [ ] Browser or GraphQL client (curl, Insomnia, etc.)

---

## Testing User Story 1: Query Single Definition

**Goal**: Verify we can fetch a definition by ID with all fields and relationships.

**Steps**:

1. Open GraphQL playground at `http://localhost:3001/graphql`

2. Execute query to list definitions first (to get an ID):
```graphql
query {
  definitions(limit: 1) {
    id
    name
  }
}
```

3. Copy an ID from the result, then query single definition:
```graphql
query GetDefinition($id: ID!) {
  definition(id: $id) {
    id
    name
    content
    parentId
    parent {
      id
      name
    }
    children {
      id
      name
    }
    runs {
      id
      status
    }
    createdAt
    updatedAt
  }
}
```

Variables:
```json
{
  "id": "<paste-id-here>"
}
```

**Expected**:
- All scalar fields returned (id, name, content, createdAt, etc.)
- `parent` is null for root definitions, or resolved Definition object
- `children` is empty array or list of child definitions
- `runs` is empty array or list of associated runs

**Verification**:
- Response has no errors
- `id` matches requested ID
- `content` is valid JSON object

---

## Testing User Story 2: List Definitions with Filtering

**Goal**: Verify paginated listing with optional filters.

**Steps**:

1. Query all definitions (default limit):
```graphql
query {
  definitions {
    id
    name
    parentId
  }
}
```

2. Query root definitions only:
```graphql
query {
  definitions(rootOnly: true) {
    id
    name
    parentId
  }
}
```

3. Query with pagination:
```graphql
query {
  definitions(limit: 5, offset: 0) {
    id
    name
  }
}
```

Then offset by 5:
```graphql
query {
  definitions(limit: 5, offset: 5) {
    id
    name
  }
}
```

**Expected**:
- Default query returns up to 20 definitions
- `rootOnly: true` returns only definitions where `parentId` is null
- Pagination returns correct slice (no overlap between offset 0 and offset 5)
- Results ordered by createdAt descending (newest first)

**Verification**:
- Count results match limits
- Root-only filter verified by checking all `parentId` are null
- No duplicate IDs across paginated results

---

## Testing User Story 3: Query Single Run with Progress

**Goal**: Verify we can fetch a run with its transcripts and relationships.

**Steps**:

1. First, find a run ID (may need to seed data or create a run):
```graphql
query {
  runs(limit: 1) {
    id
    status
  }
}
```

2. Query single run with full details:
```graphql
query GetRun($id: ID!) {
  run(id: $id) {
    id
    status
    config
    progress
    definition {
      id
      name
    }
    experiment {
      id
      name
    }
    transcripts(limit: 10) {
      id
      modelId
      modelVersion
      turnCount
      tokenCount
    }
    startedAt
    completedAt
    createdAt
  }
}
```

3. Test transcript filtering by model:
```graphql
query GetRunTranscripts($id: ID!, $model: String!) {
  run(id: $id) {
    transcripts(model: $model, limit: 10) {
      id
      modelId
    }
  }
}
```

Variables:
```json
{
  "id": "<run-id>",
  "model": "gpt-4"
}
```

**Expected**:
- Run scalar fields returned correctly
- `definition` is always resolved (required relation)
- `experiment` is null or resolved Experiment object
- `transcripts` returns array (empty if no transcripts)
- Model filter returns only matching transcripts

**Verification**:
- Status is valid enum value (PENDING, RUNNING, COMPLETED, FAILED, CANCELLED)
- Config and progress are valid JSON
- Filtered transcripts all have matching modelId

---

## Testing User Story 4: List Runs with Filtering

**Goal**: Verify paginated run listing with multiple filter options.

**Steps**:

1. Query all runs:
```graphql
query {
  runs {
    id
    status
    definition {
      id
    }
  }
}
```

2. Filter by status:
```graphql
query {
  runs(status: COMPLETED) {
    id
    status
  }
}
```

3. Filter by definition:
```graphql
query ListRunsByDefinition($defId: ID!) {
  runs(definitionId: $defId) {
    id
    definition {
      id
    }
  }
}
```

**Expected**:
- Default query returns up to 20 runs
- Status filter returns only matching status
- Definition filter returns only runs for that definition
- Multiple filters can combine

**Verification**:
- All returned runs match filter criteria
- Pagination works correctly (limit/offset)

---

## Testing User Story 5: Create Definition

**Goal**: Verify we can create a new definition via mutation.

**Steps**:

1. Execute createDefinition mutation:
```graphql
mutation CreateDefinition($input: CreateDefinitionInput!) {
  createDefinition(input: $input) {
    id
    name
    content
    parentId
    createdAt
  }
}
```

Variables:
```json
{
  "input": {
    "name": "Test Definition from Quickstart",
    "content": {
      "preamble": "You are being asked about...",
      "template": "A person faces [situation]...",
      "dimensions": []
    }
  }
}
```

2. Verify it persists by querying:
```graphql
query {
  definition(id: "<new-id>") {
    id
    name
    content
  }
}
```

3. Test validation error (missing name):
```graphql
mutation {
  createDefinition(input: { content: {} }) {
    id
  }
}
```

**Expected**:
- Successful creation returns new definition with generated ID
- `parentId` is null (this is a root definition)
- Content includes `schema_version: 1` (auto-added)
- Definition is queryable after creation
- Missing required fields return validation error

**Verification**:
- Check database: `SELECT * FROM definitions WHERE id = '<new-id>'`
- Verify `schema_version` field in content JSON

---

## Testing User Story 6: Fork Definition

**Goal**: Verify we can fork an existing definition with parent-child linking.

**Steps**:

1. First, get a definition ID to fork:
```graphql
query {
  definitions(limit: 1) {
    id
    name
    content
  }
}
```

2. Fork the definition:
```graphql
mutation ForkDefinition($input: ForkDefinitionInput!) {
  forkDefinition(input: $input) {
    id
    name
    parentId
    parent {
      id
      name
    }
    content
  }
}
```

Variables:
```json
{
  "input": {
    "parentId": "<parent-id>",
    "name": "Forked Definition - Quickstart Test"
  }
}
```

3. Fork with content changes:
```graphql
mutation ForkWithChanges($input: ForkDefinitionInput!) {
  forkDefinition(input: $input) {
    id
    name
    content
  }
}
```

Variables:
```json
{
  "input": {
    "parentId": "<parent-id>",
    "name": "Modified Fork",
    "content": {
      "schema_version": 1,
      "preamble": "Modified preamble...",
      "template": "Changed template...",
      "dimensions": []
    }
  }
}
```

4. Verify parent's children include fork:
```graphql
query {
  definition(id: "<parent-id>") {
    children {
      id
      name
    }
  }
}
```

5. Test error case - invalid parent:
```graphql
mutation {
  forkDefinition(input: {
    parentId: "nonexistent-id",
    name: "Should Fail"
  }) {
    id
  }
}
```

**Expected**:
- Fork has `parentId` set to original definition
- Fork without content inherits parent's content
- Fork with content uses provided content
- Parent's `children` field includes the new fork
- Invalid parentId returns NOT_FOUND error

**Verification**:
- Query parent and verify fork appears in children
- Compare content between fork (no changes) and parent

---

## Testing User Story 7: DataLoader N+1 Prevention

**Goal**: Verify that nested queries use batched database calls.

**Steps**:

1. Enable query logging (set `LOG_LEVEL=debug` in environment)

2. Execute nested query:
```graphql
query {
  runs(limit: 10) {
    id
    definition {
      id
      name
    }
  }
}
```

3. Check server logs for SQL queries

**Expected**:
- Should see only 2 SQL queries:
  1. `SELECT * FROM runs LIMIT 10`
  2. `SELECT * FROM definitions WHERE id IN (...)`
- NOT 11 queries (1 for runs + 10 for definitions)

**Verification**:
- Count SQL queries in debug logs
- Confirm batching by presence of `IN (...)` clause

---

## Testing User Story 8: GraphQL Playground

**Goal**: Verify interactive playground works in development.

**Steps**:

1. Open browser to `http://localhost:3001/graphql`

2. Verify GraphiQL/Playground UI loads

3. Test autocomplete:
   - Type `query { def` and verify autocomplete suggests `definition`, `definitions`

4. Test documentation:
   - Click "Docs" or schema explorer
   - Verify all types (Definition, Run, etc.) appear with field descriptions

5. Test introspection query:
```graphql
query {
  __schema {
    types {
      name
    }
  }
}
```

**Expected**:
- Playground UI loads and is interactive
- Autocomplete works for queries and types
- Documentation shows all types and fields
- Introspection returns full schema

**Verification**:
- Introspection query succeeds
- Can explore schema via UI

---

## Troubleshooting

**Issue**: `Cannot find module '@pothos/plugin-prisma'`
**Fix**: Run `npm install` in `apps/api`, then `npm run db:generate`

**Issue**: GraphQL playground not loading (blank page)
**Fix**: Check `NODE_ENV=development` is set; playground disabled in production

**Issue**: Queries return empty arrays but data exists
**Fix**: Verify DATABASE_URL points to correct database; check seed data exists

**Issue**: DataLoader not batching (11 queries instead of 2)
**Fix**: Ensure DataLoaders are created per-request in context, not globally

**Issue**: Type errors with Pothos Prisma plugin
**Fix**: Run `npm run db:generate` to regenerate Prisma client, then restart TypeScript server

**Issue**: `Cannot read property 'findMany' of undefined`
**Fix**: Ensure Prisma client is exported correctly from `@valuerank/db`

---

## API Examples with curl

**Query definitions**:
```bash
curl -X POST http://localhost:3001/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ definitions(limit: 5) { id name } }"}'
```

**Create definition**:
```bash
curl -X POST http://localhost:3001/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation($input: CreateDefinitionInput!) { createDefinition(input: $input) { id name } }",
    "variables": {
      "input": {
        "name": "Curl Test",
        "content": {"preamble": "Test"}
      }
    }
  }'
```

**Fork definition**:
```bash
curl -X POST http://localhost:3001/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation($input: ForkDefinitionInput!) { forkDefinition(input: $input) { id parentId } }",
    "variables": {
      "input": {
        "parentId": "<parent-id>",
        "name": "Curl Fork Test"
      }
    }
  }'
```
