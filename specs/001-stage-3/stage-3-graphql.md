# Stage 3: GraphQL API Foundation

> Part of [High-Level Implementation Plan](./high-level.md)
>
> Must adhere to [Project Constitution](../CLAUDE.md)

**Goal:** Set up the GraphQL server with Pothos (code-first), core types, and basic CRUD operations.

---

## Deliverables Summary

| Deliverable | Description |
|-------------|-------------|
| GraphQL Yoga server | GraphQL endpoint at `POST /graphql` in `apps/api` |
| Pothos schema builder | Code-first schema with TypeScript integration |
| Core GraphQL types | Definition, Run, Transcript, Scenario, Experiment |
| DataLoaders | N+1 prevention for related entity queries |
| Basic queries | `definition`, `definitions`, `run`, `runs` |
| Basic mutations | `createDefinition`, `forkDefinition` |
| GraphQL playground | Interactive explorer in development mode |

---

## User Scenarios & Testing

### User Story 1 - Query Single Definition (Priority: P1)

As a researcher, I need to fetch a single definition by ID with its relationships so that I can view scenario details and their version lineage.

**Why this priority**: Single-entity queries are the foundation for all detail views. Without this, users cannot view or work with individual definitions.

**Independent Test**: Query a definition by ID and verify all fields including parent/children relationships are returned.

**Acceptance Scenarios**:

1. **Given** a definition exists, **When** querying by ID, **Then** all scalar fields (id, name, content, createdAt) are returned
2. **Given** a definition with a parent, **When** querying with parent field, **Then** parent definition is resolved
3. **Given** a definition with children, **When** querying with children field, **Then** all child definitions are returned
4. **Given** a definition with runs, **When** querying with runs field, **Then** associated runs are returned
5. **Given** a non-existent ID, **When** querying, **Then** null is returned (not an error)

---

### User Story 2 - List Definitions with Filtering (Priority: P1)

As a researcher, I need to list definitions with optional filters so that I can browse and find scenarios to work with.

**Why this priority**: Listing is essential for the definition library UI. Users need to browse before selecting.

**Independent Test**: Query definitions list with various filter combinations and verify correct results.

**Acceptance Scenarios**:

1. **Given** multiple definitions, **When** querying without filters, **Then** all definitions returned (with default limit)
2. **Given** a definition tree, **When** querying with `rootOnly: true`, **Then** only definitions with null parent_id returned
3. **Given** definitions, **When** querying with `limit: 5`, **Then** at most 5 definitions returned
4. **Given** definitions, **When** querying with `offset: 10`, **Then** pagination works correctly
5. **Given** definitions with various dates, **When** querying, **Then** results ordered by createdAt descending (newest first)

---

### User Story 3 - Query Single Run with Progress (Priority: P1)

As a researcher, I need to fetch a run by ID with its progress and transcripts so that I can monitor execution and view results.

**Why this priority**: Run detail view is critical for monitoring active runs and reviewing completed results.

**Independent Test**: Query a run by ID and verify all fields including nested transcripts are returned correctly.

**Acceptance Scenarios**:

1. **Given** a run exists, **When** querying by ID, **Then** all scalar fields (id, status, config, progress) are returned
2. **Given** a run with transcripts, **When** querying with transcripts field, **Then** transcripts are returned
3. **Given** a run, **When** querying transcripts with model filter, **Then** only transcripts for that model returned
4. **Given** a run linked to definition, **When** querying definition field, **Then** definition is resolved
5. **Given** a run in experiment, **When** querying experiment field, **Then** experiment is resolved

---

### User Story 4 - List Runs with Filtering (Priority: P1)

As a researcher, I need to list runs with filters (by definition, status, experiment) so that I can find and compare runs.

**Why this priority**: Run dashboard requires listing with filters. Critical for the runs overview page.

**Independent Test**: Query runs list with various filter combinations and verify correct results.

**Acceptance Scenarios**:

