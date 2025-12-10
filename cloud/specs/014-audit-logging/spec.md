# Feature Specification: Comprehensive Audit Logging

**Feature Branch**: `feat/audit-logging`
**Created**: 2025-12-10
**Status**: Draft

## Input Description

Track who performed every mutation on data and when, for comprehensive auditability. Enable answering questions like "who created this definition?", "who started this run?", "who deleted it?", etc.

---

## Research Summary: Audit Logging Patterns

Based on research from [StrongDM](https://www.strongdm.com/blog/audit-logging), [Vertabelo/Red Gate](https://www.red-gate.com/blog/database-design-for-audit-logging/), and industry best practices, there are three main patterns:

### Pattern 1: Row Versioning In Place
Add version numbers to existing tables; treat updates as new rows.

| Pros | Cons |
|------|------|
| No additional tables | Breaks foreign key relationships |
| Simple concept | Violates database design principles |
| | Requires views for current data |

**Verdict**: Not recommended for our use case.

### Pattern 2: Shadow Tables
Create duplicate audit tables for each audited table, populated via triggers.

| Pros | Cons |
|------|------|
| Maintains data model integrity | Every schema change requires shadow table update |
| Easy to query audit history | Trigger complexity grows |
| Separate audit from operational data | More tables to maintain |

**Verdict**: Good for heavy audit requirements, but maintenance overhead.

### Pattern 3: Generic Audit Tables (Recommended)
Two tables capture all changes: header table (operation metadata) + details table (field-level changes).

| Pros | Cons |
|------|------|
| Single solution scales to all tables | Complex querying |
| No schema changes when adding tables | All values stored as text |
| Stores only changed fields | |

**Verdict**: Best balance of flexibility and maintainability.

### Hybrid Approach (Recommended for ValueRank)
Given our needs are primarily "who did what" rather than "what exact field values changed", we recommend a **simplified hybrid approach**:

1. **Add `createdByUserId` / `deletedByUserId` fields** to key entities (lightweight tracking)
2. **Create a generic `AuditLog` table** for comprehensive event logging
3. **Application-level logging** (not database triggers) for control and testability

---

## User Scenarios & Testing

### User Story 1 - View Who Created a Resource (Priority: P1)

As a **ValueRank administrator**, I need to see who created a definition, run, or other resource so that I can understand accountability and contact the appropriate person for questions.

**Why this priority**: Core audit requirement. Without knowing who created resources, we cannot audit system usage or debug issues effectively.

**Independent Test**: Query any definition/run via API and verify `createdBy` field returns user information.

**Acceptance Scenarios**:

1. **Given** a definition exists, **When** I query `definition(id)` via GraphQL, **Then** I see `createdBy { id, email, name }` with the creating user's info.
2. **Given** a run exists, **When** I query `run(id)` via GraphQL, **Then** I see `createdBy { id, email, name }` with the user who started it.
3. **Given** an API key was used to create a resource, **When** I query the resource, **Then** `createdBy` shows the user who owns that API key.

---

### User Story 2 - View Who Deleted a Resource (Priority: P1)

As a **ValueRank administrator**, I need to see who deleted a definition or run so that I can audit destructive actions and restore if needed.

**Why this priority**: Destructive actions are the most important to audit. Users should be accountable for deletions.

**Independent Test**: Soft-delete a definition, then verify the `deletedBy` and `deletedAt` fields are populated.

**Acceptance Scenarios**:

1. **Given** I soft-delete a definition, **When** I query it with `includeDeleted: true`, **Then** I see `deletedBy { id, email }` and `deletedAt` timestamp.
2. **Given** I soft-delete a run, **When** I query it with `includeDeleted: true`, **Then** I see `deletedBy { id, email }` and `deletedAt` timestamp.

---

### User Story 3 - Query Audit Log for an Entity (Priority: P2)

As a **ValueRank administrator**, I need to see the complete history of actions performed on a specific resource so that I can audit its lifecycle.

**Why this priority**: Important for compliance and debugging, but not blocking for basic "who created this" queries.

**Independent Test**: Create, update, and delete a definition. Query its audit log and verify all three events appear with correct details.

**Acceptance Scenarios**:

1. **Given** multiple actions were performed on a definition, **When** I query `auditLog(entityType: "Definition", entityId: "xxx")`, **Then** I see all events in chronological order.
2. **Given** an audit log entry exists, **When** I view it, **Then** I see: `action`, `performedBy`, `timestamp`, `entityType`, `entityId`, and optional `metadata`.

---

### User Story 4 - Query Audit Log by User (Priority: P2)

As a **ValueRank administrator**, I need to see all actions performed by a specific user so that I can audit their activity.

**Why this priority**: Useful for security audits and understanding user behavior patterns.

**Independent Test**: Have a user perform multiple actions, then query audit log filtered by that user.

**Acceptance Scenarios**:

1. **Given** a user has performed multiple actions, **When** I query `auditLog(userId: "xxx")`, **Then** I see all their actions across all entities.
2. **Given** I filter by date range, **When** I query `auditLog(userId: "xxx", from: "...", to: "...")`, **Then** I only see actions within that range.

---

### User Story 5 - Automatic Audit Logging for All Mutations (Priority: P1)

As a **system**, all mutations should automatically create audit log entries without requiring manual logging code in each mutation.

**Why this priority**: Ensures comprehensive coverage and prevents gaps when new mutations are added.

**Independent Test**: Add a new mutation, verify audit log entry is created automatically via middleware/interceptor.

**Acceptance Scenarios**:

1. **Given** any GraphQL mutation is executed, **When** it completes successfully, **Then** an audit log entry is created with the mutation name, user, timestamp, and affected entity.
2. **Given** a mutation fails, **When** the error is thrown, **Then** no audit log entry is created (or it's marked as failed).

---

## Mutations Requiring Audit Tracking

Based on codebase analysis, here are all mutations that need audit logging:

### Definition Mutations (`definition.ts`)
| Mutation | Action Type | Entity | Notes |
|----------|-------------|--------|-------|
| `createDefinition` | CREATE | Definition | Track creator |
| `forkDefinition` | CREATE | Definition | Track forker, reference parent |
| `updateDefinition` | UPDATE | Definition | Track modifier |
| `updateDefinitionContent` | UPDATE | Definition | Track modifier |
| `deleteDefinition` | DELETE | Definition | Track deleter (cascades to children) |
| `regenerateScenarios` | ACTION | Definition | Track who triggered regeneration |

### Run Mutations (`run.ts`)
| Mutation | Action Type | Entity | Notes |
|----------|-------------|--------|-------|
| `startRun` | CREATE | Run | Track who started (already has userId) |
| `pauseRun` | UPDATE | Run | Track who paused |
| `resumeRun` | UPDATE | Run | Track who resumed |
| `cancelRun` | UPDATE | Run | Track who cancelled |
| `deleteRun` | DELETE | Run | Track deleter |

### API Key Mutations (`api-key.ts`)
| Mutation | Action Type | Entity | Notes |
|----------|-------------|--------|-------|
| `createApiKey` | CREATE | ApiKey | Track creator (implicit - user's own key) |
| `revokeApiKey` | DELETE | ApiKey | Track revoker |

### Tag Mutations (`tag.ts`, `definition-tags.ts`)
| Mutation | Action Type | Entity | Notes |
|----------|-------------|--------|-------|
| `createTag` | CREATE | Tag | Track creator |
| `deleteTag` | DELETE | Tag | Track deleter |
| `addTagToDefinition` | CREATE | DefinitionTag | Track who assigned |
| `removeTagFromDefinition` | DELETE | DefinitionTag | Track who removed |
| `createAndAssignTag` | CREATE | Tag + DefinitionTag | Track creator |

### LLM Mutations (`llm.ts`)
| Mutation | Action Type | Entity | Notes |
|----------|-------------|--------|-------|
| `createLlmModel` | CREATE | LlmModel | Track creator |
| `updateLlmModel` | UPDATE | LlmModel | Track modifier |
| `deprecateLlmModel` | UPDATE | LlmModel | Track who deprecated |
| `reactivateLlmModel` | UPDATE | LlmModel | Track who reactivated |
| `setDefaultLlmModel` | UPDATE | LlmModel | Track who set default |
| `updateLlmProvider` | UPDATE | LlmProvider | Track modifier |
| `updateSystemSetting` | UPDATE | SystemSetting | Track modifier |

### Analysis Mutations (`analysis.ts`)
| Mutation | Action Type | Entity | Notes |
|----------|-------------|--------|-------|
| `recomputeAnalysis` | ACTION | AnalysisResult | Track who triggered |

### Queue Mutations (`queue.ts`)
| Mutation | Action Type | Entity | Notes |
|----------|-------------|--------|-------|
| `pauseQueue` | ACTION | System | Track who paused |
| `resumeQueue` | ACTION | System | Track who resumed |

**Total: 27 mutations requiring audit tracking**

---

## Edge Cases

- **Anonymous/Unauthenticated actions**: Some mutations don't require auth (e.g., `createDefinition`). Should log `userId: null` or require auth for all mutations?
- **System-initiated actions**: Background jobs (scenario expansion, analysis) should log as `system` actor, not a user.
- **Cascade deletes**: When deleting a definition cascades to children, should each child get its own audit entry?
- **Bulk operations**: If we add bulk mutations, should they create one audit entry or many?
- **Failed mutations**: Should failed attempts be logged? (Recommended: No, to avoid noise)
- **Concurrent modifications**: Audit log should capture point-in-time state, not affected by race conditions.

---

## Requirements

### Functional Requirements

- **FR-001**: System MUST record `createdByUserId` on Definition, Run, Tag, LlmModel, ApiKey, Experiment, Cohort entities at creation time.
- **FR-002**: System MUST record `deletedByUserId` on entities that support soft delete (Definition, Run, Scenario, DefinitionTag, AnalysisResult, Transcript) when deleted.
- **FR-003**: System MUST create an `AuditLog` entry for every successful mutation with: action, entityType, entityId, userId, timestamp, and optional metadata.
- **FR-004**: GraphQL API MUST expose `createdBy` and `deletedBy` fields on audited entity types.
- **FR-005**: GraphQL API MUST provide `auditLog` query with filters: entityType, entityId, userId, action, dateRange.
- **FR-006**: Audit log entries MUST be immutable (no updates or deletes allowed).
- **FR-007**: System MUST support pagination for audit log queries (cursor-based).
- **FR-008**: Background jobs MUST log with a system actor identifier, not null userId.

### Non-Functional Requirements

- **NFR-001**: Audit logging MUST NOT significantly impact mutation latency (<10ms overhead).
- **NFR-002**: Audit log MUST be append-only for tamper resistance.
- **NFR-003**: Audit log entries MUST be retained for at least 90 days (configurable).

---

## Success Criteria

- **SC-001**: All 27 identified mutations create audit log entries automatically.
- **SC-002**: Users can answer "who created/deleted this?" for any Definition or Run via API.
- **SC-003**: Audit log queries return results in <500ms for typical filters.
- **SC-004**: Zero audit gaps - every mutation that modifies data is logged.

---

## Key Entities

### AuditLog (New Table)

```prisma
model AuditLog {
  id          String   @id @default(cuid())
  action      String   // CREATE, UPDATE, DELETE, ACTION
  entityType  String   // Definition, Run, Tag, etc.
  entityId    String   // ID of affected entity
  userId      String?  // User who performed action (null for system)
  metadata    Json?    // Optional context (e.g., changes made)
  createdAt   DateTime @default(now())

  user        User?    @relation(fields: [userId], references: [id])

  @@index([entityType, entityId])
  @@index([userId])
  @@index([createdAt])
  @@index([action])
  @@map("audit_logs")
}
```

### Schema Additions to Existing Tables

```prisma
// Add to Definition
createdByUserId  String?  @map("created_by_user_id")
deletedByUserId  String?  @map("deleted_by_user_id")
createdBy        User?    @relation("DefinitionCreator", fields: [createdByUserId], references: [id])
deletedBy        User?    @relation("DefinitionDeleter", fields: [deletedByUserId], references: [id])

// Add to Run (already has userId flow, formalize it)
createdByUserId  String?  @map("created_by_user_id")
deletedByUserId  String?  @map("deleted_by_user_id")

// Add to Tag
createdByUserId  String?  @map("created_by_user_id")

// Add to LlmModel
createdByUserId  String?  @map("created_by_user_id")
```

---

## Assumptions

1. **Authentication will be required** for all mutations that modify data (some currently don't require it).
2. **Existing data** will have null `createdByUserId` fields (we won't backfill).
3. **Audit log retention** of 90 days is sufficient for compliance needs.
4. **Metadata field** will store JSON with mutation-specific context (not full before/after snapshots).
5. **MCP API** mutations should also be audited (they share the same GraphQL layer).

---

## Implementation Approach Options

### Option A: Middleware/Plugin Pattern (Recommended)
Add a Pothos plugin or GraphQL middleware that intercepts all mutations and logs automatically.

**Pros**: Single implementation, automatic coverage for new mutations
**Cons**: Less granular control per mutation

### Option B: Manual Logging in Each Mutation
Add explicit audit logging calls in each mutation resolver.

**Pros**: Full control over what gets logged
**Cons**: Easy to forget, inconsistent implementation, more code

### Option C: Database Triggers
Use PostgreSQL triggers to capture changes.

**Pros**: Cannot be bypassed, captures all changes
**Cons**: Harder to test, no access to request context (userId), complex maintenance

**Recommendation**: Option A with Option B fallback for special cases.

---

## Next Steps

1. Review this spec and confirm requirements
2. Decide on authentication requirements for unauthenticated mutations
3. Proceed to `feature-plan` skill for technical implementation plan
