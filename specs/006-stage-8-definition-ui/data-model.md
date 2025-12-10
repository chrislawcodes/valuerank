# Data Model: Stage 8 - Definition Management UI

## New Entities

### Entity: Tag

**Purpose**: Flexible categorization labels for organizing definitions

**Storage**: `tags` table

**Fields**:
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String (cuid) | PRIMARY KEY | Unique identifier |
| name | String | UNIQUE, NOT NULL, max 50 chars | Tag name (stored lowercase) |
| createdAt | DateTime | DEFAULT NOW() | Creation timestamp |

**Indexes**:
- Unique index on `name` (case-insensitive)

**Validation Rules**:
- Name must be 1-50 characters
- Name normalized to lowercase before storage
- Name allows: alphanumeric, hyphen, underscore
- Duplicate names rejected (case-insensitive)

---

### Entity: DefinitionTag (Junction Table)

**Purpose**: Many-to-many relationship between definitions and tags

**Storage**: `definition_tags` table

**Fields**:
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String (cuid) | PRIMARY KEY | Unique identifier |
| definitionId | String | FK → definitions.id, NOT NULL | Reference to definition |
| tagId | String | FK → tags.id, NOT NULL | Reference to tag |
| createdAt | DateTime | DEFAULT NOW() | When tag was assigned |

**Indexes**:
- Unique composite index on `(definitionId, tagId)`
- Index on `definitionId`
- Index on `tagId`

**Relationships**:
- Definition 1:N DefinitionTag (one definition can have many tags)
- Tag 1:N DefinitionTag (one tag can be on many definitions)

**Cascade Rules**:
- Delete definition → delete associated DefinitionTags
- Delete tag → delete associated DefinitionTags

---

## Prisma Schema Additions

```prisma
// Add to schema.prisma after Definition model

model Tag {
  id        String   @id @default(cuid())
  name      String   @unique
  createdAt DateTime @default(now()) @map("created_at")

  definitions DefinitionTag[]

  @@map("tags")
}

model DefinitionTag {
  id           String   @id @default(cuid())
  definitionId String   @map("definition_id")
  tagId        String   @map("tag_id")
  createdAt    DateTime @default(now()) @map("created_at")

  definition Definition @relation(fields: [definitionId], references: [id], onDelete: Cascade)
  tag        Tag        @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@unique([definitionId, tagId])
  @@index([definitionId])
  @@index([tagId])
  @@map("definition_tags")
}

// Update Definition model - add relation
model Definition {
  // ... existing fields ...

  tags DefinitionTag[]

  // ... existing relations ...
}
```

---

## Type Definitions

### TypeScript Types (Backend)

```typescript
// packages/db/src/types/tag.ts

export interface TagDB {
  id: string;
  name: string;
  created_at: Date;
}

export interface DefinitionTagDB {
  id: string;
  definition_id: string;
  tag_id: string;
  created_at: Date;
}

// API layer uses Prisma generated types directly
// import { Tag, DefinitionTag } from '@prisma/client'
```

### TypeScript Types (Frontend)

```typescript
// apps/web/src/types/tag.ts

export interface Tag {
  id: string;
  name: string;
  createdAt: string; // ISO date string from GraphQL
}

export interface DefinitionWithTags extends Definition {
  tags: Tag[];
}
```

---

## Definition Content Schema

The existing `Definition.content` JSONB field has this structure (unchanged):

```typescript
// packages/shared/src/types/definition-content.ts

export interface DefinitionContent {
  schema_version: number; // Currently 1
  preamble: string;
  template: string;
  dimensions: Dimension[];
}

export interface Dimension {
  name: string; // Placeholder name, e.g., "situation"
  levels: DimensionLevel[];
}

export interface DimensionLevel {
  score: number;
  label: string;
  description?: string;
  options?: string[]; // Alternative text values
}
```

---

## Migration

```sql
-- Migration: Add tags support for definitions
-- Migration name: 20241206_add_definition_tags

-- Create tags table
CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique index on lowercase name for case-insensitive uniqueness
CREATE UNIQUE INDEX tags_name_key ON tags (LOWER(name));

-- Create junction table for definition-tag relationships
CREATE TABLE definition_tags (
  id TEXT PRIMARY KEY,
  definition_id TEXT NOT NULL REFERENCES definitions(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Composite unique constraint
CREATE UNIQUE INDEX definition_tags_definition_id_tag_id_key
  ON definition_tags (definition_id, tag_id);

-- Query optimization indexes
CREATE INDEX definition_tags_definition_id_idx ON definition_tags (definition_id);
CREATE INDEX definition_tags_tag_id_idx ON definition_tags (tag_id);
```

---

## Query Patterns

### Get Definition with Tags

```typescript
const definition = await db.definition.findUnique({
  where: { id },
  include: {
    tags: {
      include: { tag: true }
    }
  }
});

// Transform to flat tag array
const tags = definition.tags.map(dt => dt.tag);
```

### Filter Definitions by Tags (OR logic)

```typescript
const definitions = await db.definition.findMany({
  where: {
    tags: {
      some: {
        tagId: { in: tagIds }
      }
    }
  }
});
```

### Filter Definitions by Tags (AND logic - if needed later)

```typescript
// All selected tags must be present
const definitions = await db.definition.findMany({
  where: {
    AND: tagIds.map(tagId => ({
      tags: { some: { tagId } }
    }))
  }
});
```

### Get Ancestors (Recursive CTE)

```typescript
// Via Prisma raw query for recursive ancestry
const ancestors = await db.$queryRaw`
  WITH RECURSIVE ancestry AS (
    SELECT * FROM definitions WHERE id = ${definitionId}
    UNION ALL
    SELECT d.* FROM definitions d
    JOIN ancestry a ON d.id = a.parent_id
    WHERE a.parent_id IS NOT NULL
  )
  SELECT * FROM ancestry
  WHERE id != ${definitionId}
  ORDER BY created_at ASC
`;
```

### Get Descendants (Recursive CTE)

```typescript
const descendants = await db.$queryRaw`
  WITH RECURSIVE tree AS (
    SELECT * FROM definitions WHERE id = ${definitionId}
    UNION ALL
    SELECT d.* FROM definitions d
    JOIN tree t ON d.parent_id = t.id
  )
  SELECT * FROM tree
  WHERE id != ${definitionId}
  ORDER BY created_at DESC
`;
```
