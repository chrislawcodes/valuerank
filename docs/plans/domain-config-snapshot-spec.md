# Domain Config Snapshot — Feature Specification

## Overview

This feature introduces value statement versioning, a `DomainConfigSnapshot` table that records the full domain configuration at a point in time, snapshot capture at run launch, and a settings editor panel in the `/domains/manage` UI.

## User Stories (Priority Order)

### US-1: Value Statement Versioning (High — foundation for everything else)

**As a domain admin**, I want edits to value statements to be tracked as versions, so that snapshot records remain accurate and I can see what was active when a run was launched.

**Acceptance criteria:**
- A `ValueStatementVersion` record is created each time a value statement's body changes.
- The `ValueStatement` record (concept) keeps its `token` and `domainId` stable — only the content version changes.
- `body` is moved out of `ValueStatement` and into `ValueStatementVersion`.
- The latest version's body is surfaced through the existing GraphQL API so existing clients don't break.
- Old code paths that do `db.valueStatement.create({ data: { body, token, domainId } })` are updated to also create a version record atomically (within a transaction).
- The existing `createValueStatement` and `updateValueStatement` mutations are updated: create also inserts a `ValueStatementVersion`; update creates a new version and returns the statement with latest body.
- All callsites reading `valueStatement.body` (probe worker payload assembly, MCP tools, UI) must read from the latest version instead.

### US-2: DomainConfigSnapshot Table (High — enables run tagging and history)

**As a developer**, I want the domain's full configuration captured atomically at a point in time, so that each run records exactly what preamble, level preset, context, and value statements were active.

**Acceptance criteria:**
- `DomainConfigSnapshot` table with: `id`, `domainId`, `preambleVersionId?`, `levelPresetVersionId?`, `contextId?`, `valueStatementVersionIds[]`, `fingerprint`, `createdAt`.
- Fingerprint is `SHA-256` of the sorted concatenation of non-null IDs (preambleVersionId, levelPresetVersionId, contextId, all valueStatementVersionIds).
- `@@unique([fingerprint])` enforced at schema level — upsert on fingerprint means identical configs reuse the same row.
- FK constraints to `preamble_versions`, `level_preset_versions`, `domain_contexts` (all nullable).
- `valueStatementVersionIds` stored as `String[]` (Postgres array of cuid strings) — no join table needed.

### US-3: Snapshot at Run Launch (High — core product value)

**As a researcher**, I want each run to record the domain config that was active when it started, so I can compare results that used different preambles or value statements.

**Acceptance criteria:**
- Run schema gets `domainConfigSnapshotId?` FK to `domain_config_snapshots`.
- When `startRun` is called, look up the definition's domain, snapshot the current config, and store the snapshot ID on the run.
- If the definition has no domain, `domainConfigSnapshotId` stays null.
- The snapshot is captured within the same `db.$transaction` as run creation.

### US-4: Domain Settings Editor UI (Medium — user-facing config management)

**As a domain admin**, I want a settings panel on the `/domains/manage` page to view and edit domain configuration (preamble, level preset, context, value statements), so I don't need to use the GraphQL playground.

**Acceptance criteria:**
- Selected domain shows a "Settings" panel with current preamble version, level preset version, context, and value statements.
- Value statements show inline editor with diff: previous content displayed grayed-out next to new input.
- "Save Settings" button creates a new `DomainConfigSnapshot` atomically — all field changes go into one transaction.
- Config history section (collapsed by default) shows past snapshots with ISO date and fingerprint prefix.
- Pickers for preamble, level preset, and context show existing names and allow clearing to null.
- The settings panel fetches available preamble versions, level preset versions, and domain contexts via existing queries (reuse what JobChoiceNew.tsx already fetches).
- Snapshot capture at run launch is wrapped in the same `db.$transaction` as run creation so a snapshot failure rolls back the run.

### US-5: setDomainSettings Mutation (Medium — API surface for US-4)

**As an API consumer**, I want a single `setDomainSettings` mutation that:
- Accepts new preambleVersionId, levelPresetVersionId, contextId, and a list of value statement bodies by token.
- For each body change, creates a new `ValueStatementVersion`.
- Atomically upserts a `DomainConfigSnapshot` with the new state.
- Returns the snapshot ID.

### US-6: domainConfigSnapshot Query (Low — for history display)

**As a UI developer**, I want to query the snapshot history for a domain so I can render the collapsed config history panel.

**Acceptance criteria:**
- `domainConfigSnapshots(domainId: ID!, limit: Int, offset: Int)` returns an ordered list (newest first) with `id`, `fingerprint`, `createdAt`, and the associated version details.

## Scope Boundaries

**In scope:**
- Schema: `ValueStatementVersion`, `DomainConfigSnapshot`, FK on `Run`
- API: `setDomainSettings` mutation, `domainConfigSnapshots` query, version-aware value statement resolvers
- UI: domain settings panel in `DomainsManage.tsx`
- Migration: one SQL migration file

**Out of scope:**
- Analysis layer enforcement (blocking/warning on mixed-config runs)
- Backfilling existing runs with snapshot IDs
- Surfacing snapshot diff in run results view

## Key Constraints

- DO NOT MODIFY: `CLAUDE.md`, `AGENTS.md`, `cloud/CLAUDE.md`, `MEMORY.md`, `.gitignore`
- Existing `body` field on `ValueStatement` is removed; all reads must go through `ValueStatementVersion`.
- No `@ts-ignore` in output. `npm run build` must pass for api and web.
- All tests must pass.
- Prisma scalar fields must NOT be inside `include: {}` — use `select: {}`.