1. **Given** multiple runs, **When** querying without filters, **Then** all runs returned with default limit
2. **Given** runs for different definitions, **When** filtering by definitionId, **Then** only matching runs returned
3. **Given** runs with various statuses, **When** filtering by status, **Then** only matching status runs returned
4. **Given** runs in experiments, **When** filtering by experimentId, **Then** only matching runs returned
5. **Given** many runs, **When** using limit/offset, **Then** pagination works correctly

---

### User Story 5 - Create Definition (Priority: P1)

As a researcher, I need to create a new definition so that I can add scenarios to evaluate.

**Why this priority**: Creating definitions is the starting point for all evaluation work. Users need to author before running.

**Independent Test**: Create a definition via mutation and verify it persists correctly in the database.

**Acceptance Scenarios**:

1. **Given** valid input, **When** creating definition, **Then** definition created with generated ID
2. **Given** input with name and content, **When** creating, **Then** both fields stored correctly
3. **Given** JSONB content, **When** creating, **Then** content stored and retrievable as JSON
4. **Given** content without schema_version, **When** creating, **Then** schema_version:1 added automatically
5. **Given** missing required fields, **When** creating, **Then** validation error returned

---

### User Story 6 - Fork Definition (Priority: P1)

As a researcher, I need to fork an existing definition so that I can iterate on scenarios while preserving history.

**Why this priority**: Forking enables the core version control workflow. Essential for iterative scenario development.

**Independent Test**: Fork a definition and verify parent-child relationship is established correctly.

**Acceptance Scenarios**:

