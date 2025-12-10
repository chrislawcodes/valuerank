# Data Model: Comprehensive Audit Logging

## Entities

### Entity 1: AuditLog (New)

**Purpose**: Generic audit trail capturing all mutations performed on any entity in the system.

**Storage**: `audit_logs` table

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String | PRIMARY KEY, cuid() | Unique identifier |
| action | String | NOT NULL | Action type: CREATE, UPDATE, DELETE, ACTION |
| entityType | String | NOT NULL | Entity name: Definition, Run, Tag, etc. |
| entityId | String | NOT NULL | ID of the affected entity |
| userId | String | NULLABLE, FK→users | User who performed action (null for system) |
| metadata | Json | NULLABLE | Additional context (mutation args, changes) |
| createdAt | DateTime | NOT NULL, DEFAULT now() | When the action occurred |

**Indexes**:
- `(entityType, entityId)` - Query history of specific entity
- `(userId)` - Query all actions by user
- `(createdAt)` - Query by time range
- `(action)` - Filter by action type

**Relationships**:
- `user` → `User` (optional, for non-system actions)

**Validation Rules**:
- `action` must be one of: CREATE, UPDATE, DELETE, ACTION
- `entityType` should match a known model name
- `entityId` should be a valid cuid

---

### Entity 2: Definition (Modified)

**New Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| createdByUserId | String | NULLABLE, FK→users | User who created this definition |
| deletedByUserId | String | NULLABLE, FK→users | User who deleted this definition |

**New Relationships**:
- `createdBy` → `User` (DefinitionCreator)
- `deletedBy` → `User` (DefinitionDeleter)

---

### Entity 3: Run (Modified)

**New Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| createdByUserId | String | NULLABLE, FK→users | User who started this run |
| deletedByUserId | String | NULLABLE, FK→users | User who deleted this run |

**New Relationships**:
- `createdBy` → `User` (RunCreator)
- `deletedBy` → `User` (RunDeleter)

---

### Entity 4: Tag (Modified)

**New Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| createdByUserId | String | NULLABLE, FK→users | User who created this tag |

**New Relationships**:
- `createdBy` → `User` (TagCreator)

---

### Entity 5: LlmModel (Modified)

**New Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| createdByUserId | String | NULLABLE, FK→users | User who created this model |

**New Relationships**:
- `createdBy` → `User` (LlmModelCreator)

---

## Prisma Schema Changes

```prisma
// ============================================================================
// AUDIT LOGGING
// ============================================================================

model AuditLog {
  id          String   @id @default(cuid())
  action      String   // CREATE, UPDATE, DELETE, ACTION
  entityType  String   @map("entity_type")
  entityId    String   @map("entity_id")
  userId      String?  @map("user_id")
  metadata    Json?    @db.JsonB
  createdAt   DateTime @default(now()) @map("created_at")

  user User? @relation(fields: [userId], references: [id])

  @@index([entityType, entityId])
  @@index([userId])
  @@index([createdAt])
  @@index([action])
  @@map("audit_logs")
}

// ============================================================================
// MODIFICATIONS TO EXISTING MODELS
// ============================================================================

// Add to User model - new relations
model User {
  // ... existing fields ...

  // Audit relations
  auditLogs           AuditLog[]
  createdDefinitions  Definition[] @relation("DefinitionCreator")
  deletedDefinitions  Definition[] @relation("DefinitionDeleter")
  createdRuns         Run[]        @relation("RunCreator")
  deletedRuns         Run[]        @relation("RunDeleter")
  createdTags         Tag[]        @relation("TagCreator")
  createdLlmModels    LlmModel[]   @relation("LlmModelCreator")
}

// Add to Definition model
model Definition {
  // ... existing fields ...

  // Audit fields
  createdByUserId String? @map("created_by_user_id")
  deletedByUserId String? @map("deleted_by_user_id")

  // Audit relations
  createdBy User? @relation("DefinitionCreator", fields: [createdByUserId], references: [id])
  deletedBy User? @relation("DefinitionDeleter", fields: [deletedByUserId], references: [id])

  // ... existing relations ...
}

// Add to Run model
model Run {
  // ... existing fields ...

  // Audit fields
  createdByUserId String? @map("created_by_user_id")
  deletedByUserId String? @map("deleted_by_user_id")

  // Audit relations
  createdBy User? @relation("RunCreator", fields: [createdByUserId], references: [id])
  deletedBy User? @relation("RunDeleter", fields: [deletedByUserId], references: [id])

  // ... existing relations ...
}

// Add to Tag model
model Tag {
  // ... existing fields ...

  // Audit fields
  createdByUserId String? @map("created_by_user_id")

  // Audit relations
  createdBy User? @relation("TagCreator", fields: [createdByUserId], references: [id])

  // ... existing relations ...
}

// Add to LlmModel model
model LlmModel {
  // ... existing fields ...

  // Audit fields
  createdByUserId String? @map("created_by_user_id")

  // Audit relations
  createdBy User? @relation("LlmModelCreator", fields: [createdByUserId], references: [id])

  // ... existing relations ...
}
```

