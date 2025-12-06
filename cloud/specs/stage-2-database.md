# Stage 2: Database Schema & Migrations

> Part of [High-Level Implementation Plan](./high-level.md)
>
> Must adhere to [Project Constitution](../CLAUDE.md)

**Goal:** Implement the core PostgreSQL schema with Prisma, including all tables needed for MVP.

---

## User Scenarios & Testing

### User Story 1 - Core Data Tables (Priority: P1)

As a developer, I need the foundational database tables (users, definitions, runs, transcripts) so that the application can store and retrieve core domain data.

**Why this priority**: These tables are blocking for all subsequent features. Without them, no data persistence is possible.

**Independent Test**: Create a definition, start a run, and store a transcript via direct database operations.

**Acceptance Scenarios**:

1. **Given** a clean database, **When** migrations run, **Then** all core tables exist with correct columns and constraints
2. **Given** a users table, **When** creating a user with email/password, **Then** the user is stored with hashed password
3. **Given** definitions table, **When** creating a definition with content JSONB, **Then** the content is stored and retrievable
4. **Given** runs table, **When** creating a run linked to a definition, **Then** foreign key relationship is enforced
5. **Given** transcripts table, **When** storing a transcript with metrics, **Then** all fields (turn_count, token_count, duration_ms) are persisted

---

### User Story 2 - Definition Versioning & Ancestry (Priority: P1)

As a researcher, I need to fork definitions and track their lineage so that I can iterate on evaluation scenarios while preserving history.

**Why this priority**: Version control is fundamental to the research workflow. Comparing results across definition versions is a core use case.

**Independent Test**: Create a definition tree (parent → child → grandchild) and query the full ancestry chain.

**Acceptance Scenarios**:

1. **Given** an existing definition, **When** forking with parent_id, **Then** the new definition links to parent
2. **Given** a definition with ancestors, **When** querying ancestry via recursive CTE, **Then** full chain is returned in correct order
3. **Given** a definition with descendants, **When** querying descendants, **Then** all children/grandchildren are returned
4. **Given** a definition tree, **When** querying runs across the tree, **Then** all runs using any tree member are returned

---

### User Story 3 - JSONB Schema Versioning (Priority: P1)

As a developer, I need JSONB content to include schema versions so that data can be migrated at read-time as the schema evolves.

**Why this priority**: Without schema versioning, future changes to definition content structure would break existing data.

**Independent Test**: Store content with schema_version=1, modify the expected schema, read back and verify migration runs.

**Acceptance Scenarios**:

1. **Given** definition content without schema_version, **When** reading, **Then** content is migrated to current version
2. **Given** content with schema_version=1, **When** reading with current schema v1, **Then** no migration occurs
3. **Given** content with unknown schema_version, **When** reading, **Then** appropriate error is thrown
4. **Given** analysis results with versioned output, **When** reading, **Then** schema version is respected

---

### User Story 4 - Authentication Tables (Priority: P2)

As an admin, I need user accounts and API keys so that access can be controlled and tracked.

**Why this priority**: Auth is required before any protected endpoints, but basic operations can be tested without auth during development.

**Independent Test**: Create a user, generate an API key, verify key lookup works.

**Acceptance Scenarios**:

1. **Given** a new user email, **When** creating user, **Then** user is created with unique ID
2. **Given** a user, **When** generating API key, **Then** key is stored with hash (not plaintext)
3. **Given** an API key hash, **When** looking up by prefix, **Then** correct key record is returned
4. **Given** multiple users, **When** one is deleted, **Then** cascade deletes their API keys

---

### User Story 5 - Analysis & Experiment Tables (Priority: P2)

As a researcher, I need tables for experiments, comparisons, and analysis results so that I can track hypotheses and compare runs scientifically.

**Why this priority**: These tables enable the analysis workflow but are not required for basic run execution.

**Independent Test**: Create an experiment with hypothesis, add runs, store analysis results with versioning.

**Acceptance Scenarios**:

1. **Given** an experiment definition, **When** creating, **Then** experiment is stored with hypothesis and analysis plan
2. **Given** two runs, **When** creating a comparison, **Then** delta data is stored with statistical tests
3. **Given** a run, **When** storing analysis results, **Then** input_hash and code_version are recorded
4. **Given** existing analysis, **When** re-analyzing, **Then** new version is created, old marked superseded

---

### User Story 6 - Seed Data for Development (Priority: P3)

As a developer, I need seed data so that I can test features without manually creating test data each time.

**Why this priority**: Improves developer experience but not required for core functionality.

**Independent Test**: Run seed script on empty database, verify sample data exists.

**Acceptance Scenarios**:

1. **Given** an empty database, **When** running seed script, **Then** sample users exist
2. **Given** seeded database, **When** querying definitions, **Then** sample definition tree exists
3. **Given** seeded database, **When** querying runs, **Then** sample runs with transcripts exist
4. **Given** existing data, **When** re-running seed, **Then** no duplicate data created (idempotent)

---

## Edge Cases