1. **Given** existing definition, **When** forking, **Then** new definition created with parent_id set
2. **Given** fork with new name, **When** forking, **Then** new definition has provided name
3. **Given** fork without changes, **When** forking, **Then** content copied from parent
4. **Given** fork with content changes, **When** forking, **Then** new content used (not parent's)
5. **Given** non-existent parent ID, **When** forking, **Then** NotFoundError returned
6. **Given** a fork, **When** querying parent's children, **Then** fork appears in children list

---

### User Story 7 - DataLoader N+1 Prevention (Priority: P2)

As a developer, I need DataLoaders to batch and cache database queries so that nested GraphQL queries don't cause N+1 query problems.

**Why this priority**: Performance is critical for nested queries. Without DataLoaders, listing 20 runs with their definitions would make 21 queries instead of 2.

**Independent Test**: Execute a nested query and verify only batched queries are made (inspect logs or query count).

**Acceptance Scenarios**:

1. **Given** query for 10 runs with definitions, **When** executing, **Then** only 2 DB queries made (runs + definitions)
2. **Given** same definition requested multiple times, **When** resolving, **Then** only one DB query made
3. **Given** nested query (runs → definition → parent), **When** executing, **Then** queries batched per level
4. **Given** new request, **When** executing, **Then** DataLoader cache reset (per-request scoping)

---

### User Story 8 - GraphQL Playground (Priority: P3)

As a developer, I need an interactive GraphQL playground so that I can explore the schema and test queries during development.

**Why this priority**: Improves developer experience but not required for core functionality. Schema introspection also enables LLM consumption.

**Independent Test**: Access GraphQL playground in browser and execute a test query.

**Acceptance Scenarios**:

1. **Given** development environment, **When** accessing /graphql in browser, **Then** playground UI displayed
2. **Given** playground, **When** typing query, **Then** autocomplete works from schema
3. **Given** playground, **When** viewing docs, **Then** all types and fields documented
4. **Given** production environment, **When** accessing /graphql in browser, **Then** playground disabled

---

## Edge Cases

- **Empty database**: Queries should return empty arrays, not errors
- **Null parent_id**: Root definitions have NULL parent_id - handle in parent field resolver
- **Self-referential loops**: DataLoaders must handle circular references gracefully
- **Large content JSONB**: No artificial limits on definition content size
- **Invalid JSON in mutations**: Validate and return clear error for malformed JSON
- **Concurrent mutations**: Two forks of same parent should both succeed
- **Unicode in names/content**: All UTF-8 characters must be supported
- **Empty arrays vs null**: `children: []` for no children, not `children: null`
- **Deep nesting**: Limit query depth to prevent abuse (e.g., max 10 levels)
- **Missing optional relations**: Run without experiment should return `experiment: null`
- **DataLoader key mismatch**: Handle case where DB returns fewer rows than requested
- **Schema introspection**: Must be enabled for LLM consumption via MCP

---

## Requirements

### Functional Requirements

- **FR-001**: System MUST expose GraphQL endpoint at `POST /graphql`
- **FR-002**: System MUST use Pothos for code-first schema definition
- **FR-003**: System MUST provide Definition type with all Prisma fields exposed
- **FR-004**: System MUST provide Run type with status, progress, and relationships
- **FR-005**: System MUST provide Transcript type with model version fields
- **FR-006**: System MUST implement `definition(id: ID!)` query returning nullable Definition
- **FR-007**: System MUST implement `definitions(...)` query with pagination and filters
- **FR-008**: System MUST implement `run(id: ID!)` query returning nullable Run
- **FR-009**: System MUST implement `runs(...)` query with pagination and filters
- **FR-010**: System MUST implement `createDefinition` mutation with input validation
- **FR-011**: System MUST implement `forkDefinition` mutation establishing parent link
- **FR-012**: System MUST use DataLoaders for all relationship resolutions
- **FR-013**: System MUST provide interactive playground in development mode
- **FR-014**: Schema introspection MUST be enabled for LLM/MCP consumption
- **FR-015**: Mutations MUST use Prisma transactions for multi-step operations (per CLAUDE.md)
- **FR-016**: All resolvers MUST use createLogger for logging, never console.log (per CLAUDE.md)
- **FR-017**: All code MUST pass lint with no `any` types (per CLAUDE.md)
- **FR-018**: Errors MUST use AppError, NotFoundError, ValidationError classes (per CLAUDE.md)

---

## Success Criteria

- **SC-001**: `POST /graphql` accepts and responds to valid GraphQL queries
- **SC-002**: Query `definition(id: "...")` returns correct definition with nested fields
- **SC-003**: Query `definitions(limit: 10)` returns paginated list
- **SC-004**: Query `run(id: "...")` returns run with transcripts and definition
- **SC-005**: Mutation `createDefinition` persists definition and returns it
- **SC-006**: Mutation `forkDefinition` creates child definition with parent link
- **SC-007**: Nested queries for 20 items with relations make ≤3 DB queries (DataLoader batching)
- **SC-008**: GraphQL playground accessible at `/graphql` in development
- **SC-009**: Schema introspection query returns full schema (for LLM consumption)
- **SC-010**: All resolvers have unit tests with 80%+ coverage

---

## Technical Specification

### Folder Structure

```
apps/api/src/
├── graphql/
│   ├── index.ts              # GraphQL Yoga server setup
│   ├── builder.ts            # Pothos schema builder configuration
│   ├── context.ts            # Request context (DataLoaders, auth)
│   ├── types/
│   │   ├── index.ts          # Re-exports all types
│   │   ├── definition.ts     # Definition type and resolvers
│   │   ├── run.ts            # Run type and resolvers
│   │   ├── transcript.ts     # Transcript type and resolvers
│   │   ├── scenario.ts       # Scenario type and resolvers
│   │   ├── experiment.ts     # Experiment type and resolvers
│   │   ├── enums.ts          # RunStatus, AnalysisStatus enums
│   │   └── scalars.ts        # DateTime, JSON scalars
│   ├── queries/
│   │   ├── index.ts          # Re-exports all queries
│   │   ├── definition.ts     # definition, definitions queries
│   │   └── run.ts            # run, runs queries
│   ├── mutations/
│   │   ├── index.ts          # Re-exports all mutations
│   │   └── definition.ts     # createDefinition, forkDefinition
│   └── dataloaders/
│       ├── index.ts          # DataLoader factory
│       ├── definition.ts     # Definition DataLoader
│       ├── run.ts            # Run DataLoader
│       └── transcript.ts     # Transcript DataLoader
├── server.ts                 # Updated to mount GraphQL
└── ... (existing files)
```

### Package Dependencies

Add to `apps/api/package.json`:

```json
{
  "dependencies": {
    "graphql": "^16.8.1",
    "graphql-yoga": "^5.1.1",
    "@pothos/core": "^3.41.0",
    "@pothos/plugin-prisma": "^3.65.0",
    "@pothos/plugin-validation": "^3.10.1",
    "dataloader": "^2.2.2"
  },
  "devDependencies": {
    "@graphql-codegen/cli": "^5.0.0",
    "@graphql-codegen/typescript": "^4.0.1"
  }
}
```

### GraphQL Schema (Types)

```graphql
scalar DateTime
scalar JSON

enum RunStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
  CANCELLED
}

type Definition {
  id: ID!
  name: String!
  content: JSON!
  parentId: ID
  parent: Definition
  children: [Definition!]!
  runs: [Run!]!
  scenarios: [Scenario!]!
  createdAt: DateTime!
  updatedAt: DateTime!
  lastAccessedAt: DateTime
}

type Run {
  id: ID!
  status: RunStatus!
  config: JSON!
  progress: JSON
  definition: Definition!
  experiment: Experiment
  transcripts(model: String, limit: Int): [Transcript!]!
  startedAt: DateTime
  completedAt: DateTime
  createdAt: DateTime!
  updatedAt: DateTime!
}

type Transcript {
  id: ID!
  modelId: String!
  modelVersion: String
  content: JSON!
  turnCount: Int!
  tokenCount: Int!
  durationMs: Int!
  run: Run!
  scenario: Scenario
  definitionSnapshot: JSON
  createdAt: DateTime!
}

type Scenario {
  id: ID!
  name: String!
  content: JSON!
  definition: Definition!
  transcripts: [Transcript!]!
  createdAt: DateTime!
}

type Experiment {
  id: ID!
  name: String!
  hypothesis: String
  analysisPlan: JSON
  runs: [Run!]!
  createdAt: DateTime!
  updatedAt: DateTime!
}
```

### GraphQL Schema (Operations)

```graphql
type Query {
  # Single entity queries
  definition(id: ID!): Definition
  run(id: ID!): Run

  # List queries with filtering
  definitions(
    rootOnly: Boolean
    limit: Int = 20
    offset: Int = 0
  ): [Definition!]!

  runs(
    definitionId: ID
    experimentId: ID
    status: RunStatus
    limit: Int = 20
    offset: Int = 0
  ): [Run!]!
}

type Mutation {
  createDefinition(input: CreateDefinitionInput!): Definition!
  forkDefinition(input: ForkDefinitionInput!): Definition!
}

input CreateDefinitionInput {
  name: String!
  content: JSON!
}

input ForkDefinitionInput {
  parentId: ID!
  name: String!
  content: JSON
}
```

### Pothos Builder Configuration

```typescript
// apps/api/src/graphql/builder.ts
import SchemaBuilder from '@pothos/core';
import PrismaPlugin from '@pothos/plugin-prisma';
import ValidationPlugin from '@pothos/plugin-validation';
import type PrismaTypes from '@pothos/plugin-prisma/generated';
import { db } from '@valuerank/db';
import type { Context } from './context';

export const builder = new SchemaBuilder<{
  Context: Context;
  PrismaTypes: PrismaTypes;
  Scalars: {
    DateTime: {
      Input: Date;
      Output: Date;
    };
    JSON: {
      Input: unknown;
      Output: unknown;
    };
  };
}>({
  plugins: [PrismaPlugin, ValidationPlugin],
  prisma: {
    client: db,
    filterConnectionTotalCount: true,
  },
  validationOptions: {
    validationError: (zodError) => {
      return new ValidationError('Invalid input', zodError.errors);
    },
  },
});

// Register scalars
builder.scalarType('DateTime', {
  serialize: (value) => value.toISOString(),
  parseValue: (value) => new Date(value as string),
});

builder.scalarType('JSON', {
  serialize: (value) => value,
  parseValue: (value) => value,
});
```

### Context with DataLoaders

```typescript
// apps/api/src/graphql/context.ts
import type { Request } from 'express';
import { createDefinitionLoader, createRunLoader, createTranscriptLoader } from './dataloaders';
import type { Logger } from '@valuerank/shared';

export interface Context {
  req: Request;
  log: Logger;
  loaders: {
    definition: ReturnType<typeof createDefinitionLoader>;
    run: ReturnType<typeof createRunLoader>;
    transcript: ReturnType<typeof createTranscriptLoader>;
  };
}

export function createContext(req: Request): Context {
  return {
    req,
    log: req.log,
    loaders: {
      definition: createDefinitionLoader(),
      run: createRunLoader(),
      transcript: createTranscriptLoader(),
    },
  };
}
```

### DataLoader Implementation

```typescript
// apps/api/src/graphql/dataloaders/definition.ts
import DataLoader from 'dataloader';
import { db } from '@valuerank/db';
import type { Definition } from '@prisma/client';

export function createDefinitionLoader() {
  return new DataLoader<string, Definition | null>(async (ids) => {
    const definitions = await db.definition.findMany({
      where: { id: { in: [...ids] } },
    });

    const definitionMap = new Map(definitions.map((d) => [d.id, d]));
    return ids.map((id) => definitionMap.get(id) ?? null);
  });
}
```

### Example Type Definition

```typescript
// apps/api/src/graphql/types/definition.ts
import { builder } from '../builder';
import { db } from '@valuerank/db';

builder.prismaObject('Definition', {
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    content: t.expose('content', { type: 'JSON' }),
    parentId: t.exposeID('parentId', { nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    lastAccessedAt: t.expose('lastAccessedAt', { type: 'DateTime', nullable: true }),

    // Relations via DataLoader
    parent: t.field({
      type: 'Definition',
      nullable: true,
      resolve: async (definition, _args, ctx) => {
        if (!definition.parentId) return null;
        return ctx.loaders.definition.load(definition.parentId);
      },
    }),

    children: t.field({
      type: ['Definition'],
      resolve: async (definition) => {
        return db.definition.findMany({
          where: { parentId: definition.id },
          orderBy: { createdAt: 'desc' },
        });
      },
    }),

    runs: t.field({
      type: ['Run'],
      resolve: async (definition) => {
        return db.run.findMany({
          where: { definitionId: definition.id },
          orderBy: { createdAt: 'desc' },
        });
      },
    }),
  }),
});
```

### Example Query

```typescript
// apps/api/src/graphql/queries/definition.ts
import { builder } from '../builder';
import { db } from '@valuerank/db';

builder.queryField('definition', (t) =>
  t.prismaField({
    type: 'Definition',
    nullable: true,
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      ctx.log.debug({ definitionId: args.id }, 'Fetching definition');
      return db.definition.findUnique({
        ...query,
        where: { id: args.id },
      });
    },
  })
);

builder.queryField('definitions', (t) =>
  t.prismaField({
    type: ['Definition'],
    args: {
      rootOnly: t.arg.boolean({ defaultValue: false }),
      limit: t.arg.int({ defaultValue: 20 }),
      offset: t.arg.int({ defaultValue: 0 }),
    },
    resolve: async (query, _root, args, ctx) => {
      ctx.log.debug({ args }, 'Listing definitions');
      return db.definition.findMany({
        ...query,
        where: args.rootOnly ? { parentId: null } : undefined,
        take: args.limit ?? 20,
        skip: args.offset ?? 0,
        orderBy: { createdAt: 'desc' },
      });
    },
  })
);
```

### Example Mutation

```typescript
// apps/api/src/graphql/mutations/definition.ts
import { builder } from '../builder';
import { db } from '@valuerank/db';
import { NotFoundError, ValidationError } from '@valuerank/shared';

const CreateDefinitionInput = builder.inputType('CreateDefinitionInput', {
  fields: (t) => ({
    name: t.string({ required: true }),
    content: t.field({ type: 'JSON', required: true }),
  }),
});

const ForkDefinitionInput = builder.inputType('ForkDefinitionInput', {
  fields: (t) => ({
    parentId: t.id({ required: true }),
    name: t.string({ required: true }),
    content: t.field({ type: 'JSON' }),
  }),
});

builder.mutationField('createDefinition', (t) =>
  t.prismaField({
    type: 'Definition',
    args: {
      input: t.arg({ type: CreateDefinitionInput, required: true }),
    },
    resolve: async (query, _root, { input }, ctx) => {
      ctx.log.info({ name: input.name }, 'Creating definition');

      // Ensure schema_version is set
      const content = ensureSchemaVersion(input.content);

      return db.definition.create({
        ...query,
        data: {
          name: input.name,
          content,
        },
      });
    },
  })
);

builder.mutationField('forkDefinition', (t) =>
  t.prismaField({
    type: 'Definition',
    args: {
      input: t.arg({ type: ForkDefinitionInput, required: true }),
    },
    resolve: async (query, _root, { input }, ctx) => {
      ctx.log.info({ parentId: input.parentId, name: input.name }, 'Forking definition');

      const parent = await db.definition.findUnique({
        where: { id: input.parentId },
      });

      if (!parent) {
        throw new NotFoundError('Definition', input.parentId);
      }

      const content = input.content
        ? ensureSchemaVersion(input.content)
        : parent.content;

      return db.definition.create({
        ...query,
        data: {
          name: input.name,
          content,
          parentId: input.parentId,
        },
      });
    },
  })
);

function ensureSchemaVersion(content: unknown): unknown {
  if (typeof content !== 'object' || content === null) {
    throw new ValidationError('Content must be an object');
  }
  const obj = content as Record<string, unknown>;
  if (!('schema_version' in obj)) {
    return { schema_version: 1, ...obj };
  }
  return content;
}
```

### GraphQL Yoga Server Setup

```typescript
// apps/api/src/graphql/index.ts
import { createYoga } from 'graphql-yoga';
import { builder } from './builder';
import { createContext } from './context';

// Import all types and operations to register them
import './types';
import './queries';
import './mutations';

export const schema = builder.toSchema();

export const yoga = createYoga({
  schema,
  context: ({ request }) => createContext(request),
  graphiql: process.env.NODE_ENV === 'development',
  logging: false, // Use our logger instead
});
```

### Server Integration

```typescript
// apps/api/src/server.ts (additions)
import { yoga } from './graphql';

// In createServer(), add before routes:
app.use('/graphql', yoga);
```

---

## Constitution Compliance

**Status**: PASS

Validated against [CLAUDE.md](../CLAUDE.md):

| Requirement | Implementation |
|-------------|----------------|
| **No `any` Types** | Pothos provides full type safety; `unknown` for JSON scalars; FR-017 |
| **TypeScript Strict Mode** | Pothos integrates with strict tsconfig |
| **Test Coverage 80%** | Resolvers and DataLoaders have unit tests |
| **No console.log** | All resolvers use ctx.log from context; FR-016 |
| **File Size < 400 lines** | Types/queries/mutations split into separate files |
| **Structured Logging** | Use `ctx.log.info({ data }, 'message')` pattern |
| **Custom Error Classes** | NotFoundError, ValidationError in mutations; FR-018 |
| **Prisma Transactions** | Multi-step mutations use $transaction; FR-015 |

---

## Dependencies

- **Stage 1** (complete): Express server, logging, error handling
- **Stage 2** (complete): Prisma schema with all entity types
- **Stage 2b** (complete): Transcript versioning fields (modelId, modelVersion)

---

## Next Steps

1. Review this spec for accuracy
2. When ready for technical planning, invoke the **feature-plan** skill
3. Or ask clarifying questions if requirements need refinement