---

## Type Definitions

### Database Types

```typescript
// packages/db/src/types/audit.ts

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'ACTION';

export type AuditableEntityType =
  | 'Definition'
  | 'Run'
  | 'Tag'
  | 'DefinitionTag'
  | 'LlmModel'
  | 'LlmProvider'
  | 'SystemSetting'
  | 'ApiKey'
  | 'AnalysisResult'
  | 'System'; // For queue operations

export type AuditLogDB = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

export type CreateAuditLogInput = {
  action: AuditAction;
  entityType: AuditableEntityType;
  entityId: string;
  userId: string | null;
  metadata?: Record<string, unknown>;
};
```

### API Types

```typescript
// apps/api/src/services/audit/types.ts

export type AuditLogFilters = {
  entityType?: string;
  entityId?: string;
  userId?: string;
  action?: AuditAction;
  from?: Date;
  to?: Date;
};

export type AuditLogPagination = {
  first?: number;
  after?: string;
};

export type AuditConfig<TArgs = unknown, TResult = unknown> = {
  action: AuditAction;
  entityType: AuditableEntityType;
  extractEntityId?: (args: TArgs, result: TResult) => string;
  metadata?: (args: TArgs, result: TResult) => Record<string, unknown>;
};
```

---

## Migration SQL

```sql
-- Migration: add_audit_logging

-- Create audit_logs table
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "user_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- Add indexes
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- Add foreign key
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add audit columns to definitions
ALTER TABLE "definitions" ADD COLUMN "created_by_user_id" TEXT;
ALTER TABLE "definitions" ADD COLUMN "deleted_by_user_id" TEXT;
ALTER TABLE "definitions" ADD CONSTRAINT "definitions_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "definitions" ADD CONSTRAINT "definitions_deleted_by_user_id_fkey"
    FOREIGN KEY ("deleted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add audit columns to runs
ALTER TABLE "runs" ADD COLUMN "created_by_user_id" TEXT;
ALTER TABLE "runs" ADD COLUMN "deleted_by_user_id" TEXT;
ALTER TABLE "runs" ADD CONSTRAINT "runs_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "runs" ADD CONSTRAINT "runs_deleted_by_user_id_fkey"
    FOREIGN KEY ("deleted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add audit columns to tags
ALTER TABLE "tags" ADD COLUMN "created_by_user_id" TEXT;
ALTER TABLE "tags" ADD CONSTRAINT "tags_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add audit columns to llm_models
ALTER TABLE "llm_models" ADD COLUMN "created_by_user_id" TEXT;
ALTER TABLE "llm_models" ADD CONSTRAINT "llm_models_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

---

## Query Patterns

### Get entity history

```typescript
const history = await db.auditLog.findMany({
  where: {
    entityType: 'Definition',
    entityId: definitionId,
  },
  orderBy: { createdAt: 'desc' },
  include: { user: true },
});
```

### Get user activity

```typescript
const activity = await db.auditLog.findMany({
  where: {
    userId: userId,
    createdAt: {
      gte: startDate,
      lte: endDate,
    },
  },
  orderBy: { createdAt: 'desc' },
  take: 50,
});
```

### Get who created a definition (fast path)

```typescript
const definition = await db.definition.findUnique({
  where: { id: definitionId },
  include: { createdBy: true },
});
// definition.createdBy is the User who created it
```
