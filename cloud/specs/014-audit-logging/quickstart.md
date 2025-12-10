# Quickstart: Comprehensive Audit Logging

## Prerequisites

- [ ] Development environment running (`docker-compose up -d postgres`)
- [ ] Database migrations applied (`npm run db:test:setup`)
- [ ] Test user available (`dev@valuerank.ai` / `development`)
- [ ] API server running (`cd apps/api && npm run dev`)

---

## Testing User Story 1: View Who Created a Resource

**Goal**: Verify that `createdBy` field returns user information for definitions and runs.

### Test 1.1: Query Definition Creator

**Steps**:
1. Login as test user
2. Create a new definition via GraphQL
3. Query the definition with `createdBy` field

**GraphQL Mutation (Create)**:
```graphql
mutation CreateDefinition {
  createDefinition(input: {
    name: "Audit Test Definition"
    content: {
      preamble: "Test preamble"
      template: "Test [Variable]"
      dimensions: []
    }
  }) {
    id
    name
  }
}
```

**GraphQL Query (Verify)**:
```graphql
query GetDefinitionCreator($id: ID!) {
  definition(id: $id) {
    id
    name
    createdBy {
      id
      email
      name
    }
  }
}
```

**Expected**:
- `createdBy` contains the test user's info
- `createdBy.email` equals `dev@valuerank.ai`

---

### Test 1.2: Query Run Creator

**Steps**:
1. Login as test user
2. Start a new run
3. Query the run with `createdBy` field

**GraphQL Mutation (Start Run)**:
```graphql
mutation StartRun($definitionId: ID!) {
  startRun(input: {
    definitionId: $definitionId
    models: ["gpt-4o-mini"]
    samplePercentage: 10
  }) {
    run {
      id
      status
    }
  }
}
```

**GraphQL Query (Verify)**:
```graphql
query GetRunCreator($id: ID!) {
  run(id: $id) {
    id
    status
    createdBy {
      id
      email
      name
    }
  }
}
```

**Expected**:
- `createdBy` contains the test user's info

---

## Testing User Story 2: View Who Deleted a Resource

**Goal**: Verify that `deletedBy` field is populated after soft-delete.

### Test 2.1: Delete Definition and Query Deleter

**Steps**:
1. Create a definition
2. Delete the definition
3. Query with `includeDeleted: true` to see `deletedBy`

**GraphQL Mutation (Delete)**:
```graphql
mutation DeleteDefinition($id: ID!) {
  deleteDefinition(id: $id) {
    deletedIds
    count
  }
}
```

**GraphQL Query (Verify)**:
```graphql
query GetDeletedDefinition($id: ID!) {
  definition(id: $id, includeDeleted: true) {
    id
    name
    deletedAt
    deletedBy {
      id
      email
    }
  }
}
```

**Expected**:
- `deletedAt` is set to deletion timestamp
- `deletedBy` contains the test user's info

---

## Testing User Story 3: Query Audit Log for an Entity

**Goal**: Verify complete history of actions on a specific resource.

### Test 3.1: Entity Audit History

**Steps**:
1. Create a definition
2. Update the definition
3. Delete the definition
4. Query audit history

**GraphQL Query**:
```graphql
query GetEntityHistory($entityType: String!, $entityId: String!) {
  entityAuditHistory(entityType: $entityType, entityId: $entityId) {
    id
    action
    performedBy {
      email
    }
    metadata
    timestamp
  }
}
```

**Variables**:
```json
{
  "entityType": "Definition",
  "entityId": "<definition-id-from-step-1>"
}
```

**Expected**:
- 3 audit entries returned (CREATE, UPDATE, DELETE)
- Entries in reverse chronological order
- Each entry has correct `action` and `performedBy`

---

## Testing User Story 4: Query Audit Log by User

**Goal**: Verify user activity querying works with filters.

### Test 4.1: User Activity Query

**Steps**:
1. Perform several actions as test user
2. Query audit log filtered by user

**GraphQL Query**:
```graphql
query GetUserActivity($userId: String!, $from: DateTime) {
  auditLogs(filter: {
    userId: $userId
    from: $from
  }, first: 20) {
    edges {
      node {
        id
        action
        entityType
        entityId
        timestamp
      }
    }
    totalCount
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

**Expected**:
- Returns all actions by the specified user
- Supports pagination
- `totalCount` reflects actual count

---

## Testing User Story 5: Automatic Audit Logging

**Goal**: Verify mutations automatically create audit entries.

### Test 5.1: Verify Audit Entry Creation

**Steps**:
1. Count audit log entries
2. Perform a mutation (e.g., createTag)
3. Verify audit log count increased

**GraphQL Mutations**:
```graphql
# Before - count entries
query CountBefore {
  auditLogs(first: 1) {
    totalCount
  }
}

# Perform action
mutation CreateTag {
  createTag(name: "audit-test-tag") {
    id
    name
  }
}

# After - count entries
query CountAfter {
  auditLogs(first: 1) {
    totalCount
  }
}
```

**Expected**:
- Count after > Count before
- New audit entry has `action: CREATE`, `entityType: Tag`

---

## Verification Commands

### Check Database for Audit Logs

```bash
# Connect to database
docker exec -it valuerank-postgres psql -U valuerank -d valuerank

# Query audit logs
SELECT id, action, entity_type, entity_id, user_id, created_at
FROM audit_logs
ORDER BY created_at DESC
LIMIT 10;

# Check definitions have createdByUserId
SELECT id, name, created_by_user_id, deleted_by_user_id
FROM definitions
LIMIT 10;
```

### API Health Check

```bash
# Check API is running
curl http://localhost:3030/health

# GraphQL introspection (verify AuditLog type exists)
curl -X POST http://localhost:3030/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __type(name: \"AuditLog\") { name fields { name } } }"}'
```

---

## Troubleshooting

**Issue**: `createdBy` returns null for new entities
**Fix**: Ensure user is authenticated when creating the entity. Check JWT token is valid.

**Issue**: Audit log query returns empty
**Fix**:
1. Verify migrations applied: `npm run db:test:setup`
2. Check audit service is creating entries (check logs)
3. Verify filter parameters are correct

**Issue**: Performance is slow
**Fix**:
1. Check indexes exist on `audit_logs` table
2. Add date range filter to limit results
3. Use pagination (`first`, `after`)

**Issue**: System actions have null `performedBy`
**Fix**: This is expected. System-initiated actions (background jobs) have no user context. Check `metadata.actor` for system identifier.