- **Empty parent_id**: Root definitions have NULL parent_id - queries must handle this
- **Circular references**: parent_id must not create cycles (enforce via constraint or check)
- **Self-reference**: definition.parent_id cannot equal definition.id
- **Missing schema_version**: Legacy data without version field must default to v0
- **Orphaned transcripts**: If a run is deleted, transcripts should be cascade deleted
- **Large JSONB content**: Definition content could be very large - no artificial limits
- **Concurrent migrations**: Multiple instances starting up shouldn't conflict on migrations
- **Unicode in content**: JSONB must handle all valid Unicode characters
- **Null vs empty**: Distinguish between NULL content (expired) and empty {} content
- **Duplicate email**: User creation must reject duplicate emails with clear error
- **Invalid foreign keys**: Creation with non-existent parent/definition must fail gracefully
- **Empty required fields**: Definition without content, run without definition_id must be rejected
- **Transaction rollback**: Multi-step operations (fork, run+transcripts) must be atomic

---

## Requirements

### Functional Requirements

- **FR-001**: System MUST create all core tables via Prisma migrations
- **FR-002**: System MUST enforce referential integrity via foreign keys
- **FR-003**: System MUST support recursive CTE queries for definition ancestry
- **FR-004**: System MUST store JSONB content with schema_version field
- **FR-005**: System MUST provide TypeScript types generated from Prisma schema
- **FR-006**: System MUST support cascade deletes for user → api_keys
- **FR-007**: System MUST index foreign keys for query performance
- **FR-008**: System MUST support NULL parent_id for root definitions
- **FR-009**: System MUST provide query helpers for common operations in packages/db
- **FR-010**: System MUST support idempotent seed script execution
- **FR-011**: System MUST store API key hashes, never plaintext keys
- **FR-012**: System MUST track analysis result versions with input_hash
- **FR-013**: Query helpers MUST throw NotFoundError for missing resources (per CLAUDE.md § Error Handling)
- **FR-014**: Query helpers MUST throw ValidationError for invalid inputs (per CLAUDE.md § Error Handling)
- **FR-015**: Multi-step operations MUST use Prisma transactions (per CLAUDE.md § Database Access)
- **FR-016**: Query helpers MUST use createLogger for logging, never console.log (per CLAUDE.md § Logging)
- **FR-017**: All code MUST pass lint with no `any` types (per CLAUDE.md § TypeScript Standards)

---

## Success Criteria

- **SC-001**: `npm run db:migrate` completes without errors on clean database
- **SC-002**: `npm run db:seed` populates development data in under 5 seconds
- **SC-003**: Recursive CTE ancestry query returns 10-level tree in under 100ms
- **SC-004**: TypeScript types are generated and match database schema exactly
- **SC-005**: All foreign key relationships have corresponding indexes
- **SC-006**: Query helpers handle all CRUD operations for core entities
- **SC-007**: Schema migrations are reversible (can rollback)

---

## Key Entities

Based on [Database Design](../docs/database-design.md):

| Entity | Purpose | Key Fields |
|--------|---------|------------|
| users | User accounts | id, email, password_hash |
| api_keys | MCP/API access tokens | id, user_id, key_hash, key_prefix |
| definitions | Scenario definitions with versioning | id, parent_id, name, content (JSONB) |
| runs | Pipeline execution instances | id, definition_id, status, progress (JSONB) |
| transcripts | Raw dialogue records | id, run_id, scenario_id, target_model, content |
| scenarios | Generated scenario variants | id, definition_id, content (JSONB) |
| experiments | Scientific experiment tracking | id, hypothesis, analysis_plan (JSONB) |
| run_comparisons | Delta analysis between runs | id, baseline_run_id, comparison_run_id |
| analysis_results | Versioned analysis output | id, run_id, analysis_type, input_hash |
| rubrics | Values rubric versions | id, version, content (JSONB) |

---

## Assumptions

1. **PostgreSQL 16**: Using latest stable version with full JSONB support
2. **Prisma**: Using Prisma as the ORM (established in Stage 1)
3. **Single database**: All tables in one PostgreSQL instance
4. **No multi-tenancy**: No tenant_id columns needed (per database-design.md)
5. **ltree optional**: Not using ltree extension for MVP (recursive CTEs sufficient)
6. **14-day default retention**: Transcript content retention is a runtime concern, not schema

---

## Constitution Compliance

**Status**: PASS

Validated against [CLAUDE.md](../CLAUDE.md):

| Requirement | Implementation |
|-------------|----------------|
| **No `any` Types** | Prisma generates typed client; query helpers use strict types; FR-017 |
| **TypeScript Strict Mode** | Generated types compatible with strict mode |
| **Test Coverage 80%** | Query helpers and edge cases have tests |
| **No console.log** | Query helpers use createLogger from @valuerank/shared; FR-016 |
| **File Size < 400 lines** | Schema split by domain (queries/definitions.ts, runs.ts, etc.) |
| **Structured Logging** | Use `log.info({ id }, 'message')` pattern in query helpers |
| **Custom Error Classes** | Throw NotFoundError, ValidationError from @valuerank/shared; FR-013, FR-014 |
| **Prisma Transactions** | Use $transaction for multi-step operations; FR-015 |
| **Query Helpers** | All CRUD in packages/db/src/queries/; FR-009 |

---

## Next Steps

1. Review this spec for accuracy
2. When ready for technical planning, invoke the **feature-plan** skill
3. Or ask clarifying questions if requirements need refinement
